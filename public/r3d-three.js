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
  MECH_SCALE, ARENA_CX, ARENA_CZ,
} from './r3d.js';

const DEG = Math.PI / 180;
const FOV_Y_DEG = 55;               // r3d.js の FOV_Y と一致
const SHOT_Y = 3.3 * MECH_SCALE;    // 弾の高さ(r3d.js MUZZLE_Y 相当)
const CAM_TAU = 0.5, CAM_DT_MAX = 0.1;

// 弾種ごとの色(最小描画。第3段で本演出へ差し替え)
const SHOT_COLOR = {
  rifle: 0xffcf6a, beam: 0x7dffcf, railgun: 0xcfe8ff, missile: 0xffcf4a,
  shotgun: 0xff9a4a, blade: 0xdfffef, drill: 0x9aa4a8, rocketpunch: 0xc7d0d4,
};

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
  return { root, groups, mats, baseColor, aliveState: true };
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

  // --- 動的オブジェクト(弾/爆風/障害物)のプール ---
  const mechTrees = new Map();   // mesh(オブジェクト参照) -> tree
  const shotPool = [];           // THREE.Line
  const blastPool = [];          // THREE.Mesh(sphere)
  const obsPool = [];            // THREE.Mesh(cylinder)
  const dynGroup = new THREE.Group();
  scene3.add(dynGroup);

  let lastW = 0, lastH = 0;   // canvas 実寸(dpr込み)を自前で追跡。app が canvas.width を直接いじるため
                              // renderer.domElement.width との比較では setSize 漏れ→ビューポート不整合(letterbox)になる。
  const camSt = {
    t: null, eye: null, target: null, shotIdx: -1,
    seed: null, distEMA: null, tripodIdx: -1, tripodEye: null, amAng: null,
    projIdx: -1, projSig: null, amLock: null, lineSide: null,
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
      return { target, showMarkers: true };
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
    return { target: camSt.target, showMarkers: raw.showMarkers };
  }

  // --- 弾: 発射元→着弾点の線(最小)。scene.shots[{x,y,tx,ty,age01,kind}] を想定 ---
  function updateShots(shots) {
    let n = 0;
    (shots || []).forEach((s) => {
      const ax = s.x, az = s.y;
      const bx = s.tx != null ? s.tx : s.x, bz = s.ty != null ? s.ty : s.y;
      const age = s.age01 == null ? 0 : s.age01;
      const hx = ax + (bx - ax) * age, hz = az + (bz - az) * age;      // 弾頭位置
      const t0 = Math.max(0, age - 0.12);
      const tx0 = ax + (bx - ax) * t0, tz0 = az + (bz - az) * t0;      // 短い尾
      let line = shotPool[n];
      if (!line) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
        line = new THREE.Line(geo, new THREE.LineBasicMaterial({ transparent: true }));
        shotPool[n] = line; dynGroup.add(line);
      }
      const p = line.geometry.attributes.position;
      p.setXYZ(0, tx0, SHOT_Y, tz0); p.setXYZ(1, hx, SHOT_Y, hz); p.needsUpdate = true;
      line.material.color.set(SHOT_COLOR[s.kind] || 0xffe0a0);
      line.material.opacity = 0.95;
      line.visible = true; n++;
    });
    for (let i = n; i < shotPool.length; i++) shotPool[i].visible = false;
  }

  // --- 爆風: 膨張する半透明球(最小)。scene.blasts[{x,y,age01,r?}] ---
  function updateBlasts(blasts) {
    let n = 0;
    (blasts || []).forEach((b) => {
      const age = b.age01 == null ? 0 : b.age01;
      let m = blastPool[n];
      if (!m) {
        m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0xffa64a, transparent: true, depthWrite: false }));
        blastPool[n] = m; dynGroup.add(m);
      }
      const r = (0.6 + age * 3.2) * MECH_SCALE * (b.r ? b.r / 40 + 1 : 1);
      m.position.set(b.x, 1.4 * MECH_SCALE, b.y);
      m.scale.setScalar(Math.max(0.05, r));
      m.material.opacity = Math.max(0, 0.55 * (1 - age));
      m.visible = m.material.opacity > 0.02; n++;
    });
    for (let i = n; i < blastPool.length; i++) blastPool[i].visible = false;
  }

  // --- 障害物: 単純な円柱(最小。第3段で地形/泥/岩の本描画へ) ---
  function updateObstacles(obstacles) {
    let n = 0;
    (obstacles || []).forEach((o) => {
      const r = (o.r || 6);
      let m = obsPool[n];
      if (!m) {
        m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10),
          new THREE.MeshStandardMaterial({ color: 0x5a5348, roughness: 0.95, metalness: 0.0, flatShading: true }));
        m.castShadow = true; m.receiveShadow = true;
        obsPool[n] = m; dynGroup.add(m);
      }
      const h = Math.max(2, r * 0.7);
      m.scale.set(r, h, r);
      m.position.set(o.x, h / 2, o.y);
      m.visible = true; n++;
    });
    for (let i = n; i < obsPool.length; i++) obsPool[i].visible = false;
  }

  function tintTree(tree, alive) {
    if (tree.aliveState === alive) return;
    tree.aliveState = alive;
    for (let i = 0; i < tree.mats.length; i++) {
      const base = tree.baseColor[i];
      if (alive) tree.mats[i].color.copy(base);
      else tree.mats[i].color.copy(base).lerp(new THREE.Color(0x0a0a0a), 0.6);   // 撃破=暗く
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
    (scene.mechs || []).forEach((m) => {
      const mesh = m.mesh; if (!mesh || !mesh.parts) return;
      let tree = mechTrees.get(mesh);
      if (!tree) { tree = buildMechTree(mesh); mechTrees.set(mesh, tree); scene3.add(tree.root); }
      present.add(tree);
      const P = computeMechPose(m, t);
      if (!P) { tree.root.visible = false; return; }
      tintTree(tree, P.alive);
      applyMotion(tree, mesh, P.motions);
      applyRoot(tree.root, P);
      tree.root.visible = true;
    });
    mechTrees.forEach((tree) => { if (!present.has(tree)) tree.root.visible = false; });

    updateShots(scene.shots);
    updateBlasts(scene.blasts);
    updateObstacles(scene.obstacles);

    renderer.render(scene3, camera);
  }

  return { render };
}
