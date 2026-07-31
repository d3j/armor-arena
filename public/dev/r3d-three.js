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
  computeMechPose, computeAutoCamera, containEye, scaleScene, themeOf, THEMES,
  poseMechFaces, shotWorldFaces, blastWorldFaces, obstacleWorldFaces,
  fieldDecorFaces, distantSceneryFaces,
  MECH_SCALE, ARENA_CX, ARENA_CZ,
} from './r3d.js';
import {
  partMatClass, partMatSet, groundMaps, rockMaps, concreteMaps, buildingMaps, envEquirect,
} from './tex.js';

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

// ==== プロシージャル質感(St4): 生成そのものは tex.js。ここは Three への貼り付け係 ====
// 外部アセットなし・シード固定=毎回同じ見た目。3枚組(albedo / normal / roughness+metalness)を
// パーツの質感クラス別に持ち、機体色は material.color の乗算で残す(白ベースの掟)。
// UV は「面法線のドミナント軸への平面投影」(箱・柱・多面体の寄せ集めに一様なテクセル密度を
// 与える最短の方法。継ぎ目はパネル柄なら目立たない)。
// 位置配列(非indexed三角形)から「面法線ドミナント軸の平面投影 UV」を作る。scale=1ワールド単位あたりのタイル数。
function planarUVs(pos, scale) {
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
    const bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5];
    const cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
    // ドミナント軸を落として残り2軸を UV に
    let k0 = 0, k1 = 1;                       // 既定: Z面 → (x,y)
    if (nx >= ny && nx >= nz) { k0 = 2; k1 = 1; }        // X面 → (z,y)
    else if (ny >= nx && ny >= nz) { k0 = 0; k1 = 2; }   // Y面 → (x,z)
    for (let v2 = 0; v2 < 3; v2++) {
      const px = pos[i + v2 * 3], py = pos[i + v2 * 3 + 1], pz = pos[i + v2 * 3 + 2];
      const co = [px, py, pz];
      uv[(i / 3 + v2) * 2] = co[k0] * scale;
      uv[(i / 3 + v2) * 2 + 1] = co[k1] * scale;
    }
  }
  return uv;
}

// 障害物/装飾の面が使う質感キー → テクセル密度(1ワールド単位あたりのタイル数)。
// 岩は大きな節理、ビルは窓割りが階に見える密度、舗装は骨材が細かく見える密度。
// concrete は縁石/支柱など小物用に密度を上げる(粗い節理を拡大させない)。
const TERRAIN_UV = { rock: 0.1, building: 0.055, asphalt: 0.05, concrete: 0.55 };
// tex キー(+ビルの窓パターン variant)→ tex.js の3枚組。生成は初回のみ。
function terrainSet(tex, variant) {
  if (tex === 'building') return buildingMaps((variant || 0) & 3);
  if (tex === 'asphalt') return _asphaltSet || (_asphaltSet = groundMaps(ASPHALT_THEME, 'asphalt'));
  if (tex === 'concrete') return concreteMaps();
  return rockMaps();
}
// 舗装はテーマ配色に引っ張られない(街路のアスファルトは夜でも昼でも灰黒)。
const ASPHALT_THEME = { ground: ['#3a3d40', '#2e3134', '#1c1e20'] };
let _asphaltSet = null;

// ---- パーツ形状 → BufferGeometry(非indexed=面ごとに独立頂点でフラットシェーディング) ----
function partGeometry(part, uvScale) {
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
  // 機体スケール(全高 ≈4.2 ワールド単位。St3 から継いだ「~8」は実測とずれていた)基準。
  // タイル密度は質感クラスごと(ゴムのラグは細かく、
  // 増加装甲の厚板は粗く)=同じ機体の中で「材質が違う」ことが目で分かる。
  g.setAttribute('uv', new THREE.BufferAttribute(planarUVs(pos, uvScale), 2));
  g.computeVertexNormals();           // 非indexed=各三角形が自分の面法線を持つ=フラット
  // 接線属性は作らない(computeTangents は index 必須で、非indexed だと console.error を出す)。
  // TANGENT が無い場合 Three は画面空間微分から接空間を近似する=法線マップはそのまま効く。
  return g;
}

