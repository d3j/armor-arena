// 観戦カメラのハーネス — node tools/harness/cam-probe.mjs [--dir dev]
// 「カメラが地形にめり込まない」「決着後の周回が待たされない/画面に入る」を数値で守る。
// r3d.js は DOM を触らずに import できる(純関数のカメラ director と cameraFloorAt を持つ)ので、
// ブラウザを開かずに回帰検出できる。ここが緑でも見た目の良し悪しは人間が見る(実機確認は別)。
//
// 検査:
//  A) 足場のめり込み: 瓦礫塚の上に2機を立たせ、全ショット種を舐めて eye が天端より下に来ないか。
//     (至近ショットは eye が 0.84〜2.9m しかないので、標高を見落とすと塚の中に埋まる)
//  B) 足場クランプが平地に染み出さない: 瓦礫の無い座標で cameraFloorAt が 0 を返すか
//     (0 でないと白兵至近の低い煽りが全戦場で失われる)。
//  C) 塚の形がシムと一致: cameraFloorAt が sim.js と同じランプ(天端 CLIMB_TOP_FRAC まで平ら→縁で0)か。
//  D) 決着後の周回: 実戦の決着距離分布に対し「周回開始までの秒数」と「余韻カメラが旋回円の外に居るか」。
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const argv = process.argv.slice(2);
// 既定は開発版(このハーネスが守る足場クランプは v5 で入った=本番へはまだ昇格していない)。
// 本番(--dir .)に対して回すと、未昇格の間は A〜C・E をスキップして D だけ回す。
const dirArg = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : 'dev';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = join(root, 'public', dirArg === 'dev' ? 'dev' : '.');

const { simulate, FIELDS, getField } = await import(`${DIR}/sim.js`);
const { CLIMB_TOP_FRAC, footYAt } = await import(`${DIR}/fields.js`);
const r3d = await import(`${DIR}/r3d.js`);
const { computeAutoCamera, cameraFloorAt, cameraFloorClamp, CAM_FLOOR_CLEAR, FOV_Y,
        MECH_SCALE, ARENA_CX, ARENA_CZ, WORLD_SCALE } = r3d;
const HAS_FLOOR = typeof cameraFloorAt === 'function' && typeof cameraFloorClamp === 'function';

let fail = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? `  ${extra}` : ''));
  if (!cond) fail++;
};
const W = (v) => ARENA_CX + (v - ARENA_CX) * WORLD_SCALE;   // シムm → ワールド(x/z 共通。中心は同値)
const scaledObstacles = (fid) => (getField(fid).obstacles || [])
  .map((o) => ({ ...o, x: W(o.x), y: W(o.y), r: o.r * WORLD_SCALE }));

// ---- A/B/C: 足場とカメラ ----
// 検査するのは**表示カメラ**(director の目標 → 平滑化 → cameraFloorClamp)。director の生出力だけを
// 見ると、標高を知らない系統(FRAMED/弾追跡/クライマックスカット)を「落ちて当然」として見逃す。
// 平滑化はレンダラ(r3d-three updateCamera)と同じ式をここに置く=カットでスナップ・以外は τ 追従。
const CAM_TAU = 0.5;
function displayEye(scene, tSec, aspect, camSt, dt) {
  const raw = computeAutoCamera(scene, tSec, aspect, camSt, dt, camSt.t == null);
  const cut = camSt.t == null || raw.shotIdx !== camSt.shotIdx || !camSt.dispEye;
  if (cut) { camSt.dispEye = raw.eye.slice(); camSt.dispTarget = raw.target.slice(); }
  else {
    const k = 1 - Math.exp(-dt / (raw.tau || CAM_TAU));
    for (let i = 0; i < 3; i++) {
      camSt.dispEye[i] += (raw.eye[i] - camSt.dispEye[i]) * k;
      camSt.dispTarget[i] += (raw.target[i] - camSt.dispTarget[i]) * k;
    }
  }
  camSt.t = tSec; camSt.shotIdx = raw.shotIdx;
  cameraFloorClamp(scene, camSt.dispEye, camSt, dt, cut);
  return { eye: camSt.dispEye, shotIdx: raw.shotIdx, pov: raw.pov };
}
// ショット種の内訳(検査が SHOULDER だけに偏っていないかを可視化する。偏ったら assert で落とす)
const shotKind = (idx) => idx === -2000 ? '決着カット' : idx === -1500 ? 'クライマックス'
  : idx === -1000 ? '余韻' : 'ショット' + (idx % 5);

