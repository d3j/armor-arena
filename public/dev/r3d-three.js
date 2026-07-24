// 鋼機工廠 — Three.js 観戦レンダラ(St2 第1段)
// 旧・自作ソフトウェアラスタライザ r3d.js と同じ scene 契約 `render(scene, tSec)` を実装し、
// createR3DThree(canvas) → { render } を返す。game.js はフラグ/脚種でどちらのレンダラを使うか選ぶ。
//
// 設計の芯(掟):
//  - 歩容/IK/姿勢は r3d.js の computeMechPose(純関数)を「そのまま」使う=描画方式を変えても作り直さない。
//    computeMechPose が返す per-part motions{angle,axis,angle2,axis2,offset,scale,hide} を Three の
//    Object3D 階層(剛体パーツ木・スキンなし)へ 1:1 で接続する。
//  - カメラ director(computeAutoCamera)も再利用し、平滑化(computeCamera 相当)だけこちらに持つ。
//  - シム挙動は不変(REPLAY_V を上げない)。ここは描画のみ。
//
// St2 第1段の範囲: 機体(全脚種のメッシュを汎用ジオメトリで生成。歩容検証は二脚が主)+ライティング+
//   接地シャドウ+地面/グリッド/空+カメラ。弾/爆風/障害物は「戦場が空に見えない」ための最小描画のみ
//   (演出の作り込み=マズルフラッシュ/煙/地形シェーディング/撃破余韻は第3段)。

import * as THREE from './vendor/three.module.min.js';
import {
  computeMechPose, computeAutoCamera, containEye, scaleScene, themeOf,
  poseMechFaces, shotWorldFaces, blastWorldFaces, obstacleWorldFaces,
  MECH_SCALE, ARENA_CX, ARENA_CZ,
} from './r3d.js';

const DEG = Math.PI / 180;
const FOV_Y_DEG = 55;               // r3d.js の FOV_Y と一致
const CAM_TAU = 0.5, CAM_DT_MAX = 0.1;

// ---- 演出面の色文字列 → [r,g,b,alpha](0..1)。'#hex' / 'rgb()' / 'rgba()' を受ける(キャッシュ付き) ----
const _colCache = new Map();
function parseColA(str) {
  let c = _colCache.get(str);
  if (c) return c;
  let r = 1, g = 1, b = 1, a = 1;
  if (str[0] === '#') {
    r = parseInt(str.slice(1, 3), 16) / 255; g = parseInt(str.slice(3, 5), 16) / 255; b = parseInt(str.slice(5, 7), 16) / 255;
  } else {
    const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
    if (m) { r = m[1] / 255; g = m[2] / 255; b = m[3] / 255; a = m[4] != null ? +m[4] : 1; }
  }
  c = [r, g, b, a];
  if (_colCache.size < 4096) _colCache.set(str, c);
  return c;
}

// AXIS 定数(computeMechPose の motions.axis はこの参照値のいずれか)
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
function axisVec(a) {
  // motions.axis は [1,0,0]/[0,1,0]/[0,0,1] の配列。x成分優先で判定。
  if (!a) return AX;
  if (a[0]) return AX; if (a[1]) return AY; if (a[2]) return AZ; return AX;
}

function hexToColor(hex) { return new THREE.Color(hex); }

// ---- パーツ形状 → BufferGeometry(非indexed=面ごとに独立頂点でフラットシェーディング) ----
function partGeometry(part) {
  const V = part.verts;               // pivot 相対のローカル頂点
  const pos = [];
  for (const face of part.faces) {
    // 多角形をファン三角形化(f[0],f[k],f[k+1])
    for (let k = 1; k < face.length - 1; k++) {
      const a = V[face[0]], b = V[face[k]], c = V[face[k + 1]];
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();           // 非indexed=各三角形が自分の面法線を持つ=フラット
  return g;
}

function partMaterial(part) {
  const col = hexToColor(part.color);
  if (part.emissive) {
    // 発光パーツ(コクピット/バイザー/ビーム/アンダーグロー等): 常時明るく、影は落とさない。
    return new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0.9,
      roughness: 0.4, metalness: 0.0, flatShading: true, side: THREE.DoubleSide,
    });
  }
  // 金属度は控えめ(env map 無しの金属は暗く潰れる)。拡散反射を残して2灯でも立体が読めるように。
  return new THREE.MeshStandardMaterial({
    color: col, roughness: 0.68, metalness: 0.12, flatShading: true, side: THREE.DoubleSide,
  });
}