function partMaterial(part) {
  const col = hexToColor(part.color);
  if (part.emissive) {
    // 発光パーツ(コクピット/バイザー/ビーム/アンダーグロー等): 常時明るく、影は落とさない。
    // 強度は 0.9→0.6。トーンマッピング導入で 0.9 だと色が飛んで全部白い箱になり、
    // 「バイザーは青緑・コクピットは橙」の見分け(記号)が消えていた(実機確認 2026-07-31)。
    return new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0.6,
      roughness: 0.4, metalness: 0.0, flatShading: true, side: THREE.DoubleSide,
    });
  }
  // 質感クラス別の3枚組。環境マップ(scene.environment)があるので metalness を実用域まで上げられる
  // (St3 が 0.12 に抑えていたのは env map 不在で金属面が黒く潰れたから)。
  const cls = partMatClass(part);
  const s = partMatSet(cls);
  return new THREE.MeshStandardMaterial({
    color: col, map: s.map, normalMap: s.normalMap,
    roughnessMap: s.ormMap, metalnessMap: s.ormMap,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 1, metalness: 1,          // マップ側の値がそのまま効くように基準は 1(乗算されるため)
    envMapIntensity: 0.85,
    flatShading: true, side: THREE.DoubleSide,
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
    const geo = partGeometry(part, part.emissive ? 0.7 : partMatSet(partMatClass(part)).uv);
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
  // three r185 で PCFSoftShadowMap は非推奨(内部で PCFShadowMap に落ちるうえ毎生成で警告が出る)。
  // 実際に使われる型を明示して console を静かに保つ(見た目は変わらない)。
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // St4: フィルミックなトーンマッピング。金属のハイライトが白飛びせず肩で丸まる=「安いCG」感が抜ける。
  // 演出フェイス(弾/爆風/HUD)は toneMapped=false で素の彩度を守る。
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

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

  // --- 地面(接地シャドウの受け手・テーマ別プロシージャル土テクスチャ) + グリッド ---
  // タイル間隔を 80→60 に詰め、代わりにテクスチャ側へ低周波のムラを焼いた(タイル感を割る)。
  const GROUND_SIZE = 8000, GROUND_REPEAT = 134;          // 1タイル ≈ 60 ワールド単位
  const GROUND_TILE = GROUND_SIZE / GROUND_REPEAT;
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 1,
    normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 0.35,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(ARENA_CX, 0, ARENA_CZ);
  ground.receiveShadow = true;
  scene3.add(ground);
  const groundTexCache = new Map();   // (theme,kind) -> 3枚組(テーマ2種×地質2種=最大4組)

  const grid = new THREE.GridHelper(1200, 24, 0x5a7a86, 0x3a5560);
  grid.position.set(ARENA_CX, 0.03, ARENA_CZ);
  grid.material.transparent = true; grid.material.opacity = 0.5;
  scene3.add(grid);

  // 距離フォグ(遠景を地平色に溶かす=ソフト版の距離フェード相当)。色は theme 更新時に設定。
  scene3.fog = new THREE.Fog(0x22303a, 220, 900);

  // --- 遠景(地平のシルエット)+ 戦場の装飾(街の家具)。戦場/テーマが替わった時だけ組み直す ---
  // 遠景は unlit かつ fog:false(フォグ域の外に置くので、フォグを効かせると単色に潰れる)。
  // 装飾は lit + fog あり + 地形テクスチャ=足元の情報量として戦場に馴染ませる。
  const farGroup = new THREE.Group();
  farGroup.renderOrder = -1;           // 空の直後・すべての手前のものより先に描く
  scene3.add(farGroup);
  const decorGroup = new THREE.Group();
  scene3.add(decorGroup);
  let farSig = '', decorSig = '';

  // facesToGroup が返すのは Group(実体は子のメッシュ)なので、直下だけ見ると孫の
  // ジオメトリ/マテリアルが取り残される。戦場やテーマを行き来するたび GPU 資源が積み上がるため
  // traverse で全部を解放する(既存の disposeGroup と同じ流儀)。
  function disposeChildren(group) {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const c = group.children[i];
      group.remove(c);
      c.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
    }
  }
  // 面リスト → 頂点色つきジオメトリ群。lit=地形質感つき MeshStandard(tex キー別に束ねる)、
  // unlit=MeshBasic、isLine=LineSegments。obstacle/decor/遠景で共通に使う。
  // Three の頂点色は「作業色空間(リニア)」として扱われる=16進をそのまま入れると sRGB 値を
  // リニアとして解釈され、約2倍明るく出る。既存の障害物/演出の配色はその前提で調整済みなので
  // 触らない。St4 で新規に起こした遠景・街の装飾だけは linearize:true で正しく変換し、
  // 空(ShaderMaterial 側は Color.set で正しく変換される)と同じ土台で色を決められるようにする。
  const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  function facesToGroup(faces, { lit = true, fog = true, shadow = false, unlitAll = false, linearize = false } = {}) {
    const group = new THREE.Group();
    const buckets = new Map();   // key -> {P,C,tex,variant}
    const emiP = [], emiC = [], linP = [], linC = [];
    for (const it of faces) {
      let [cr, cg, cb, ca] = parseColA(it.color);
      if (linearize) { cr = srgbToLinear(cr); cg = srgbToLinear(cg); cb = srgbToLinear(cb); }
      const a = ca * (it.alpha == null ? 1 : it.alpha);
      if (it.isLine) {
        linP.push(...it.verts[0], ...it.verts[1]); linC.push(cr, cg, cb, a, cr, cg, cb, a);
        continue;
      }
      const v = it.verts;
      const toUnlit = unlitAll || it.emissive || !lit;
      const key = toUnlit ? null : (it.tex || 'rock') + ':' + (it.texVar || 0);
      let P, C;
      if (toUnlit) { P = emiP; C = emiC; } else {
        let b = buckets.get(key);
        if (!b) { b = { P: [], C: [], tex: it.tex || 'rock', variant: it.texVar || 0 }; buckets.set(key, b); }
        P = b.P; C = b.C;
      }
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
    buckets.forEach((b) => {
      if (!b.P.length) return;
      const g = mkGeo(b.P, b.C); g.computeVertexNormals();
      g.setAttribute('uv', new THREE.BufferAttribute(planarUVs(b.P, TERRAIN_UV[b.tex] || 0.1), 2));
      const s = terrainSet(b.tex, b.variant);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        vertexColors: true, map: s.map, normalMap: s.normalMap,
        roughnessMap: s.ormMap, metalnessMap: s.ormMap,
        emissiveMap: s.emissiveMap || null,
        emissive: s.emissiveMap ? 0xffffff : 0x000000,
        emissiveIntensity: s.emissiveMap ? windowLevel() : 0,
        roughness: 1, metalness: 1, envMapIntensity: 0.5,
        flatShading: true, transparent: true, side: THREE.DoubleSide, fog,
      }));
      if (shadow) { m.castShadow = true; }
      m.receiveShadow = !!shadow;
      group.add(m);
    });
    if (emiP.length) {
      group.add(new THREE.Mesh(mkGeo(emiP, emiC), new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, side: THREE.DoubleSide, fog, toneMapped: false,
      })));
    }
    if (linP.length) {
      group.add(new THREE.LineSegments(mkGeo(linP, linC), new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, fog, toneMapped: false,
      })));
    }
    return group;
  }
  // ビルの窓の点灯は「夜(闘技場テーマ)は強く / 昼(演習テーマ)は消え気味」。
  // 生成時にこの値を焼き、テーマが替わったら既存グループを走査して付け替える(材質の参照を溜めない)。
  function windowLevel() { return curTheme === THEMES.arena ? 0.7 : 0.16; }
  function refreshWindowLevel() {
    const lv = windowLevel();
    for (const g of [decorGroup, dynGroup]) {
      g.traverse((c) => { if (c.material && c.material.emissiveMap) c.material.emissiveIntensity = lv; });
    }
  }

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
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  })));
  const fxLine = makeDynLayer((geo) => new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
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
    dg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
    // 障害物の lit 材質と同じ define 構成(USE_MAP+USE_NORMALMAP+USE_ROUGHNESSMAP+USE_METALNESSMAP+
    // vertexColors)で温める。St4 で法線/ORM マップが増えた=define 構成が変わったのでここも合わせる。
    const rs = rockMaps();
    warm.add(new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ vertexColors: true, map: rs.map, normalMap: rs.normalMap, roughnessMap: rs.ormMap, metalnessMap: rs.ormMap, flatShading: true, roughness: 1, metalness: 1, transparent: true, side: THREE.DoubleSide })));
    warm.add(new THREE.Mesh(dg.clone(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, toneMapped: false })));
    warm.add(new THREE.LineSegments(dg.clone(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, toneMapped: false })));
    // 遠景のフォグ無し unlit(fog:false は別プログラム)
    warm.add(new THREE.Mesh(dg.clone(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, fog: false, toneMapped: false })));
    // スプライトは実使用(マーカー/照準リング/計器枠)と同じ define 構成(map+alphaTest+sizeAttenuation:false)で
    // 温める。素の SpriteMaterial では別プログラムになりプリウォームが効かない(USE_MAP/ALPHATEST が変わる)。
    const wc = document.createElement('canvas'); wc.width = 2; wc.height = 2;
    const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace;
    const ws = new THREE.Sprite(new THREE.SpriteMaterial({ map: wt, alphaTest: 0.02, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0, toneMapped: false }));
    ws.position.set(0, -999, 0); ws.scale.setScalar(1e-4);
    warm.add(ws);
    warm.children.forEach((c) => { c.frustumCulled = false; });
    scene3.add(warm);
  }
  function buildObstacleGroup(o, field) {
    const faces = [];
    obstacleWorldFaces({ obstacles: [o], field }, faces);
    // 泥沼は unlit(ソフト版と同じ暗い水面色。照明が乗ると明るい土色に化ける)。発光面も unlit。
    return facesToGroup(faces, { unlitAll: o.kind === 'mud', shadow: o.kind !== 'mud', fog: true });
  }
  function disposeGroup(group) {
    dynGroup.remove(group);
    group.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
  }
  function updateObstacles(obstacles, field) {
    const present = new Set();
    (obstacles || []).forEach((o) => {
      const key = o.kind + ':' + o.x.toFixed(1) + ':' + o.y.toFixed(1) + ':' + (o.r || 0);   // r も同一性に含める
      present.add(key);
      const sig = (o.alive === false ? 'd' : 'a') + ':' + (o.hpFrac == null ? '1' : Math.round(o.hpFrac * 24)) + ':' + (field || '');
      let ent = obsCache.get(key);
      if (ent && ent.sig === sig) { ent.group.visible = true; return; }
      // 近接カットの透過量は組み直しをまたいで引き継ぐ(カメラ前で消えている最中に被弾して
      // 状態が変わると、新しいグループが不透明で1フレーム現れて壁が瞬く)。
      const op = ent ? ent.op : undefined;
      if (ent) disposeGroup(ent.group);
      const group = buildObstacleGroup(o, field);
      dynGroup.add(group);
      obsCache.set(key, { group, sig, op });
    });
    // 戦闘/戦場が替わって不在になった障害物は破棄(隠すだけだとGPU資源がセッション中積み上がる)
    obsCache.forEach((ent, key) => { if (!present.has(key)) { disposeGroup(ent.group); obsCache.delete(key); } });
  }

  // --- 近接カット: カメラと狙点の間に入った遮蔽物を透かして消す ---
  // 市街の高層ビルは何もしないと画面が壁一枚で埋まる(岩柱でも稀に起きる)。カメラ側 3/4 の区間で
  // 視線を横切り、かつカメラがその天端より低い遮蔽物だけを対象にし、0.1s で滑らかに抜き差しする
  // (即時オンオフはカットのようにチラつく)。判定は描画のみ=シム/射線には一切触れない。
  function updateObstacleCull(obstacles, eye, target, dt, field) {
    if (!eye || !target) return;
    const dx = target[0] - eye[0], dz = target[2] - eye[2];
    const len2 = dx * dx + dz * dz || 1;
    const k = 1 - Math.exp(-Math.max(0.001, dt) / 0.1);
    (obstacles || []).forEach((o) => {
      if (o.kind !== 'wall' || o.alive === false) return;
      const key = o.kind + ':' + o.x.toFixed(1) + ':' + o.y.toFixed(1) + ':' + (o.r || 0);
      const ent = obsCache.get(key);
      if (!ent) return;
      // 天端の見積り(obstacleWorldFaces の高さ式に合わせた保守値)。カメラがこれより上なら跨いで見える。
      const topY = field === 'shigai' ? o.r * 2.4 : 12;
      let block = false;
      if (eye[1] < topY) {
        let t = ((o.x - eye[0]) * dx + (o.y - eye[2]) * dz) / len2;
        if (t < 0.78) {                                  // 狙点側の遮蔽は残す(奥行きの手掛かり)
          t = t < 0 ? 0 : t;
          const px = eye[0] + dx * t, pz = eye[2] + dz * t;
          block = Math.hypot(o.x - px, o.y - pz) < o.r * 1.05;
        }
      }
      const want = block ? 0 : 1;
      const cur = ent.op == null ? 1 : ent.op;
      const op = cur + (want - cur) * k;
      ent.op = Math.abs(op - want) < 0.01 ? want : op;
      if (ent.opApplied === ent.op) return;
      ent.opApplied = ent.op;
      ent.group.traverse((c) => {
        if (!c.material) return;
        if (c.userData._cs === undefined) c.userData._cs = !!c.castShadow;   // 元の影設定を覚えて戻せるように
        c.material.opacity = ent.op;
        c.visible = ent.op > 0.02;
        c.castShadow = c.userData._cs && ent.op > 0.5;
      });
    });
  }

  // --- 遠景+装飾の組み直し(戦場id/テーマが変わった時だけ) ---
  function updateSceneryAndDecor(field, theme) {
    const fsig = (field || '') + '|' + (theme === THEMES.arena ? 'a' : 't');
    if (fsig !== farSig) {
      farSig = fsig;
      disposeChildren(farGroup);
      const faces = [];
      distantSceneryFaces(theme, field, faces);
      // 遠景はフォグ域の外=フォグを切って色を手で決める。影も不要(遠すぎて意味がない)。
      const g = facesToGroup(faces, { lit: false, fog: false, shadow: false, linearize: true });
      g.traverse((c) => { c.frustumCulled = false; });
      farGroup.add(g);
    }
    if ((field || '') !== decorSig) {
      decorSig = field || '';
      disposeChildren(decorGroup);
      const faces = [];
      fieldDecorFaces(field, faces);
      if (faces.length) decorGroup.add(facesToGroup(faces, { lit: true, fog: true, shadow: true, linearize: true }));
      refreshWindowLevel();
    }
  }

  // --- 敵機マーカーHUD: 距離+方向の▽をスプライト(スクリーン等倍)で敵機頭上に出す。
  //     ソフト版の 2D 描画と同じ表示条件(auto カメラ・2機・生存・距離>90)と配色(遮蔽=橙の破線)。 ---
  const mkCanvas = document.createElement('canvas');
  mkCanvas.width = 192; mkCanvas.height = 96;
  const mkTex = new THREE.CanvasTexture(mkCanvas);
  mkTex.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: mkTex, sizeAttenuation: false, depthTest: false, transparent: true, alphaTest: 0.02, toneMapped: false,
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
    map: rtTex, sizeAttenuation: false, depthTest: false, transparent: true, alphaTest: 0.02, toneMapped: false,
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
    map: cpTex, sizeAttenuation: false, depthTest: false, transparent: true, alphaTest: 0.02, toneMapped: false,
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
  let lastCullT = null;      // 近接カットのフェード用に前フレームの時刻を持つ(シークで負dtなら次フレームで復帰)

  // 環境マップ: テーマの空+太陽+地面を equirect に描き PMREM でぼかす。金属面の映り込みの元。
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envCache = new Map();
  function applyEnv(theme) {
    let env = envCache.get(theme);
    if (!env) {
      const eq = envEquirect(theme);
      env = pmrem.fromEquirectangular(eq).texture;
      eq.dispose();
      envCache.set(theme, env);
    }
    scene3.environment = env;
  }

  // 地面: テーマ×地質(土/舗装)の3枚組。市街戦だけ舗装にする。
  let groundSig = null;
  function applyGround(theme, kind) {
    const key = (theme === THEMES.arena ? 'a:' : 't:') + kind;
    if (groundSig === key) return;
    groundSig = key;
    let set = groundTexCache.get(key);
    if (!set) {
      set = groundMaps(kind === 'asphalt' ? ASPHALT_THEME : theme, kind);
      const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      for (const t of [set.map, set.normalMap, set.ormMap]) {
        t.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = aniso;
      }
      groundTexCache.set(key, set);
    }
    groundMat.map = set.map;
    groundMat.normalMap = set.normalMap;
    groundMat.roughnessMap = set.ormMap;
    groundMat.metalnessMap = set.ormMap;
    groundMat.needsUpdate = true;
  }

  function applyTheme(theme) {
    if (theme === curTheme) return;
    curTheme = theme;
    skyUni.c0.value.set(theme.sky[0]); skyUni.c1.value.set(theme.sky[1]);
    skyUni.c2.value.set(theme.sky[2]); skyUni.c3.value.set(theme.sky[3]);
    scene3.fog.color.set(theme.ground[0]);
    hemi.color.set(theme.sky[2]); hemi.groundColor.set(theme.ground[2]);
    // 夜(闘技場)は太陽を弱め、環境光と街の灯りに寄せる=同じシーンでも時間帯が変わって見える
    const night = theme === THEMES.arena;
    sun.intensity = night ? 0.95 : 1.9;
    sun.color.set(night ? 0xffd0a8 : 0xfff2e0);
    hemi.intensity = night ? 0.7 : 1.15;
    fill.intensity = night ? 0.22 : 0.35;
    applyEnv(theme);
    refreshWindowLevel();
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
    const theme = themeOf(scene);
    applyTheme(theme);
    // St4: 戦場別の地質(市街=舗装)・遠景(山稜 or スカイライン)・街の装飾。
    const field = scene.field || null;
    applyGround(theme, field === 'shigai' ? 'asphalt' : 'dirt');
    // 遠方のフォグ色: 通常は地面色(土に溶ける)。市街は都市のスモッグ寄りの中性色にする
    // (土の暗緑がアスファルトの灰黒とぶつかって、地平に緑の帯が出るため)。
    scene3.fog.color.set(field === 'shigai'
      ? (theme === THEMES.arena ? 0x2a1d1c : 0x2b3238)
      : theme.ground[0]);
    updateSceneryAndDecor(field, theme);
    grid.visible = field !== 'shigai';   // 市街は道路と区画線が方向の手掛かり=デバッググリッドは邪魔

    const camInfo = updateCamera(scene, t, aspect);
    window.__r3dCam = camInfo;   // デバッグハンドル(__kb と同じ流儀): 実機検証でPOV区間の特定に使う
    window.__r3dInfo = renderer.info;   // 同上: 戦場/テーマを往復させて GPU 資源が積み上がらないかを実測する

    // グリッド/地面を注視点へ追従(グリッド間隔にスナップ=線はワールド整列のまま窓だけ動く=無限地面)。
    // 機体が歩いて移動しても常に足元に地面があり、地面が流れて見える(歩行と地面の連動)。
    const gstep = 1200 / 24;   // GridHelper(1200, 24) のセル間隔=50
    grid.position.set(Math.round(camInfo.target[0] / gstep) * gstep, 0.03, Math.round(camInfo.target[2] / gstep) * gstep);
    // 地面もテクスチャタイル間隔にスナップ(連続追従だと土テクスチャが機体と一緒に流れて見える)
    ground.position.set(Math.round(camInfo.target[0] / GROUND_TILE) * GROUND_TILE, 0, Math.round(camInfo.target[2] / GROUND_TILE) * GROUND_TILE);

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

    updateObstacles(scene.obstacles, field);
    updateObstacleCull(scene.obstacles, camSt.eye, camInfo.target, t - (lastCullT == null ? t - 0.016 : lastCullT), field);
    lastCullT = t;
    updateMarker(scene, camInfo.showMarkers);
    updateCockpitHUD(scene, camInfo.pov, aspect);

    renderer.render(scene3, camera);
  }

  return { render };
}
