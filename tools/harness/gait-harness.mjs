// 歩容の物理妥当性ハーネス(St2)。人間が毎回目視しなくても「倒れる/滑る/重心が乗らない」を
// 定量検出できる自動チェック。ブラウザ実行の描画は手続き歩容のまま(決定論・build不要)で、この
// ハーネスだけが物理を使う=「検証と描画の分離」。
//
//   node tools/harness/gait-harness.mjs [--dir dev] [--phys]
//
// 測る量(すべて poseWorld=本体と同じ computeMechPose 由来。LESSONS「bot は本体と同じ関数・同じ量で」):
//  A) 接地スリップ: stance の足パーツ重心がワールドXZでフレーム間にどれだけ動くか。
//     St1 の不変量「接地脚は対地で静止」の一般化。前進は緑・横移動で壊れているのを検出する。
//  B) 支持マージン: 支持脚の接地点が作る支持多角形(単脚なら足の footprint 矩形)に対し、重心XZ投影の
//     符号つきマージン。負=重心が支持の外(=静的には倒れる)。動的二脚は単脚期に一時的に負になり得るので
//     「平均マージン」と「重心の横シフトが接地脚に追従するか(重心感)」を主指標にする。
//  C) 動的トッポル(--phys): cannon-es で数歩容位相を凍結→接地脚を地面に固定+重力+微小外乱→短時間積分し
//     重心の水平ドリフト/胴の傾きを実測。静的マージンでは見えない動的な倒れやすさを確認する。
//
// exit code 1 = どれか赤(CI・AI反復用)。

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');
const args = process.argv.slice(2);
const DIRFLAG = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : 'dev';
const USE_PHYS = args.includes('--phys');
const BASE = join(ROOT, 'public', DIRFLAG);

const { mechMesh, poseWorld, MECH_SCALE } = await import(join(BASE, 'r3d.js'));
const { PARTS, defaultBuild } = await import(join(BASE, 'parts.js'));

// テストする脚種と代表 build(脚だけ差し替え)。
const LEGS = [
  { id: 'lg1', label: '二脚・疾風', kind: 'biped' },
  { id: 'lg8', label: '四脚・子鹿', kind: 'quad' },
  { id: 'lg12', label: '逆関節・雛', kind: 'reverse' },
];
// 移動方向(機体ローカル)。turn は旋回しながら前進。
const DIRS = [
  { key: 'fwd',   fwd: 1,  lat: 0,  turn: 0 },
  { key: 'back',  fwd: -1, lat: 0,  turn: 0 },
  { key: 'right', fwd: 0,  lat: 1,  turn: 0 },
  { key: 'left',  fwd: 0,  lat: 0,  turn: 0, latNeg: true },
  { key: 'turnR', fwd: 0.6, lat: 0, turn: 0.6 },
];

const SPEED = 22;       // m/s(疾風相当)
const DT = 1 / 60;
const WARM = 60;        // 助走(gait 状態を定常に)
const FRAMES = 150;     // 計測フレーム

// 足の footprint 半径(接地点の周りに支持面を持たせる=単脚でも面。実寸: 足幅~0.4m×MECH_SCALE)
const FOOT_R = 0.55 * MECH_SCALE;

// 点が凸包(点群)内かの符号つきマージン。点群1〜2点は「点/線分の周りに半径FOOT_Rの太らせ」で近似。
function supportMargin(comXZ, contacts) {
  if (contacts.length === 0) return -Infinity;
  if (contacts.length === 1) {
    const d = Math.hypot(comXZ[0] - contacts[0][0], comXZ[1] - contacts[0][1]);
    return FOOT_R - d;                      // 足の footprint 内なら正
  }
  if (contacts.length === 2) {
    // 線分までの距離。線分の内側(投影が[0,1])なら垂距、外なら端点距離。太らせ FOOT_R。
    const [a, b] = contacts;
    const abx = b[0] - a[0], abz = b[1] - a[1];
    const L2 = abx * abx + abz * abz;
    let tproj = L2 > 1e-9 ? ((comXZ[0] - a[0]) * abx + (comXZ[1] - a[1]) * abz) / L2 : 0;
    tproj = Math.max(0, Math.min(1, tproj));
    const px = a[0] + abx * tproj, pz = a[1] + abz * tproj;
    const d = Math.hypot(comXZ[0] - px, comXZ[1] - pz);
    return FOOT_R - d;
  }
  // 3点以上: 凸包の各辺に対する内側符号距離の最小(凸包外なら負)。太らせ FOOT_R。
  const pts = convexHull(contacts);
  let minEdge = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const nx = ez, nz = -ex;                // 右手系の外向き法線(CCW包なら内側が正になるよう後で符号調整)
    const len = Math.hypot(nx, nz) || 1;
    const sd = ((comXZ[0] - a[0]) * nx + (comXZ[1] - a[1]) * nz) / len;
    minEdge = Math.min(minEdge, sd);
  }
  // CCW 凸包では内側で sd<0 になる法線定義なので反転してマージンに
  return -minEdge + FOOT_R;
}