// ---- 機体の Object3D 木を組む(mesh.parts の親子=parentIdx をそのまま Group 階層に) ----
function buildMechTree(mesh) {
  const root = new THREE.Group();     // 機体ルート(原点+向き+傾き+ロールを毎フレーム設定)
  const groups = new Array(mesh.parts.length);
  const mats = new Array(mesh.parts.length);
  const baseColor = new Array(mesh.parts.length);
  mesh.parts.forEach((part, i) => {
    const g = new THREE.Group();
    const geo = partGeometry(part);
    const mat = partMaterial(part);
    const m = new THREE.Mesh(geo, mat);
    if (!part.emissive) { m.castShadow = true; m.receiveShadow = true; }
    g.add(m);
    groups[i] = g; mats[i] = mat; baseColor[i] = mat.color.clone();
  });
  // 親子付け + ローカル位置(pivot - 親pivot)。親が無ければ root 直下。
  mesh.parts.forEach((part, i) => {
    const g = groups[i];
    const pv = part.pivot;
    if (part.parentIdx != null && part.parentIdx >= 0) {
      const pp = mesh.parts[part.parentIdx].pivot;
      g.position.set(pv[0] - pp[0], pv[1] - pp[1], pv[2] - pp[2]);
      groups[part.parentIdx].add(g);
    } else {
      g.position.set(pv[0], pv[1], pv[2]);
      root.add(g);
    }
  });
  return { root, groups, mats, baseColor, tintSig: '' };
}

// motions[i] → group[i] の quaternion/scale/offset/visible を設定する。
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function applyMotion(tree, mesh, motions) {
  const { groups } = tree;
  for (let i = 0; i < motions.length; i++) {
    const mo = motions[i], g = groups[i], part = mesh.parts[i];
    // transformThroughChain の順序: scale → rotate(axis,angle) → rotate(axis2,angle2) → offset
    // Three は q*(scale*p)+pos。合成回転 = q(axis2,angle2)*q(axis,angle)。
    _q1.setFromAxisAngle(axisVec(mo.axis), mo.angle || 0);
    if (mo.angle2) { _q2.setFromAxisAngle(axisVec(mo.axis2), mo.angle2); _q1.premultiply(_q2); }
    g.quaternion.copy(_q1);
    const s = (mo.scale && mo.scale !== 1) ? mo.scale : 1;
    g.scale.setScalar(s);
    // 基準ローカル位置(pivot-親pivot) + offset(部位ローカル軸。親フレームと軸整合)
    const pv = part.pivot;
    let bx = pv[0], by = pv[1], bz = pv[2];
    if (part.parentIdx != null && part.parentIdx >= 0) {
      const pp = mesh.parts[part.parentIdx].pivot; bx -= pp[0]; by -= pp[1]; bz -= pp[2];
    }
    if (mo.offset) g.position.set(bx + mo.offset[0], by + mo.offset[1], bz + mo.offset[2]);
    else g.position.set(bx, by, bz);
    g.visible = !mo.hide;
  }
}

const _camDir = new THREE.Vector3();   // 演出ビルボード用のカメラ前方(毎フレーム更新)

// ルート変換: toWorld と同値。world = origin + basis(right,up,fwd) * (rotZ(rock)*rotX(tilt)*p)
const _mBasis = new THREE.Matrix4(), _qBasis = new THREE.Quaternion();
const _qx = new THREE.Quaternion(), _qz = new THREE.Quaternion();
const _vR = new THREE.Vector3(), _vU = new THREE.Vector3(0, 1, 0), _vF = new THREE.Vector3();
function applyRoot(root, P) {
  const { origin, right3, forward3, tiltX, rockAngle } = P;
  _vR.set(right3[0], right3[1], right3[2]);
  _vF.set(forward3[0], forward3[1], forward3[2]);
  _mBasis.makeBasis(_vR, _vU, _vF);       // 列= right,up,forward(ローカルX→right,Y→up,Z→forward)
  _qBasis.setFromRotationMatrix(_mBasis);
  _qx.setFromAxisAngle(AX, tiltX || 0);
  _qz.setFromAxisAngle(AZ, rockAngle || 0);
  // q = Qbasis * Qz * Qx
  _qBasis.multiply(_qz).multiply(_qx);
  root.quaternion.copy(_qBasis);
  root.position.set(origin[0], origin[1], origin[2]);
}