console.log('== 足場クランプ(小障害物へのめり込み) ==');
if (!HAS_FLOOR) console.log('  — cameraFloorAt/Clamp が無い(本番へ未昇格)ためスキップ');
else {
  // 瓦礫を持つ戦場すべてで、いちばん高い塚の上に2機を立たせて舐める。
  // 距離は毎回振る: 間合いで採用ショットが変わる(白兵<30 / POV≥60 / 両機フレーム>120)ので、
  // 近接だけで回すと肩越しにフォールバックした画しか検査できない。
  for (const f of FIELDS) {
    const obs = scaledObstacles(f.id);
    const rub = obs.filter((o) => o.kind === 'rubble').sort((p, q) => q.h - p.h)[0];
    if (!rub) continue;
    const elev = rub.h;   // 天端に立つ=シムが返す標高
    let worst = Infinity, worstAt = '';
    const seen = new Map();
    for (const gap of [8, 70, 150]) {
      const camSt = {};
      for (let i = 0; i < 300; i++) {
        // 撃破直後(決着カット)も含めるため、3回に1回は敗者に deadAge を入れる
        const dying = i % 3 === 0;
        const jx = Math.cos(i * 0.7) * 2, jz = Math.sin(i * 1.1) * 2;   // 位置を振ってシード=ショット割りも振る
        const mechs = [
          { x: rub.x + jx, y: rub.y + jz, h: 0, elev, mesh: null,
            alive: !dying, deadAge: dying ? (i % 30) / 10 : undefined },
          // 相手は塚の外(離れるほど標高0の平地に立つ)。gap=8 は同じ天端の上。
          { x: rub.x + gap + jx, y: rub.y, h: Math.PI, elev: gap > 20 ? 0 : elev, mesh: null },
        ];
        const scene = { mechs, obstacles: obs, field: f.id, shots: [] };
        const r = displayEye(scene, i * 0.25, 1.674, camSt, 0.25);
        const k = shotKind(r.shotIdx); seen.set(k, (seen.get(k) || 0) + 1);
        const clr = r.eye[1] - cameraFloorAt(scene, r.eye[0], r.eye[2]);
        if (clr < worst) { worst = clr; worstAt = k; }
      }
    }
    ok(`${f.id}: 塚(h=${rub.h})の上でも表示カメラが天端より下に来ない`, worst >= 0,
       `最小クリアランス ${worst.toFixed(2)}${worst < 0 ? '(' + worstAt + ')' : ''} / 種${seen.size}`);
    if (f.id === FIELDS[0].id) {
      ok('  検査が肩越しだけに偏っていない(3種以上)', seen.size >= 3,
         [...seen.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
    }
  }
}
if (HAS_FLOOR) {
  const fid = FIELDS.find((f) => (f.obstacles || []).some((o) => o.kind === 'rubble')).id;
  const obs = scaledObstacles(fid);
  const rub = obs.filter((o) => o.kind === 'rubble')[0];
  const scene = { obstacles: obs, field: fid };
  ok('平地(塚の外)では床0=至近ショットの低い煽りを潰さない',
     cameraFloorAt(scene, rub.x + rub.r * 1.2, rub.y) === 0);
  // 浮かせ量は設計上いちばん低いアイレベル(白兵 1.4×MECH_SCALE)より下であること。
  // 超えると塚の上では必ずクランプが働き、低い煽りのショットが成立しなくなる。
  ok('浮かせ量が白兵至近のアイレベルより低い', CAM_FLOOR_CLEAR < 1.4 * MECH_SCALE,
     `CLEAR ${CAM_FLOOR_CLEAR} < ${(1.4 * MECH_SCALE).toFixed(2)}`);
  // 塚の縁を跨ぐときに段差で跳ねない(床が0から連続に立ち上がるので下限も連続であること)
  {
    let maxStep = 0, prev = null;
    const st = {};
    for (let i = 0; i <= 200; i++) {
      const x = rub.x + rub.r * (1.1 - i * 0.006);      // 縁の外→天端へゆっくり入る
      const eye = [x, 0, rub.y];                        // 地面すれすれ=必ずクランプが効く高さ
      cameraFloorClamp(scene, eye, st, 1 / 60, i === 0);
      if (prev != null) maxStep = Math.max(maxStep, Math.abs(eye[1] - prev));
      prev = eye[1];
    }
    ok('塚の縁を跨いでも下限が段差で跳ねない', maxStep < 0.12, `1フレーム最大 ${maxStep.toFixed(3)}`);
  }
  // 形がシム(sim.js の標高式)と一致するか: 天端の内側=o.h / 縁=0 / 中間=ランプ
  const at = (frac) => cameraFloorAt(scene, rub.x + rub.r * frac, rub.y);
  const want = (frac) => rub.h * Math.max(0, Math.min(1, (1 - frac) / (1 - CLIMB_TOP_FRAC)));
  const diffs = [0, 0.3, CLIMB_TOP_FRAC, 0.8, 0.99].map((fr) => Math.abs(at(fr) - want(fr)));
  ok('塚の形がシムの標高式と一致(天端まで平ら→縁で0)', Math.max(...diffs) < 1e-6,
     `最大差 ${Math.max(...diffs).toExponential(1)}`);
  // カメラの床(ワールド座標)と、余韻で勝者の足元に使う footYAt(シムm)が同じ形であること。
  // 片方だけ式を変えると「勝者は塚に乗っているのにカメラだけ地面基準」のような食い違いが出る。
  if (typeof footYAt === 'function') {
    const fld = getField(fid);
    const rubSim = (fld.obstacles || []).filter((o) => o.kind === 'rubble')[0];
    const d2 = [0, 0.3, CLIMB_TOP_FRAC, 0.8, 0.99].map((fr) =>
      Math.abs(footYAt(fld, rubSim.x + rubSim.r * fr, rubSim.y, 'biped') - at(fr)));
    ok('カメラの床と勝者の足元(footYAt)が同じ形', Math.max(...d2) < 1e-6,
       `最大差 ${Math.max(...d2).toExponential(1)}`);
    // hover は乗りも沈みもしない(シムの footY と同じ契約)
    ok('hover は瓦礫に乗らない(シムと同じ免疫)',
       footYAt(fld, rubSim.x, rubSim.y, 'hover') === 0 && footYAt(fld, rubSim.x, rubSim.y, 'biped') > 0);
    // 泥は沈む(負の標高)。脚種で深さが変わる
    const mudFld = FIELDS.find((f) => (f.obstacles || []).some((o) => o.kind === 'mud'));
    const mud = mudFld && mudFld.obstacles.find((o) => o.kind === 'mud');
    if (!mud) ok('泥のある戦場が見つからない(検査の前提が崩れている)', false);
    else {
    const sinkW = footYAt(mudFld, mud.x, mud.y, 'wheel'), sinkB = footYAt(mudFld, mud.x, mud.y, 'biped');
    ok('泥は沈み、脚種で深さが変わる(車輪 < 二脚)', sinkW < sinkB && sinkB < 0 &&
       footYAt(mudFld, mud.x, mud.y, 'hover') === 0, `wheel ${sinkW.toFixed(2)} / biped ${sinkB.toFixed(2)}`);
    }
  }
  ok('縁の外側で 0 に落ちている(段差で跳ねない)', at(1.001) === 0 && at(0.999) < rub.h * 0.02,
     `r×0.999 で ${at(0.999).toFixed(3)}`);
}

// ---- D: 決着後の余韻(周回) ----
// game.js の余韻演出と同じ式(APPROACH_SEC/速度クランプ)。**数値を変えたらここも直す**。
// 旋回半径だけは r3d.js の正本を読む(game.js もそこから取る=三者が同じ数を見る)。
const R2 = r3d.AFTERMATH_ORBIT_R_SIM != null ? r3d.AFTERMATH_ORBIT_R_SIM : 23;
const APPROACH_SEC = 5, SPD_MIN = 14, SPD_MAX = 46;
const orbitStartSec = (d) => {
  const dd0 = Math.max(0, d - R2);
  const spd = Math.max(SPD_MIN, Math.min(SPD_MAX, dd0 / APPROACH_SEC));
  return Math.max(0, d - R2 - 0.5) / spd;
};
console.log('== 決着後の周回 ==');
{
  const A = {
    assault:  { frame:'fr4', legs:'lg1', gen:'gn2', armor:'ar1', wpnR:'wp6', wpnL:'wp5', ai:'ai1', color:'#b0563e', decal:'none', name:'' },
    standard: { frame:'fr2', legs:'lg1', gen:'gn2', armor:'ar2', wpnR:'wp1', wpnL:'wp2', ai:'ai2', color:'#8fa3b0', decal:'none', name:'' },
    heavy:    { frame:'fr5', legs:'lg5', gen:'gn3', armor:'ar3', wpnR:'wp4', wpnL:'wp8', ai:'ai2', color:'#3a4047', decal:'none', name:'' },
    sniper:   { frame:'fr2', legs:'lg4', gen:'gn3', armor:'ar1', wpnR:'wp7', wpnL:'wp3', ai:'ai4', color:'#6d8f5a', decal:'none', name:'' },
    skirmish: { frame:'fr1', legs:'lg4', gen:'gn3', armor:'ar1', wpnR:'wp8', wpnL:'wp3', ai:'ai3', color:'#4d7ea8', decal:'none', name:'' },
  };
  const keys = Object.keys(A), secs = [];
  let draws = 0, n = 0;
  for (const f of FIELDS) for (const i of keys) for (const j of keys) for (let s = 1; s <= 6; s++) {
    const r = simulate(A[i], A[j], s * 7919, { fieldId: f.id });
    n++;
    if (r.winner === -1) { draws++; continue; }
    const st = r.states[r.states.length - 1];
    secs.push(orbitStartSec(Math.hypot(st.m[0].x - st.m[1].x, st.m[0].y - st.m[1].y)));
  }
  secs.sort((x, y) => x - y);
  const q = (p) => secs[Math.min(secs.length - 1, Math.floor(secs.length * p))];
  const within8 = 100 * secs.filter((t) => t <= 8).length / secs.length;
  ok('周回開始まで p50 ≤ 6s', q(0.5) <= 6, `p50 ${q(0.5).toFixed(1)}s / p90 ${q(0.9).toFixed(1)}s`);
  ok('8秒以内に周回開始する試合が9割以上', within8 >= 90, `${within8.toFixed(0)}%(${n}戦・引分${draws})`);
}
{
  // 余韻カメラは**旋回円の外**に居ること: camDist ≦ 旋回半径だと勝者が周回の半分を画面外で過ごす。
  // (勝者が周回に入った状態=機体間距離が旋回半径で一定、をカメラへ与えて実測する)
  const orbitR = R2 * WORLD_SCALE;
  const obs = scaledObstacles('plain');
  const FOV = FOV_Y != null ? FOV_Y : 55 * Math.PI / 180;   // 画角は r3d.js の正本を読む(写すと嘘の緑になる)
  const ORBIT_K_CAP = 2.2;   // r3d.js の orbitK 上限と同じ(縦画面で敗者が豆粒になるのを避ける妥協点)
  // ワイド(コックピットHUD)だけでなく、3Dタブがほぼ正方形になる幅・縦画面も見る
  // (カメラ距離の下限は aspect から出す=狭い画面ほど引く。上限2.2で敗者が豆粒にならないよう止める)
  for (const aspect of [1440 / 860, 1280 / 720, 1.0, 0.62]) {
    const mechs = [
      { x: ARENA_CX, y: ARENA_CZ, h: 0, mesh: null, alive: false, deadAge: 99, elev: 0 },
      { x: ARENA_CX + orbitR, y: ARENA_CZ, h: 0, mesh: null, elev: 0 },
    ];
    const scene = { mechs, obstacles: obs, field: 'plain', aftermath: { loser: 0 } };
    const camSt = {};
    let r = null;
    for (let i = 0; i < 400; i++) r = computeAutoCamera(scene, i * 0.05, aspect, camSt, 0.05, i === 0);
    const d = Math.hypot(r.target[0] - r.eye[0], r.target[2] - r.eye[2]);
    // asin(旋回半径/camDist) ≦ 水平半画角 なら周回の全周が画角内
    const hHalf = Math.atan(aspect * Math.tan(FOV / 2));
    // 本命は幾何そのもの: 周回の全周が画角に入るか(asin(旋回半径/camDist) ≦ 水平半画角)。
    // ただし**縦長の画面では設計上そこまで引かない**(r3d.js の orbitK は上限2.2で頭打ち=幾何どおり
    // 引くと敗者が豆粒になるため)。上限が効く帯では「全周」を要求すると、実装が守っていない保証を
    // ハーネスが主張することになる(そのうえ containEye の押し出し次第で緑にも赤にもなる)。
    // → 上限が効かない帯だけ「全周」を要求し、効く帯は「旋回円の外+上限に張り付いている」を見る。
    const need = orbitR / Math.sin(hHalf), capped = 1.15 / Math.sin(hHalf) > ORBIT_K_CAP;
    if (!capped) {
      ok(`余韻カメラの画角に周回の全周が入る(aspect ${aspect.toFixed(2)})`,
         d > orbitR && Math.asin(Math.min(1, orbitR / d)) <= hHalf,
         `camDist ${d.toFixed(1)}m / 必要 ${need.toFixed(1)}m`);
    } else {
      ok(`余韻カメラが旋回円の外・上限まで引いている(aspect ${aspect.toFixed(2)}=縦長)`,
         d >= orbitR * ORBIT_K_CAP - 0.05,
         `camDist ${d.toFixed(1)}m / 上限ぶん ${(orbitR * ORBIT_K_CAP).toFixed(1)}m(全周には ${need.toFixed(1)}m 要る=設計上の妥協)`);
    }
  }
  // **撃破の無い決着(判定勝ち・降参)の経路**: 決着カット(deadAge<3.0)の猶予が無いので、余韻の
  // 初回フレームから「決着間合いのまま」ラッチしうる。近い間合いで決着しても旋回円の外に居ること。
  for (const gap of [5, 12.7, 25]) {
    const mechs = [
      { x: ARENA_CX, y: ARENA_CZ, h: 0, mesh: null, elev: 0 },              // 敗者(立ったまま=判定負け)
      { x: ARENA_CX + gap * WORLD_SCALE, y: ARENA_CZ, h: 0, mesh: null, elev: 0 },
    ];
    const scene = { mechs, obstacles: obs, field: 'plain', aftermath: { loser: 0 } };
    const camSt = {};
    const r = computeAutoCamera(scene, 0, 1.674, camSt, 0.016, true);   // 初回フレームでラッチしうる
    const d = Math.hypot(r.target[0] - r.eye[0], r.target[2] - r.eye[2]);
    ok(`判定決着(間合い${gap}sim)でも初回フレームから旋回円の外`, d > orbitR * 1.25,
       `camDist ${d.toFixed(1)}m`);
  }
}

// ---- E: 試合をまたいでカメラの記憶が残らない ----
// camSt はレンダラ1インスタンスに1個=ページ寿命で共有される。amLock(余韻カメラのラッチ)や seed が
// 残ると、2戦目の決着で1戦目の座標に固定される/ショット割りが1戦目のシードで決まる。
console.log('== 試合またぎ(camSt の持ち越し) ==');
if (!HAS_FLOOR) console.log('  — 本番へ未昇格のためスキップ');
else {
  const obs = scaledObstacles('plain');
  const mk = (x, z) => [
    { x, y: z, h: 0, mesh: null, alive: false, deadAge: 99, elev: 0 },
    { x: x + R2 * WORLD_SCALE, y: z, h: 0, mesh: null, elev: 0 },
  ];
  const camSt = {};
  // 1戦目: アリーナ北西で決着 → 余韻カメラがラッチするまで回す
  const s1 = { mechs: mk(ARENA_CX - 120, ARENA_CZ - 120), obstacles: obs, field: 'plain', aftermath: { loser: 0 } };
  for (let i = 0; i < 400; i++) computeAutoCamera(s1, i * 0.05, 1.674, camSt, 0.05, i === 0);
  ok('1戦目の決着で余韻カメラがラッチする(前提)', !!camSt.amLock);
  const seed1 = camSt.seed;
  // 2戦目: 別の場所で開始(tSec が巻き戻る=reset)
  const s2 = { mechs: mk(ARENA_CX + 140, ARENA_CZ + 90), obstacles: obs, field: 'plain' };
  const r2 = computeAutoCamera(s2, 0, 1.674, camSt, 0.016, true);
  ok('2戦目の初回フレームで amLock が捨てられている', camSt.amLock == null);
  ok('2戦目のシードが1戦目から取り直される', camSt.seed !== seed1);
  const near2 = Math.hypot(r2.target[0] - s2.mechs[0].x, r2.target[2] - s2.mechs[0].y);
  ok('2戦目のカメラが2戦目の機体を見ている', near2 < 260, `狙点まで ${near2.toFixed(0)}m`);
  // 「捨て漏れ」を将来にわたって捕まえる契約: reset 直後に**前の試合由来のラッチが生きていない**こと。
  // (camSt に新しいラッチを足したとき、reset の列挙に足し忘れるとここで落ちる)
  // 除外は「同じフレームのうちに新しい試合の値へ取り直されるもの」だけ:
  //   t/eye/target/shotIdx/dispEye/dispTarget=表示状態、seed/distEMA/floorY=このフレームで再導出、
  //   lineSide/povIdx/povOk=イマジナリーラインとPOVのラッチ(enforceLine が同フレームで張り直す)。
  const DERIVED = ['t', 'eye', 'target', 'shotIdx', 'seed', 'distEMA', 'floorY',
                   'dispEye', 'dispTarget', 'lineSide', 'povIdx', 'povOk'];
  const alive = Object.entries(camSt).filter(([k, v]) =>
    !DERIVED.includes(k) && v != null && v !== -1 && v !== false);
  ok('reset 後に前試合のラッチが生き残っていない', alive.length === 0,
     alive.length ? '残: ' + alive.map(([k]) => k).join(',') : '');
  // 2戦目の決着でも、1戦目ではなく2戦目の座標でラッチすること
  s2.aftermath = { loser: 0 };
  let r3 = null;
  for (let i = 0; i < 400; i++) r3 = computeAutoCamera(s2, i * 0.05, 1.674, camSt, 0.05, false);
  const d3 = Math.hypot(r3.eye[0] - s2.mechs[0].x, r3.eye[2] - s2.mechs[0].y);
  ok('2戦目の余韻カメラが2戦目の敗者の周りに居る', d3 < 40, `敗者まで ${d3.toFixed(1)}m`);
}

console.log(fail ? `\n${fail} 件 NG` : '\nALL GREEN');
process.exit(fail ? 1 : 0);