function convexHull(points) {
  const pts = points.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

function runDir(mesh, dir) {
  // gait 状態をリセット(mesh._gait を作り直す)
  mesh._gait = undefined;
  const lat = dir.latNeg ? -1 : dir.lat;
  const mag = Math.min(1, Math.hypot(dir.fwd, lat));
  const mech = { mesh, x: 500, y: 500, h: 0, alive: true, walkPhase: 0, moveLocal: { fwd: dir.fwd, lat, mag } };
  let t = 0;
  const prevFoot = {}, prevStance = {};
  // A) plantError(主指標): 描画された足の接地点が「IKが意図した接地点 anchor」からどれだけズレるか。
  //    正しい planted-foot なら ≈0。横成分の取りこぼし等で足が股直下へ寄ると大きくなる=倒れて見える主因。
  let plantMax = 0, plantSum = 0, plantN = 0;
  // 参考) slip=描画足のフレーム間ワールド移動 / margin=重心‐支持多角形の符号つきマージン /
  //       comSway=重心の機体横方向オフセット振幅(重心シフトの有無)
  let slipMax = 0;
  let marginMin = Infinity, marginSum = 0, marginN = 0;
  let comLatMin = Infinity, comLatMax = -Infinity;
  const total = WARM + FRAMES;
  for (let f = 0; f < total; f++) {
    t += DT;
    mech.h += dir.turn * DT;
    const fwd3 = [Math.cos(mech.h), Math.sin(mech.h)];      // XZ
    const rgt3 = [Math.sin(mech.h), -Math.cos(mech.h)];
    mech.x += (fwd3[0] * dir.fwd + rgt3[0] * lat) * SPEED * DT;
    mech.y += (fwd3[1] * dir.fwd + rgt3[1] * lat) * SPEED * DT;
    const W = poseWorld(mech, t);
    if (!W) continue;
    // 計測点: 二脚/逆関節=足パーツcentroid(第1段の校正値を維持)。四脚=toe(脛の底面中心=IK連鎖の終端)。
    // 四脚は足パーツが無く脛centroidは中空(脛中央)で、脛が傾くほど接地点からズレる計測バイアスがあった。
    const mp = (ft) => ((mesh.legsKind === 'quad' || mesh.legsKind === 'reverse') && ft.toe) ? ft.toe : ft.centroid;
    if (f >= WARM) {
      const stanceContacts = [];
      for (const [i, ft] of Object.entries(W.feet)) {
        if (ft.stance) {
          stanceContacts.push([ft.contact[0], ft.contact[2]]);
          if (ft.anchor) {
            const p = mp(ft);
            const d = Math.hypot(p[0] - ft.anchor[0], p[2] - ft.anchor[1]);
            plantSum += d; plantN++; if (d > plantMax) plantMax = d;
          }
          if (prevFoot[i] && prevStance[i]) {
            const p = mp(ft);
            const s = Math.hypot(p[0] - prevFoot[i][0], p[2] - prevFoot[i][2]);
            if (s > slipMax) slipMax = s;
          }
        }
      }
      if (stanceContacts.length > 0) {
        const m = supportMargin([W.com[0], W.com[2]], stanceContacts);
        marginSum += m; marginN++; if (m < marginMin) marginMin = m;
      }
      // 重心の機体横方向オフセット(重心シフト振幅)
      const comLat = (W.com[0] - mech.x) * rgt3[0] + (W.com[2] - mech.y) * rgt3[1];
      if (comLat < comLatMin) comLatMin = comLat; if (comLat > comLatMax) comLatMax = comLat;
    }
    for (const [i, ft] of Object.entries(W.feet)) { prevFoot[i] = mp(ft); prevStance[i] = ft.stance; }
  }
  return {
    plantMax, plantAvg: plantN ? plantSum / plantN : 0,
    slipMax, marginMin, marginAvg: marginN ? marginSum / marginN : -Infinity,
    comSway: (comLatMax - comLatMin),
  };
}

// ---- 動的トッポル(cannon-es) ----
async function physProbe(mesh, dir) {
  const CANNON = await import(join(__dir, 'vendor/cannon-es.js'));
  mesh._gait = undefined;
  const lat = dir.latNeg ? -1 : dir.lat;
  const mag = Math.min(1, Math.hypot(dir.fwd, lat));
  const mech = { mesh, x: 500, y: 500, h: 0, alive: true, walkPhase: 0, moveLocal: { fwd: dir.fwd, lat, mag } };
  // 助走して定常な歩容位相へ
  let t = 0;
  for (let f = 0; f < WARM + 30; f++) {
    t += DT; const fwd3 = [Math.cos(mech.h), Math.sin(mech.h)], rgt3 = [Math.sin(mech.h), -Math.cos(mech.h)];
    mech.x += (fwd3[0] * dir.fwd + rgt3[0] * lat) * SPEED * DT;
    mech.y += (fwd3[1] * dir.fwd + rgt3[1] * lat) * SPEED * DT;
  }
  // いくつかの位相で凍結して倒れテスト
  let worstDrift = 0;
  for (let s = 0; s < 4; s++) {
    for (let k = 0; k < 10; k++) { t += DT; const fwd3 = [Math.cos(mech.h), Math.sin(mech.h)], rgt3 = [Math.sin(mech.h), -Math.cos(mech.h)]; mech.x += (fwd3[0] * dir.fwd + rgt3[0] * lat) * SPEED * DT; mech.y += (fwd3[1] * dir.fwd + rgt3[1] * lat) * SPEED * DT; }
    const W = poseWorld(mech, t);
    if (!W) continue;
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
    // 全質量を重心に集約した1剛体(倒れの主因は重心と支持の関係)。半径=平均footprintで箱。
    const body = new CANNON.Body({ mass: Math.max(1, W.mass), shape: new CANNON.Box(new CANNON.Vec3(0.5, W.com[1] - 0, 0.5)) });
    body.position.set(W.com[0], W.com[1], W.com[2]);
    world.addBody(body);
    // 接地脚を「支点」としてピン(距離拘束で重心を支持点上の逆振り子に)。stance 足のみ。
    for (const [i, ft] of Object.entries(W.feet)) {
      if (!ft.stance) continue;
      const pivot = new CANNON.Body({ mass: 0 });
      pivot.position.set(ft.contact[0], 0, ft.contact[2]);
      world.addBody(pivot);
      const c = new CANNON.PointToPointConstraint(body, new CANNON.Vec3(ft.contact[0] - W.com[0], -W.com[1], ft.contact[2] - W.com[2]), pivot, new CANNON.Vec3(0, 0, 0));
      world.addConstraint(c);
    }
    // 微小外乱(横)+重力で 0.6s 積分。重心の水平ドリフトを測る。
    body.velocity.set(0.2, 0, 0.2);
    const p0 = [body.position.x, body.position.z];
    for (let f = 0; f < 36; f++) world.step(DT);
    const drift = Math.hypot(body.position.x - p0[0], body.position.z - p0[1]);
    if (drift > worstDrift) worstDrift = drift;
  }
  return worstDrift;
}

// ---- 実行 ----
// plantMax(主指標)= 描画足と意図接地点のズレ。planted-foot が守れていれば ≈0。閾値0.20m。
// physDrift = cannon-es の倒れテスト(重心水平ドリフト)。
const TH = { plantMax: 0.20, physDrift: 1.2 };
let red = 0;
console.log(`gait-harness (${DIRFLAG})  SPEED=${SPEED}m/s  ${USE_PHYS ? '+phys(cannon-es)' : ''}`);
for (const leg of LEGS) {
  const mesh = mechMesh({ ...defaultBuild(), legs: leg.id }, PARTS, '#8fa3b0');
  // St2: 移植済みの脚種を緑判定の対象に加えていく(第1段=二脚、第2段=四脚、第3段=逆関節をtoe計測で有効化)。
  const GATE = leg.kind === 'biped' || leg.kind === 'quad' || leg.kind === 'reverse';
  console.log(`\n■ ${leg.label} (${leg.kind})${GATE ? '' : '  — 参考(計測整備前)'}`);
  console.log('  dir     plantMax plantAvg  slipMax  marginMin comSway  ' + (USE_PHYS ? 'physDrift' : ''));
  for (const dir of DIRS) {
    const r = runDir(mesh, dir);
    let phys = null;
    if (USE_PHYS) phys = await physProbe(mesh, dir);
    const plantBad = r.plantMax > TH.plantMax;
    const physBad = phys != null && phys > TH.physDrift;
    if (GATE && (plantBad || physBad)) red++;
    const mark = (b) => b ? '✗' : ' ';
    console.log(
      `  ${dir.key.padEnd(6)}  ${r.plantMax.toFixed(3)}${mark(plantBad)} ${r.plantAvg.toFixed(3)}    ` +
      `${r.slipMax.toFixed(3)}   ${r.marginMin.toFixed(3)}   ${r.comSway.toFixed(3)}  ` +
      (USE_PHYS ? `${phys.toFixed(3)}${mark(physBad)}` : '')
    );
  }
}
console.log(`\n${red === 0 ? 'ALL GREEN' : red + ' RED'}  (閾値 plantMax<${TH.plantMax}${USE_PHYS ? ' / physDrift<' + TH.physDrift : ''})`);
process.exit(red === 0 ? 0 : 1);