export function createR3DThree(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // canvas.width/height は game.js 側が dpr 込みで設定する(バックストア)。ここで pixelRatio を
  // 掛けると二重適用でビューポートがはみ出す(右側が欠ける)ので 1 に固定し、setSize(W,H,false)で
  // ちょうど canvas 実寸に合わせる。
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene3 = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV_Y_DEG, 1, 0.5, 6000);
  camera.up.set(0, 1, 0);

  // --- ライティング(キー=太陽で接地シャドウ / 半球=環境光) ---
  const hemi = new THREE.HemisphereLight(0x9fbcd6, 0x2a2f28, 1.15);
  scene3.add(hemi);
  const fill = new THREE.DirectionalLight(0x88a0c0, 0.35);   // カメラ側からの弱い補助光(黒潰れ防止)
  fill.position.set(-40, 60, -60);
  scene3.add(fill);
  const sun = new THREE.DirectionalLight(0xfff2e0, 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  const sc = sun.shadow.camera;               // 接地シャドウの範囲(狙点まわりに毎フレーム追従)
  sc.near = 1; sc.far = 260; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46;
  scene3.add(sun);
  scene3.add(sun.target);

  // --- 空ドーム(縦グラデ。theme の sky[0..3] を高さで補間) ---
  const skyUni = {
    c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() },
    c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() },
  };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: skyUni,
    vertexShader: 'varying vec3 vp; void main(){ vp=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: [
      'varying vec3 vp; uniform vec3 c0,c1,c2,c3;',
      'void main(){',
      '  float y = clamp(vp.y*0.5+0.5, 0.0, 1.0);',      // 0=下 1=上
      '  float t = 1.0 - y;',                             // 上(空頂)=0 → 下(地平)=1 で sky[0..3]
      '  vec3 col;',
      '  if(t<0.62){ col=mix(c0,c1,t/0.62);} else if(t<0.9){ col=mix(c1,c2,(t-0.62)/0.28);} else { col=mix(c2,c3,(t-0.9)/0.1);}',
      '  gl_FragColor=vec4(col,1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 16), skyMat);
  scene3.add(sky);

  // --- 地面(接地シャドウの受け手) + グリッド(アリーナ中心まわり) ---
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x16241d, roughness: 0.98, metalness: 0.0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(ARENA_CX, 0, ARENA_CZ);
  ground.receiveShadow = true;
  scene3.add(ground);

  const grid = new THREE.GridHelper(1200, 24, 0x5a7a86, 0x3a5560);
  grid.position.set(ARENA_CX, 0.03, ARENA_CZ);
  grid.material.transparent = true; grid.material.opacity = 0.5;
  scene3.add(grid);

  // 距離フォグ(遠景を地平色に溶かす=ソフト版の距離フェード相当)。色は theme 更新時に設定。
  scene3.fog = new THREE.Fog(0x22303a, 220, 900);

  // --- 機体木 + 演出レイヤ(弾/爆風/砂煙/くすぶり煙/マズルフラッシュ等) ---
  const mechTrees = new Map();   // mesh(オブジェクト参照) -> tree
  const dynGroup = new THREE.Group();
  scene3.add(dynGroup);

  // 演出フェイス動的レイヤ: r3d.js の共有面リスト({verts,color,alpha,emissive,noCull,isLine})を毎フレーム
  // RGBA頂点色の非indexedジオメトリへ流し込む(三角形=fan分割 / isLine=LineSegments)。ソフト版と同じ
  // 見た目の unlit フラット塗り(発光・煙・火花は照明に反応させない)。depthWrite なし+depthTest あり
  // =機体の陰には隠れるが、半透明同士の順序は挿入順(実用上十分)。
  function makeDynLayer(makeObj) {
    let cap = 512 * 3;   // 頂点数
    let pos = new Float32Array(cap * 3), col = new Float32Array(cap * 4), n = 0;
    let obj = null, geo = null;
    const alloc = () => {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      const old = obj;
      obj = makeObj(geo);
      obj.frustumCulled = false;
      obj.renderOrder = 10;
      dynGroup.add(obj);
      if (old) { dynGroup.remove(old); old.geometry.dispose(); old.material.dispose(); }
    };
    alloc();
    return {
      begin() { n = 0; },
      ensure(add) {
        if (n + add <= cap) return;
        while (cap < n + add) cap *= 2;
        const p2 = new Float32Array(cap * 3), c2 = new Float32Array(cap * 4);
        p2.set(pos.subarray(0, n * 3)); c2.set(col.subarray(0, n * 4));
        pos = p2; col = c2; alloc();
      },
      vert(p, r, g, b, a) {
        pos[n * 3] = p[0]; pos[n * 3 + 1] = p[1]; pos[n * 3 + 2] = p[2];
        col[n * 4] = r; col[n * 4 + 1] = g; col[n * 4 + 2] = b; col[n * 4 + 3] = a;
        n++;
      },
      commit() {
        geo.setDrawRange(0, n);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
        obj.visible = n > 0;
      },
    };
  }
  const fxTri = makeDynLayer((geo) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  })));
  const fxLine = makeDynLayer((geo) => new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false,
  })));

  function feedFaces(faces) {
    fxTri.begin(); fxLine.begin();
    for (const it of faces) {
      const [cr, cg, cb, ca] = parseColA(it.color);
      const a = ca * (it.alpha == null ? 1 : it.alpha);
      if (a <= 0.004) continue;
      if (it.isLine) {
        fxLine.ensure(2);
        fxLine.vert(it.verts[0], cr, cg, cb, a); fxLine.vert(it.verts[1], cr, cg, cb, a);
        continue;
      }
      const v = it.verts;
      for (let k = 1; k < v.length - 1; k++) {
        fxTri.ensure(3);
        fxTri.vert(v[0], cr, cg, cb, a); fxTri.vert(v[k], cr, cg, cb, a); fxTri.vert(v[k + 1], cr, cg, cb, a);
      }
    }
    fxTri.commit(); fxLine.commit();
  }

  // --- 障害物(岩柱/泥沼/茨): 状態(alive/hpFrac)が変わった時だけ、共有の obstacleWorldFaces から
  //     ジオメトリを組み直してキャッシュ。岩・茨は照明+影あり(MeshStandard)、発光面(茨の先端)は
  //     unlit、isLine(ひび/油膜リング/警告リング)は LineSegments。 ---
  const obsCache = new Map();   // key -> { group, sig }
  // マテリアル型のプリウォーム: 障害物/演出で使う3種(lit/unlit/line の頂点色つき)を初回フレームで
  // まとめてコンパイルする(戦闘中の初出現時に1回数百msのシェーダコンパイルで時計が跳ぶのを防ぐ)。
  {
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute([0, -999, 0, 0.01, -999, 0, 0, -999, 0.01], 3));
    dg.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 4));
    dg.computeVertexNormals();
    const warm = new THREE.Group();
    warm.add(new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0.0, transparent: true, side: THREE.DoubleSide })));
    warm.add(new THREE.Mesh(dg.clone(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide })));
    warm.add(new THREE.LineSegments(dg.clone(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true })));
    // スプライトは実使用(マーカー/照準リング/計器枠)と同じ define 構成(map+alphaTest+sizeAttenuation:false)で
    // 温める。素の SpriteMaterial では別プログラムになりプリウォームが効かない(USE_MAP/ALPHATEST が変わる)。
    const wc = document.createElement('canvas'); wc.width = 2; wc.height = 2;
    const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace;
    const ws = new THREE.Sprite(new THREE.SpriteMaterial({ map: wt, alphaTest: 0.02, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0 }));
    ws.position.set(0, -999, 0); ws.scale.setScalar(1e-4);
    warm.add(ws);
    warm.children.forEach((c) => { c.frustumCulled = false; });
    scene3.add(warm);
  }
  function buildObstacleGroup(o) {
    const faces = [];
    obstacleWorldFaces({ obstacles: [o] }, faces);
    const group = new THREE.Group();
    const litP = [], litC = [], emiP = [], emiC = [], linP = [], linC = [];
    for (const it of faces) {
      const [cr, cg, cb, ca] = parseColA(it.color);
      const a = ca * (it.alpha == null ? 1 : it.alpha);
      if (it.isLine) {
        linP.push(...it.verts[0], ...it.verts[1]); linC.push(cr, cg, cb, a, cr, cg, cb, a);
        continue;
      }
      // 泥沼は unlit(ソフト版と同じ暗い水面色。照明が乗ると明るい土色に化ける)。発光面も unlit。
      const unlit = it.emissive || o.kind === 'mud';
      const v = it.verts, P = unlit ? emiP : litP, C = unlit ? emiC : litC;
      for (let k = 1; k < v.length - 1; k++) {
        P.push(...v[0], ...v[k], ...v[k + 1]);
        C.push(cr, cg, cb, a, cr, cg, cb, a, cr, cg, cb, a);
      }
    }
    const mkGeo = (P, C) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
      return g;
    };
    if (litP.length) {
      const g = mkGeo(litP, litC); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0.0,
        transparent: true, side: THREE.DoubleSide,
      }));
      if (o.kind !== 'mud') { m.castShadow = true; }
      m.receiveShadow = true;
      group.add(m);
    }
    if (emiP.length) {
      group.add(new THREE.Mesh(mkGeo(emiP, emiC), new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, side: THREE.DoubleSide,
      })));
    }
    if (linP.length) {
      group.add(new THREE.LineSegments(mkGeo(linP, linC), new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true,
      })));
    }
    return group;
  }
  function disposeGroup(group) {
    dynGroup.remove(group);
    group.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
  }
  function updateObstacles(obstacles) {
    const present = new Set();
    (obstacles || []).forEach((o) => {
      const key = o.kind + ':' + o.x.toFixed(1) + ':' + o.y.toFixed(1) + ':' + (o.r || 0);   // r も同一性に含める
      present.add(key);
      const sig = (o.alive === false ? 'd' : 'a') + ':' + (o.hpFrac == null ? '1' : Math.round(o.hpFrac * 24));
      let ent = obsCache.get(key);
      if (ent && ent.sig === sig) { ent.group.visible = true; return; }
      if (ent) disposeGroup(ent.group);
      const group = buildObstacleGroup(o);
      dynGroup.add(group);
      obsCache.set(key, { group, sig });
    });
    // 戦闘/戦場が替わって不在になった障害物は破棄(隠すだけだとGPU資源がセッション中積み上がる)
    obsCache.forEach((ent, key) => { if (!present.has(key)) { disposeGroup(ent.group); obsCache.delete(key); } });
  }

  // --- 敵機マーカーHUD: 距離+方向の▽をスプライト(スクリーン等倍)で敵機頭上に出す。
  //     ソフト版の 2D 描画と同じ表示条件(auto カメラ・2機・生存・距離>90)と配色(遮蔽=橙の破線)。 ---
  const mkCanvas = document.createElement('canvas');
  mkCanvas.width = 192; mkCanvas.height = 96;
  const mkTex = new THREE.CanvasTexture(mkCanvas);
  mkTex.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: mkTex, sizeAttenuation: false, depthTest: false, transparent: true, alphaTest: 0.02,
  }));
  marker.scale.set(0.22, 0.11, 1);
  marker.renderOrder = 20;
  marker.visible = false;
  scene3.add(marker);
  let mkSig = '';
  function drawMarkerTex(dist, occ) {
    const c = mkCanvas.getContext('2d');
    c.clearRect(0, 0, 192, 96);
    c.font = 'bold 26px ui-monospace, Menlo, monospace';
    c.textAlign = 'center';
    c.fillStyle = occ ? 'rgba(255,190,130,0.9)' : 'rgba(255,150,120,0.95)';
    c.fillText((occ ? '遮蔽 ' : '') + dist + 'm', 96, 30);
    c.strokeStyle = occ ? 'rgba(255,170,90,0.6)' : 'rgba(255,120,90,0.9)';
    c.lineWidth = 3;
    if (occ) c.setLineDash([7, 5]);
    c.beginPath();
    c.moveTo(96 - 18, 44); c.lineTo(96 + 18, 44); c.lineTo(96, 70);
    c.closePath(); c.stroke();
    c.setLineDash([]);
    mkTex.needsUpdate = true;
  }
  function updateMarker(scene, showMarkers) {
    const mk = scene.mechs || [];
    let show = false;
    if (showMarkers !== false && mk.length === 2 && mk[1] && mk[1].alive !== false) {
      const distM = Math.hypot(mk[1].x - mk[0].x, mk[1].y - mk[0].y);
      if (distM > 90) {
        show = true;
        const occ = !!mk[1].occluded;
        const sig = Math.round(distM) + ':' + occ;
        if (sig !== mkSig) { mkSig = sig; drawMarkerTex(Math.round(distM), occ); }
        marker.position.set(mk[1].x, 13.5 * MECH_SCALE, mk[1].y);
      }
    }
    marker.visible = show;
  }

  // --- コックピットHUD(POVショット中のみ。通常ショットには一切出さない=director の pov 指示で駆動) ---
  // 照準リング: 敵機の狙点(shotPOV の target と同じ高さ)に重ねるスクリーン等倍スプライト。
  // 距離読みと遮蔽(橙・破線)の流儀は敵機マーカーHUDと同じ。テクスチャは(丸め距離,遮蔽)変化時のみ再描画。
  const rtCanvas = document.createElement('canvas');
  rtCanvas.width = 256; rtCanvas.height = 256;
  const rtTex = new THREE.CanvasTexture(rtCanvas);
  rtTex.colorSpace = THREE.SRGBColorSpace;
  const reticle = new THREE.Sprite(new THREE.SpriteMaterial({
    map: rtTex, sizeAttenuation: false, depthTest: false, transparent: true, alphaTest: 0.02,
  }));
  reticle.scale.set(0.3, 0.3, 1);
  reticle.renderOrder = 21;
  reticle.visible = false;
  scene3.add(reticle);
  let rtSig = '';
  function drawReticleTex(dist, occ) {
    const c = rtCanvas.getContext('2d');
    c.clearRect(0, 0, 256, 256);
    const col = occ ? 'rgba(255,190,110,0.85)' : 'rgba(140,255,190,0.9)';
    c.strokeStyle = col; c.fillStyle = col;
    c.lineWidth = 3;
    if (occ) c.setLineDash([10, 7]);
    c.beginPath(); c.arc(128, 108, 62, 0, Math.PI * 2); c.stroke();   // 外リング(遮蔽時は破線)
    c.setLineDash([]);
    c.beginPath(); c.arc(128, 108, 30, 0, Math.PI * 2); c.stroke();   // 内リング
    for (let k = 0; k < 4; k++) {                                      // 4方位ティック
      const a = k * Math.PI / 2, c1 = Math.cos(a), s1 = Math.sin(a);
      c.beginPath(); c.moveTo(128 + c1 * 66, 108 + s1 * 66); c.lineTo(128 + c1 * 84, 108 + s1 * 84); c.stroke();
    }
    c.font = 'bold 30px ui-monospace, Menlo, monospace';
    c.textAlign = 'center';
    c.fillText((occ ? '遮蔽 ' : '') + dist + 'm', 128, 232);
    rtTex.needsUpdate = true;
  }
  // 計器枠: カメラの子(視線前方 距離1)に吊るす全画面スプライト。sizeAttenuation:false は距離1で等倍
  // =画面いっぱいのサイズが scale 指定そのままになり、マーカーと同じシェーダプログラムを共有できる。
  scene3.add(camera);   // 子(計器枠)の行列更新のためシーンに入れる(描画自体には無関係)
  const cpCanvas = document.createElement('canvas');
  cpCanvas.width = 1024; cpCanvas.height = 512;
  const cpTex = new THREE.CanvasTexture(cpCanvas);
  cpTex.colorSpace = THREE.SRGBColorSpace;
  {
    const c = cpCanvas.getContext('2d');
    const W = 1024, H = 512;
    // 四隅の構造材(暗いくさび=キャノピー支柱)
    c.fillStyle = 'rgba(10,16,18,0.88)';
    const wedge = (x0, y0, x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.closePath(); c.fill(); };
    wedge(0, 0, 170, 0, 0, 120); wedge(W, 0, W - 170, 0, W, 120);
    wedge(0, H, 200, H, 0, H - 150); wedge(W, H, W - 200, H, W, H - 150);
    // 下部コンソールの影(浅いグラデ)
    const g = c.createLinearGradient(0, H - 90, 0, H);
    g.addColorStop(0, 'rgba(8,14,16,0)'); g.addColorStop(1, 'rgba(8,14,16,0.85)');
    c.fillStyle = g; c.fillRect(0, H - 90, W, 90);
    // ガラス縁のブラケット+上辺センターの方位ノッチ
    c.strokeStyle = 'rgba(120,220,200,0.5)'; c.lineWidth = 3;
    const br = (x, y, dx, dy) => { c.beginPath(); c.moveTo(x + dx * 60, y); c.lineTo(x, y); c.lineTo(x, y + dy * 40); c.stroke(); };
    br(24, 24, 1, 1); br(W - 24, 24, -1, 1); br(24, H - 24, 1, -1); br(W - 24, H - 24, -1, -1);
    c.beginPath(); c.moveTo(W / 2 - 26, 10); c.lineTo(W / 2, 24); c.lineTo(W / 2 + 26, 10); c.stroke();
    // コンソール上の常灯
    c.fillStyle = 'rgba(140,255,190,0.55)';
    for (let k = 0; k < 5; k++) c.fillRect(W / 2 - 90 + k * 45, H - 26, 14, 5);
    cpTex.needsUpdate = true;
  }
  const cockpit = new THREE.Sprite(new THREE.SpriteMaterial({
    map: cpTex, sizeAttenuation: false, depthTest: false, transparent: true, alphaTest: 0.02,
  }));
  cockpit.position.set(0, 0, -1);
  cockpit.renderOrder = 22;   // 照準リングより手前(縁は目に一番近い)
  cockpit.visible = false;
  camera.add(cockpit);
  const COCKPIT_H = 2 * Math.tan(FOV_Y_DEG * DEG / 2);   // 距離1で画面全高を覆うスプライトの高さ
  function updateCockpitHUD(scene, povIdx, aspect) {
    const mk = scene.mechs || [];
    const tgt = povIdx == null ? null : mk[1 - povIdx];
    const src = povIdx == null ? null : mk[povIdx];
    if (!tgt || !src || tgt.alive === false) { reticle.visible = false; cockpit.visible = false; return; }
    const dist = Math.round(Math.hypot(tgt.x - src.x, tgt.y - src.y));
    const occ = !!(mk[1] && mk[1].occluded);   // 遮蔽(岩柱LOS)は両機間で対称なので mechs[1] の旗を共用
    const sig = dist + ':' + occ;
    if (sig !== rtSig) { rtSig = sig; drawReticleTex(dist, occ); }
    reticle.position.set(tgt.x, 3 * MECH_SCALE, tgt.y);
    reticle.visible = true;
    cockpit.scale.set(COCKPIT_H * aspect, COCKPIT_H, 1);
    cockpit.visible = true;
  }

  let lastW = 0, lastH = 0;   // canvas 実寸(dpr込み)を自前で追跡。app が canvas.width を直接いじるため
                              // renderer.domElement.width との比較では setSize 漏れ→ビューポート不整合(letterbox)になる。
  const camSt = {
    t: null, eye: null, target: null, shotIdx: -1,
    seed: null, distEMA: null, tripodIdx: -1, tripodEye: null, amAng: null,
    projIdx: -1, projSig: null, amLock: null, lineSide: null, povIdx: -1, povOk: false,
  };
  let curTheme = null;

  function applyTheme(theme) {
    if (theme === curTheme) return;
    curTheme = theme;
    skyUni.c0.value.set(theme.sky[0]); skyUni.c1.value.set(theme.sky[1]);
    skyUni.c2.value.set(theme.sky[2]); skyUni.c3.value.set(theme.sky[3]);
    groundMat.color.set(theme.ground[1]);
    scene3.fog.color.set(theme.ground[0]);
    hemi.color.set(theme.sky[2]); hemi.groundColor.set(theme.ground[2]);
  }

  // camera director + 平滑化(r3d.js createR3D 内 computeCamera と同じロジック)
  function updateCamera(scene, tSec, aspect) {
    if (scene.camera && Array.isArray(scene.camera.eye)) {   // 手動カメラ(工廠プレビュー)
      const eye = scene.camera.eye, target = scene.camera.target || [ARENA_CX, 4, ARENA_CZ];
      camera.position.set(eye[0], eye[1], eye[2]);
      camera.lookAt(target[0], target[1], target[2]);
      return { target, showMarkers: true, pov: null };
    }
    const dtRaw = camSt.t == null ? 0 : tSec - camSt.t;
    const reset = camSt.t == null || dtRaw < -1e-3;
    const dt = Math.max(0, Math.min(CAM_DT_MAX, dtRaw));
    const raw = computeAutoCamera(scene, tSec, aspect, camSt, dt, reset);
    const cut = reset || raw.shotIdx !== camSt.shotIdx || !camSt.eye;
    if (cut) { camSt.eye = raw.eye.slice(); camSt.target = raw.target.slice(); }
    else {
      const k = 1 - Math.exp(-dt / (raw.tau || CAM_TAU));
      for (let i = 0; i < 3; i++) {
        camSt.eye[i] += (raw.eye[i] - camSt.eye[i]) * k;
        camSt.target[i] += (raw.target[i] - camSt.target[i]) * k;
      }
    }
    camSt.t = tSec; camSt.shotIdx = raw.shotIdx;
    if (raw.contain) camSt.eye = containEye(camSt.eye, camSt.target, aspect, scene.mechs || []);
    camera.position.set(camSt.eye[0], camSt.eye[1], camSt.eye[2]);
    camera.lookAt(camSt.target[0], camSt.target[1], camSt.target[2]);
    return { target: camSt.target, showMarkers: raw.showMarkers, pov: raw.pov == null ? null : raw.pov, shotIdx: raw.shotIdx };
  }

  // 機体の色状態: 撃破=暗く / 被弾白熱(flash01)=白へ寄せる(ソフト版 poseMechFaces の色補正と同じ)。
  const _white = new THREE.Color(0xffffff), _dead = new THREE.Color(0x0a0a0a);
  function tintTree(tree, alive, flash01) {
    const fq = alive ? Math.min(0.8, Math.round((flash01 || 0) * 16) / 16 * 0.8) : 0;   // 1/16量子化(毎フレームの色再設定を避ける)
    const sig = (alive ? 'a' : 'd') + fq;
    if (tree.tintSig === sig) return;
    tree.tintSig = sig;
    for (let i = 0; i < tree.mats.length; i++) {
      const base = tree.baseColor[i];
      if (!alive) tree.mats[i].color.copy(base).lerp(_dead, 0.6);        // 撃破=暗く
      else if (fq > 0.01) tree.mats[i].color.copy(base).lerp(_white, fq); // 被弾白熱
      else tree.mats[i].color.copy(base);
    }
  }

  function render(rawScene, tSec) {
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    if (W !== lastW || H !== lastH) { renderer.setSize(W, H, false); lastW = W; lastH = H; }
    const t = tSec || 0;
    const scene = scaleScene(rawScene);      // シム座標→3D描画座標へ相似縮小(ソフト版と同一)
    const aspect = W / H;
    if (camera.aspect !== aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
    applyTheme(themeOf(scene));

    const camInfo = updateCamera(scene, t, aspect);
    window.__r3dCam = camInfo;   // デバッグハンドル(__kb と同じ流儀): 実機検証でPOV区間の特定に使う

    // グリッド/地面を注視点へ追従(グリッド間隔にスナップ=線はワールド整列のまま窓だけ動く=無限地面)。
    // 機体が歩いて移動しても常に足元に地面があり、地面が流れて見える(歩行と地面の連動)。
    const gstep = 1200 / 24;   // GridHelper(1200, 24) のセル間隔=50
    grid.position.set(Math.round(camInfo.target[0] / gstep) * gstep, 0.03, Math.round(camInfo.target[2] / gstep) * gstep);
    ground.position.set(camInfo.target[0], 0, camInfo.target[2]);

    // 太陽(接地シャドウ)を狙点まわりへ追従。方向は r3d.js の LIGHT_KEY 相当(斜め上)。
    const tg = camInfo.target;
    sun.target.position.set(tg[0], 0, tg[2]);
    sun.position.set(tg[0] + 60, 150, tg[2] + 45);
    sun.target.updateMatrixWorld();

    // 機体木の更新(存在しない機体は隠す)
    const present = new Set();
    (scene.mechs || []).forEach((m, mi) => {
      const mesh = m.mesh; if (!mesh || !mesh.parts) return;
      let tree = mechTrees.get(mesh);
      if (!tree) { tree = buildMechTree(mesh); mechTrees.set(mesh, tree); scene3.add(tree.root); }
      present.add(tree);
      const P = computeMechPose(m, t);
      if (!P) { tree.root.visible = false; return; }
      tintTree(tree, P.alive, m.flash01);
      applyMotion(tree, mesh, P.motions);
      applyRoot(tree.root, P);
      // POV(コックピット目線)中は視点機のメッシュを丸ごと隠す=頭/胴どころか攻撃モーションで
      // 振り回す腕もカメラを塞がない(部分hideより堅い。影ごと消えるが一人称では自影は見えない)。
      tree.root.visible = mi !== camInfo.pov;
    });
    // 不在の機体木は破棄(battle レンダラはセッションで1インスタンス=戦闘のたび新しい mesh が来るので、
    // 隠すだけだと mechTrees と GPU 資源が戦闘数ぶん積み上がる)
    mechTrees.forEach((tree, mesh) => {
      if (present.has(tree)) return;
      scene3.remove(tree.root);
      tree.root.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
      mechTrees.delete(mesh);
    });

    // 演出フェイス(r3d.js と共有の生成関数): 機体付随(砂煙/くすぶり煙/マズルフラッシュ/刃の軌跡/
    // ポッド噴煙)+ 弾(SHOT_STYLES)+ 爆風/着弾(武器別)。ビルボードはカメラ前方ベクトルで展開。
    camera.getWorldDirection(_camDir);
    const camFx = { forward: [_camDir.x, _camDir.y, _camDir.z] };
    const fx = [];
    (scene.mechs || []).forEach((m) => poseMechFaces(m, t, fx, { effectsOnly: true }));
    shotWorldFaces(scene, camFx, fx);
    blastWorldFaces(scene, fx, t);
    feedFaces(fx);

    updateObstacles(scene.obstacles);
    updateMarker(scene, camInfo.showMarkers);
    updateCockpitHUD(scene, camInfo.pov, aspect);

    renderer.render(scene3, camera);
  }

  return { render };
}
