// r3d.js — 自前ソフトウェア3D(ワイヤーフレーム+フラットシェード) pure ESM・DOM非依存
// 契約:
//   export function mechMesh(build, PARTS, color) -> mesh (内部形式・opaque)
//   (観戦3Dの描画は r3d-three.js の createR3DThree(canvas) -> { render }。旧ソフト版 createR3D は撤去済)
//   scene = { mechs:[{mesh,x,y,h,hp,alive,walkPhase,attack,moveLocal?}], shots:[...], blasts:[...],
//   moveLocal = {fwd,lat,mag}  … 機体ローカルの移動速度(前後/横, 各-1..1目安)。脚の前後/横ステップと
//                                体幹リーンを移動方向へ合わせる(省略時は「前進歩行」にフォールバック)。
//             obstacles:[{kind,x,y,r,alive,hpFrac}], camera:'auto' }
//   attack = { kind:'rifle'|'beam'|'missile'|'railgun'|'shotgun'|'blade'|'drill'|'rocketpunch',
//              age01:number(0..1), side?:'R'|'L' } | null  … 直近のfireイベントに応じてgame.jsが渡す
// シムの (x,y)m -> 3D の (x,z)。y=高さ。機体全高≈4.2m(MECH_SCALE参照)。Math.random は使用しない。

// このファイル唯一の import。瓦礫の天端の割合は「シムが標高を出すときの形」そのものなので、
// r3d 側に数値を写すと必ずいつか食い違う(斜面の上に機体が浮く/めり込む)。fields.js を正本にする。
import { CLIMB_TOP_FRAC } from './fields.js';

const DEG = Math.PI / 180;

// 機体全高スケール定数。旧デザインの生寸法(標準二脚で全高≈7.07m)を約4.2m(ボトムズAT級)へ
// 一括縮小する。mechMesh末尾で全パーツ(pivot/頂点オフセット)へ一律適用し、脚種/武器の
// 比率(ratio)は不変。攻撃モーションのオフセット・マズル/爆発などの「長さ」を持つ演出定数にも
// 同じ係数を使い、機体まわりの縮尺を一貫させる(角度・比率係数はスケール対象外)。
export const MECH_SCALE = 0.6;

// 歩容(距離駆動 planted-foot)の定数。接地(stance)が占める位相割合 / 歩行中の屈み込み(膝を曲げてIK到達域を確保)。
const GAIT_DUTY = 0.62;
const GAIT_CROUCH = 0.16;        // 歩行中の屈み込み割合(膝を曲げIK到達域を確保。深めで蹴り出しの余地を作る)
const GAIT_MAX_CAD = 9;          // 最大歩容/秒。これ以下は完全接地(滑りゼロ)、超過分は滑走(高速=ブースト表現)
const GAIT_STRIDE_K = 1.30;      // 歩幅係数(strideS = K×脚長)。大きいほど一歩が長く、後方への蹴り出しが伸びる
const GAIT_PLANT_AHEAD = 0.30;   // 接地点を股の前方どれだけに置くか(脚長比)。小さいほど後方の蹴りが長くなる
const GAIT_LIFT = 0.30;          // 遊脚の持ち上げ高さ(脚長比)
const GAIT_SLOW_STRIDE = 0.60;   // 低速時に歩幅を伸ばす係数(2乗カーブ。mag→0で+60%=大股のゆっくりした重い足取り)
const GAIT_SLOW_DUTY = 0.14;     // 低速時に接地デューティを伸ばす量(2乗カーブ。接地時間が長い=どっしり)
const REV_BEND = 0.10;           // 逆関節の常時屈み(脚長比)。膝の後折れが常に見える=鳥脚のシルエット
// ↑2乗カーブの理由: 中速域(旋回歩行 mag≈0.6 等)に効かせると、長い接地の間に機体の向きが回り込み
//   world固定の接地足がIK到達限界に当たる(plantError悪化)。低域だけ強く効かせる。

// ワールド縮小率。シム(座標・射程・速度・バランス)は一切変えず、3D描画側だけをアリーナ中心まわりに
// この率で相似縮小する。機体サイズ(MECH_SCALE)は据え置き=機体が相対的に大きくなり、機体間/射程が
// 画面上で近づいて迫力が出る。歩容ケイデンス∝(k×対地速度)/歩幅 も k倍に低下し、大股でゆっくり重い歩行に。
// 画面上の見かけ速度は不変(速度もカメラ距離も同率縮小)なので鈍重にはならず、歩数だけ減って重量感が出る。
export const WORLD_SCALE = 0.45;

function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

function strHash(str) {
  let h = 0;
  const s = String(str == null ? '' : str);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return hash(h * 0.9301 + s.length * 3.7);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
function lerpP(A, B, t) { return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// ---- ベクトル演算 ----
function v3(x, y, z) { return [x, y, z]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scaleV(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function length(a) { return Math.sqrt(dot(a, a)); }
function normalize(a) {
  const l = length(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}
function rotateAroundAxis(p, axis, angle) {
  // ロドリゲスの回転公式(axis は単位ベクトル)
  if (!angle) return p;
  const c = Math.cos(angle), s = Math.sin(angle);
  const k = axis;
  const kxp = cross(k, p);
  const kdp = dot(k, p);
  return add(add(scaleV(p, c), scaleV(kxp, s)), scaleV(k, kdp * (1 - c)));
}
const AXIS_X = [1, 0, 0], AXIS_Y = [0, 1, 0], AXIS_Z = [0, 0, 1];
// ⑤ ライティング方向(shade で使用)。KEY=主光(上前) / FILL=補助光(逆側・弱)。
const LIGHT_KEY = normalize([0.45, 0.8, 0.35]);
const LIGHT_FILL = normalize([-0.5, 0.25, -0.55]);

// ⑤ 弾道の高さ(世界Y・全高≈4.2m前提の実寸)。発射=マズル、着弾=被弾部位へ斜めに飛ばす。
// 旧実装は発射も着弾も 1.8m 固定で「地面を這う」ように見えていた。game.js が s.y0/s.y1 を渡せば優先。
const MUZZLE_Y = 3.3;
function hitPartY(kind, si, tx, ty) {
  if (kind === 'beam' || kind === 'railgun') {
    return hash(si * 3.9 + (tx || 0) * 0.13 + (ty || 0) * 0.17 + 2.2) < 0.5 ? 2.9 : 3.7; // 精密=胴/頭
  }
  const r = hash(si * 3.9 + (tx || 0) * 0.13 + (ty || 0) * 0.17 + 2.2);
  if (r < 0.12) return 4.0;   // 頭
  if (r < 0.62) return 2.9;   // 胴(最頻)
  if (r < 0.80) return 3.2;   // 腕
  if (r < 0.92) return 2.4;   // 腰
  return 1.4;                 // 脚
}
function axisFromKey(k) { return k === 'x' ? AXIS_X : k === 'y' ? AXIS_Y : k === 'z' ? AXIS_Z : AXIS_X; }

function mixColor(hex, targetHex, t) {
  const a = hexToRgb(hex), b = hexToRgb(targetHex);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}
function hexToRgb(hex) {
  const str = String(hex || '#8fb3c7');
  const rgbMatch = str.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgbMatch) return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };
  let h = str.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  if (Number.isNaN(num)) return { r: 143, g: 179, b: 199 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

// ---- 基本形状: 直方体(中心cx,cy,cz、半径hw,hh,hd)。面の向きは自動で外向きに補正する ----
function boxShape(cx, cy, cz, hw, hh, hd) {
  const v = [
    [cx - hw, cy - hh, cz - hd], [cx + hw, cy - hh, cz - hd],
    [cx + hw, cy + hh, cz - hd], [cx - hw, cy + hh, cz - hd],
    [cx - hw, cy - hh, cz + hd], [cx + hw, cy - hh, cz + hd],
    [cx + hw, cy + hh, cz + hd], [cx - hw, cy + hh, cz + hd],
  ];
  const f = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
    [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ];
  return fixWinding(v, f, [cx, cy, cz]);
}

// 台形ボックス: 底面(y-hh)と上面(y+hh)で前後方向(Z)の半長を変えられる箱。
// hdTop>hdBot で「逆台形(上が長い)」=実戦車の履帯側面形やホバースカートに使う。
function trapBoxZ(cx, cy, cz, hw, hh, hdBot, hdTop) {
  const v = [
    [cx - hw, cy - hh, cz - hdBot], [cx + hw, cy - hh, cz - hdBot],
    [cx + hw, cy - hh, cz + hdBot], [cx - hw, cy - hh, cz + hdBot],
    [cx - hw, cy + hh, cz - hdTop], [cx + hw, cy + hh, cz - hdTop],
    [cx + hw, cy + hh, cz + hdTop], [cx - hw, cy + hh, cz + hdTop],
  ];
  const f = [
    [0, 1, 2, 3], [4, 5, 6, 7],
    [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
  ];
  return fixWinding(v, f, [cx, cy, cz]);
}

// 上下で断面(X/Z半幅)を独立に変えられる箱。裾絞り(ウエスト)/肩張り/装甲ベベルのシルエット用。
function trapBoxY(cx, cy, cz, hh, hwBot, hdBot, hwTop, hdTop) {
  const v = [
    [cx - hwBot, cy - hh, cz - hdBot], [cx + hwBot, cy - hh, cz - hdBot],
    [cx + hwBot, cy - hh, cz + hdBot], [cx - hwBot, cy - hh, cz + hdBot],
    [cx - hwTop, cy + hh, cz - hdTop], [cx + hwTop, cy + hh, cz - hdTop],
    [cx + hwTop, cy + hh, cz + hdTop], [cx - hwTop, cy + hh, cz + hdTop],
  ];
  const f = [
    [0, 1, 2, 3], [4, 5, 6, 7],
    [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
  ];
  return fixWinding(v, f, [cx, cy, cz]);
}

function octaShape(cx, cy, cz, r) {
  const v = [
    [cx + r, cy, cz], [cx - r, cy, cz],
    [cx, cy + r, cz], [cx, cy - r, cz],
    [cx, cy, cz + r], [cx, cy, cz - r],
  ];
  const f = [
    [0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0],
    [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3],
  ];
  return fixWinding(v, f, [cx, cy, cz]);
}

// N角柱/円錐(rTop=0で円錐)。axis は AXIS_X/AXIS_Y/AXIS_Z のいずれか(参照一致で断面基底を選ぶ。
// それ以外を渡した場合は既定でY軸基底を使う=概形は保てるが軸整合は近似になる)。
function ringBasis(axis) {
  if (axis === AXIS_X) return [AXIS_Y, AXIS_Z];
  if (axis === AXIS_Z) return [AXIS_X, AXIS_Y];
  return [AXIS_X, AXIS_Z];
}
function prismShape(center, axis, halfLen, rTop, rBottom, sides, opts = {}) {
  const [u, w] = ringBasis(axis);
  const twist = opts.twist || 0;
  const jitter = opts.jitter || null;
  const verts = [];
  const topIdx = [], botIdx = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const rt = Math.max(0, rTop + (jitter ? jitter(i, 1) : 0));
    const rb = Math.max(0, rBottom + (jitter ? jitter(i, 0) : 0));
    const atop = a + twist;
    const topP = add(center, add(scaleV(axis, halfLen), add(scaleV(u, Math.cos(atop) * rt), scaleV(w, Math.sin(atop) * rt))));
    const botP = add(center, add(scaleV(axis, -halfLen), add(scaleV(u, Math.cos(a) * rb), scaleV(w, Math.sin(a) * rb))));
    verts.push(topP); topIdx.push(verts.length - 1);
    verts.push(botP); botIdx.push(verts.length - 1);
  }
  const faces = [];
  for (let i = 0; i < sides; i++) {
    const ni = (i + 1) % sides;
    // 頂点順を [top(i), bot(i), bot(ni), top(ni)] にして、rTop=0(円錐)でも先頭3点が
    // 退化しない(法線/カリングが破綻しない)ようにする。
    faces.push([topIdx[i], botIdx[i], botIdx[ni], topIdx[ni]]);
  }
  if (rTop > 1e-6) faces.push(topIdx.slice().reverse());
  if (rBottom > 1e-6) faces.push(botIdx.slice());
  return fixWinding(verts, faces, center);
}

function fixWinding(verts, faces, center) {
  // 面の重心が形状中心から見て「外向き」になるよう winding を補正する。
  const outFaces = faces.map((f) => {
    const v0 = verts[f[0]], v1 = verts[f[1]], v2 = verts[f[2]];
    const n = cross(sub(v1, v0), sub(v2, v0));
    const cx = (v0[0] + v1[0] + v2[0]) / 3, cy = (v0[1] + v1[1] + v2[1]) / 3, cz = (v0[2] + v1[2] + v2[2]) / 3;
    const outward = sub([cx, cy, cz], center);
    return dot(n, outward) < 0 ? f.slice().reverse() : f;
  });
  return { verts, faces: outFaces };
}

// パーツ(独自の回転ピボット+アニメ属性を持つ剛体)を組み立てるヘルパ
// parent: 親パーツ名(文字列)。指定すると親の変換(回転+オフセット)が自分の変換の後段に連鎖適用される
// (=腿の先端に脛のpivotを置けば「膝が繋がる」)。
function makePart(name, pivot, shape, color, opts = {}) {
  // shape.verts はワールド原点基準で作ったので pivot 相対に変換しておく
  const verts = shape.verts.map((p) => sub(p, pivot));
  return {
    name, pivot, verts, faces: shape.faces, color,
    parentName: opts.parent || null, parentIdx: -1,
    swingAxis: opts.swingAxis || null, swingAmp: opts.swingAmp || 0,
    swingFreq: opts.swingFreq == null ? 1 : opts.swingFreq, swingPhase: opts.swingPhase || 0,
    swingClampPositive: !!opts.swingClampPositive,
    restAngle: opts.restAngle || 0, restAxis: opts.restAxis || null,
    clampRange: opts.clampRange || null,
    spin: opts.spin || null, // {axis:'x'|'y'|'z', speed} 連続回転(車輪・ドリル)
    deadAxis: opts.deadAxis || null, deadAngle: opts.deadAngle || 0,
    emissive: !!opts.emissive,
    // St4: 質感クラスの明示指定(tex.js partMatClass。未指定ならパーツ名の前方一致で決まる)。
    // 名前だけでは決まらないパーツ(装甲id で見た目が変わる肩など)にだけ付ける。
    mat: opts.mat || null,
    role: opts.role || null, // 攻撃演出/組立の目印: 'arm'|'fist'|'gunBarrel'|'muzzle'|'railGlow'|'blade'|'hilt'|'pod'|'drill'|'drillcasing'|'rocketFist'
    side: opts.side || 0,    // 1=右 / -1=左 / 0=非該当
    // 移動方向連携(②): 'hip'=股/大腿(前後スイング+横ステップの主動)/'knee'=膝(接地伸展・遊脚屈曲) を指定した
    // 脚パーツだけが scene.mechs[].moveLocal(前後/横のローカル速度)に反応する。未指定/moveLocal無し時は
    // 従来の「前進歩行」挙動に落ちる(ガレージのプレビュー等が不変)。
    leg: opts.leg || null,
  };
}

function findPart(list, id) {
  if (!Array.isArray(list)) return null;
  return list.find((p) => p && p.id === id) || null;
}

// ==================== mechMesh ====================
// St3 外装作り込み: パーツ id ごとの固有シルエット(フレーム=胴/頭、脚=同一運動学での肉付け、
// 武器=得物別レシピ、動力炉=背部ユニット、装甲=増加装甲)。参考にした文法 —
// メックウォーリア: 重量級の「歩く戦車」感(スラブ装甲・リベット・胴の量感)/
// アーマード・コア: 軽量機のウエスト絞り・肩ブースタ・センサ形状の記号性/
// バーチャロン: 発光部と大胆な色面のヒーロー的シルエット。
// 未知 id は kind/tier の既定形へ落ちる(将来パーツ追記に安全)。
// IK/歩容/演出の契約は不変: legU/legL/foot/toe/spur の名前と pivot 高さ、role
// (arm/fist/gunBarrel/muzzle/pod/hilt/blade/drill/drillcasing/rocketFist)、torso 名。

// フレーム: 胴の縦横厚(倍率)+胸部意匠+頭部センサ種。
const FRAME_STYLES = {
  fr7: { w: 0.80, h: 0.95, d: 0.75, chest: 'wedge', head: 'mono',  antenna: 1, waist: 1 },
  fr1: { w: 0.90, h: 1.00, d: 0.85, chest: 'wedge', head: 'visor', antenna: 1, waist: 1 },
  fr2: { w: 1.00, h: 1.00, d: 1.00, chest: 'duct',  head: 'visor' },
  fr6: { w: 1.14, h: 0.94, d: 1.10, chest: 'slab',  head: 'mono',  rivets: 1 },
  fr4: { w: 0.95, h: 1.04, d: 0.90, chest: 'swept', head: 'twin',  antenna: 1, waist: 1 },
  fr3: { w: 1.22, h: 1.03, d: 1.16, chest: 'layer', head: 'mono',  rivets: 1 },
  fr8: { w: 0.95, h: 0.96, d: 1.08, chest: 'rack',  head: 'twin' },
  fr5: { w: 1.30, h: 1.10, d: 1.22, chest: 'layer', head: 'crest', crest: 1 },
};

// 動力炉: 背部ユニットの型(大きさは出力由来の finScale が決める)。
const GEN_STYLES = {
  gn1: { kind: 'mini' },
  gn5: { kind: 'tanks' },
  gn2: { kind: 'std' },
  gn6: { kind: 'slim' },
  gn7: { kind: 'turbine' },
  gn3: { kind: 'big' },
  gn4: { kind: 'core' },
};

// 脚: 同一 kind 内の肉付け差。thigh/shin/foot は断面倍率(pivot 高さは kind 既定を維持し、
// hipY 指定のみ許す=IK は pivot から導出されるため整合)。
const LEG_STYLES = {
  lg1:  { thigh: 0.90, shin: 0.85, foot: 1.00, calfBoost: 1 },
  lg2:  { thigh: 1.30, shin: 1.25, foot: 1.20, kneePlate: 1 },
  lg13: { thigh: 1.00, shin: 0.90, foot: 1.05, calfBoost: 1, hipArmor: 1, hipY: 4.25 },
  lg8:  { thigh: 0.80, shin: 0.75 },
  lg3:  { thigh: 1.10, shin: 1.05, hipY: 2.4, stanceW: 1.15, fender: 1 },
  lg14: { thigh: 1.35, shin: 1.25, hipY: 2.8, stanceW: 1.10, hipArmor: 1 },
  lg12: { thigh: 0.90, shin: 0.85, spurS: 0.80, toeS: 0.90 },
  lg7:  { thigh: 1.00, shin: 1.00, spurS: 1.35, toeS: 1.15, piston: 1, hipY: 4.3 },
  lg9:  { treadLen: 0.85, wheels: 3, domed: 1 },
  lg5:  { treadLen: 1.15, wheels: 5, skirt: 1 },
  lg11: { spoke: 1, wheelR: 0.95 },
  lg6:  { fender: 1, wheelR: 1.05 },
  lg10: { hullLen: 0.80, thrusters: 1 },
  lg4:  { hullLen: 1.20, thrusters: 2, floats: 1 },
};

// 武器: id 別レシピ。gun 系は len/rad/muzzle+意匠フラグ、missile 系は pod 寸法+発射管数。
const WPN_STYLES = {
  wp1:  { len: 1.15, rad: 0.15, muzzle: 0.14, mag: 1, grip: 1 },
  wp13: { len: 1.75, rad: 0.11, muzzle: 0.16, mag: 1, scopeBig: 1, brake: 1 },
  wp8:  { len: 1.00, rad: 0.13, muzzle: 0.15, rotary: 1, ammoBox: 1 },
  wp17: { len: 1.45, rad: 0.17, muzzle: 0.20, mag: 1, shroud: 1 },
  wp2:  { len: 1.05, rad: 0.13, muzzle: 0.16, fins: 1 },
  wp14: { len: 0.55, rad: 0.21, muzzle: 0.30, tank: 1 },
  wp7:  { len: 1.70, rad: 0.11, muzzle: 0.14, rings: 1, scopeBig: 1 },
  wp15: { len: 1.10, rad: 0.10, muzzle: 0.13, twin: 1 },
  wp5:  { len: 0.62, rad: 0.27, muzzle: 0.30, drum: 1 },
  wp16: { len: 0.80, rad: 0.30, muzzle: 0.36, drum: 1, brake: 1 },
  wp4:  { len: 1.90, rad: 0.19, muzzle: 0.32, capacitor: 1 },
  wp12: { podW: 0.26, podH: 0.22, podD: 0.50, tubes: 2 },
  wp3:  { podW: 0.34, podH: 0.30, podD: 0.60, tubes: 4 },
  wp18: { podW: 0.44, podH: 0.34, podD: 0.75, tubes: 3 },
  wp11: { cleaver: 1 },
  wp9:  { collar: 1 },
  wp10: { thrustRing: 1 },
};

export function mechMesh(build, PARTS, color) {
  build = build || {};
  PARTS = PARTS || {};
  const col = color || build.color || '#8fb3c7';

  const framePart = findPart(PARTS.frame, build.frame);
  const legsPart = findPart(PARTS.legs, build.legs);
  const genPart = findPart(PARTS.gen, build.gen);
  const wpnRPart = findPart(PARTS.wpn, build.wpnR);
  const wpnLPart = findPart(PARTS.wpn, build.wpnL);

  const armorPart = findPart(PARTS.armor, build.armor);
  const legsKind = (legsPart && legsPart.kind) || 'biped';
  const tier = (framePart && framePart.tier) || 0;
  const torsoScale = 1 + Math.min(tier, 3) * 0.12;
  const FS = FRAME_STYLES[build.frame] || {};
  const GS = GEN_STYLES[build.gen] || {};
  const LS = LEG_STYLES[build.legs] || {};
  const WS = (id) => WPN_STYLES[id] || null;

  const parts = [];
  let hoverInfo = null;
  let rockInfo = null;

  // --- 胴体(フレームid別のプロポーション+シルエット) ---
  let hipY = legsKind === 'quad' ? 2.6
    : legsKind === 'hover' ? 2.1
    : legsKind === 'tank' ? 1.6
    : legsKind === 'wheel' ? 1.9
    : 4.0; // biped / reverse
  if (LS.hipY) hipY = LS.hipY;
  const torsoH = 2.4 * torsoScale * (FS.h || 1);
  const torsoW = 1.5 * torsoScale * (FS.w || 1);
  const torsoD = 1.0 * torsoScale * (FS.d || 1);
  const torsoCy = hipY + torsoH / 2;
  // waist=1(軽量殻)はウエストを絞った逆台形胴(AC系の記号)。それ以外はスラブ胴(MW系の量感)。
  const torsoShape = FS.waist
    ? trapBoxY(0, torsoCy, 0, torsoH / 2, torsoW * 0.34, torsoD * 0.36, torsoW / 2, torsoD / 2)
    : boxShape(0, torsoCy, 0, torsoW / 2, torsoH / 2, torsoD / 2);
  parts.push(makePart('torso', [0, torsoCy, 0], torsoShape, col, {
    deadAxis: 'x', deadAngle: 0.55,
  }));

  // 胴体ディティール(胸部意匠はフレームid別/コクピット発光/襟)。全て torso 子で追従。
  const fz0 = torsoD / 2;
  const darker = (t) => mixColor(col, '#000000', t);
  const chest = FS.chest || 'duct';
  if (chest === 'duct') {
    parts.push(makePart('chestVent', [0, torsoCy + torsoH * 0.06, fz0 + 0.04], boxShape(0, torsoCy + torsoH * 0.06, fz0 + 0.04, torsoW * 0.3, torsoH * 0.16, 0.06), darker(0.42), { parent: 'torso' }));
  } else if (chest === 'wedge') {
    // くさび胸(前方へ尖る楔形の主装甲)+胸元スリット
    parts.push(makePart('chestWedge', [0, torsoCy + torsoH * 0.14, fz0], trapBoxY(0, torsoCy + torsoH * 0.14, fz0, torsoH * 0.2, torsoW * 0.34, 0.2, torsoW * 0.2, 0.06), darker(0.18), { parent: 'torso' }));
    parts.push(makePart('chestSlit', [0, torsoCy + torsoH * 0.02, fz0 + 0.1], boxShape(0, torsoCy + torsoH * 0.02, fz0 + 0.1, torsoW * 0.22, 0.03, 0.04), darker(0.55), { parent: 'torso' }));
  } else if (chest === 'slab') {
    // 一枚板の厚殻+リベット(安い鉄を厚く)
    parts.push(makePart('chestSlab', [0, torsoCy + torsoH * 0.05, fz0 + 0.08], boxShape(0, torsoCy + torsoH * 0.05, fz0 + 0.08, torsoW * 0.42, torsoH * 0.3, 0.07), darker(0.12), { parent: 'torso' }));
  } else if (chest === 'swept') {
    // 前進翼のように左右へ流れる胸装甲(襲撃殻の鋭さ)
    [1, -1].forEach((s) => {
      parts.push(makePart(`chestSwept${s}`, [torsoW * 0.22 * s, torsoCy + torsoH * 0.12, fz0 + 0.05], boxShape(torsoW * 0.22 * s, torsoCy + torsoH * 0.12, fz0 + 0.05, torsoW * 0.2, torsoH * 0.1, 0.07), darker(0.2), { parent: 'torso', restAngle: -0.28 * s, restAxis: 'z' }));
    });
    parts.push(makePart('chestRidge', [0, torsoCy + torsoH * 0.16, fz0 + 0.09], boxShape(0, torsoCy + torsoH * 0.16, fz0 + 0.09, 0.05, torsoH * 0.16, 0.08), darker(0.35), { parent: 'torso' }));
  } else if (chest === 'layer') {
    // 段積みの重装甲(上段が下段に覆い被さる)
    parts.push(makePart('chestL0', [0, torsoCy - torsoH * 0.06, fz0 + 0.07], boxShape(0, torsoCy - torsoH * 0.06, fz0 + 0.07, torsoW * 0.44, torsoH * 0.2, 0.06), darker(0.16), { parent: 'torso' }));
    parts.push(makePart('chestL1', [0, torsoCy + torsoH * 0.2, fz0 + 0.12], boxShape(0, torsoCy + torsoH * 0.2, fz0 + 0.12, torsoW * 0.48, torsoH * 0.16, 0.08), darker(0.08), { parent: 'torso' }));
  } else if (chest === 'rack') {
    // 換装ラック(骨組みの枠+固定具=積むための殻)
    [1, -1].forEach((s) => {
      parts.push(makePart(`rackBar${s}`, [torsoW * 0.3 * s, torsoCy + torsoH * 0.08, fz0 + 0.06], boxShape(torsoW * 0.3 * s, torsoCy + torsoH * 0.08, fz0 + 0.06, 0.05, torsoH * 0.3, 0.05), darker(0.4), { parent: 'torso' }));
    });
    parts.push(makePart('rackBeam', [0, torsoCy + torsoH * 0.3, fz0 + 0.06], boxShape(0, torsoCy + torsoH * 0.3, fz0 + 0.06, torsoW * 0.36, 0.05, 0.05), darker(0.4), { parent: 'torso' }));
  }
  parts.push(makePart('cockpit', [0, torsoCy - torsoH * 0.12, fz0 + 0.05], boxShape(0, torsoCy - torsoH * 0.12, fz0 + 0.05, torsoW * 0.12, 0.06, 0.04), '#ffb04a', { parent: 'torso', emissive: true }));
  parts.push(makePart('collar', [0, torsoCy + torsoH * 0.44, 0], boxShape(0, torsoCy + torsoH * 0.44, 0, torsoW * 0.54, torsoH * 0.08, torsoD * 0.6), darker(0.25), { parent: 'torso' }));
  if (!FS.waist) [1, -1].forEach((s) => {
    parts.push(makePart(`sidePanel${s}`, [torsoW * 0.5 * s, torsoCy - torsoH * 0.06, 0], boxShape(torsoW * 0.5 * s, torsoCy - torsoH * 0.06, 0, 0.05, torsoH * 0.3, torsoD * 0.34), darker(0.3), { parent: 'torso' }));
  });
  if (FS.rivets) {
    // リベット(厚殻の記号): 胸板の四隅に小さな鋲
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx2, sy2], ri) => {
      const rx = torsoW * 0.36 * sx2, ry = torsoCy + torsoH * (0.05 + 0.24 * sy2), rz = fz0 + 0.13;
      parts.push(makePart(`rivet${ri}`, [rx, ry, rz], boxShape(rx, ry, rz, 0.035, 0.035, 0.03), darker(0.5), { parent: 'torso' }));
    });
  }

  // --- 増加装甲(armor id 別のオーバーレイ。性能は sim 側、ここは見た目の記号) ---
  const armorId = (armorPart && armorPart.id) || build.armor;
  if (armorId === 'ar6') {
    parts.push(makePart('aSlab', [0, torsoCy - torsoH * 0.02, fz0 + 0.16], boxShape(0, torsoCy - torsoH * 0.02, fz0 + 0.16, torsoW * 0.38, torsoH * 0.26, 0.055), darker(0.34), { parent: 'torso' }));
  } else if (armorId === 'ar5') {
    parts.push(makePart('aPad', [0, torsoCy + torsoH * 0.02, fz0 + 0.14], trapBoxY(0, torsoCy + torsoH * 0.02, fz0 + 0.14, torsoH * 0.2, torsoW * 0.36, 0.05, torsoW * 0.28, 0.035), mixColor(col, '#ffffff', 0.16), { parent: 'torso' }));
  } else if (armorId === 'ar3') {
    parts.push(makePart('aL0', [0, torsoCy - torsoH * 0.14, fz0 + 0.14], boxShape(0, torsoCy - torsoH * 0.14, fz0 + 0.14, torsoW * 0.4, torsoH * 0.14, 0.05), darker(0.22), { parent: 'torso' }));
    parts.push(makePart('aL1', [0, torsoCy + torsoH * 0.1, fz0 + 0.18], boxShape(0, torsoCy + torsoH * 0.1, fz0 + 0.18, torsoW * 0.44, torsoH * 0.14, 0.05), darker(0.1), { parent: 'torso' }));
  } else if (armorId === 'ar4') {
    // 反応装甲: レンガ状ブロックの貼り付け(ERAの記号)
    for (let bx2 = -1; bx2 <= 1; bx2++) for (let by2 = 0; by2 <= 1; by2++) {
      const px = torsoW * 0.26 * bx2, py = torsoCy + torsoH * (by2 ? 0.16 : -0.1), pz = fz0 + 0.12;
      parts.push(makePart(`aEra${bx2}_${by2}`, [px, py, pz], boxShape(px, py, pz, torsoW * 0.11, torsoH * 0.09, 0.06), darker(0.46), { parent: 'torso' }));
    }
  } else if (armorId === 'ar7') {
    // 流体装甲: 面取りされた滑らかなパック+流路の発光シーム
    parts.push(makePart('aFluid', [0, torsoCy, fz0 + 0.15], trapBoxY(0, torsoCy, fz0 + 0.15, torsoH * 0.3, torsoW * 0.4, 0.05, torsoW * 0.3, 0.03), mixColor(col, '#bfe8ff', 0.22), { parent: 'torso' }));
    parts.push(makePart('aSeam', [0, torsoCy, fz0 + 0.21], boxShape(0, torsoCy, fz0 + 0.21, 0.02, torsoH * 0.24, 0.02), '#7fd4ff', { parent: 'torso', emissive: true }));
  }

  // --- 背部ユニット(動力炉id別)+放熱フィン(出力でボリューム差) ---
  const genRaw = (genPart && (genPart.output != null ? genPart.output : genPart.cap)) || 0;
  const finScale = 1 + Math.max(0, Math.min(1.6, genRaw / 120));
  const bz0 = -torsoD / 2;
  const gkind = GS.kind || (tier >= 1 ? 'big' : 'std');
  const addFins = (n, fh) => {
    for (let i = 0; i < n; i++) {
      const fx = (i - (n - 1) / 2) * (torsoW * 0.9 / Math.max(2, n));
      parts.push(makePart(`fin${i}`, [fx, torsoCy + 0.1, bz0 - 0.05], boxShape(fx, torsoCy + 0.1, bz0 - 0.05, 0.05, fh / 2, 0.14 * finScale), darker(0.3), { parent: 'torso' }));
    }
  };
  if (gkind === 'mini') {
    parts.push(makePart('backpack', [0, torsoCy - torsoH * 0.1, bz0 - 0.12], boxShape(0, torsoCy - torsoH * 0.1, bz0 - 0.12, torsoW * 0.26, torsoH * 0.22, 0.12), darker(0.22), { parent: 'torso' }));
    parts.push(makePart('genVent', [0, torsoCy + torsoH * 0.08, bz0 - 0.1], octaShape(0, torsoCy + torsoH * 0.08, bz0 - 0.1, 0.09), '#9fe8c0', { parent: 'torso', emissive: true }));
  } else if (gkind === 'tanks') {
    [1, -1].forEach((s) => {
      const tx = torsoW * 0.24 * s, ty = torsoCy + torsoH * 0.02, tz = bz0 - 0.18;
      parts.push(makePart(`genTank${s}`, [tx, ty, tz], prismShape([tx, ty, tz], AXIS_Y, torsoH * 0.34, 0.13, 0.13, 8), darker(0.18), { parent: 'torso' }));
    });
  } else if (gkind === 'slim') {
    parts.push(makePart('backpack', [0, torsoCy, bz0 - 0.07], boxShape(0, torsoCy, bz0 - 0.07, torsoW * 0.4, torsoH * 0.38, 0.07), darker(0.2), { parent: 'torso' }));
  } else if (gkind === 'turbine') {
    // 渦潮炉: 横置きタービン筒+吸気リング
    const ty = torsoCy + torsoH * 0.06, tz = bz0 - 0.2;
    parts.push(makePart('genTurb', [0, ty, tz], prismShape([0, ty, tz], AXIS_X, torsoW * 0.4, 0.2, 0.2, 8), darker(0.18), { parent: 'torso' }));
    [1, -1].forEach((s) => {
      const rx = torsoW * 0.42 * s;
      parts.push(makePart(`genIntake${s}`, [rx, ty, tz], prismShape([rx, ty, tz], AXIS_X, 0.03, 0.24, 0.24, 8), darker(0.42), { parent: 'torso' }));
    });
  } else if (gkind === 'core') {
    // 臨界炉: 露出した発光コア+大型フィン(常に沸点)
    const cy2 = torsoCy + torsoH * 0.04, cz2 = bz0 - 0.22;
    parts.push(makePart('backpack', [0, cy2, cz2 + 0.08], boxShape(0, cy2, cz2 + 0.08, torsoW * 0.4, torsoH * 0.42, 0.12), darker(0.22), { parent: 'torso' }));
    parts.push(makePart('genCore', [0, cy2, cz2 - 0.06], octaShape(0, cy2, cz2 - 0.06, 0.22), '#ffd27f', { parent: 'torso', emissive: true }));
    addFins(4, (0.62 + tier * 0.12) * finScale);
  } else if (gkind === 'big') {
    parts.push(makePart('backpack', [0, torsoCy, bz0 - 0.16 * finScale], boxShape(0, torsoCy, bz0 - 0.16 * finScale, torsoW * 0.38, torsoH * 0.42, 0.16 * finScale), darker(0.22), { parent: 'torso' }));
    addFins(4, (0.5 + tier * 0.12) * finScale);
  } else {   // std
    parts.push(makePart('backpack', [0, torsoCy, bz0 - 0.1], boxShape(0, torsoCy, bz0 - 0.1, torsoW * 0.34, torsoH * 0.36, 0.1), darker(0.22), { parent: 'torso' }));
    addFins(2, (0.5 + tier * 0.12) * finScale);
  }

  // --- 頭部(フレームid別のセンサ種: バイザー/単眼/双眼/旗甲クレスト。未知idはハッシュ) ---
  const headY = torsoCy + torsoH / 2 + 0.35;
  parts.push(makePart('head', [0, headY, 0], boxShape(0, headY, 0.05, 0.32, 0.32, 0.32), col, {
    parent: 'torso',
  }));
  const sensorRoll = strHash((build.frame || 'f0') + '::sensor');
  const headKind = FS.head || (sensorRoll < 0.34 ? 'visor' : sensorRoll < 0.67 ? 'mono' : 'twin');
  if (headKind === 'visor') {
    parts.push(makePart('visor', [0, headY, torsoD * 0.4], boxShape(0, headY, torsoD * 0.4, 0.26, 0.09, 0.06), '#8fffe6', {
      parent: 'head', emissive: true,
    }));
  } else if (headKind === 'mono') {
    parts.push(makePart('visor', [0, headY, torsoD * 0.42], octaShape(0, headY, torsoD * 0.42, 0.13), '#ffe08a', {
      parent: 'head', emissive: true,
    }));
    parts.push(makePart('brow', [0, headY + 0.16, torsoD * 0.36], boxShape(0, headY + 0.16, torsoD * 0.36, 0.22, 0.05, 0.1), darker(0.3), { parent: 'head' }));
  } else {   // twin / crest(どちらも双眼)
    [1, -1].forEach((s) => {
      parts.push(makePart(`visor${s}`, [0.12 * s, headY, torsoD * 0.4], boxShape(0.12 * s, headY, torsoD * 0.4, 0.08, 0.08, 0.05), '#8fd0ff', {
        parent: 'head', emissive: true,
      }));
    });
  }
  if (FS.crest || headKind === 'crest') {
    // 旗甲のクレスト(縦フィン)+左右の角。ヒーローシルエット(バーチャロン流)。
    parts.push(makePart('crest', [0, headY + 0.34, 0.02], boxShape(0, headY + 0.34, 0.02, 0.035, 0.24, 0.16), '#d8b24a', { parent: 'head' }));
    parts.push(makePart('crestGem', [0, headY + 0.22, torsoD * 0.36], boxShape(0, headY + 0.22, torsoD * 0.36, 0.05, 0.05, 0.04), '#ffd27f', { parent: 'head', emissive: true }));
    [1, -1].forEach((s) => {
      parts.push(makePart(`horn${s}`, [0.3 * s, headY + 0.2, 0], boxShape(0.3 * s, headY + 0.2, 0, 0.03, 0.2, 0.05), '#d8b24a', {
        parent: 'head', restAngle: -0.5 * s, restAxis: 'z',
      }));
    });
  }
  if (FS.antenna) {
    // 通信アンテナ(軽量・襲撃殻の記号): 頭側面の細い棒+先端灯
    const ax = -0.26, ay = headY + 0.3;
    parts.push(makePart('antenna', [ax, ay, -0.06], boxShape(ax, ay, -0.06, 0.018, 0.24, 0.018), darker(0.35), {
      parent: 'head', restAngle: 0.18, restAxis: 'z',
    }));
    parts.push(makePart('antennaTip', [ax, ay + 0.24, -0.06], boxShape(ax, ay + 0.24, -0.06, 0.03, 0.03, 0.03), '#ff8d7a', { parent: 'antenna', emissive: true }));
  }

  // --- 脚部(kind の運動学は共通、id で肉付け=LEG_STYLES) ---
  if (legsKind === 'quad') {
    const legY0 = hipY;
    const kneeY = legY0 * 0.5;
    const tU = LS.thigh || 1, tL = LS.shin || 1;
    const stw = LS.stanceW || 1;
    const xs = [torsoW * 0.55 * stw, -torsoW * 0.55 * stw];   // xi=0 右 / xi=1 左
    const zs = [torsoD * 0.9, -torsoD * 0.9];     // zi=0 前 / zi=1 後
    let li = 0;
    for (let zi = 0; zi < zs.length; zi++) {
      const zx = zs[zi];
      for (let xi = 0; xi < xs.length; xi++) {
        const xx = xs[xi];
        // 斜対歩(トロット): 対角の脚が同位相で動く(前右+後左 / 前左+後右)。四足動物の速歩。
        // 旧実装は (li%2) で左右同側が同位相=側対歩(ラクダ歩き)になっていた。
        const phase = ((xi + zi) % 2) === 0 ? 0 : Math.PI;
        parts.push(makePart(`legU${li}`, [xx, legY0, zx], boxShape(xx, (legY0 + kneeY) / 2, zx, 0.16 * tU, (legY0 - kneeY) / 2, 0.16 * tU), col, {
          swingAxis: 'x', swingAmp: 0.52, swingPhase: phase, deadAxis: 'x', deadAngle: 0.7, leg: 'hip',
        }));
        parts.push(makePart(`legL${li}`, [xx, kneeY, zx], boxShape(xx, kneeY / 2, zx, 0.13 * tL, kneeY / 2, 0.13 * tL), col, {
          parent: `legU${li}`,
          swingAxis: 'x', swingAmp: 0.46, swingPhase: phase + 0.6, swingClampPositive: true, deadAxis: 'x', deadAngle: -0.5, leg: 'knee',
        }));
        if (LS.fender) {
          // 守宮: 腿上のロープロファイルなフェンダー(低い重心の記号)
          parts.push(makePart(`fender${li}`, [xx, legY0 + 0.12, zx], boxShape(xx, legY0 + 0.12, zx, 0.2 * tU, 0.05, 0.26), darker(0.28), { parent: `legU${li}` }));
        }
        if (LS.hipArmor) {
          // 岩戸: 股関節の装甲キャップ(砲脚の量感)
          parts.push(makePart(`hipcap${li}`, [xx, legY0, zx], octaShape(xx, legY0, zx, 0.2), darker(0.2), { parent: `legU${li}` }));
        }
        li++;
      }
    }
  } else if (legsKind === 'hover') {
    // ③ ホバー: 車高を低く、前後に長い低スカート(裾が少し広がる)+基部のアンダーグロー+後方スラスタ。
    //    ホバークラフトのイメージ(背が低く後ろが長い)。脚は持たない。
    hoverInfo = { baseLift: 0.9 * MECH_SCALE, bobAmp: 0.18 * MECH_SCALE };
    const hl = LS.hullLen || 1;
    const skH = hipY * 0.42;                              // 低い車高
    const skCz = -torsoD * 0.4;                           // 後ろへ寄せる
    const skLenB = torsoD * 2.0 * hl, skLenT = torsoD * 1.6 * hl;   // 前後に長い(底が少し長い=裾広がり)
    const skW = torsoW * 0.95;
    parts.push(makePart('skirt', [0, skH, skCz], trapBoxZ(0, skH, skCz, skW, skH, skLenB, skLenT), mixColor(col, '#20242a', 0.3), {}));
    parts.push(makePart('deck', [0, skH * 2, skCz * 0.4], boxShape(0, skH * 2, skCz * 0.4, skW * 0.82, skH * 0.5, skLenT * 0.7), mixColor(col, '#000000', 0.15), {}));
    parts.push(makePart('underglow', [0, 0.06, skCz], trapBoxZ(0, 0.06, skCz, skW * 1.05, 0.04, skLenB * 1.02, skLenB), '#7fe7ff', { emissive: true }));
    const thN = LS.thrusters || 1;
    for (let ti = 0; ti < thN; ti++) {
      const tx = thN === 1 ? 0 : (ti === 0 ? 1 : -1) * skW * 0.42;
      parts.push(makePart(`thruster${ti ? ti : ''}`, [tx, skH, skCz - skLenB * 0.5], octaShape(tx, skH, skCz - skLenB * 0.5, thN === 1 ? 0.28 : 0.22), '#bff7ff', { emissive: true }));
    }
    if (LS.floats) {
      // 浮舟: 舷側フロート(船めいた左右の張り出し)
      [1, -1].forEach((s) => {
        const fx = skW * 0.95 * s;
        parts.push(makePart(`float${s}`, [fx, skH * 0.9, skCz], trapBoxZ(fx, skH * 0.9, skCz, 0.14, skH * 0.55, skLenB * 0.6, skLenT * 0.5), darker(0.24), {}));
      });
    }
  } else if (legsKind === 'tank') {
    rockInfo = { amp: 0.03, freq: 1.4 };
    const tl = LS.treadLen || 1;
    const hullY = hipY * 0.6;
    parts.push(makePart('hull', [0, hullY, 0], boxShape(0, hullY, 0, torsoW * 0.7, hipY * 0.4, torsoD * 1.3 * tl), mixColor(col, '#111111', 0.2), {}));
    if (LS.domed) {
      // 亀甲: 甲羅めいた天板(上へすぼむ台形)
      parts.push(makePart('dome', [0, hullY + hipY * 0.4, 0], trapBoxY(0, hullY + hipY * 0.4, 0, hipY * 0.14, torsoW * 0.66, torsoD * 1.15 * tl, torsoW * 0.4, torsoD * 0.7 * tl), darker(0.14), { parent: 'hull' }));
    }
    [1, -1].forEach((side) => {
      const tx = torsoW * 0.75 * side, th = hipY * 0.35;
      // 逆台形の履帯側面(上が前後に長い=実戦車のシルエット)
      parts.push(makePart(`tread${side}`, [tx, th, 0], trapBoxZ(tx, th, 0, 0.22, th, torsoD * 1.2 * tl, torsoD * 1.6 * tl), '#1a1a1a', {}));
      // 転輪(下部に複数・明色で履帯と差)
      const wr = th * 0.42;
      const wn = LS.wheels || 4;
      for (let wi = 0; wi < wn; wi++) {
        // wheels:1 でも 0 除算にしない(1個なら中央)
        const wz = wn > 1 ? -torsoD * 1.0 * tl + wi * (torsoD * 2.0 * tl / (wn - 1)) : 0;
        parts.push(makePart(`roadw${side}_${wi}`, [tx, wr, wz], prismShape([tx, wr, wz], AXIS_X, 0.24, wr, wr, 7), mixColor(col, '#2a2a2a', 0.4), {}));
      }
      if (LS.skirt) {
        // 城塞: 履帯上部を覆うサイドスカート装甲
        parts.push(makePart(`skirtArm${side}`, [tx, th * 1.7, 0], boxShape(tx, th * 1.7, 0, 0.26, th * 0.5, torsoD * 1.5 * tl), darker(0.16), {}));
      }
    });
  } else if (legsKind === 'wheel') {
    // ④ 二輪(セグウェイ/ボトムズのローラーダッシュ): 大径の同軸2輪でバランス。多輪の履帯的シルエットを
    //    避けて履帯と一目で差別化。前進時は moveLocal の前傾(leanX)でバランサーらしく前のめりになる。
    rockInfo = { amp: 0.02, freq: 2.2 };
    const wr = hipY * 0.6 * (LS.wheelR || 1);   // 大径ホイール(接地=中心をwrに置き底が地面)
    const hullY = wr + hipY * 0.2;         // 車体は車軸の上でバランス
    parts.push(makePart('hull', [0, hullY, 0], boxShape(0, hullY, 0, torsoW * 0.55, hipY * 0.3, torsoD * 0.7), mixColor(col, '#111111', 0.18), {}));
    parts.push(makePart('axle', [0, wr, 0], boxShape(0, wr, 0, torsoW * 0.9, 0.08, 0.08), '#222222', {}));
    for (const side of [1, -1]) {
      const wx = torsoW * 0.92 * side;
      parts.push(makePart(`wheel${side}`, [wx, wr, 0], prismShape([wx, wr, 0], AXIS_X, 0.18, wr, wr, 12), '#161616', {
        spin: { axis: 'x', speed: 3.2 },
      }));
      // ハブ(明色・スポーク代わり。回転が見えるように本体色寄り)
      parts.push(makePart(`hub${side}`, [wx, wr, 0], prismShape([wx, wr, 0], AXIS_X, 0.2, wr * 0.34, wr * 0.34, 6), mixColor(col, '#333333', 0.35), {
        spin: { axis: 'x', speed: 3.2 },
      }));
      if (LS.spoke) {
        // 風車: 廉価輪の露出スポーク(wheel の子=回転が見える)
        for (let si2 = 0; si2 < 3; si2++) {
          const ang = si2 * Math.PI / 3;
          parts.push(makePart(`spoke${side}_${si2}`, [wx, wr, 0], boxShape(wx, wr, 0, 0.06, wr * 0.86, 0.05), mixColor(col, '#444444', 0.4), {
            parent: `wheel${side}`, restAngle: ang, restAxis: 'x',
          }));
        }
      }
      if (LS.fender) {
        // 疾駆: ホイールを覆う流線フェンダー(hull の子=回転しない)
        parts.push(makePart(`fenderW${side}`, [wx, wr + wr * 0.7, 0], trapBoxZ(wx, wr + wr * 0.7, 0, 0.2, wr * 0.32, wr * 1.05, wr * 0.75), darker(0.14), { parent: 'hull' }));
      }
    }
  } else if (legsKind === 'reverse') {
    // ① 逆関節(鳥脚): IKモデルと視覚を一致させる(四脚の toe 方式)。脛(legL)は膝から接地まで届く
    //    1本のIKボーンで、planted歩容(walker2)が足先を地面へ駆動する。膝は後折れ(elbow=+1)+
    //    常時軽い屈み(REV_BEND)で鳥脚のシルエットを姿勢そのもので出す。踵の距(スパー)と爪先は
    //    脛の子の装飾パーツ(IK非関与)。旧実装は足首/足の装飾関節が接地に届かず footContactY=0.88 で
    //    宙に浮いていた(ソフト版は影が無く目立たなかったが Three の接地シャドウで露呈する)。
    const kneeY = hipY * 0.62;
    const tU = LS.thigh || 1, tL = LS.shin || 1;
    const spurS = LS.spurS || 1, toeS = LS.toeS || 1;
    [1, -1].forEach((side, li) => {
      const xx = torsoW * 0.3 * side;
      const phase = li === 0 ? 0 : Math.PI;
      parts.push(makePart(`legU${li}`, [xx, hipY, 0], boxShape(xx, (hipY + kneeY) / 2, 0, 0.19 * tU, (hipY - kneeY) / 2, 0.19 * tU), col, {
        swingAxis: 'x', swingAmp: 0.42, swingPhase: phase, deadAxis: 'x', deadAngle: 0.9, leg: 'hip',
      }));
      parts.push(makePart(`legL${li}`, [xx, kneeY, 0], boxShape(xx, kneeY / 2, 0, 0.15 * tL, kneeY / 2, 0.15 * tL), col, {
        parent: `legU${li}`,
        swingAxis: 'x', swingAmp: 0.5, swingPhase: phase + 0.6, swingClampPositive: true, deadAxis: 'x', deadAngle: -0.9, leg: 'knee',
      }));
      // 踵の距(後方へ張り出す=鳥脚の記号)+爪先プレート(前)。脛の子=IKに追従する装飾。
      parts.push(makePart(`spur${li}`, [xx, kneeY * 0.32, -0.24], boxShape(xx, kneeY * 0.32, -0.24, 0.11 * spurS, 0.3 * spurS, 0.18 * spurS), mixColor(col, '#111111', 0.3), { parent: `legL${li}` }));
      parts.push(makePart(`toe${li}`, [xx, 0.12, 0.1], boxShape(xx, 0.12, 0.1, 0.14 * toeS, 0.12, 0.3 * toeS), mixColor(col, '#111111', 0.3), { parent: `legL${li}` }));
      if (LS.piston) {
        // 跳兵: 脛裏の跳躍ピストン(バネの記号)
        parts.push(makePart(`piston${li}`, [xx, kneeY * 0.6, -0.14], prismShape([xx, kneeY * 0.6, -0.14], AXIS_Y, kneeY * 0.3, 0.05, 0.05, 6), mixColor(col, '#8a9096', 0.5), { parent: `legL${li}` }));
      }
    });
  } else {
    // biped
    const kneeY = hipY * 0.5;
    const tU = LS.thigh || 1, tL = LS.shin || 1, tF = LS.foot || 1;
    [1, -1].forEach((side, li) => {
      const xx = torsoW * 0.32 * side;
      const phase = li === 0 ? 0 : Math.PI;
      parts.push(makePart(`legU${li}`, [xx, hipY, 0], boxShape(xx, (hipY + kneeY) / 2, 0, 0.22 * tU, (hipY - kneeY) / 2, 0.22 * tU), col, {
        swingAxis: 'x', swingAmp: 0.64, swingPhase: phase, deadAxis: 'x', deadAngle: 0.8, leg: 'hip',
      }));
      parts.push(makePart(`legL${li}`, [xx, kneeY, 0], boxShape(xx, kneeY / 2, 0, 0.18 * tL, kneeY / 2, 0.18 * tL), col, {
        parent: `legU${li}`,
        swingAxis: 'x', swingAmp: 0.62, swingPhase: phase + 0.7, swingClampPositive: true, deadAxis: 'x', deadAngle: -0.6, leg: 'knee',
      }));
      parts.push(makePart(`foot${li}`, [xx, 0.1, 0.08], boxShape(xx, 0.1, 0.08, 0.2 * tF, 0.1, 0.32 * tF), mixColor(col, '#111111', 0.3), {
        parent: `legL${li}`,
        deadAxis: 'x', deadAngle: -0.3,
      }));
      if (LS.kneePlate) {
        // 堅牢: 膝前の追加装甲(戦列二脚の記号)
        parts.push(makePart(`kneep${li}`, [xx, kneeY + 0.06, 0.16 * tL], boxShape(xx, kneeY + 0.06, 0.16 * tL, 0.16 * tL, 0.18, 0.07), darker(0.22), { parent: `legL${li}` }));
      }
      if (LS.calfBoost) {
        // 疾風/野分: ふくらはぎのブースタ(ノズル発光=速さの記号)
        parts.push(makePart(`calf${li}`, [xx, kneeY * 0.62, -0.16 * tL], boxShape(xx, kneeY * 0.62, -0.16 * tL, 0.1, kneeY * 0.24, 0.09), darker(0.28), { parent: `legL${li}` }));
        parts.push(makePart(`calfN${li}`, [xx, kneeY * 0.36, -0.2 * tL], boxShape(xx, kneeY * 0.36, -0.2 * tL, 0.05, 0.04, 0.04), '#7fe7ff', { parent: `calf${li}`, emissive: true }));
      }
    });
    if (LS.hipArmor) {
      // 野分: 腰部スカート装甲(torso 子=脚の振りに干渉しない)
      [1, -1].forEach((s) => {
        parts.push(makePart(`hipSkirt${s}`, [torsoW * 0.4 * s, hipY + 0.15, 0], trapBoxY(torsoW * 0.4 * s, hipY + 0.15, 0, 0.24, 0.1, 0.2, 0.16, 0.26), darker(0.18), {
          parent: 'torso', restAngle: -0.16 * s, restAxis: 'z',
        }));
      });
    }
  }

  // --- 腕+武装(腕→拳→得物 の階層で連鎖。得物は WPN_STYLES の id 別レシピ) ---
  const shoulderY = torsoCy + torsoH * 0.32;
  const wpns = [{ side: 1, part: wpnRPart }, { side: -1, part: wpnLPart }];
  wpns.forEach(({ side, part }) => {
    const kind = (part && part.kind) || 'rifle';
    const st = WS(part && part.id) || {};
    const sx = (torsoW / 2 + 0.18) * side;
    const armLen = 1.5;
    const armY0 = shoulderY, armY1 = shoulderY - armLen;
    const armName = `arm${side}`;
    parts.push(makePart(armName, [sx, (armY0 + armY1) / 2, 0], boxShape(sx, (armY0 + armY1) / 2, 0, 0.2, armLen / 2, 0.2), col, {
      swingAxis: 'x', swingAmp: 0.12, swingPhase: side > 0 ? Math.PI : 0, swingFreq: 1,
      deadAxis: 'z', deadAngle: 0.4 * side, role: 'arm', side,
    }));
    const handY = armY1 - 0.15;
    const fistName = `fist${side}`;
    parts.push(makePart(fistName, [sx, handY, 0.1], boxShape(sx, handY, 0.1, 0.15, 0.15, 0.15), col, {
      parent: armName, role: 'fist', side,
    }));

    if (kind === 'missile') {
      // ポッド寸法+前面の発射管(id 別: 小型=2連 / 標準=4連 / 大蛇=3連大口径)
      const pw = st.podW || 0.34, ph = st.podH || 0.3, pd = st.podD || 0.6;
      const py = shoulderY + 0.35, pz = -0.1;
      const podName = `pod${side}`;
      parts.push(makePart(podName, [sx, py, pz], boxShape(sx, py, pz, pw, ph, pd), mixColor(col, '#000000', 0.15), {
        parent: armName, role: 'pod', side,
      }));
      const tubes = st.tubes || 2;
      const tr = Math.min(0.09, pw * 0.75 / tubes);
      for (let ti = 0; ti < tubes; ti++) {
        const tx = sx + (tubes === 1 ? 0 : (ti / (tubes - 1) - 0.5) * (pw * 1.5 - tr * 2));
        parts.push(makePart(`tube${side}_${ti}`, [tx, py + ph * 0.3, pz + pd], prismShape([tx, py + ph * 0.3, pz + pd], AXIS_Z, 0.05, tr, tr, 6), '#1c2024', { parent: podName }));
      }
    } else if (kind === 'blade') {
      parts.push(makePart(`hilt${side}`, [sx, handY, 0.15], boxShape(sx, handY, 0.15, 0.13, 0.13, 0.22), mixColor(col, '#000000', 0.2), {
        parent: fistName, role: 'hilt', side,
      }));
      if (st.cleaver) {
        // 作業用重刃: 金属の厚刃(非発光)+背の補強リブ。工廠の解体刃。
        parts.push(makePart(`blade${side}`, [sx, handY - 0.62, 0.15], trapBoxY(sx, handY - 0.62, 0.15, 0.85, 0.05, 0.24, 0.02, 0.1), '#aeb6ba', {
          parent: `hilt${side}`, role: 'blade', side,
        }));
        parts.push(makePart(`bladeRib${side}`, [sx, handY - 0.3, 0.15 - 0.16], boxShape(sx, handY - 0.3, 0.15 - 0.16, 0.06, 0.5, 0.06), mixColor(col, '#000000', 0.3), { parent: `blade${side}` }));
      } else {
        // 光刃: 発光する刀身
        parts.push(makePart(`blade${side}`, [sx, handY - 0.62, 0.15], boxShape(sx, handY - 0.62, 0.15, 0.035, 0.85, 0.16), '#c8fff0', {
          parent: `hilt${side}`, emissive: true, role: 'blade', side,
        }));
      }
    } else if (kind === 'drill') {
      const drillLen = 1.0;
      parts.push(makePart(`drillcasing${side}`, [sx, handY, 0.15], boxShape(sx, handY, 0.15, 0.2, 0.2, 0.3), mixColor(col, '#0a0a0a', 0.3), {
        parent: fistName, role: 'drillcasing', side,
      }));
      parts.push(makePart(`drillbit${side}`, [sx, handY, 0.15 + drillLen / 2], prismShape([sx, handY, 0.15 + drillLen / 2], AXIS_Z, drillLen / 2, 0, 0.22, 7), mixColor(col, '#111111', 0.1), {
        parent: fistName, spin: { axis: 'z', speed: 2.4 }, role: 'drill', side,
      }));
      if (st.collar) {
        // 基部の締め付けカラー(回らない側=ケーシングの子)
        parts.push(makePart(`drillCol${side}`, [sx, handY, 0.48], prismShape([sx, handY, 0.48], AXIS_Z, 0.04, 0.25, 0.25, 8), mixColor(col, '#333333', 0.4), { parent: `drillcasing${side}` }));
      }
    } else if (kind === 'rocketpunch') {
      parts.push(makePart(`rpforearm${side}`, [sx, handY, 0.12], boxShape(sx, handY, 0.12, 0.19, 0.22, 0.34), col, {
        parent: fistName, role: 'rocketFist', side,
      }));
      parts.push(makePart(`rpknuckle${side}`, [sx, handY, 0.42], boxShape(sx, handY, 0.42, 0.2, 0.22, 0.14), mixColor(col, '#000000', 0.1), {
        parent: fistName, role: 'rocketFist', side,
      }));
      if (st.thrustRing) {
        // 手首の推進リング(飛んで帰る拳の記号)
        parts.push(makePart(`rpRing${side}`, [sx, handY, 0.02], prismShape([sx, handY, 0.02], AXIS_Z, 0.03, 0.24, 0.24, 8), mixColor(col, '#333333', 0.4), { parent: fistName, side }));
      }
    } else {
      const dims = {
        len: st.len || (kind === 'railgun' ? 1.9 : kind === 'shotgun' ? 0.62 : kind === 'beam' ? 1.05 : 1.15),
        rad: st.rad || (kind === 'railgun' ? 0.19 : kind === 'shotgun' ? 0.27 : kind === 'beam' ? 0.13 : 0.15),
        muzzleSize: st.muzzle || (kind === 'railgun' ? 0.32 : kind === 'shotgun' ? 0.3 : kind === 'beam' ? 0.16 : 0.14),
      };
      const gunZ = 0.1 + dims.len / 2;
      const gunName = `gun${side}`;
      if (st.twin) {
        // 双連ビーム: レシーバ+左右2本の細銃身
        parts.push(makePart(gunName, [sx, handY, gunZ], boxShape(sx, handY, gunZ - dims.len * 0.28, dims.rad * 1.6, dims.rad * 1.2, dims.len * 0.22), mixColor(col, '#0a0a0a', 0.35), {
          parent: fistName, role: 'gunBarrel', side,
        }));
        [1, -1].forEach((bs) => {
          const bx = sx + dims.rad * 0.85 * bs;
          parts.push(makePart(`barrel${side}_${bs}`, [bx, handY, gunZ], boxShape(bx, handY, gunZ, dims.rad * 0.55, dims.rad * 0.55, dims.len / 2), mixColor(col, '#0a0a0a', 0.3), { parent: gunName }));
        });
      } else if (st.rotary) {
        // 速射機関砲: レシーバ+回転する3連銃身クラスタ(rotor の子=軸周りに公転)
        parts.push(makePart(gunName, [sx, handY, gunZ - dims.len * 0.3], boxShape(sx, handY, gunZ - dims.len * 0.3, dims.rad * 1.3, dims.rad * 1.3, dims.len * 0.2), mixColor(col, '#0a0a0a', 0.35), {
          parent: fistName, role: 'gunBarrel', side,
        }));
        const rotName = `rotor${side}`;
        parts.push(makePart(rotName, [sx, handY, gunZ], prismShape([sx, handY, gunZ], AXIS_Z, dims.len * 0.12, dims.rad * 0.5, dims.rad * 0.5, 6), mixColor(col, '#222222', 0.4), {
          parent: gunName, spin: { axis: 'z', speed: 5.0 },
        }));
        for (let bi = 0; bi < 3; bi++) {
          const ba = bi * Math.PI * 2 / 3;
          const bx = sx + Math.cos(ba) * dims.rad * 0.62, by = handY + Math.sin(ba) * dims.rad * 0.62;
          parts.push(makePart(`barrel${side}_${bi}`, [bx, by, gunZ + dims.len * 0.1], boxShape(bx, by, gunZ + dims.len * 0.1, 0.045, 0.045, dims.len * 0.42), '#141414', { parent: rotName }));
        }
      } else {
        parts.push(makePart(gunName, [sx, handY, gunZ], boxShape(sx, handY, gunZ, dims.rad, dims.rad, dims.len / 2), mixColor(col, '#0a0a0a', 0.35), {
          parent: fistName, role: 'gunBarrel', side,
        }));
      }
      if (kind === 'railgun') {
        [1, -1].forEach((rside) => {
          parts.push(makePart(`rail${side}_${rside}`, [sx, handY + dims.rad * 0.75 * rside, gunZ], boxShape(sx, handY + dims.rad * 0.75 * rside, gunZ, 0.03, 0.03, dims.len / 2 - 0.05), '#bff7ff', {
            parent: `gun${side}`, emissive: true, role: 'railGlow', side,
          }));
        });
      }
      parts.push(makePart(`muzzle${side}`, [sx, handY, 0.1 + dims.len], boxShape(sx, handY, 0.1 + dims.len, dims.muzzleSize * 0.6, dims.muzzleSize * 0.6, 0.06), kind === 'beam' ? '#bff7ff' : '#8a8a8a', {
        parent: `gun${side}`, emissive: kind === 'beam', role: 'muzzle', side,
      }));
      // 銃のディティール(id 別): スコープ/弾倉/前握把/マズルブレーキ/冷却リング/蓄電器/ドラム/タンク等
      if (st.scopeBig) {
        const sy2 = handY + dims.rad + 0.1, sz2 = gunZ - dims.len * 0.18;
        parts.push(makePart(`scope${side}`, [sx, sy2, sz2], prismShape([sx, sy2, sz2], AXIS_Z, dims.len * 0.16, 0.06, 0.06, 6), mixColor(col, '#000000', 0.45), { parent: `gun${side}` }));
        parts.push(makePart(`lens${side}`, [sx, sy2, sz2 - dims.len * 0.17], boxShape(sx, sy2, sz2 - dims.len * 0.17, 0.04, 0.04, 0.02), '#8fd0ff', { parent: `scope${side}`, emissive: true }));
      } else if (!st.rotary && !st.tank) {
        parts.push(makePart(`scope${side}`, [sx, handY + dims.rad + 0.06, gunZ - dims.len * 0.12], boxShape(sx, handY + dims.rad + 0.06, gunZ - dims.len * 0.12, 0.045, 0.05, dims.len * 0.2), mixColor(col, '#000000', 0.45), { parent: `gun${side}` }));
      }
      if (st.mag || (!WS(part && part.id) && (kind === 'rifle' || kind === 'railgun' || kind === 'shotgun'))) {
        parts.push(makePart(`mag${side}`, [sx, handY - dims.rad - 0.11, gunZ - dims.len * 0.18], boxShape(sx, handY - dims.rad - 0.11, gunZ - dims.len * 0.18, 0.08, 0.15, 0.09), mixColor(col, '#000000', 0.32), { parent: `gun${side}` }));
      }
      if (st.grip) {
        parts.push(makePart(`grip${side}`, [sx, handY - dims.rad - 0.09, gunZ + dims.len * 0.16], boxShape(sx, handY - dims.rad - 0.09, gunZ + dims.len * 0.16, 0.05, 0.11, 0.05), mixColor(col, '#000000', 0.4), { parent: `gun${side}` }));
      }
      if (st.brake) {
        // マズルブレーキ(制退器): 銃口の一回り太い箱
        parts.push(makePart(`brake${side}`, [sx, handY, 0.1 + dims.len - 0.1], boxShape(sx, handY, 0.1 + dims.len - 0.1, dims.rad * 1.4, dims.rad * 1.4, 0.09), mixColor(col, '#111111', 0.3), { parent: `gun${side}` }));
      }
      if (st.shroud) {
        // 徹甲ライフル: 後半を覆う厚い砲身シュラウド
        parts.push(makePart(`shroud${side}`, [sx, handY, gunZ - dims.len * 0.16], boxShape(sx, handY, gunZ - dims.len * 0.16, dims.rad * 1.35, dims.rad * 1.35, dims.len * 0.28), mixColor(col, '#0a0a0a', 0.2), { parent: `gun${side}` }));
      }
      if (st.rings) {
        // 狙撃ビーム: 冷却リング×3(長銃身の記号)
        for (let ri = 0; ri < 3; ri++) {
          const rz = gunZ + dims.len * (0.02 + ri * 0.14);
          parts.push(makePart(`ring${side}_${ri}`, [sx, handY, rz], prismShape([sx, handY, rz], AXIS_Z, 0.025, dims.rad + 0.05, dims.rad + 0.05, 8), mixColor(col, '#333333', 0.42), { parent: `gun${side}` }));
        }
      }
      if (st.fins) {
        // 中距離ビーム: エミッタ左右の放熱フィン
        [1, -1].forEach((fs2) => {
          const fx2 = sx + (dims.rad + 0.05) * fs2;
          parts.push(makePart(`gfin${side}_${fs2}`, [fx2, handY, gunZ + dims.len * 0.1], boxShape(fx2, handY, gunZ + dims.len * 0.1, 0.03, dims.rad * 1.5, dims.len * 0.24), mixColor(col, '#000000', 0.38), { parent: `gun${side}` }));
        });
      }
      if (st.tank) {
        // 溶断バーナー: 燃料タンク(銃身上の小円筒)+ノズル余熱の発光
        const ty2 = handY + dims.rad + 0.12;
        parts.push(makePart(`fuel${side}`, [sx, ty2, gunZ - 0.05], prismShape([sx, ty2, gunZ - 0.05], AXIS_Z, dims.len * 0.3, 0.09, 0.09, 8), mixColor(col, '#000000', 0.3), { parent: `gun${side}` }));
        parts.push(makePart(`pilot${side}`, [sx, handY, 0.1 + dims.len + 0.05], boxShape(sx, handY, 0.1 + dims.len + 0.05, 0.05, 0.05, 0.03), '#ffb04a', { parent: `gun${side}`, emissive: true }));
      }
      if (st.capacitor) {
        // レールガン: 銃身下の蓄電器ブロック+充電灯
        parts.push(makePart(`cap${side}`, [sx, handY - dims.rad - 0.14, gunZ - dims.len * 0.22], boxShape(sx, handY - dims.rad - 0.14, gunZ - dims.len * 0.22, 0.12, 0.13, dims.len * 0.2), mixColor(col, '#000000', 0.35), { parent: `gun${side}` }));
        parts.push(makePart(`capLamp${side}`, [sx, handY - dims.rad - 0.14, gunZ - dims.len * 0.02], boxShape(sx, handY - dims.rad - 0.14, gunZ - dims.len * 0.02, 0.04, 0.04, 0.03), '#bff7ff', { parent: `cap${side}`, emissive: true }));
      }
      if (st.drum) {
        // 散弾系: 銃身下の回転ドラム弾倉
        const dy2 = handY - dims.rad - 0.12;
        parts.push(makePart(`drum${side}`, [sx, dy2, gunZ - dims.len * 0.08], prismShape([sx, dy2, gunZ - dims.len * 0.08], AXIS_X, 0.1, 0.14, 0.14, 8), mixColor(col, '#000000', 0.35), { parent: `gun${side}` }));
      }
      if (st.ammoBox) {
        // 機関砲: 給弾ボックス+ベルトの示唆
        parts.push(makePart(`abox${side}`, [sx, handY - dims.rad - 0.16, gunZ - dims.len * 0.3], boxShape(sx, handY - dims.rad - 0.16, gunZ - dims.len * 0.3, 0.13, 0.15, 0.16), mixColor(col, '#000000', 0.3), { parent: `gun${side}` }));
      }
    }
    // 肩アーマー(装甲id別: 鋳鉄/重層=角張った大型 / 繊維/流体=丸パッド / 他=標準)
    // 質感も装甲idへ合わせる(名前が共通なので mat を明示: 鋳鉄=鋳肌 / 重層=厚板 / 繊維=織り / 流体=艶)
    if (armorId === 'ar6' || armorId === 'ar3') {
      parts.push(makePart(`pauldron${side}`, [sx, shoulderY - 0.02, 0], trapBoxY(sx, shoulderY - 0.02, 0, 0.2, 0.3, 0.32, 0.2, 0.24), mixColor(col, '#000000', 0.24), { parent: armName, mat: armorId === 'ar6' ? 'cast' : 'plate' }));
    } else if (armorId === 'ar5' || armorId === 'ar7') {
      parts.push(makePart(`pauldron${side}`, [sx, shoulderY - 0.02, 0], octaShape(sx, shoulderY - 0.02, 0, 0.26), armorId === 'ar7' ? mixColor(col, '#bfe8ff', 0.2) : mixColor(col, '#ffffff', 0.12), { parent: armName, mat: armorId === 'ar7' ? 'fluid' : 'weave' }));
    } else if (armorId === 'ar4') {
      parts.push(makePart(`pauldron${side}`, [sx, shoulderY - 0.05, 0], boxShape(sx, shoulderY - 0.05, 0, 0.26, 0.16, 0.28), mixColor(col, '#000000', 0.18), { parent: armName, mat: 'era' }));
    } else {
      parts.push(makePart(`pauldron${side}`, [sx, shoulderY - 0.05, 0], boxShape(sx, shoulderY - 0.05, 0, 0.26, 0.16, 0.28), mixColor(col, '#000000', 0.18), { parent: armName }));
    }
  });

  // 親子解決(名前 -> index)
  const nameIdx = new Map();
  parts.forEach((p, i) => nameIdx.set(p.name, i));
  parts.forEach((p) => {
    if (p.parentName && nameIdx.has(p.parentName)) p.parentIdx = nameIdx.get(p.parentName);
  });

  // 全体スケール適用: pivot・頂点オフセットを接地点(0,0,0)基準で一律縮小する。
  // 脚種ごとの接地(y=0)や親子連鎖の回転整合は、pivot自体も同率で縮小されるため保たれる。
  parts.forEach((p) => {
    p.pivot = scaleV(p.pivot, MECH_SCALE);
    p.verts = p.verts.map((v) => scaleV(v, MECH_SCALE));
  });

  return { color: col, parts, hover: hoverInfo, rock: rockInfo, legsKind, torsoCy: torsoCy * MECH_SCALE };
}

// 横倒し(撃破)した機体が「見た目の中心」をどのワールド座標に置くか。カメラの狙点/勝者の周回中心に使う。
// poseMechと同じ決定論(fallCurve・fallSign・Zロール)で胴中心を追い、feet基準の(x,y)からのズレを返す。
// 生存中・deadAge未満は直立の胴中心を返す。mesh は torsoCy(スケール済み)を持つ。
export function mechFocus(mech, mesh) {
  const x = mech.x || 0, z = mech.y || 0, h = mech.h || 0;
  const torsoCy = (mesh && mesh.torsoCy) || 2.7 * MECH_SCALE;
  const elev = mech.elev || 0;   // v5: 足場の標高(カメラの狙点も一緒に上げないと高所の機体が画面下に落ちる)
  if (mech.alive !== false || mech.deadAge == null) {
    return { x, y: GROUND_Y + elev + torsoCy, z };
  }
  const fc = fallCurve(mech.deadAge);
  const idxHash = hash(x * 0.013 + z * 0.017);
  const fallSign = hash(idxHash * 13.7 + h * 4.1 + 0.31) < 0.5 ? -1 : 1;
  const rockAngle = fc.roll * 88 * DEG * fallSign;
  // 胴中心[0,torsoCy,0]をZロール(横倒し)→機体の右/前ベクトルでワールド展開
  const c = Math.cos(rockAngle), s = Math.sin(rockAngle);
  const bx = -torsoCy * s, by = torsoCy * c;   // Z軸回転後の機体ローカルx,y
  const right3 = [Math.sin(h), 0, -Math.cos(h)];
  const originY = GROUND_Y + elev + fc.roll * 1.6 * MECH_SCALE;
  return { x: x + right3[0] * bx, y: originY + by, z: z + right3[2] * bx };
}

// ==================== 姿勢計算(階層変換 + 攻撃モーション) ====================

function matchesAttack(part, attack) {
  if (!attack || !part.role) return false;
  if (attack.side === 'R' || attack.side === 'L') {
    const wantSide = attack.side === 'R' ? 1 : -1;
    if (part.side && part.side !== wantSide) return false;
  }
  return true;
}

// 反動/のけぞりの時間曲線: rise までで最大→減衰しつつ一度だけ逆側へ小さく振れて収まる
// (フォロースルーの「戻りの余韻」。純関数=同じ age は同じ値・決定論)。
function impulseCurve(age, rise) {
  const a = clamp01(age);
  if (a < rise) return a / rise;
  const b = (a - rise) / (1 - rise);
  return Math.exp(-3.2 * b) * Math.cos(b * Math.PI * 0.8);
}
// 踏み込み/回避の山: 速く入ってゆっくり抜ける非対称カーブ(白兵の振り抜き・横っ飛びの戻り)。
function lungeCurve(age) {
  return Math.sin(Math.PI * Math.pow(clamp01(age), 0.72));
}
function recoilCurve(age) { return impulseCurve(age, 0.1); }

function attackMorph(part, attack) {
  const age = clamp01(attack.age01 == null ? 0 : attack.age01);
  const kind = attack.kind;
  const res = {};
  if (part.role === 'gunBarrel') {
    if (kind === 'rifle' || kind === 'shotgun' || kind === 'railgun') {
      const depth = (kind === 'railgun' ? 0.55 : kind === 'shotgun' ? 0.22 : 0.16) * MECH_SCALE;
      res.offset = [0, 0, -depth * recoilCurve(age)];
    }
  } else if (part.role === 'muzzle') {
    if (kind === 'beam') res.scale = 1 + Math.sin(Math.min(1, age) * Math.PI) * 1.8;
  } else if (part.role === 'drill') {
    if (kind === 'drill') {
      res.angleDelta = age * 14;
      res.offset = [0, 0, 0.5 * MECH_SCALE * Math.sin(Math.min(1, age) * Math.PI)];
    }
  } else if (part.role === 'drillcasing') {
    if (kind === 'drill') res.offset = [0, 0, 0.3 * MECH_SCALE * Math.sin(Math.min(1, age) * Math.PI)];
  } else if (part.role === 'rocketFist') {
    if (kind === 'rocketpunch' && age > 0.03) res.hide = true;
  } else if (part.role === 'hilt') {
    if (kind === 'blade') {
      res.angleDelta = lungeCurve(age) * 1.9;   // 速く振り込み、ゆっくり振り抜く(フォロースルー)
      res.axisOverride = 'y';
    }
  }
  return res;
}

// 敗者の崩れ落ち(横倒し)の時間曲線。deadAge(撃破からの経過秒)のみに依存する純関数
// (Math.random不使用・tSecにも依存しないので何度呼んでも同じ姿勢になる=静止後の凍結も自然に成立)。
const DEAD_ROLL_DUR = 1.4;   // 全身ロール(横倒し)が完了するまでの時間
const DEAD_JOINT_DUR = 0.7;  // 関節が脱力しきるまでの時間(全身より早く抜ける)
function fallCurve(deadAge) {
  const t = clamp01(deadAge / DEAD_ROLL_DUR);
  const roll = easeOutCubic(t);
  // 着地バウンド: deadAge~0.7〜1.2sの間だけ立ち上がる小さな山(それ以外は0)
  const bt = clamp01((deadAge - 0.7) / 0.5);
  const bounce = deadAge < DEAD_ROLL_DUR ? Math.sin(bt * Math.PI) * (1 - bt) : 0;
  return { roll, bounce };
}
function jointEase(deadAge) { return easeOutCubic(clamp01((deadAge || 0) / DEAD_JOINT_DUR)); }

function partMotion(part, ctx) {
  let angle = part.restAngle || 0;
  let axisKey = part.swingAxis || part.restAxis || 'x';
  let angle2 = 0, axis2 = null;   // 第2回転(脚の横ステップ用。Z軸で開閉)
  if (ctx.alive && part.swingAxis) {
    const cyc = Math.sin(ctx.wp * 1.4 * part.swingFreq + part.swingPhase);
    if (part.leg) {
      // ②③① 移動方向連携。moveLocal(ctx.move)が無ければ従来の「まっすぐ前進歩行」に落ちる。
      const mv = ctx.move;
      const driveF = mv ? clampN(mv.fwd, -1, 1) : 1;   // 前後速度(前進+ / 後退-)
      const driveL = mv ? clampN(mv.lat, -1, 1) : 0;   // 横速度(右+ / 左-)
      const stride = mv ? clamp01(Math.hypot(driveF, driveL)) : 1; // 総移動量(静止=0)
      if (part.leg === 'knee') {
        // ① 膝: サイクル正相=遊脚で屈曲、負相=接地脚で伸展(clampPositiveの脚)。屈曲量は移動量に比例
        //    (静止時は直立で足が浮かない)。逆関節はclampPositiveを持たず両方向に撓む挙動を保つ。
        const s = part.swingClampPositive ? Math.max(0, cyc) : cyc;
        angle += s * part.swingAmp * stride;
      } else {
        // ② 股/大腿: 前後成分で前後キック(後退で位相反転)、横成分でZ軸の横ステップ。
        angle += cyc * part.swingAmp * driveF;
        angle2 = cyc * part.swingAmp * 0.75 * driveL;
        axis2 = AXIS_Z;
      }
    } else {
      let s = cyc;
      if (part.swingClampPositive) s = Math.max(0, s);
      angle += s * part.swingAmp;
    }
  }
  if (part.spin && ctx.alive) {
    axisKey = part.spin.axis;
    angle += ctx.wp * part.spin.speed;
  }
  let offset = null, scale = null, hide = false;
  if (!ctx.alive && part.deadAxis) {
    // 脱力: restAngle(直立時の基準角)から deadAngle(脱力しきった角)へ deadAge で ease。
    const jt = jointEase(ctx.deadAge);
    const rest = part.restAngle || 0;
    angle = rest + (part.deadAngle - rest) * jt;
    axisKey = part.deadAxis;
    angle2 = 0; axis2 = null;   // 脱力中は横ステップを消す
  } else if (ctx.alive && ctx.attack && part.role && matchesAttack(part, ctx.attack)) {
    const m = attackMorph(part, ctx.attack);
    if (m.angleDelta) angle += m.angleDelta;
    if (m.axisOverride) axisKey = m.axisOverride;
    if (m.offset) offset = m.offset;
    if (m.scale) scale = m.scale;
    if (m.hide) hide = true;
  }
  if (part.clampRange) angle = Math.max(part.clampRange[0], Math.min(part.clampRange[1], angle));
  return { angle, axis: axisFromKey(axisKey), angle2, axis2, offset, scale, hide };
}

// rest座標系の点(part基準)を、親の連鎖(parentIdx)を辿って最終的な位置まで変換する。
// 「腿の先端(=脛のpivot)」は腿の回転に厳密に追従する(同一点に同一回転列を適用するため)。
function transformThroughChain(parts, motions, partIdx, restPoint) {
  let idx = partIdx;
  let p = restPoint;
  let guard = 0;
  while (idx != null && idx >= 0 && guard++ < 12) {
    const part = parts[idx];
    const mo = motions[idx];
    let rel = sub(p, part.pivot);
    if (mo.scale && mo.scale !== 1) rel = scaleV(rel, mo.scale);
    if (mo.angle) rel = rotateAroundAxis(rel, mo.axis, mo.angle);
    if (mo.angle2) rel = rotateAroundAxis(rel, mo.axis2, mo.angle2);
    p = add(rel, part.pivot);
    if (mo.offset) p = add(p, mo.offset);
    idx = part.parentIdx;
  }
  return p;
}

// ==================== 姿勢計算(純関数・描画非依存) ====================
// 機体の姿勢(各パーツの motions / 原点 / 前後傾 / 横倒しロール / 距離駆動の歩容+2ボーンIK)を計算する。
// ソフトウェア描画(poseMechFaces)と Three.js 描画(r3d-three.js)がこの関数を共有する=歩容/IKの
// 唯一の真実(掟: St1で確立した歩容ロジックは描画非依存の純数式。描画方式を変えても作り直さない)。
// mesh._gait を進めるので「1フレームにつき1回だけ」呼ぶこと(ソフト版は faces/edges で2回呼ぶが、
// 2回目は dt≈0 で dist が進まないため冪等)。
export function computeMechPose(mech, tSec) {
  const mesh = mech.mesh;
  if (!mesh || !mesh.parts) return null;
  const alive = mech.alive !== false;
  const deadAge = alive ? 0 : (mech.deadAge == null ? DEAD_ROLL_DUR : mech.deadAge);
  const h = mech.h || 0;
  const wp = mech.walkPhase || 0;
  const attack = mech.attack || null;
  const forward3 = [Math.cos(h), 0, Math.sin(h)];
  const right3 = [Math.sin(h), 0, -Math.cos(h)];
  const idxHash = hash((mech.x || 0) * 0.013 + (mech.y || 0) * 0.017);

  // v5: mech.elev=足場の標高(m。シムの climbH をそのまま渡す)。IK は origin から下へ解くので、
  // origin を上げるだけで脚も接地点も一緒に上がる=瓦礫の天端に立つ。未指定なら従来どおり地面。
  let originY = GROUND_Y + (mech.elev || 0);
  if (mesh.hover && alive) originY += mesh.hover.baseLift + Math.sin(tSec * 1.6) * mesh.hover.bobAmp;

  let rockAngle = 0;
  if (mesh.rock && alive) rockAngle = Math.sin(wp * mesh.rock.freq) * mesh.rock.amp;

  const move = (alive && mech.moveLocal) ? mech.moveLocal : null;
  const legged = mesh.legsKind === 'biped' || mesh.legsKind === 'quad' || mesh.legsKind === 'reverse';
  let leanX = 0;
  if (move) {
    leanX = -clampN(move.fwd, -1, 1) * 7 * DEG;
    rockAngle += clampN(move.lat, -1, 1) * 6 * DEG;
  }
  const walker2 = mesh.legsKind === 'biped' || mesh.legsKind === 'quad' || mesh.legsKind === 'reverse';
  let gaitCycles = 0, footReach = 0, gaitStride = 1, travelX = forward3[0], travelZ = forward3[2];
  if (walker2) {
    const g = mesh._gait || (mesh._gait = { ph: 0, lx: null, lz: null, lt: null, dx: null, dz: null, legs: [] });
    const hip0 = mesh.parts.find((p) => p.name === 'legU0');
    footReach = hip0 ? hip0.pivot[1] : 2.4;
    // 低速ほど歩幅を伸ばす(歩数が減り、一歩が大きくゆっくり=重い足取り)。歩幅が速度で変わるため、
    // 位相は「距離の総和/歩幅」の後計算ではなく step/stride をその場で積分する(過去の位相が跳ばない)。
    const slowF = move ? (1 - clamp01(move.mag)) : 0;
    const slowK = 1 + GAIT_SLOW_STRIDE * slowF * slowF;
    gaitStride = GAIT_STRIDE_K * footReach * slowK;   // 1歩容周期あたりの進行距離[m]
    const bx = mech.x || 0, bz = mech.y || 0;
    let dt = 0;
    if (g.lt != null) { dt = tSec - g.lt; if (dt < 0 || dt > 0.1) dt = 0; }
    g.lt = tSec;
    let step = 0;
    if (g.lx != null) {
      const ddx = bx - g.lx, ddz = bz - g.lz, d = Math.hypot(ddx, ddz);
      if (d < 8) { step = d; if (d > 1e-4) { g.dx = ddx / d; g.dz = ddz / d; } }  // 8m超=シーク跳びは無視、進行方向を更新
    }
    g.lx = bx; g.lz = bz;
    // 進行方向: 実移動があればその向き、無ければ機体前方(後退は反転)。接地脚の掃引/接地点はこの向きに沿う。
    if (g.dx != null && step > 1e-4) { travelX = g.dx; travelZ = g.dz; }
    else { const sgn = (move && move.fwd < -0.05) ? -1 : 1; travelX = forward3[0] * sgn; travelZ = forward3[2] * sgn; }
    if (step < 1e-4 && move && move.mag > 0.01) step = move.mag * 10 * dt;   // 非移動プレビューは合成(接地基準無=滑り無関係。落ち着いた歩調に)
    // ケイデンス上限(脚のバタつき防止)。上限内は完全接地、超過分は機体が脚を追い越す=滑走(ブースト表現)。
    if (dt > 0) step = Math.min(step, GAIT_MAX_CAD * gaitStride * dt);
    if (alive && move) g.ph = (g.ph || 0) + step / gaitStride;   // ||0: 旧形_gait({dist})残留時のNaN防止
    gaitCycles = g.ph || 0;
  }
  const gaitAng = gaitCycles * 2 * Math.PI;

  // ==== 全身アクション(描画のみ・シム非依存・決定論): 射撃反動/白兵踏み込み/被弾flinch/回避juke ====
  // イベント時刻からの経過(age01)だけで決まる純関数の姿勢加算。actDip は IK の実効脚長にも反映し、
  // 沈み込んでも接地脚は planted のまま(足が地面へ潜らない)。
  let actTiltX = 0, actRock = 0, actFwd = 0, actLat = 0, actDip = 0;
  if (alive && attack) {
    const aa = clamp01(attack.age01);
    const sgn = attack.side === 'L' ? -1 : 1;
    const k = attack.kind;
    if (k === 'rifle' || k === 'shotgun' || k === 'railgun' || k === 'missile') {
      const amp = k === 'railgun' ? 7 : k === 'shotgun' ? 5 : k === 'missile' ? 2.5 : 3;
      const c = impulseCurve(aa, 0.1);
      actTiltX += c * amp * DEG;              // 反動で上体が起き、揺り戻して収まる
      actRock += c * sgn * amp * 0.35 * DEG;  // 発砲側の肩が開く捻れ
    } else if (k === 'beam') {
      actTiltX -= Math.sin(Math.PI * aa) * 2.5 * DEG;   // 照射を支える前傾ブレース
    } else if (k === 'blade' || k === 'drill' || k === 'rocketpunch') {
      const c = lungeCurve(aa);
      actTiltX -= c * (k === 'blade' ? 8 : 6) * DEG;    // 踏み込みの前傾
      actFwd += c * 0.55 * MECH_SCALE;                  // 体ごと前へ出る(接地脚は planted のまま)
      actRock += c * sgn * 4 * DEG;                     // 振り抜きの捻れ
      actDip += c * 0.22 * MECH_SCALE;                  // 沈み込み
    }
  }
  const hitFx = alive ? mech.hitFx : null;   // 被弾flinch: {age01, dirX, dirZ(押し込みのワールド向き), mag}
  if (hitFx && hitFx.mag) {
    const c = impulseCurve(hitFx.age01, 0.12) * hitFx.mag;
    const pf = (hitFx.dirX || 0) * forward3[0] + (hitFx.dirZ || 0) * forward3[2];
    const pr = (hitFx.dirX || 0) * right3[0] + (hitFx.dirZ || 0) * right3[2];
    actTiltX += -pf * c * 12 * DEG;                        // 押し込まれた向きへ上体がのけぞる
    actRock += pr * c * 10 * DEG;                          // 横弾なら横へよろける
    actDip += Math.abs(c) * hitFx.mag * 0.16 * MECH_SCALE; // 膝が一瞬折れる
  }
  const dodgeFx = alive ? mech.dodgeFx : null;   // 回避juke: {age01, side(±1)}
  if (dodgeFx) {
    const c = lungeCurve(dodgeFx.age01);   // 速く飛び、ゆっくり戻る
    const side = dodgeFx.side || 1;
    actLat += side * c * (walker2 ? footReach * 0.35 : 1.4 * MECH_SCALE);   // 横っ飛びスウェイ
    actRock += side * c * 9 * DEG;                                          // 飛ぶ側へ倒し込む
    actDip += c * 0.18 * MECH_SCALE;                                        // 屈んでかわす
  }
  rockAngle += actRock;

  // ②(b) 踏み込みで胴が沈む上下動(接地の重み)+歩行中の屈み込み(膝を曲げIK到達域を確保)。歩容位相の2倍周期で沈む。
  if (alive && move && legged) {
    // 逆関節は常時 REV_BEND ぶん低く構える(R_eff と対で膝の後折れを常に出す)
    if (walker2) originY -= footReach * (GAIT_CROUCH * clamp01(move.mag) + (mesh.legsKind === 'reverse' ? REV_BEND : 0));
    const cyc2 = (walker2 ? gaitAng : wp * 1.4) * 2;
    originY += (Math.cos(cyc2) * 0.5 - 0.5) * 0.18 * move.mag;
  }

  let fallTilt = 0;
  if (!alive) {
    const fc = fallCurve(deadAge);
    const fallSign = hash(idxHash * 13.7 + h * 4.1 + 0.31) < 0.5 ? -1 : 1;
    rockAngle += fc.roll * 88 * DEG * fallSign;
    fallTilt = fc.roll * 8 * DEG;
    originY += fc.roll * 1.6 * MECH_SCALE + fc.bounce * 0.5 * MECH_SCALE;
  }
  const tiltX = fallTilt + leanX + actTiltX;
  const origin = [mech.x || 0, originY, mech.y || 0];
  if (actFwd || actLat || actDip) {   // 全身アクションの並進(踏み込み/横っ飛び/沈み込み)
    origin[0] += forward3[0] * actFwd + right3[0] * actLat;
    origin[2] += forward3[2] * actFwd + right3[2] * actLat;
    origin[1] -= actDip;
  }

  // ②(e) 重心の横シフト(重量感): 接地脚の真上へ体を寄せる=歩ごとに左右へ重心を移す。歩容位相に同期し
  //   移動量に比例。IK(接地脚のワールド固定)より前に origin を寄せるので、体が揺れても足は planted のまま
  //   (体が接地脚の上を乗り越える=荷重移動が見える)。二脚/四脚のみ。振幅は股幅の 1/4 程度。
  if (alive && move && walker2) {
    const sway = Math.sin(gaitAng - Math.PI / 2) * footReach * 0.05 * clamp01(move.mag);
    origin[0] += right3[0] * sway; origin[2] += right3[2] * sway;
  }

  const pctx = { alive, wp, attack, tSec, deadAge, move };
  const motions = mesh.parts.map((part) => partMotion(part, pctx));

  // ⑤ ワールド固定の接地歩容(world-anchored planted-foot + 2ボーンIK)。接地脚は「着地した瞬間の
  //   ワールド座標」に足先を固定=機体が並進・旋回・ストレイフしても足は対地で静止(滑り/ムーンウォーク解消)。
  if (alive && move && walker2) {
    const nIdx = new Map();
    mesh.parts.forEach((p, i) => nIdx.set(p.name, i));
    const strideMag = clamp01(move.mag);
    const duty = GAIT_DUTY + GAIT_SLOW_DUTY * (1 - strideMag) * (1 - strideMag);   // 低速ほど接地が長い(重い足取り・2乗)
    const legCount = mesh.legsKind === 'quad' ? 4 : 2;
    const legState = mesh._gait.legs || (mesh._gait.legs = []);
    const ahead = GAIT_PLANT_AHEAD * footReach;   // 接地点を股の前方へ置く距離
    for (let i = 0; i < legCount; i++) {
      const hipIdx = nIdx.get('legU' + i), kneeIdx = nIdx.get('legL' + i);
      if (hipIdx == null || kneeIdx == null) continue;
      const hip = mesh.parts[hipIdx], knee = mesh.parts[kneeIdx];
      const reach = hip.pivot[1];                              // 股高
      const L1 = Math.max(0.05, hip.pivot[1] - knee.pivot[1]); // 腿長
      const L2 = Math.max(0.05, knee.pivot[1]);                // 脛長(膝→接地)
      const crouchFrac = GAIT_CROUCH * strideMag + (mesh.legsKind === 'reverse' ? REV_BEND : 0);   // 逆関節は常時屈み
      const R_eff = Math.max(0.15, reach * (1 - crouchFrac) - actDip);   // 屈み込み+アクション沈み込み後の実効脚長(接地維持)
      const hipWX = origin[0] + right3[0] * hip.pivot[0] + forward3[0] * hip.pivot[2];
      const hipWZ = origin[2] + right3[2] * hip.pivot[0] + forward3[2] * hip.pivot[2];
      let phi = (gaitCycles + (hip.swingPhase || 0) / (2 * Math.PI)) % 1;
      if (phi < 0) phi += 1;
      const stance = phi < duty;
      const ls = legState[i] || (legState[i] = { px: null, pz: null, sx: null, sz: null, stance: false });
      let tgtX, tgtZ, lift;
      if (stance) {
        if (!ls.stance || ls.px == null) {   // 着地(swing→stance): この瞬間のワールド接地点を固定
          ls.px = hipWX + travelX * ahead; ls.pz = hipWZ + travelZ * ahead;
        }
        tgtX = ls.px; tgtZ = ls.pz; lift = 0;
      } else {
        if (ls.stance) { ls.sx = ls.px != null ? ls.px : hipWX; ls.sz = ls.pz != null ? ls.pz : hipWZ; } // 離地: 遊脚開始点=直前の接地点
        const sw = (phi - duty) / (1 - duty);
        const nx = hipWX + travelX * ahead, nz = hipWZ + travelZ * ahead;  // 次の接地予測(股の前方へ)
        const s0x = ls.sx != null ? ls.sx : hipWX, s0z = ls.sz != null ? ls.sz : hipWZ;
        tgtX = s0x + (nx - s0x) * sw; tgtZ = s0z + (nz - s0z) * sw;
        lift = Math.sin(Math.PI * sw);
        ls.px = null;   // 次の着地で取り直す
      }
      ls.stance = stance;
      // ワールド接地目標を股ローカルへ分解: 前後(forward)=tz, 横(right)=tx。従来は tz(矢状面)だけを解き
      // 横成分を捨てていたため、横移動/旋回で足が股直下に寄り「滑る・重心が乗らない」原因になっていた。
      // ここでは水平到達 horiz=hypot(tx,tz) と方位 az=atan2(tx,tz) に分け、股に方位回転(Y軸)を足して
      // 足を横方向へも届かせる=あらゆる進行方向で planted-foot を守る(接地スリップ解消)。
      const relX = tgtX - hipWX, relZ = tgtZ - hipWZ;
      const localZ = relX * forward3[0] + relZ * forward3[2];
      const localX = relX * right3[0] + relZ * right3[2];
      // 接地脚は既にワールド固定の anchor。到達に速度(strideMag)を掛けると足が股側へ引かれ「滑る」ので
      // 接地脚は anchor へ**フル到達**する(=対地静止)。歩幅そのものは着地点 ahead で決まる。
      // 分解: 前後(tz)は矢状面のピッチ(X軸)で扱い膝は前向きのまま。横(tx)だけを外転(Z軸ロール)で足す
      //   =膝の前後反転を起こさず、横移動/旋回でも足が横へ届いて planted-foot を守る。
      let tz = -localZ;                                        // 前後(回転規約に合わせ反転)。ピッチで解く
      const latT = localX;                                     // 横。外転(Z軸ロール)は前後(X)と回転規約が逆なので非反転
      const ty = -R_eff + lift * (GAIT_LIFT * reach * strideMag);
      const ab = Math.atan2(latT, Math.max(0.05, R_eff));      // 外転角(Z軸ロール): 横到達
      let vdown = -Math.hypot(latT, ty);                       // 外転後の矢状面での下方到達(横に倒したぶん短くなる)
      let D = Math.hypot(tz, vdown);
      const Dmax = L1 + L2 - 1e-3, Dmin = Math.abs(L1 - L2) + 1e-3;
      if (D > Dmax) { const k = Dmax / D; tz *= k; vdown *= k; D = Dmax; }
      else if (D < Dmin && D > 1e-6) { const k = Dmin / D; tz *= k; vdown *= k; D = Dmin; }
      // 膝向き: 二脚=前折れ。四脚=前脚(i0,1)は前折れ・後脚(i2,3)は後折れのミラー(獣脚/多脚メカの
      // X字シルエット。4本同方向だと横から「全脚が同じ向きに崩れた」ように読める)。IK到達点は elbow に
      // よらず同一なので、接地(plantError/スリップ)には影響しない=見え方だけの選択。
      const elbow = mesh.legsKind === 'biped' ? -1 : (mesh.legsKind === 'quad' ? (i < 2 ? -1 : 1) : 1);
      const baseAng = Math.atan2(tz, -vdown);                  // 矢状面(前後×下方)で2ボーンIK
      const cosH = clampN((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1);
      const cosK = clampN((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1);
      // 股: X軸(pitch)で矢状面到達 → その上にZ軸(abduction)で横へ倒す(内=X, 外=Z の合成)。膝は前向き維持。
      motions[hipIdx].angle = baseAng + elbow * Math.acos(cosH);      // 腿角(pitch)
      motions[hipIdx].axis = AXIS_X;
      motions[hipIdx].angle2 = ab;                                   // 外転(横到達)
      motions[hipIdx].axis2 = AXIS_Z;
      motions[kneeIdx].angle = elbow * -(Math.PI - Math.acos(cosK));  // 膝の曲げ
      motions[kneeIdx].axis = AXIS_X;
      motions[kneeIdx].angle2 = 0; motions[kneeIdx].axis2 = null;
    }
  }

  // ②(c) 簡易IK: 接地脚の足裏を水平寄りに保つ(足の祖先のX軸回転を打ち消す)。生存時のみ。
  if (alive) {
    mesh.parts.forEach((part, pi) => {
      if (!part.name || part.name.indexOf('foot') !== 0) return;
      let sum = 0, idx = part.parentIdx, guard = 0;
      while (idx >= 0 && guard++ < 8) {
        const mo = motions[idx];
        if (mo && mo.axis === AXIS_X) sum += mo.angle;   // 脚はX軸回転
        idx = mesh.parts[idx].parentIdx;
      }
      motions[pi].angle = -sum;   // 対地角≈0(足裏水平)
      motions[pi].axis = AXIS_X;
      motions[pi].angle2 = 0; motions[pi].axis2 = null;
    });
  }

  const flash01 = alive ? (mech.flash01 || 0) : 0;   // Ver6: 被弾直後の白熱(0..1)
  return {
    mesh, alive, deadAge, h, wp, attack, move, legged, walker2,
    forward3, right3, idxHash, flash01, origin, tiltX, rockAngle, gaitAng, footReach, motions,
  };
}

// 歩容の物理妥当性を「本体と同じ関数」で検証するためのワールド座標を返す(検証ハーネス専用・純関数)。
// computeMechPose(唯一の歩容真実)を1回呼び、各パーツの重心/質量(AABB体積を代理質量)と、脚ごとの
// 接地点(足パーツの最下ワールド頂点)+ stance フラグを算出する。ハーネスはこれで重心‐支持多角形マージン・
// 接地スリップ・重心シフトを測る(LESSONS「bot は本体と同じ関数・同じ量で」)。描画には一切使わない。
export function poseWorld(mech, tSec) {
  const P = computeMechPose(mech, tSec);
  if (!P) return null;
  const { mesh, motions, origin, tiltX, rockAngle, right3, forward3, alive } = P;
  const toWorld = (p) => {
    let pp = p;
    if (tiltX) pp = rotateAroundAxis(pp, AXIS_X, tiltX);
    if (rockAngle) pp = rotateAroundAxis(pp, AXIS_Z, rockAngle);
    return add(origin, add(scaleV(right3, pp[0]), add([0, pp[1], 0], scaleV(forward3, pp[2]))));
  };
  const parts = [];
  let cx = 0, cy = 0, cz = 0, cm = 0;
  const feet = {};   // legIndex -> { contact:[x,y,z], stance:bool }
  mesh.parts.forEach((part, pi) => {
    if (motions[pi] && motions[pi].hide) return;
    // パーツ重心(rest) と AABB 体積(代理質量)
    let sx = 0, sy = 0, sz = 0;
    let miX = Infinity, miY = Infinity, miZ = Infinity, maX = -Infinity, maY = -Infinity, maZ = -Infinity;
    const n = part.verts.length || 1;
    for (const v of part.verts) {
      sx += v[0]; sy += v[1]; sz += v[2];
      if (v[0] < miX) miX = v[0]; if (v[0] > maX) maX = v[0];
      if (v[1] < miY) miY = v[1]; if (v[1] > maY) maY = v[1];
      if (v[2] < miZ) miZ = v[2]; if (v[2] > maZ) maZ = v[2];
    }
    const vol = Math.max(1e-4, (maX - miX) * (maY - miY) * (maZ - miZ));
    const mass = part.emissive ? vol * 0.15 : vol;   // 発光ディテールは軽く扱う
    const restC = [sx / n + part.pivot[0], sy / n + part.pivot[1], sz / n + part.pivot[2]];
    const wc = toWorld(transformThroughChain(mesh.parts, motions, pi, restC));
    parts.push({ name: part.name, world: wc, mass });
    cx += wc[0] * mass; cy += wc[1] * mass; cz += wc[2] * mass; cm += mass;
    // 接地点: 足パーツ(biped=foot / quad・reverse=legL(脛=IK連鎖の終端が接地))の最下ワールド頂点
    const nm = part.name || '';
    let legIdx = -1;
    if (nm.indexOf('foot') === 0) legIdx = parseInt(nm.slice(4), 10);
    else if (nm.indexOf('legL') === 0 && (mesh.legsKind === 'quad' || mesh.legsKind === 'reverse')) legIdx = parseInt(nm.slice(4), 10);
    if (legIdx >= 0 && !isNaN(legIdx)) {
      let lo = null;
      for (const v of part.verts) {
        const w = toWorld(transformThroughChain(mesh.parts, motions, pi, [v[0] + part.pivot[0], v[1] + part.pivot[1], v[2] + part.pivot[2]]));
        if (!lo || w[1] < lo[1]) lo = w;
      }
      const ls = (mesh._gait && mesh._gait.legs && mesh._gait.legs[legIdx]) ? mesh._gait.legs[legIdx] : null;
      const st = ls ? !!ls.stance : false;
      // contact=最下頂点(支持多角形用)、centroid=足パーツ重心(スリップ計測用。頂点飛び移りを避ける)、
      // anchor=IKが意図した接地点(ls.px/pz。stance中は固定)。描画された足がここからズレる=横成分の取りこぼし等。
      // toe=接地パーツ底面中心(単一のローカル点なので頂点飛び移り無し)。四脚は足パーツが無く脛(legL)の
      //   centroid が中空(脛中央)で計測バイアスになるため、IK連鎖の終端=脛の底面中心を接地計測に使う。
      const toeL = [sx / n + part.pivot[0], miY + part.pivot[1], sz / n + part.pivot[2]];
      const toe = toWorld(transformThroughChain(mesh.parts, motions, pi, toeL));
      feet[legIdx] = { contact: lo, centroid: wc, toe, stance: st,
        anchor: (st && ls && ls.px != null) ? [ls.px, ls.pz] : null };
    }
  });
  const com = cm > 0 ? [cx / cm, cy / cm, cz / cm] : origin.slice();
  return { com, mass: cm, feet, parts, legsKind: mesh.legsKind, alive };
}

// ==================== 演出フェイス生成(両レンダラ共有・純関数群) ====================
// 旧ソフトレンダラ(撤去済)のクロージャから module スコープへ純移動したもの。Three 版(r3d-three.js)が
// 同じ関数から面リスト({verts,color,alpha,emissive,noCull,isLine})を受け取り描画する=演出の唯一の真実。
function billboardRibbon(A, B, camForward, halfW) {
  const dir = normalize(sub(B, A));
  let side = cross(dir, camForward);
  if (length(side) < 1e-5) side = [1, 0, 0]; else side = normalize(side);
  const off = scaleV(side, halfW);
  return [add(A, off), sub(A, off), sub(B, off), add(B, off)];
}

function billboardRibbonSimple(A, B, halfW) {
  const dir = normalize(sub(B, A));
  let side = cross(dir, WORLD_UP);
  if (length(side) < 1e-5) side = [1, 0, 0]; else side = normalize(side);
  const off = scaleV(side, halfW);
  return [add(A, off), sub(A, off), sub(B, off), add(B, off)];
}

function thinQuadFromCenter(center, dirVec, size) {
  const halfW = size * 0.12;
  const A = sub(center, scaleV(dirVec, size));
  const B = add(center, scaleV(dirVec, size));
  let s = cross(dirVec, [0, 0, 1]);
  s = length(s) < 1e-5 ? [1, 0, 0] : normalize(s);
  const off = scaleV(s, halfW);
  return [add(A, off), sub(A, off), sub(B, off), add(B, off)];
}

function pushMuzzleFlash(kind, center, size, alpha, out, right3, forward3) {
  if (kind === 'shotgun') {
    const spread = 5;
    for (let i = 0; i < spread; i++) {
      const t = (i / (spread - 1)) - 0.5;
      const dir = normalize(add(scaleV(forward3, 1), scaleV(right3, t * 0.9)));
      const tip = add(center, scaleV(dir, size * 1.4));
      out.push({ verts: [center, add(center, scaleV(right3, 0.02)), tip], color: '#ffe9b0', alpha: alpha * 0.7, emissive: true, noCull: true });
    }
  } else {
    out.push({ verts: thinQuadFromCenter(center, right3, size), color: '#fff7d8', alpha, emissive: true, noCull: true });
    out.push({ verts: thinQuadFromCenter(center, [0, 1, 0], size), color: '#fff7d8', alpha, emissive: true, noCull: true });
  }
}

// 姿勢適用+ワールド座標化(階層変換を経由)。out に face エントリを積む。
// opts.effectsOnly=true で機体本体の面を出さず、付随演出(砂煙/くすぶり煙/マズルフラッシュ/刃の軌跡/
// ポッド噴煙)だけを積む(Three 版は本体を Object3D 木で描くため演出のみ受け取る=演出の唯一の真実を共有)。
export function poseMechFaces(mech, tSec, out, opts) {
  const P = computeMechPose(mech, tSec);   // 歩容/IK/姿勢は純関数へ抽出(Three.js版と共有)
  if (!P) return;
  const { mesh, alive, wp, attack, move, legged, walker2,
    forward3, right3, idxHash, flash01, origin, tiltX, rockAngle, gaitAng, motions } = P;

  // ②(d) 足元の砂煙: 接地する足の後方へ淡い塵を上げる(重量物が地面を蹴る感)。歩調に同期し左右交互。
  if (alive && move && legged && move.mag > 0.28) {
    const lat = (mesh.legsKind === 'quad' ? 0.55 : 0.42) * MECH_SCALE;
    for (const s of [1, -1]) {
      const strike = Math.max(0, -Math.cos((walker2 ? gaitAng : wp * 1.4) + (s > 0 ? 0 : Math.PI)));  // 脚が後方=接地でピーク
      if (strike < 0.35) continue;
      const base = add([mech.x || 0, 0, mech.y || 0], add(scaleV(right3, lat * s), scaleV(forward3, -0.3 * MECH_SCALE)));
      const r = (0.25 + (1 - strike) * 0.5) * MECH_SCALE;   // 接地直後は小さく→広がる
      const sh = octaShape(base[0], 0.12 + r * 0.3, base[2], r);
      const a = strike * 0.22 * move.mag;
      sh.faces.forEach((f) => out.push({ verts: f.map((vi) => sh.verts[vi]), color: '#8f8676', alpha: a, emissive: false, noCull: true }));
    }
  }

  const toWorld = (p) => {
    let pp = p;
    if (tiltX) pp = rotateAroundAxis(pp, AXIS_X, tiltX);
    if (rockAngle) pp = rotateAroundAxis(pp, AXIS_Z, rockAngle);
    return add(origin, add(scaleV(right3, pp[0]), add([0, pp[1], 0], scaleV(forward3, pp[2]))));
  };

  if (!(opts && opts.effectsOnly)) mesh.parts.forEach((part, pi) => {
    const mo = motions[pi];
    if (mo.hide) return;
    const color = !alive ? mixColor(part.color, '#0a0a0a', 0.65)
      : (flash01 > 0.01 ? mixColor(part.color, '#ffffff', Math.min(0.8, flash01)) : part.color);
    for (const face of part.faces) {
      const verts = face.map((vi) => {
        const restPoint = add(part.verts[vi], part.pivot);
        const p = transformThroughChain(mesh.parts, motions, pi, restPoint);
        return toWorld(p);
      });
      out.push({ verts, color, emissive: part.emissive, glowSeed: idxHash });
    }
  });

  // ② 撃破機のくすぶり煙: 横倒しした胴の「実際の位置」から立ち上げる(toWorldがロール/持上げ込みで
  //    胴中心を返すので、機体外にズレない)。tSecで位相をずらし絶やさない。
  if (!alive && mech.smolder) {
    const torsoIdx = mesh.parts.findIndex((p) => p.name === 'torso');
    if (torsoIdx >= 0) {
      const base = toWorld(transformThroughChain(mesh.parts, motions, torsoIdx, mesh.parts[torsoIdx].pivot));
      for (let k = 0; k < 3; k++) {
        const ph = (tSec * 0.4 + k / 3) % 1;
        const r = (0.5 + ph * 1.4) * MECH_SCALE;
        const dy = ph * 2.4 * MECH_SCALE;              // 立ち上る
        const sway = (hash(k * 4.3 + idxHash) - 0.5) * 0.8 * MECH_SCALE;
        const cx = base[0] + sway, cz = base[2] + (hash(k * 2.1 + idxHash) - 0.5) * 0.8 * MECH_SCALE;
        const a = Math.max(0, (1 - ph) * 0.5);
        if (a <= 0.02) continue;
        const sh = octaShape(cx, base[1] + dy, cz, Math.max(0.05, r));
        const v = Math.round(46 + ph * 26);
        sh.faces.forEach((f) => out.push({ verts: f.map((vi) => sh.verts[vi]), color: `rgb(${v},${v},${v + 2})`, alpha: a, emissive: false, noCull: true }));
      }
    }
  }

  // --- 攻撃モーションの追加演出(マズルフラッシュ/刃の軌跡/噴煙) ---
  if (alive && attack) {
    mesh.parts.forEach((part, pi) => {
      if (!part.role || !matchesAttack(part, attack)) return;
      const age = clamp01(attack.age01 == null ? 0 : attack.age01);
      if (part.role === 'muzzle' && (attack.kind === 'rifle' || attack.kind === 'shotgun' || attack.kind === 'railgun') && age < 0.22) {
        const wp0 = toWorld(transformThroughChain(mesh.parts, motions, pi, part.pivot));
        const size = (attack.kind === 'railgun' ? 0.9 : attack.kind === 'shotgun' ? 0.7 : 0.5) * MECH_SCALE;
        const a = 1 - age / 0.22;
        pushMuzzleFlash(attack.kind, wp0, size, a, out, right3, forward3);
      } else if (part.role === 'hilt' && attack.kind === 'blade') {
        // 刃の軌跡(扇形の半透明ポリ): 現在の刃先とその手前角度を結ぶ簡易な扇
        const bladeIdx = mesh.parts.findIndex((p2) => p2.parentName === part.name && p2.role === 'blade');
        if (bladeIdx >= 0) {
          const bp = mesh.parts[bladeIdx];
          let farVi = 0, farD = -1;
          bp.verts.forEach((v, i) => { const d = length(v); if (d > farD) { farD = d; farVi = i; } });
          const tipRest = add(bp.verts[farVi], bp.pivot);
          const tipWorld = toWorld(transformThroughChain(mesh.parts, motions, bladeIdx, tipRest));
          const hiltWorld = toWorld(transformThroughChain(mesh.parts, motions, pi, part.pivot));
          const sweepSign = (part.side || 1) >= 0 ? 1 : -1;
          const prevOffset = rotateAroundAxis(sub(tipWorld, hiltWorld), AXIS_Y, -0.4 * sweepSign);
          const p0 = add(hiltWorld, prevOffset);
          const alpha = Math.max(0, 0.55 * (1 - Math.abs(age - 0.5) * 1.6));
          if (alpha > 0) out.push({ verts: [hiltWorld, p0, tipWorld], color: '#bff7ff', alpha, emissive: true, noCull: true });
        }
      } else if (part.role === 'pod' && attack.kind === 'missile') {
        const base = toWorld(transformThroughChain(mesh.parts, motions, pi, part.pivot));
        for (let i = 0; i < 3; i++) {
          const puffAge = clamp01(age + i * 0.08);
          const hn = hash(i * 7.7 + Math.floor(puffAge * 20) * 1.3);
          const r = (0.15 + puffAge * 0.6) * MECH_SCALE;
          const dy = (puffAge * 0.8 + hn * 0.2) * MECH_SCALE;
          const spread = 0.4 * MECH_SCALE;
          const cx2 = base[0] + (hn - 0.5) * spread, cz2 = base[2] + (hash(hn * 3.1) - 0.5) * spread;
          const shape = octaShape(cx2, base[1] + dy, cz2, Math.max(0.05, r));
          const a = Math.max(0, (1 - puffAge) * 0.5);
          if (a > 0) shape.faces.forEach((f) => out.push({ verts: f.map((vi2) => shape.verts[vi2]), color: '#c9d4d8', alpha: a, emissive: false, noCull: true }));
        }
      }
    });
  }
}

// ---- SHOT_STYLES: 弾種(kind)ごとの描き分け。各関数は (age,A,B,cam,out,si) を受け、
// A=発射点/B=着弾点(shotY固定高さ)。si=scene.shots内のindex(決定論ハッシュのシード用)。
const SHOT_STYLES = {
  rifle(age, A, B, cam, out) {
    // 黄橙の短いトレーサー
    const p1 = lerpP(A, B, age);
    const p0 = lerpP(A, B, Math.max(0, age - 0.045));
    out.push({ verts: billboardRibbon(p0, p1, cam.forward, 0.09 * MECH_SCALE), color: '#ffcf6a', alpha: 0.92, emissive: true });
  },
  shotgun(age, A, B, cam, out, si) {
    // 橙の粒が円錐状に散開(複数点)
    let fwd = normalize(sub(B, A));
    if (length(fwd) < 1e-5) fwd = [0, 0, 1];
    let right3 = cross(fwd, WORLD_UP);
    right3 = length(right3) < 1e-5 ? [1, 0, 0] : normalize(right3);
    const up3 = normalize(cross(right3, fwd));
    const p1 = lerpP(A, B, age);
    const spread = (0.3 + age * 1.5) * MECH_SCALE;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const hn = hash(si * 7.13 + i * 3.71 + 0.4);
      const hn2 = hash(si * 11.7 + i * 5.13 + 1.9);
      const ang = hn * Math.PI * 2;
      const rad = (0.25 + hn2 * 0.85) * spread;
      const along = (hn2 - 0.5) * 0.18 * MECH_SCALE;
      const pos = add(add(p1, scaleV(right3, Math.cos(ang) * rad)), add(scaleV(up3, Math.sin(ang) * rad), scaleV(fwd, along)));
      const size = 0.06 * MECH_SCALE;
      out.push({ verts: thinQuadFromCenter(pos, right3, size), color: '#ff9a4a', alpha: Math.max(0, 0.85 * (1 - age * 0.6)), emissive: true, noCull: true });
    }
  },
  beam(age, A, B, cam, out) {
    // 翠白の連続光条: コア(細く明るい)+外周グロー(太く淡い)
    const a = 1 - age;
    if (a <= 0) return;
    out.push({ verts: billboardRibbon(A, B, cam.forward, 0.16 * MECH_SCALE), color: '#eafff5', alpha: a, emissive: true });
    out.push({ verts: billboardRibbon(A, B, cam.forward, 0.55 * MECH_SCALE), color: '#7dffcf', alpha: a * 0.32, emissive: true });
  },
  railgun(age, A, B, cam, out) {
    // 青白の細長いストリーク(高速で先行)+通過後の残光(全経路がうっすら光る)
    const travelT = Math.min(1, age * 1.6);
    const head = lerpP(A, B, travelT);
    const tail = lerpP(A, B, Math.max(0, travelT - 0.12));
    out.push({ verts: billboardRibbon(tail, head, cam.forward, 0.05 * MECH_SCALE), color: '#cfe8ff', alpha: 0.95, emissive: true });
    const glowA = Math.max(0, Math.min(1, (age - 0.12) * 1.4)) * Math.max(0, 1 - age);
    if (glowA > 0.02) out.push({ verts: billboardRibbon(A, B, cam.forward, 0.03 * MECH_SCALE), color: '#8fd0ff', alpha: glowA * 0.5, emissive: true });
  },
  missile(age, A, B, cam, out, si) {
    // ⑥ ロケット化: 金属の弾体+発光する噴射炎(ちらつき)+後方に膨張しながら漂う白煙トレイル。
    const pos = lerpP(A, B, age);
    let dir = normalize(sub(B, A));
    if (length(dir) < 1e-5) dir = [0, 0, 1];
    const bodyHalf = 0.22 * MECH_SCALE;
    const nose = add(pos, scaleV(dir, bodyHalf));
    const tail = add(pos, scaleV(dir, -bodyHalf));
    // 噴射炎(発光・フレーム毎にちらつく)
    const flick = 0.6 + hash(si * 5.1 + Math.floor(age * 40) * 1.7) * 0.7;
    const flameEnd = add(tail, scaleV(dir, -0.55 * MECH_SCALE * flick));
    out.push({ verts: billboardRibbon(tail, flameEnd, cam.forward, 0.15 * MECH_SCALE), color: '#ffcf4a', alpha: 0.85, emissive: true });
    out.push({ verts: billboardRibbon(tail, add(tail, scaleV(dir, -0.28 * MECH_SCALE * flick)), cam.forward, 0.09 * MECH_SCALE), color: '#fff7d6', alpha: 0.95, emissive: true });
    // 弾体(金属)+弾頭(明色)
    out.push({ verts: billboardRibbon(tail, nose, cam.forward, 0.1 * MECH_SCALE), color: '#b9c0c6', alpha: 1, emissive: false });
    out.push({ verts: billboardRibbon(add(pos, scaleV(dir, bodyHalf * 0.4)), nose, cam.forward, 0.1 * MECH_SCALE), color: '#e9edf0', alpha: 1, emissive: false });
    // 白煙トレイル(長め・膨張・漂い)
    for (let i = 1; i <= 6; i++) {
      const t = age - i * 0.05;
      if (t < 0) break;
      const tp = lerpP(A, B, t);
      const drift = (hash(si * 3.3 + i * 2.7) - 0.5) * 0.35 * MECH_SCALE;
      const r = (0.12 + i * 0.07) * MECH_SCALE;
      const a = 0.5 * (1 - i / 7);
      const sh = octaShape(tp[0] + drift, tp[1] + i * 0.05 * MECH_SCALE, tp[2] + drift, r);
      sh.faces.forEach((f) => out.push({ verts: f.map((vi) => sh.verts[vi]), color: '#c8ccd0', alpha: a, emissive: false, noCull: true }));
    }
  },
  rocketpunch(age, A, B, cam, out, si) {
    // 回転しながら飛ぶ小さな拳型ブロック
    const p1 = lerpP(A, B, age);
    const p0 = lerpP(A, B, Math.max(0, age - 0.06));
    out.push({ verts: billboardRibbon(p0, p1, cam.forward, 0.14 * MECH_SCALE), color: '#c7d0d4', alpha: 0.9, emissive: false });
    let dirv = normalize(sub(B, A));
    if (length(dirv) < 1e-5) dirv = [0, 0, 1];
    const spinAngle = age * 10 + si * 1.7;
    const boxHalf = 0.22 * MECH_SCALE;
    const box = boxShape(p1[0], p1[1], p1[2], boxHalf, boxHalf * 0.85, boxHalf * 1.35);
    const rotVerts = box.verts.map((v) => add(p1, rotateAroundAxis(sub(v, p1), dirv, spinAngle)));
    box.faces.forEach((f) => out.push({ verts: f.map((vi) => rotVerts[vi]), color: '#9aa4a8', alpha: 1, emissive: false }));
  },
  blade(age, A, B, cam, out) {
    // 既存の斬閃(短いトレーサー)を維持
    const p1 = lerpP(A, B, age);
    const p0 = lerpP(A, B, Math.max(0, age - 0.06));
    out.push({ verts: billboardRibbon(p0, p1, cam.forward, 0.12 * MECH_SCALE), color: '#dfffef', alpha: 0.9 * (1 - age * 0.3), emissive: true });
  },
  drill(age, A, B, cam, out) {
    // 既存の回転演出(トレーサー+芯のブロック)を維持
    const p1 = lerpP(A, B, age);
    const p0 = lerpP(A, B, Math.max(0, age - 0.06));
    out.push({ verts: billboardRibbon(p0, p1, cam.forward, 0.16 * MECH_SCALE), color: '#4a4a4a', alpha: 0.95, emissive: false });
    const shape = octaShape(p1[0], p1[1], p1[2], 0.22 * MECH_SCALE);
    shape.faces.forEach((f) => out.push({ verts: f.map((i) => shape.verts[i]), color: '#2e2e2e', alpha: 1, emissive: false }));
  },
};

export function shotWorldFaces(scene, cam, out) {
  (scene.shots || []).forEach((s, si) => {
    const age = clamp01(s.age01 == null ? 0 : s.age01);
    // ⑤ 発射=マズル高さ、着弾=被弾部位高さへ斜めに。地面すれすれの水平飛翔を解消。
    // v5: ey0/ey1 = 射手/標的の足場の標高。瓦礫の上から撃つと銃口も着弾点もその分だけ高い
    //     (マズルフラッシュは computeMechPose 経由で既に上がるので、弾道だけ地上高に残ると割れる)。
    const srcY = (s.y0 != null ? s.y0 : MUZZLE_Y) + (s.ey0 || 0);
    const dstY = (s.y1 != null ? s.y1 : hitPartY(s.kind, si, s.tx, s.ty)) + (s.ey1 || 0);
    const A = [s.x, srcY, s.y];
    const B = [s.tx, dstY, s.ty];
    const style = SHOT_STYLES[s.kind] || SHOT_STYLES.rifle;
    style(age, A, B, cam, out, si);
  });
}

export function blastWorldFaces(scene, out, tSec) {
  (scene.blasts || []).forEach((b, bi) => {
    // v5: b.ey = 炸裂点の足場の標高。炸裂の形は種類ごとに別関数へ散っていて y の起点も
    //     bi 箇所あるので、各所に足して回ると必ず取りこぼす。一旦受けてから頂点をまとめて上げる。
    //     (octaShape 等は面どうしで頂点配列を共有するので、その場書き換えではなく新しい配列を作る)
    const ey = b.ey || 0;
    if (!ey) { blastOne(b, bi, out, tSec); return; }
    const tmp = [];
    blastOne(b, bi, tmp, tSec);
    for (const f of tmp) {
      if (f.verts) f.verts = f.verts.map((v) => [v[0], v[1] + ey, v[2]]);
      out.push(f);
    }
  });
}
function blastOne(b, bi, out, tSec) {
  {
    const age = clamp01(b.age01 == null ? 0 : b.age01);
    const kind = b.kind || (b.big ? 'boom' : 'hit');
    if (kind === 'smoke') {
      // くすぶる残骸の煙: age01で上昇+拡散+フェード(釣鐘状=sin(age*PI))。決定論のちらつき火花付き。
      // 半径・上昇量・火花サイズはレビュー9巡目で×1.5(敗北の余韻を強く)。
      const cx = b.x, cz = b.y;
      const seed = bi * 13.7 + cx * 0.021 + cz * 0.019;
      const riseAmt = 3.9 * MECH_SCALE;
      const cy = (0.5 + riseAmt * age) * MECH_SCALE;
      const baseR = 0.45 * MECH_SCALE;
      const growR = 1.575 * MECH_SCALE;
      const r = baseR + growR * age;
      const bell = Math.max(0, Math.sin(Math.min(1, age) * Math.PI));
      const alpha = bell * 0.4;
      const driftX = (hash(seed) - 0.5) * 0.7 * MECH_SCALE * age;
      const driftZ = (hash(seed * 1.7) - 0.5) * 0.7 * MECH_SCALE * age;
      if (alpha > 0.003) {
        const shape = octaShape(cx + driftX, cy, cz + driftZ, Math.max(0.04 * MECH_SCALE, r));
        const shadeV = Math.round(58 + bell * 22);
        const smokeCol = `rgba(${shadeV},${shadeV},${shadeV + 2},1)`;
        shape.faces.forEach((f) => out.push({ verts: f.map((vi) => shape.verts[vi]), color: smokeCol, alpha, noCull: true }));
      }
      // 時々の火花のちらつき(高周波sin、決定論。age前半のみ・煙の根元付近で明滅)
      if (age < 0.55) {
        const flick = Math.sin((tSec || 0) * 23 + seed) * 0.5 + 0.5;
        const sparkA = Math.max(0, (flick - 0.7) / 0.3) * (1 - age / 0.55) * 0.85;
        if (sparkA > 0.01) {
          const sy = 0.35 * MECH_SCALE + riseAmt * age * MECH_SCALE * 0.15;
          const sshape = octaShape(cx + driftX * 0.4, sy, cz + driftZ * 0.4, 0.09 * MECH_SCALE);
          sshape.faces.forEach((f) => out.push({ verts: f.map((vi) => sshape.verts[vi]), color: '#ffa050', alpha: sparkA, emissive: true, noCull: true }));
        }
      }
      return;
    }
    if (kind === 'parry') {
      const cx = b.x, cz = b.y;
      const cy = 2.6 * MECH_SCALE;
      const ang0 = hash(cx * 0.13 + cz * 0.07) * Math.PI * 2;
      const arc = 0.9;
      const r = (1.2 + 3.2 * (1 - (1 - age) * (1 - age))) * MECH_SCALE;
      const alpha = Math.max(0, 1 - age * 1.4);
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        const a0 = ang0 - arc / 2 + (i / segs) * arc;
        const a1 = ang0 - arc / 2 + ((i + 1) / segs) * arc;
        const p0 = [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r];
        const p1 = [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r];
        out.push({ verts: [[cx, cy, cz], p0, p1], color: '#eaffff', alpha: alpha * 0.6, emissive: true, noCull: true });
      }
      return;
    }
    if (kind === 'hit') {
      const wpn = b.wpn;
      if (wpn === 'rifle' || wpn === 'shotgun') hitSpark(b, bi, age, out);
      else if (wpn === 'beam') hitBeam(b, age, out);
      else if (wpn === 'railgun') hitRailgun(b, bi, age, out);
      else if (wpn === 'missile') hitMissile(b, bi, age, out);
      else if (wpn === 'blade' || wpn === 'drill') hitSlashArc(b, age, out);
      else if (wpn === 'rocketpunch') hitRocketpunch(b, age, out);
      else hitGeneric(b, bi, age, out); // wpn不明時は従来の汎用hit
      return;
    }
    // kind === 'boom'(撃破・障害物破壊): 従来どおり不変
    const maxR = 7 * MECH_SCALE;
    const r = maxR * (1 - (1 - age) * (1 - age));
    const cx = b.x, cz = b.y;
    const cy = 1 * MECH_SCALE + r * 0.4;
    const shape = octaShape(cx, cy, cz, Math.max(0.05 * MECH_SCALE, r));
    const alpha = Math.max(0, 1 - age);
    shape.faces.forEach((f) => {
      out.push({ verts: f.map((i) => shape.verts[i]), color: '#ffd9a0', alpha: alpha * 0.85, emissive: true });
    });
    const segs = 10;
    const groundY = 0.05 * MECH_SCALE;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const gr = r * 1.3;
      out.push({
        verts: [[cx, groundY, cz], [cx + Math.cos(a0) * gr, groundY, cz + Math.sin(a0) * gr], [cx + Math.cos(a1) * gr, groundY, cz + Math.sin(a1) * gr]],
        color: '#ffb060', alpha: alpha * 0.3, emissive: true, noCull: true,
      });
    }
    const debN = 6;
    for (let i = 0; i < debN; i++) {
      const hn = hash(bi * 13.1 + i * 5.3 + age * 0.01);
      const ang = hn * Math.PI * 2;
      const el = 0.3 + hash(hn * 9.9) * 0.6;
      const len = (0.5 + hash(hn * 3.3) * 1.5) * age * MECH_SCALE;
      const dir = [Math.cos(ang), el, Math.sin(ang)];
      const start = [cx, cy, cz];
      const end = add(start, scaleV(dir, len * 3));
      out.push({ verts: billboardRibbonSimple(start, end, 0.05 * MECH_SCALE), color: '#ffe0b0', alpha: alpha * 0.7, emissive: true });
    }
  }
}

// ---- 着弾(kind==='hit')の武器別演出。b={x,y,wpn,age01} ----
function hitSpark(b, bi, age, out) {
  // 実弾系(rifle/shotgun)=小さな火花
  const cx = b.x, cz = b.y, cy = 1.0 * MECH_SCALE;
  const alpha = Math.max(0, 1 - age * 1.6);
  if (alpha <= 0) return;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const hn = hash(bi * 9.3 + i * 4.7 + 0.2);
    const ang = hn * Math.PI * 2;
    const el = 0.2 + hash(hn * 3.1) * 0.5;
    const len = (0.15 + hash(hn * 7.7) * 0.35) * (0.3 + age * 1.4) * MECH_SCALE;
    const dir = [Math.cos(ang), el, Math.sin(ang)];
    const end = add([cx, cy, cz], scaleV(dir, len));
    out.push({ verts: billboardRibbonSimple([cx, cy, cz], end, 0.025 * MECH_SCALE), color: '#fff2c0', alpha, emissive: true });
  }
}
function hitBeam(b, age, out) {
  // beam=白熱の閃光(短)
  const a = Math.max(0, 1 - age * 2.2);
  if (a <= 0) return;
  const cx = b.x, cz = b.y, cy = 1.2 * MECH_SCALE;
  const r = (0.35 + age * 0.3) * MECH_SCALE;
  const shape = octaShape(cx, cy, cz, r);
  shape.faces.forEach((f) => out.push({ verts: f.map((i) => shape.verts[i]), color: '#f2fff8', alpha: a * 0.95, emissive: true }));
}
function hitRailgun(b, bi, age, out) {
  // railgun=大きな貫通スパーク+金属片
  const cx = b.x, cz = b.y, cy = 1.1 * MECH_SCALE;
  const r = 1.6 * MECH_SCALE * (1 - (1 - age) * (1 - age));
  const alpha = Math.max(0, 1 - age);
  const shape = octaShape(cx, cy, cz, Math.max(0.05 * MECH_SCALE, r * 0.4));
  shape.faces.forEach((f) => out.push({ verts: f.map((i) => shape.verts[i]), color: '#dff2ff', alpha: alpha * 0.9, emissive: true }));
  const debN = 6;
  for (let i = 0; i < debN; i++) {
    const hn = hash(bi * 17.3 + i * 6.1 + 0.5);
    const ang = hn * Math.PI * 2;
    const el = 0.1 + hash(hn * 5.3) * 0.4;
    const len = (1.0 + hash(hn * 2.9) * 1.6) * age * MECH_SCALE;
    const dir = [Math.cos(ang), el, Math.sin(ang)];
    const end = add([cx, cy, cz], scaleV(dir, len));
    out.push({ verts: billboardRibbonSimple([cx, cy, cz], end, 0.045 * MECH_SCALE), color: '#b9d6e6', alpha: alpha * 0.85, emissive: true });
  }
}
function hitMissile(b, bi, age, out) {
  // missile=火球+煙の輪(b.scale=掠り時の縮小。既定1)
  const sc = b.scale || 1;
  const cx = b.x, cz = b.y;
  const maxR = 3.4 * MECH_SCALE * sc;
  const r = maxR * (1 - (1 - age) * (1 - age));
  const cy = 1 * MECH_SCALE + r * 0.35;
  const shape = octaShape(cx, cy, cz, Math.max(0.05 * MECH_SCALE, r));
  const alpha = Math.max(0, 1 - age);
  shape.faces.forEach((f) => out.push({ verts: f.map((i) => shape.verts[i]), color: '#ffc27a', alpha: alpha * 0.85, emissive: true }));
  const ringR = (0.6 + age * 2.2) * MECH_SCALE;
  const ringY = cy + (0.4 + age * 0.6) * MECH_SCALE;
  const ringA = Math.max(0, 1 - age) * 0.4;
  if (ringA > 0.01) {
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * ringR, ringY, cz + Math.sin(a0) * ringR];
      const p1 = [cx + Math.cos(a1) * ringR, ringY, cz + Math.sin(a1) * ringR];
      out.push({ isLine: true, verts: [p0, p1], color: `rgba(210,210,214,${ringA.toFixed(3)})` });
    }
  }
  const segs2 = 10, groundY = 0.05 * MECH_SCALE, gr = r * 1.3;
  for (let i = 0; i < segs2; i++) {
    const a0 = (i / segs2) * Math.PI * 2, a1 = ((i + 1) / segs2) * Math.PI * 2;
    out.push({
      verts: [[cx, groundY, cz], [cx + Math.cos(a0) * gr, groundY, cz + Math.sin(a0) * gr], [cx + Math.cos(a1) * gr, groundY, cz + Math.sin(a1) * gr]],
      color: '#ffb060', alpha: alpha * 0.3, emissive: true, noCull: true,
    });
  }
}
function hitSlashArc(b, age, out) {
  // blade・drill=斬撃アーク(弧状の光。既存parryと同系の弧描画を流用)
  const cx = b.x, cz = b.y, cy = 2.4 * MECH_SCALE;
  const ang0 = hash(cx * 0.13 + cz * 0.07 + 5.5) * Math.PI * 2;
  const arc = 1.1;
  const r = (1.0 + 3.0 * (1 - (1 - age) * (1 - age))) * MECH_SCALE;
  const alpha = Math.max(0, 1 - age * 1.5);
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const a0 = ang0 - arc / 2 + (i / segs) * arc;
    const a1 = ang0 - arc / 2 + ((i + 1) / segs) * arc;
    const p0 = [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r];
    const p1 = [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r];
    out.push({ verts: [[cx, cy, cz], p0, p1], color: '#eafcff', alpha: alpha * 0.55, emissive: true, noCull: true });
  }
}
function hitRocketpunch(b, age, out) {
  // rocketpunch=衝撃リング
  const cx = b.x, cz = b.y, cy = 1.3 * MECH_SCALE;
  const r = (0.3 + age * 3.0) * MECH_SCALE;
  const alpha = Math.max(0, 1 - age * 1.3);
  if (alpha <= 0) return;
  const segs = 14;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r];
    const p1 = [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r];
    out.push({ isLine: true, verts: [p0, p1], color: `rgba(230,236,238,${(alpha * 0.8).toFixed(3)})` });
  }
  const shape = octaShape(cx, cy, cz, Math.max(0.05 * MECH_SCALE, 0.5 * MECH_SCALE * (1 - age)));
  shape.faces.forEach((f) => out.push({ verts: f.map((i) => shape.verts[i]), color: '#eef0f2', alpha: Math.max(0, 1 - age * 2) * 0.8, emissive: true }));
}
function hitGeneric(b, bi, age, out) {
  // wpn不明時: 従来の汎用hit(旧・boom/hit共通コードのhit版=maxR3.2・debN3)をそのまま踏襲
  const maxR = 3.2 * MECH_SCALE;
  const r = maxR * (1 - (1 - age) * (1 - age));
  const cx = b.x, cz = b.y;
  const cy = 1 * MECH_SCALE + r * 0.4;
  const shape = octaShape(cx, cy, cz, Math.max(0.05 * MECH_SCALE, r));
  const alpha = Math.max(0, 1 - age);
  shape.faces.forEach((f) => out.push({ verts: f.map((i) => shape.verts[i]), color: '#ffd9a0', alpha: alpha * 0.85, emissive: true }));
  const segs = 10, groundY = 0.05 * MECH_SCALE, gr = r * 1.3;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    out.push({
      verts: [[cx, groundY, cz], [cx + Math.cos(a0) * gr, groundY, cz + Math.sin(a0) * gr], [cx + Math.cos(a1) * gr, groundY, cz + Math.sin(a1) * gr]],
      color: '#ffb060', alpha: alpha * 0.3, emissive: true, noCull: true,
    });
  }
  const debN = 3;
  for (let i = 0; i < debN; i++) {
    const hn = hash(bi * 13.1 + i * 5.3 + age * 0.01);
    const ang = hn * Math.PI * 2;
    const el = 0.3 + hash(hn * 9.9) * 0.6;
    const len = (0.5 + hash(hn * 3.3) * 1.5) * age * MECH_SCALE;
    const dir = [Math.cos(ang), el, Math.sin(ang)];
    const end = add([cx, cy, cz], scaleV(dir, len * 3));
    out.push({ verts: billboardRibbonSimple([cx, cy, cz], end, 0.05 * MECH_SCALE), color: '#ffe0b0', alpha: alpha * 0.7, emissive: true });
  }
}

// 障害物(scene.obstacles): wall=岩柱(alive/hpFracで劣化・瓦礫化)/ mud=暗色円盤 / spike=錐クラスタ
// St4: scene.field(戦場id)で「同じ当たり判定・違う見た目」に分岐する。市街戦(shigai)は
//   wall=ビル / spike=崩落瓦礫と鉄筋 / mud=冠水した街路。シム側の意味(遮蔽/減速/DoT)は不変。
// 面には tex('rock'|'building'|'asphalt')を付け、レンダラ側が質感テクスチャを選ぶ(未指定=rock)。
export function obstacleWorldFaces(scene, out) {
  const urban = !!(scene && scene.field === 'shigai');
  (scene.obstacles || []).forEach((o) => {
    if (urban) { urbanObstacleFaces(o, out); return; }
    if (o.kind === 'wall') {
      const alive = o.alive !== false;
      const hpFrac = o.hpFrac == null ? 1 : o.hpFrac;
      const seed = o.x * 0.31 + o.y * 0.17;
      const sides = 5 + Math.floor(hash(seed) * 4);
      const hgtFull = 12 + hash(seed * 1.7) * 8;
      const hgt = alive ? hgtFull : hgtFull * 0.16;
      const rTop = o.r * (alive ? 0.82 : 1.1);
      const cy = hgt / 2;
      const jitterAmp = alive ? 0 : o.r * 0.55;
      const jitterFn = jitterAmp ? (i) => (hash(seed + i * 3.3) - 0.5) * jitterAmp : null;
      const shape = prismShape([o.x, cy, o.y], AXIS_Y, hgt / 2, rTop, o.r, sides, { jitter: jitterFn });
      const baseColor = alive ? '#5c5850' : '#38352f';
      const col2 = mixColor(baseColor, '#151310', (1 - hpFrac) * 0.5);
      shape.faces.forEach((f) => out.push({ verts: f.map((vi) => shape.verts[vi]), color: col2, alpha: 1 }));
      if (alive && hpFrac < 0.999) {
        for (let c = 0; c < 2; c++) {
          const a = hash(seed * 5.1 + c * 9.3) * Math.PI * 2;
          const top = [o.x + Math.cos(a) * o.r * 0.7, hgt * (0.4 + c * 0.3), o.y + Math.sin(a) * o.r * 0.7];
          const bot = [o.x + Math.cos(a) * o.r * 0.9, 0.2, o.y + Math.sin(a) * o.r * 0.9];
          out.push({ isLine: true, verts: [top, bot], color: 'rgba(10,10,8,0.7)' });
        }
      }
    } else if (o.kind === 'mud') {
      // ④ 泥地(沼): 地面より明度・彩度を上げた濁った緑褐色の水面+油膜の同心リング+泡+光る外縁で
      //    「足を取る危険な水場」と一目で分かるように(暗い夜テーマでも沈まない)。
      if (o.alive === false) return;
      const sides = 12;
      const seed = o.x * 0.21 + o.y * 0.29;
      const verts = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const jitter = 0.78 + hash(seed + i * 4.1) * 0.36;
        verts.push([o.x + Math.cos(a) * o.r * jitter, 0.05, o.y + Math.sin(a) * o.r * jitter]);
      }
      // 巨大な1枚面は、機体が沼内に入りカメラが近づくと手前側頂点がカメラ背後へ回り近クリップで
      // 面全体が消える。中心からの三角形ファンに分割し、背後の三角だけがクリップされるようにする。
      const mudCenter = [o.x, 0.05, o.y];
      for (let i = 0; i < sides; i++) {
        out.push({ verts: [mudCenter, verts[i], verts[(i + 1) % sides]], color: '#2c3320', alpha: 0.92, noCull: true });
      }
      // 油膜の同心リング(2重)
      for (let ring = 1; ring <= 2; ring++) {
        const rr = o.r * (0.38 + ring * 0.28);
        const rv = [];
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2;
          rv.push([o.x + Math.cos(a) * rr, 0.07, o.y + Math.sin(a) * rr]);
        }
        const rc = ring === 1 ? 'rgba(130,160,85,0.42)' : 'rgba(95,125,72,0.28)';
        for (let i = 0; i < sides; i++) out.push({ isLine: true, verts: [rv[i], rv[(i + 1) % sides]], color: rc });
      }
      // 光る外縁
      for (let i = 0; i < sides; i++) {
        const p0 = verts[i], p1 = verts[(i + 1) % sides];
        out.push({ isLine: true, verts: [add(p0, [0, 0.02, 0]), add(p1, [0, 0.02, 0])], color: 'rgba(175,185,115,0.5)' });
      }
      // 泡(小さな明点)
      for (let i = 0; i < 3; i++) {
        const hn = hash(seed * 2.3 + i * 5.7);
        const ba = hn * Math.PI * 2, br = hash(hn + i) * o.r * 0.68;
        const sh = octaShape(o.x + Math.cos(ba) * br, 0.12, o.y + Math.sin(ba) * br, 0.16 + hash(hn * 3.1) * 0.12);
        sh.faces.forEach((f) => out.push({ verts: f.map((vi) => sh.verts[vi]), color: '#4a5535', alpha: 0.9 }));
      }
    } else if (o.kind === 'spike') {
      // ④ 茨(トゲ): 高く鋭い暗色の錐+光る危険色の先端+赤茶の警告リングで「踏むと痛い」を明示。
      if (o.alive === false) return;
      const seed = o.x * 0.37 + o.y * 0.13;
      const n = 6 + Math.floor(hash(seed) * 5);
      // 危険域の警告リング
      const rs = 14, rv = [];
      for (let i = 0; i < rs; i++) {
        const a = (i / rs) * Math.PI * 2;
        rv.push([o.x + Math.cos(a) * o.r, 0.06, o.y + Math.sin(a) * o.r]);
      }
      for (let i = 0; i < rs; i++) out.push({ isLine: true, verts: [rv[i], rv[(i + 1) % rs]], color: 'rgba(205,72,40,0.5)' });
      for (let i = 0; i < n; i++) {
        const hn = hash(seed + i * 11.3);
        const ang = hn * Math.PI * 2;
        const rad = hash(hn * 3.3 + i) * o.r * 0.82;
        const cx = o.x + Math.cos(ang) * rad, cz = o.y + Math.sin(ang) * rad;
        const hgt = 1.8 + hash(hn * 7.7) * 2.2;   // より高く鋭く
        const br = 0.24 + hash(hn) * 0.14;
        const shape = prismShape([cx, hgt / 2, cz], AXIS_Y, hgt / 2, 0, br, 6);
        shape.faces.forEach((f) => out.push({ verts: f.map((vi) => shape.verts[vi]), color: '#3a3d33', alpha: 1 }));
        // 光る鋭端(危険色)
        const tip = prismShape([cx, hgt - 0.16, cz], AXIS_Y, 0.16, 0, br * 0.5, 6);
        tip.faces.forEach((f) => out.push({ verts: f.map((vi) => tip.verts[vi]), color: '#ff5a2a', alpha: 1, emissive: true }));
      }
    } else if (o.kind === 'rubble') {
      rubbleFaces(o, out);
    }
  });
}

// v5: 踏破可能な小障害物(rubble)。「止まらないが乗る」ものなので、危険色ではなく
// **天端が平らな土盛り**として描く=形そのものが「ここに立てる」の記号。高さは o.h(m≒描画単位)。
// 市街でも同じ関数を使う(コンクリ塊か土塊かの差は tex とテーマ色で出る=urbanObstacleFaces から呼ぶ)。
function rubbleFaces(o, out, opt) {
  if (o.alive === false) return;
  const urban = !!(opt && opt.urban);
  const seed = o.x * 0.41 + o.y * 0.23;
  const h = o.h > 0 ? o.h : 0.6;
  const tex = urban ? 'concrete' : 'rock';
  const baseCol = urban ? '#6a665e' : '#5f5a51';
  // 土台: 天端 62% のテーパー(裾が広く天端が平ら=登れる形)。縁を乱して自然物にする。
  // chunky=割れた舗石(角張った5面+強い乱れ)。丸い8面の塚だと路上の「石ころ」に見えてしまい、
  // 「崩れた歩道」には読めない(実機確認 2026-08-01)。
  // 天端の割合は fields.js の CLIMB_TOP_FRAC と**必ず同じ**にする(シムはこの形で標高を出す)。
  // chunky でも割合は変えず、乱れの強さだけで角張らせる。
  const chunky = !!(opt && opt.chunky);
  const sides = chunky ? 5 : 8;
  const body = prismShape([o.x, h / 2, o.y], AXIS_Y, h / 2, o.r * CLIMB_TOP_FRAC, o.r,
    sides, { jitter: (i) => (hash(seed + i * 3.3) - 0.5) * o.r * (chunky ? 0.5 : 0.24) });
  body.faces.forEach((f) => out.push({ verts: f.map((vi) => body.verts[vi]), color: baseCol, alpha: 1, tex }));
  // 裾に散る岩塊/コンクリ塊(土台だけだと「置いた円柱」に見える)
  const n = 4 + Math.floor(hash(seed * 1.9) * 4);
  for (let i = 0; i < n; i++) {
    const hn = hash(seed + i * 7.7);
    const a = hn * Math.PI * 2, rad = o.r * (0.72 + hash(hn * 3.1) * 0.34);
    const cr = o.r * (0.1 + hash(hn * 5.3) * 0.12);
    const ch = cr * (0.7 + hash(hn * 2.7) * 0.9);
    const ck = prismShape([o.x + Math.cos(a) * rad, ch / 2, o.y + Math.sin(a) * rad], AXIS_Y, ch / 2,
      cr * 0.6, cr, 5, { jitter: (k) => (hash(hn * 11 + k) - 0.5) * cr * 0.5 });
    ck.faces.forEach((f) => out.push({ verts: f.map((vi) => ck.verts[vi]), color: mixColor(baseCol, '#2a2722', hash(hn * 13) * 0.4), alpha: 1, tex }));
  }
  // 天端の縁取り。機体の腰より高い足場(=露出ペナルティが効く高さ)にだけ付け、
  // 「ここに乗ると見晴らしと引き換えに晒される」を観戦者が形で読めるようにする。
  if (h >= 2) {
    const rt = o.r * CLIMB_TOP_FRAC, rv = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      rv.push([o.x + Math.cos(a) * rt, h + 0.06, o.y + Math.sin(a) * rt]);
    }
    for (let i = 0; i < sides; i++) out.push({ isLine: true, verts: [rv[i], rv[(i + 1) % sides]], color: 'rgba(196,206,214,0.42)' });
  }
}

// ==================== 市街戦(shigai)の障害物 ====================
// 当たり判定は共通(円 r)。見た目だけを都市の語彙に置き換える。
//   wall  … 鉄筋コンクリのビル(不壊 hp===null=高層タワー / 破壊可=中層。損傷で焦げと亀裂、
//            撃破で瓦礫の山+折れた壁の残骸)。矩形は判定円に内接させる(見た目が判定より外へ出ない)。
//   spike … 崩落した高架の瓦礫+突き出た鉄筋(踏めば痛い=茨と同じ意味の都市版)。
//   mud   … 冠水した街路(油膜の浮いた濁水)。
function urbanObstacleFaces(o, out) {
  const seed = o.x * 0.31 + o.y * 0.17;
  if (o.kind === 'wall') {
    const alive = o.alive !== false;
    const hpFrac = o.hpFrac == null ? 1 : o.hpFrac;
    const tower = o.hp0 === null || o.hp === null;      // 不壊=街のランドマーク(高層)
    const hw = o.r * 0.74, hd = o.r * 0.74 * (0.82 + hash(seed * 2.3) * 0.36);
    const bvar = Math.floor(hash(seed * 5.7) * 4);      // 窓の点灯パターン(4種)
    const wallCol = mixColor('#a8a49c', '#5a564e', hash(seed * 1.3) * 0.5);
    if (!alive) {
      // 全壊: 瓦礫の山(低く不定形)+折れた壁の残骸2枚
      const mound = prismShape([o.x, o.r * 0.16, o.y], AXIS_Y, o.r * 0.16, o.r * 0.5, o.r * 1.04, 7,
        { jitter: (i) => (hash(seed + i * 3.3) - 0.5) * o.r * 0.42 });
      mound.faces.forEach((f) => out.push({ verts: f.map((vi) => mound.verts[vi]), color: '#4a4640', alpha: 1, tex: 'rock' }));
      for (let s = 0; s < 2; s++) {
        const a = hash(seed * 7.1 + s * 4.7) * Math.PI * 2;
        const sh = o.r * (0.5 + hash(seed + s) * 0.5);
        const px = o.x + Math.cos(a) * o.r * 0.5, pz = o.y + Math.sin(a) * o.r * 0.5;
        const stub = trapBoxY(px, sh / 2, pz, sh / 2, o.r * 0.3, o.r * 0.12, o.r * 0.18, o.r * 0.08);
        stub.faces.forEach((f) => out.push({ verts: f.map((vi) => stub.verts[vi]), color: '#6e6a62', alpha: 1, tex: 'building', texVar: bvar }));
        // 露出した鉄筋
        for (let k = 0; k < 3; k++) {
          const rx = px + (hash(seed + s * 3 + k) - 0.5) * o.r * 0.4;
          const rz = pz + (hash(seed + s * 5 + k) - 0.5) * o.r * 0.4;
          out.push({ isLine: true, verts: [[rx, sh * 0.95, rz], [rx + (hash(k + s) - 0.5) * 2, sh * 1.25, rz + (hash(k * 2 + s) - 0.5) * 2]], color: 'rgba(140,88,52,0.9)' });
        }
      }
      return;
    }
    const hUnits = o.r * (tower ? 3.7 + hash(seed * 1.7) * 0.9 : 2.5 + hash(seed * 1.7) * 1.1);
    const dmg = (1 - hpFrac);
    const col = mixColor(wallCol, '#2a2622', dmg * 0.45);
    // 本体(下段)
    const h0 = tower ? hUnits * 0.62 : hUnits;
    const body = boxShape(o.x, h0 / 2, o.y, hw, h0 / 2, hd);
    body.faces.forEach((f) => out.push({ verts: f.map((vi) => body.verts[vi]), color: col, alpha: 1, tex: 'building', texVar: bvar }));
    // 高層はセットバックした上段(都市のシルエットに段差を作る)
    let topY = h0;
    if (tower) {
      const h1 = hUnits - h0;
      const up = boxShape(o.x, h0 + h1 / 2, o.y, hw * 0.68, h1 / 2, hd * 0.68);
      up.faces.forEach((f) => out.push({ verts: f.map((vi) => up.verts[vi]), color: col, alpha: 1, tex: 'building', texVar: (bvar + 1) & 3 }));
      // 下段の屋上パラペット
      const par = boxShape(o.x, h0 + 0.5, o.y, hw * 1.04, 0.5, hd * 1.04);
      par.faces.forEach((f) => out.push({ verts: f.map((vi) => par.verts[vi]), color: mixColor(col, '#000000', 0.2), alpha: 1, tex: 'concrete' }));
      topY = hUnits;
    }
    // 最上部のパラペット(縁取り=ビルらしさの決め手)
    const par2 = boxShape(o.x, topY + 0.6, o.y, hw * 1.06, 0.6, hd * 1.06);
    par2.faces.forEach((f) => out.push({ verts: f.map((vi) => par2.verts[vi]), color: mixColor(col, '#000000', 0.22), alpha: 1, tex: 'concrete' }));
    // 屋上設備(空調ユニット/貯水槽)
    for (let k = 0; k < 2; k++) {
      const ux = o.x + (hash(seed * 9.1 + k) - 0.5) * hw, uz = o.y + (hash(seed * 11.3 + k) - 0.5) * hd;
      const uh = o.r * (0.1 + hash(seed + k * 7) * 0.12);
      const eq = boxShape(ux, topY + 1.2 + uh, uz, o.r * 0.16, uh, o.r * 0.14);
      eq.faces.forEach((f) => out.push({ verts: f.map((vi) => eq.verts[vi]), color: '#7c7a74', alpha: 1, tex: 'concrete' }));
    }
    // 1階の店舗(暗いガラス面+庇)= 足元の情報量
    const shopH = Math.min(o.r * 0.34, 5.5);
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dz]) => {
      const gx = o.x + dx * (hw + 0.12), gz = o.y + dz * (hd + 0.12);
      const g = boxShape(gx, shopH / 2, gz, dx ? 0.12 : hw * 0.8, shopH / 2, dz ? 0.12 : hd * 0.8);
      g.faces.forEach((f) => out.push({ verts: f.map((vi) => g.verts[vi]), color: '#20262c', alpha: 1, tex: 'concrete' }));
      const aw = boxShape(gx + dx * 0.5, shopH + 0.3, gz + dz * 0.5, dx ? 0.6 : hw * 0.84, 0.22, dz ? 0.6 : hd * 0.84);
      aw.faces.forEach((f) => out.push({ verts: f.map((vi) => aw.verts[vi]), color: mixColor(col, '#000000', 0.3), alpha: 1, tex: 'concrete' }));
    });
    // 高層の航空障害灯(点滅は tSec 非依存の常灯=決定論)+マスト
    if (tower) {
      out.push({ isLine: true, verts: [[o.x, topY + 1.2, o.y], [o.x, topY + 1.2 + o.r * 0.5, o.y]], color: 'rgba(60,58,54,0.9)' });
      const bl = octaShape(o.x, topY + 1.2 + o.r * 0.5, o.y, 0.5);
      bl.faces.forEach((f) => out.push({ verts: f.map((vi) => bl.verts[vi]), color: '#ff4433', alpha: 1, emissive: true }));
    }
    // 損傷: 亀裂(暗線)と焦げ
    if (hpFrac < 0.999) {
      for (let c = 0; c < 4; c++) {
        const a = hash(seed * 5.1 + c * 9.3) * Math.PI * 2;
        const sx2 = Math.cos(a) >= 0 ? hw : -hw, sz2 = Math.sin(a) >= 0 ? hd : -hd;
        const useX = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
        const px = useX ? o.x + sx2 * 1.01 : o.x + (hash(a) - 0.5) * hw * 1.6;
        const pz = useX ? o.y + (hash(a * 3) - 0.5) * hd * 1.6 : o.y + sz2 * 1.01;
        out.push({ isLine: true, verts: [[px, h0 * (0.2 + c * 0.18), pz], [px + (hash(c) - 0.5) * 4, h0 * (0.4 + c * 0.18), pz + (hash(c * 2) - 0.5) * 4]], color: 'rgba(12,10,8,0.75)' });
      }
    }
  } else if (o.kind === 'mud') {
    // 冠水した街路: 濁った水面+油膜+水没した縁石
    if (o.alive === false) return;
    const sides = 14;
    const verts = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const j = 0.82 + hash(seed + i * 4.1) * 0.28;
      verts.push([o.x + Math.cos(a) * o.r * j, 0.18, o.y + Math.sin(a) * o.r * j]);
    }
    const cen = [o.x, 0.18, o.y];
    // 舗装(暗い灰黒)の上に暗い水を置くと、明度が近すぎて水面が見えない(実機確認 2026-07-31)。
    // 街の冠水は「空を映す明るい青灰」にして、舗装との差で水だと分かるようにする。
    for (let i = 0; i < sides; i++) {
      out.push({ verts: [cen, verts[i], verts[(i + 1) % sides]], color: '#2a3a42', alpha: 0.9, noCull: true });
    }
    for (let ring = 1; ring <= 3; ring++) {
      const rr = o.r * (0.3 + ring * 0.22), rv = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        rv.push([o.x + Math.cos(a) * rr, 0.21, o.y + Math.sin(a) * rr]);
      }
      const rc = ring === 1 ? 'rgba(178,142,214,0.5)' : ring === 2 ? 'rgba(132,178,208,0.42)' : 'rgba(108,134,158,0.34)';
      for (let i = 0; i < sides; i++) out.push({ isLine: true, verts: [rv[i], rv[(i + 1) % sides]], color: rc });
    }
    // 水際の白い縁(ここから水、が一目で分かる)
    for (let i = 0; i < sides; i++) {
      out.push({ isLine: true, verts: [add(verts[i], [0, 0.02, 0]), add(verts[(i + 1) % sides], [0, 0.02, 0])], color: 'rgba(200,224,236,0.72)' });
    }
  } else if (o.kind === 'spike') {
    // 崩落した高架の瓦礫: コンクリ塊+突き出た鉄筋(先端は錆色の発光=危険の記号)
    if (o.alive === false) return;
    const rs = 16, rv = [];
    for (let i = 0; i < rs; i++) {
      const a = (i / rs) * Math.PI * 2;
      rv.push([o.x + Math.cos(a) * o.r, 0.19, o.y + Math.sin(a) * o.r]);
    }
    for (let i = 0; i < rs; i++) out.push({ isLine: true, verts: [rv[i], rv[(i + 1) % rs]], color: 'rgba(210,120,50,0.5)' });
    // 塊の数は判定円の広さに見合う密度に(疎だと「ここは踏むと痛い帯」に見えない)
    const n = 11 + Math.floor(hash(seed) * 6);
    for (let i = 0; i < n; i++) {
      const hn = hash(seed + i * 11.3);
      const ang = hn * Math.PI * 2, rad = Math.sqrt(hash(hn * 3.3 + i)) * o.r * 0.86;
      const cx = o.x + Math.cos(ang) * rad, cz = o.y + Math.sin(ang) * rad;
      // コンクリ塊(傾いた板)
      const bh = 0.9 + hash(hn * 7.7) * 2.4, bw = 1.0 + hash(hn * 2.1) * 1.8;
      const slab = trapBoxY(cx, bh / 2, cz, bh / 2, bw, bw * 0.55, bw * 0.7, bw * 0.4);
      slab.faces.forEach((f) => out.push({ verts: f.map((vi) => slab.verts[vi]), color: '#6b675f', alpha: 1, tex: 'concrete' }));
      // 突き出た鉄筋(2〜3本)
      const rn = 2 + Math.floor(hash(hn * 4.3) * 2);
      for (let k = 0; k < rn; k++) {
        const jx = (hash(hn * 5 + k) - 0.5) * bw, jz = (hash(hn * 6 + k) - 0.5) * bw;
        const tipY = bh + 0.9 + hash(hn * 8 + k) * 1.6;
        out.push({ isLine: true, verts: [[cx + jx, bh * 0.7, cz + jz], [cx + jx * 1.5, tipY, cz + jz * 1.5]], color: 'rgba(158,96,54,0.95)' });
        const tip = octaShape(cx + jx * 1.5, tipY, cz + jz * 1.5, 0.16);
        tip.faces.forEach((f) => out.push({ verts: f.map((vi) => tip.verts[vi]), color: '#ff6a2a', alpha: 1, emissive: true }));
      }
    }
  } else if (o.kind === 'rubble') {
    // 同じ判定円を街の語彙で描き分ける(o.deco は render-only のヒント。シムは読まない)。
    if (o.alive === false) return;
    if (o.deco === 'car') { wreckFaces(o, out); return; }
    rubbleFaces(o, out, { urban: true, chunky: o.deco === 'curb' });
    if (o.deco === 'slab') {
      // 崩落塊には折れた鉄筋を数本。踏めば痛い spike とは違い「乗れる」ものなので、
      // 発光する鋭端は付けない(危険の記号を混ぜると意味が読めなくなる)。
      for (let k = 0; k < 4; k++) {
        const hn = hash(o.x * 0.53 + o.y * 0.29 + k * 6.1);
        const a = hn * Math.PI * 2, rad = o.r * 0.5 * hash(hn * 3.7);
        const bx = o.x + Math.cos(a) * rad, bz = o.y + Math.sin(a) * rad;
        out.push({ isLine: true, verts: [[bx, o.h * 0.6, bz], [bx + (hn - 0.5) * 3, o.h + 1.2 + hn * 1.4, bz + (hash(hn * 9) - 0.5) * 3]],
                   color: 'rgba(150,92,50,0.9)' });
      }
    }
  }
}

// 焼けた廃車(v5 で装飾からシムへ昇格。判定円 o.r の内側に収める=見た目が判定より外へ出ない)
function wreckFaces(o, out) {
  const seed = o.x * 0.61 + o.y * 0.37;
  const rot = hash(seed) * Math.PI * 2;
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const rotY = (v) => [o.x + (v[0] - o.x) * ca - (v[2] - o.y) * sa, v[1], o.y + (v[0] - o.x) * sa + (v[2] - o.y) * ca];
  const L = o.r * 0.86, W = o.r * 0.4;
  const body = boxShape(o.x, o.h * 0.42, o.y, L, o.h * 0.42, W);
  body.faces.forEach((f) => out.push({ verts: f.map((vi) => rotY(body.verts[vi])), color: '#3a352f', alpha: 1, tex: 'concrete' }));
  const cab = boxShape(o.x - L * 0.2, o.h * 0.78, o.y, L * 0.45, o.h * 0.36, W * 0.86);
  cab.faces.forEach((f) => out.push({ verts: f.map((vi) => rotY(cab.verts[vi])), color: '#221f1c', alpha: 1, tex: 'concrete' }));
  // 焼け跡(路面の黒い染み)。判定円いっぱいに広げて「ここが車の占める場所」を足元で示す。
  out.push({
    verts: [rotY([o.x - o.r, 0.09, o.y - o.r]), rotY([o.x + o.r, 0.09, o.y - o.r]),
            rotY([o.x + o.r, 0.09, o.y + o.r]), rotY([o.x - o.r, 0.09, o.y + o.r])],
    color: 'rgba(12,10,9,0.55)', alpha: 1, noCull: true, tex: 'asphalt',
  });
  // 転がったタイヤ/ドア(半数だけ。乱れの量に差を作る)
  if (hash(seed * 3.1) > 0.5) {
    const t = boxShape(o.x, o.h * 0.2, o.y + o.r * 0.72, L * 0.7, o.h * 0.2, W * 0.5);
    t.faces.forEach((f) => out.push({ verts: f.map((vi) => rotY(t.verts[vi])), color: '#332f2a', alpha: 1, tex: 'concrete' }));
  }
}

// ==================== 戦場の装飾(render-only・当たり判定ゼロ) ====================
// シムは一切知らない「街の家具」。市街戦の道路・区画線・横断歩道・折れた街灯/信号/電柱を
// 実座標(シムのメートル)で組み、ここで WORLD_SCALE の縮小をかける(高さは描画単位のまま)。
// 戦場id ごとに1回だけ生成してレンダラ側がキャッシュする(静的=毎フレーム再生成しない)。
// **v5 の不変条件: 機体可動域に置く装飾は高さ2未満(機体全高4.24の膝下)に留める。**
// それを超える実体が要るなら fields.js の障害物へ昇格させる。当たり判定ゼロのものが
// 機体より高く立っていると、必ず「すり抜け」として観戦者の目に映るため。
// 「可動域」= shapeClamp が機体を閉じ込める範囲(rect なら実座標 20..980)。場外の街並みと
// 外周20mの縁は機体が到達しないので対象外(実測 2026-08-01: 20..980 内の装飾頂点で y>2 は0件)。
// solidsOut を渡すと「硬くて脛が埋まる高さの瓦礫」の踏み面も同時に集める(→ decorLiftAt)。
// 面の生成と同じ場所で座標を出すので、装飾を動かしたときに踏み面だけ取り残されることがない。
export function fieldDecorFaces(fieldId, out, solidsOut) {
  if (fieldId !== 'shigai') return;
  const S = WORLD_SCALE;
  // 踏み面(シムm座標。h は描画単位): 円は x2/z2 を省略、細長いものは線分+半径のカプセルで置く。
  // 舗装・区画線・焼け跡(厚みゼロ)とケーブル(柔らかい)は登録しない=乗り上げるのは硬い物だけ。
  const solid = solidsOut
    ? (x, z, r, h, x2, z2) => solidsOut.push({ x, z, r, h, x2, z2 })
    : () => {};
  // (シムm, 描画単位の高さ, シムm) → ワールド座標
  const P = (x, y, z) => [ARENA_CX + (x - ARENA_CX) * S, y, ARENA_CZ + (z - ARENA_CZ) * S];
  const quad = (x0, z0, x1, z1, y, color, alpha, tex) => out.push({
    verts: [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)], color, alpha: alpha == null ? 1 : alpha, noCull: true, tex,
  });
  // 大きな地面パッチは必ず分割する: 1枚の巨大面はカメラが上に乗ると手前頂点が背後へ回り、
  // 近クリップで面ごと消える(泥沼の扇分割と同じ理由)。~24m 角のタイルに割る。
  const quadTiled = (x0, z0, x1, z1, y, color, tex) => {
    const step = 24;
    for (let x = x0; x < x1; x += step) {
      const xe = Math.min(x1, x + step);
      for (let z = z0; z < z1; z += step) quad(x, z, xe, Math.min(z1, z + step), y, color, 1, tex);
    }
  };
  // 箱(シムmの幅奥行き × 描画単位の高さ)
  const box = (x, z, hwM, hdM, y0, y1, color, tex) => {
    const c = P(x, 0, z), hw = hwM * S, hd = hdM * S;
    const sh = boxShape(c[0], (y0 + y1) / 2, c[2], hw, (y1 - y0) / 2, hd);
    sh.faces.forEach((f) => out.push({ verts: f.map((vi) => sh.verts[vi]), color, alpha: 1, tex }));
  };
  // 発光する小箱(灯体。世界座標のオフセットで置く)
  const glow = (x, z, y, hw, hh, hd, color, ox, oz) => {
    const c = P(x, 0, z);
    const sh = boxShape(c[0] + (ox || 0), y, c[2] + (oz || 0), hw, hh, hd);
    sh.faces.forEach((f) => out.push({ verts: f.map((vi) => sh.verts[vi]), color, alpha: 1, emissive: true }));
  };
  const line = (x0, y0, z0, x1, y1, z1, color) => out.push({ isLine: true, verts: [P(x0, y0, z0), P(x1, y1, z1)], color });

  const AV = 500, HALF = 62;             // 大通りの中心線と半幅(m)
  // --- 舗装(大通り2本。地面より僅かに上=Zファイト回避) ---
  quadTiled(AV - HALF, 40, AV + HALF, 960, 0.05, '#2b2e31', 'asphalt');
  quadTiled(40, AV - HALF, 960, AV + HALF, 0.07, '#2b2e31', 'asphalt');
  // --- 縁石(歩道の立ち上がり。長い箱は分割して近クリップ落ちを避ける)---
  // 色は暗いコンクリ。岩肌テクスチャは明色ベースなので、明るい頂点色だと白い擁壁のように
  // 前景を占領してしまう(実機確認 2026-07-31)。
  for (const s of [-1, 1]) {
    for (let z = 60; z < 940; z += 80) {
      box(AV + s * (HALF + 3), z + 40, 3, 40, 0.0, 1.1, '#6d6a64', 'concrete');
      solid(AV + s * (HALF + 3), z, 3, 1.1, AV + s * (HALF + 3), z + 80);   // 縁石に乗り上げる
    }
    for (let x = 60; x < 940; x += 80) {
      box(x + 40, AV + s * (HALF + 3), 40, 3, 0.0, 1.1, '#6d6a64', 'concrete');
      solid(x, AV + s * (HALF + 3), 3, 1.1, x + 80, AV + s * (HALF + 3));
    }
  }
  // --- 区画線(白の破線・交差点は空ける)---
  for (let z = 60; z < 940; z += 44) {
    if (Math.abs(z - AV) < HALF + 14) continue;
    quad(AV - 1.6, z, AV + 1.6, z + 22, 0.12, 'rgba(224,222,206,0.75)', 1, 'concrete');
  }
  for (let x = 60; x < 940; x += 44) {
    if (Math.abs(x - AV) < HALF + 14) continue;
    quad(x, AV - 1.6, x + 22, AV + 1.6, 0.13, 'rgba(224,222,206,0.7)', 1, 'concrete');
  }
  // --- 横断歩道(交差点の四辺)---
  for (const s of [-1, 1]) {
    for (let i = -5; i <= 5; i++) {
      const off = i * 10;
      quad(AV + off - 3.2, AV + s * (HALF + 8), AV + off + 3.2, AV + s * (HALF + 26), 0.14, 'rgba(226,224,210,0.62)', 1, 'concrete');
      quad(AV + s * (HALF + 8), AV + off - 3.2, AV + s * (HALF + 26), AV + off + 3.2, 0.15, 'rgba(226,224,210,0.6)', 1, 'concrete');
    }
  }
  // --- 街灯(v5: すべて根元から折れた姿にした)---
  // 装飾は当たり判定ゼロなので、機体全高(4.24)を超える支柱を立てると必ず「すり抜け」が見える。
  // 街灯/信号/電柱は円1個で表せず(細長い)、r≈1.2m は機体半径2.2mより小さいのでシムへも
  // 昇格できない(fields.js の線引き)。ならば **膝下まで倒す** のが唯一嘘の出ない解で、
  // しかも「崩落市街」の名にかなう。灯体は路面でまだ点いている=街が死にきっていない記号。
  const lampAt = (x, z, ax, az) => {
    box(x, z, 1.3, 1.3, 0, 1.6, '#4c4f52', 'concrete');                                        // 折れた根元
    box(x + ax * 13, z + az * 13, ax ? 11 : 1.1, az ? 11 : 1.1, 0.2, 1.1, '#4c4f52', 'concrete'); // 路面に倒れた支柱
    box(x + ax * 27, z + az * 27, 2.4, 2.4, 0.2, 1.0, '#3a3d40', 'concrete');                  // 割れた笠
    glow(x + ax * 27, z + az * 27, 1.15, 0.7, 0.18, 0.7, '#ffd79a');
    solid(x, z, 1.3, 1.6);                                                                     // 根元に乗り上げる
    solid(x + ax * 2, z + az * 2, 1.1, 1.1, x + ax * 24, z + az * 24);                         // 倒れた支柱を跨ぐ
    solid(x + ax * 27, z + az * 27, 2.4, 1.0);                                                 // 笠
  };
  for (let z = 120; z < 900; z += 130) {
    lampAt(AV - HALF - 9, z, 1, 0);
    lampAt(AV + HALF + 9, z + 65, -1, 0);
  }
  for (let x = 120; x < 900; x += 130) {
    if (Math.abs(x - AV) < HALF + 30) continue;
    lampAt(x, AV - HALF - 9, 0, 1);
    lampAt(x + 65, AV + HALF + 9, 0, -1);
  }
  // --- 交差点の信号機(4隅。倒れて路面に転がり、3灯はまだ点いている)---
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = AV + sx * (HALF + 10), pz = AV + sz * (HALF + 10);
    box(px, pz, 1.3, 1.3, 0, 1.8, '#42454a', 'concrete');                       // 折れた根元
    box(px - sx * 13, pz, 12, 1.1, 0.2, 1.2, '#42454a', 'concrete');            // 交差点へ倒れた支柱
    box(px - sx * 28, pz, 2.8, 1.5, 0.2, 1.7, '#2c2f33', 'concrete');           // 路面の灯体
    ['#ff4a34', '#ffca4a', '#4affa0'].forEach((c, i) => {
      glow(px - sx * 28, pz, 1.0, 0.4, 0.4, 0.2, c, sx * (i - 1) * 1.0, sz * 0.7);
    });
    solid(px, pz, 1.3, 1.8);
    solid(px - sx * 2, pz, 1.1, 1.2, px - sx * 25, pz);
    solid(px - sx * 28, pz, 2.8, 1.7);
  }
  // --- 折れた電柱と路面を這うケーブル(v5: 立った支柱は残さない。理由は lampAt のコメント)---
  for (let i = 0; i < 7; i++) {
    const px = 120 + i * 120, pz = AV + HALF + 34;
    box(px, pz, 1.6, 1.6, 0, 1.8, '#5a5148', 'concrete');                       // 折れた根元
    box(px + 15, pz, 13, 1.2, 0.2, 1.3, '#5a5148', 'concrete');                 // 倒れた電柱
    box(px + 28, pz, 1.2, 9, 0.2, 1.0, '#5a5148', 'concrete');                  // 腕木
    solid(px, pz, 1.6, 1.8);
    solid(px + 2, pz, 1.2, 1.3, px + 28, pz);
    solid(px + 28, pz - 9, 1.2, 1.0, px + 28, pz + 9);
    if (i > 0) {
      const qx = px - 120;
      for (const dz of [-6, 0, 6]) {
        // 断線して路面を這うケーブル(3分割で蛇行を付ける)
        line(qx + 30, 0.9, pz + dz, qx + 60, 0.28, pz + dz + 7, 'rgba(24,22,20,0.85)');
        line(qx + 60, 0.28, pz + dz + 7, qx + 92, 0.28, pz + dz - 5, 'rgba(24,22,20,0.85)');
        line(qx + 92, 0.28, pz + dz - 5, px, 0.9, pz + dz, 'rgba(24,22,20,0.85)');
      }
    }
  }
  // --- 焼けた廃車は v5 でシムへ昇格した(fields.js の kind:'rubble'/deco:'car')。
  //     ここで描くと二重になるので装飾側からは削除。座標の正本は fields.js。
  // --- 場外の街(戦域の外へ街を続ける。距離フォグに溶けて「街の中の戦場」に見える)---
  // 実座標で 0..1000 が戦域。その外側のリングに街区を置く=遊べないが必ず見える帯。
  quadTiled(AV - HALF, -260, AV + HALF, 40, 0.05, '#2b2e31', 'asphalt');
  quadTiled(AV - HALF, 960, AV + HALF, 1260, 0.05, '#2b2e31', 'asphalt');
  quadTiled(-260, AV - HALF, 40, AV + HALF, 0.07, '#2b2e31', 'asphalt');
  quadTiled(960, AV - HALF, 1260, AV + HALF, 0.07, '#2b2e31', 'asphalt');
  for (let i = 0; i < 46; i++) {
    const h1 = hash(i * 2.7 + 11.5), h2 = hash(i * 6.1 + 3.3), h3 = hash(i * 4.9 + 7.1);
    const ang = (i / 46) * Math.PI * 2 + (h1 - 0.5) * 0.09;
    const rad = 620 + h2 * 900;                                  // 実座標での中心距離(戦域外)
    const x = 500 + Math.cos(ang) * rad, z = 500 + Math.sin(ang) * rad;
    if (Math.abs(x - AV) < HALF + 26 && Math.abs(z - AV) < HALF + 26) continue;   // 大通りの延長は塞がない
    const w = 52 + h3 * 74, d = 52 + hash(i * 9.3) * 74;
    const hgt = (16 + h3 * 46) * (0.8 + rad / 1200);             // 遠いほど高い=奥行き
    const bv = Math.floor(hash(i * 13.7) * 4);
    box(x, z, w / 2, d / 2, 0, hgt, mixColor('#98948c', '#4e4a44', h1 * 0.55), 'building');
    // 屋上の縁+設備
    box(x, z, w / 2 + 1.5, d / 2 + 1.5, hgt, hgt + 1.1, '#6e6a63', 'concrete');
    if (h2 > 0.5) box(x + (h1 - 0.5) * w * 0.4, z + (h3 - 0.5) * d * 0.4, w * 0.12, d * 0.12, hgt + 1.1, hgt + 1.1 + 3 + h1 * 5, '#7a766f', 'concrete');
    if (bv === 0) glow(x, z, hgt + 2.4, 0.4, 0.4, 0.4, '#ff4433');   // 航空障害灯
  }
  // --- 瓦礫の散り(小さな塊。歩ける=判定なし)---
  for (let i = 0; i < 44; i++) {
    const h1 = hash(i * 3.7 + 0.5), h2 = hash(i * 8.1 + 1.3), h3 = hash(i * 5.3 + 2.7);
    const x = 60 + h1 * 880, z = 60 + h2 * 880;
    if (Math.abs(x - AV) < HALF - 10 && Math.abs(z - AV) < HALF - 10) continue;   // 交差点の中央は空ける
    const c = P(x, 0, z), r = 0.4 + h3 * 1.1;
    const sh = prismShape([c[0], r * 0.5, c[2]], AXIS_Y, r * 0.5, r * 0.5, r, 5,
      { jitter: (k) => (hash(i * 11 + k) - 0.5) * r * 0.6 });
    sh.faces.forEach((f) => out.push({ verts: f.map((vi) => sh.verts[vi]), color: '#57534c', alpha: 1, tex: 'concrete' }));
    solid(x, z, r / S, r);   // 塊の半径はワールド単位で作っているのでシムmへ戻す
  }
}

// --- 装飾の踏み面: 硬い低い瓦礫に「乗り上げる」(render-only・シムは知らない) ---
// 脛が埋まる高さ(〜2)の硬い物は、すり抜けるより乗り越えるほうが正しい。乗ってから降りるだけなので
// 進路も速度も変わらない=シムに上げる必要がない(fields.js の昇格の線引きに触れずに済む)。
// 座標はシムm。戦場ごとに1回作ってキャッシュする(静的)。
const decorSolidCache = new Map();
export function fieldDecorSolids(fieldId) {
  let s = decorSolidCache.get(fieldId);
  if (!s) { s = []; fieldDecorFaces(fieldId, [], s); decorSolidCache.set(fieldId, s); }
  return s;
}
// (x,z)=シムm の足元にある踏み面の高さ(描画単位)。pad は機体の footprint 相当の余裕(シムm)。
export function decorLiftAt(fieldId, x, z, pad) {
  const list = fieldDecorSolids(fieldId);
  const p = pad || 0;
  let best = 0;
  for (const s of list) {
    if (s.h <= best) continue;                       // すでにもっと高い所に乗っている
    let dx = x - s.x, dz = z - s.z;
    if (s.x2 !== undefined) {                        // カプセル: 線分までの距離
      const ax = s.x2 - s.x, az = s.z2 - s.z;
      const l2 = ax * ax + az * az || 1;
      let t = (dx * ax + dz * az) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      dx -= ax * t; dz -= az * t;
    }
    if (dx * dx + dz * dz < (s.r + p) * (s.r + p)) best = s.h;
  }
  return best;
}

// --- カメラの足場: 小障害物の中に潜り込ませない ---
// 「乗り上げるもの」(踏破可能な瓦礫 rubble・装飾の縁石/コンクリ塊)は、機体だけでなく**カメラに
// とっても床**。至近ショット(白兵1.4/決着カット1.7/肩越し4.8×MECH_SCALE)は eye が2m前後まで
// 下がるので、天端3.2m・半径15mの瓦礫塚に入ると画面が土砂で埋まる(人間報告 2026-08-01)。
// 壁(wall)は近接カットの透過(r3d-three updateObstacleCull)が受け持ち、茨の棘は細く画面を
// 覆わないので対象外。x,z=ワールド座標 / 返り値=描画単位の高さ(0=素の地面)。
const CAM_FOOT_PAD = 1.5;   // 装飾の踏み面に対する余裕(シムm)。カメラに footprint は無いが縁を掠らせない
// 足場から浮かせる高さ。**設計上いちばん低いアイレベル(白兵 1.4×MECH_SCALE=0.84)より下に置く**こと:
// これを超える値にすると、瓦礫の上の殴り合いで必ずクランプが働き「低い煽り」が失われる。
export const CAM_FLOOR_CLEAR = 0.6;   // 通常の浮かせ量
const CAM_FLOOR_HARD = 0.35;          // 絶対に割らない下限(なましが追いつく間のめり込み止め)
// 床が低いうちは浮かせ量も比例で立ち上げる(縁での段差防止)。係数は「床の傾きを何倍に増幅するか」
// でもあるので大きくしない: 3 にすると塚の縁を横切るカメラが床の4倍の速さでせり上がって跳ねて見える
// (ハーネス cam-probe の「縁を跨いでも段差で跳ねない」が実測で落ちる)。
const CAM_FLOOR_RAMP = 1;
export function cameraFloorAt(scene, x, z) {
  let top = 0;
  for (const o of (scene && scene.obstacles) || []) {
    if (o.kind !== 'rubble' || o.alive === false) continue;
    // h 未定義は 0.6(rubbleFaces が描く既定の高さ)。fields.js の footYAt は同じ場合に「乗らない」
    // =0 を返すが、これは意図的な非対称: あちらは**シムの足元**の正本、こちらは**描かれた面**の正本。
    const h = o.h > 0 ? o.h : 0.6;
    if (h <= top) continue;
    const dx = x - o.x, dz = z - o.y;
    const d = Math.hypot(dx, dz);
    if (d >= o.r) continue;
    // **シム(sim.js の標高)と同じ形**で高さを出す: 天端(CLIMB_TOP_FRAC×r)までが平らで、そこから
    // 縁へ向かって0に落ちるランプ。円内一律 o.h にすると縁を跨ぐ瞬間にカメラが天端ぶん(最大3.2m)
    // 跳ね、塚の外に立つ機体まで見下ろしの画になる。描画(rubbleFaces)は同じランプに頂点ジッタ
    // (±0.12r・chunky は ±0.25r)が乗るので方位によっては数十cm外れるが、浮かせ量が吸収する。
    const y = h * Math.max(0, Math.min(1, (1 - d / o.r) / (1 - CLIMB_TOP_FRAC)));
    if (y > top) top = y;
  }
  // 装飾の踏み面はシムm座標で持つ(fieldDecorFaces が内側で WORLD_SCALE をかける)ので逆変換する。
  const S = WORLD_SCALE;
  const sx = ARENA_CX + (x - ARENA_CX) / S, sz = ARENA_CZ + (z - ARENA_CZ) / S;
  return Math.max(top, decorLiftAt(scene && scene.field, sx, sz, CAM_FOOT_PAD));
}

// 表示カメラを足場の上へ持ち上げる(平滑化・包含のあとに効かせる最終段。レンダラとハーネスの
// 唯一の実装=定数を二重管理しないため、r3d-three ではなくここに置く)。
// eye を破壊的に持ち上げ、なましの状態は camSt.floorY に持つ。snap=カット時(なまさず即座に合わせる)。
// 浮かせ量は床が低いうちは比例で立ち上げる(`floor>0 になった瞬間に +CLEAR` だと、塚の縁を跨ぐ
// 一歩で eye が段差状に跳ぶ。ランプで床が0から連続に立ち上がる意味が無くなる)。
export function cameraFloorClamp(scene, eye, camSt, dt, snap) {
  const fl = cameraFloorAt(scene, eye[0], eye[2]);
  camSt.floorY = (snap || camSt.floorY == null) ? fl
    : camSt.floorY + (fl - camSt.floorY) * (1 - Math.exp(-Math.max(0, dt) / 0.18));
  if (camSt.floorY < 0.02) camSt.floorY = 0;   // なましの尾を切る(素の地面に微小な下限が残り続けない)
  const soft = camSt.floorY + Math.min(CAM_FLOOR_CLEAR, camSt.floorY * CAM_FLOOR_RAMP);
  const hard = fl + Math.min(CAM_FLOOR_HARD, fl * CAM_FLOOR_RAMP);
  const minY = Math.max(soft, hard);
  if (eye[1] < minY) eye[1] = minY;
  return eye;
}

// ==================== 遠景(地平のシルエット) ====================
// 距離フォグ(220〜900)の外に置く「不透明なシルエット」。照明もフォグも切り、色は空気遠近法を
// 手で焼く(近い稜線=暗い/遠い稜線=空に近い霞色)。これが無いと地平線がただの直線になる。
// 戦場が市街(shigai)なら山ではなく高層ビル群のスカイラインを立てる。
// 生成は戦場+テーマごとに1回(静的ジオメトリ)。Math.random は使わない。
export function distantSceneryFaces(theme, fieldId, out) {
  const cx = ARENA_CX, cz = ARENA_CZ;
  const LAYERS = [
    { rad: 1150, hMin: 55, hMax: 165, shade: 0.10, haze: 0.10, seg: 110, seed: 3.1 },
    { rad: 1750, hMin: 120, hMax: 300, shade: 0.34, haze: 0.30, seg: 86, seed: 11.7 },
    { rad: 2450, hMin: 210, hMax: 460, shade: 0.62, haze: 0.52, seg: 66, seed: 23.3 },
  ];
  // 空気遠近法: 遠い層ほど地平の空色へ寄せる(テーマの mountain() を基色に霞を足す)。
  // arena テーマの mountain() はほぼ黒なので、この霞が無いと3層が同じ黒で重なって奥行きが出ない。
  const layerCol = (L, extra) => mixColor(theme.mountain(L.shade), theme.sky[3], Math.min(0.88, L.haze + (extra || 0)));
  const push = (v, color) => out.push({ verts: v, color, alpha: 1, far: true });

  if (fieldId === 'shigai') {
    // --- 市街: 箱のスカイライン(3層。奥ほど高く霞む)---
    // ビル群は山稜と違って「近くに見える大きな面」なので、山と同じ明るさだと白い段ボールの
    // 書割に見える(実機確認 2026-07-31)。基色を暗く取り、霞は控えめに乗せる。
    const SKY_BASE = ['#191e23', '#232a31', '#2f3841'];
    const cityCol = (li, L, extra) => mixColor(SKY_BASE[li], theme.sky[3], Math.min(0.6, L.haze * 0.5 + (extra || 0)));
    LAYERS.forEach((L, li) => {
      const base = cityCol(li, L, 0);
      const top = cityCol(li, L, 0.08);
      const n = Math.round(L.seg * 0.62);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + hash(i * 1.7 + L.seed) * 0.02;
        const hh = L.hMin + hash(i * 3.3 + L.seed) * (L.hMax - L.hMin);
        const w = (0.4 + hash(i * 5.1 + L.seed) * 0.7) * (L.rad * Math.PI * 2 / n) * 0.5;
        const rr = L.rad * (0.94 + hash(i * 7.9 + L.seed) * 0.14);
        const bx = cx + Math.cos(a) * rr, bz = cz + Math.sin(a) * rr;
        // 中心を向く板(遠景=シルエットなので前面のみ。左右の稜線を段付きにして塔らしさを出す)
        const tx = -Math.sin(a), tz = Math.cos(a);   // 接線方向
        const p = (s, y) => [bx + tx * s, y, bz + tz * s];
        push([p(-w, -30), p(w, -30), p(w, hh), p(-w, hh)], base);
        // 頂部の段(セットバック)+尖塔
        const w2 = w * (0.4 + hash(i * 9.1 + L.seed) * 0.35);
        const h2 = hh + hh * (0.08 + hash(i * 2.9 + L.seed) * 0.22);
        push([p(-w2, hh), p(w2, hh), p(w2, h2), p(-w2, h2)], top);
        if (hash(i * 13.1 + L.seed) > 0.72) {
          const w3 = w2 * 0.16;
          push([p(-w3, h2), p(w3, h2), p(w3, h2 + hh * 0.24), p(-w3, h2 + hh * 0.24)], top);
        }
        // 窓の灯(手前2層のみ。夜テーマで街が生きて見える)
        if (li < 2) {
          const rows = 3 + Math.floor(hash(i * 17.3 + L.seed) * 3);
          for (let r = 0; r < rows; r++) {
            const lh = hash(i * 19.7 + r + L.seed);
            if (lh < 0.42) continue;
            const wy = hh * (0.2 + (r / rows) * 0.7);
            const ws = w * (0.16 + hash(i * 23.1 + r) * 0.3);
            const wo = (hash(i * 29.3 + r) - 0.5) * w * 1.2;
            out.push({
              verts: [p(wo - ws, wy), p(wo + ws, wy), p(wo + ws, wy + hh * 0.05), p(wo - ws, wy + hh * 0.05)],
              color: lh > 0.8 ? 'rgba(255,214,150,0.75)' : 'rgba(190,214,244,0.5)', alpha: 1, far: true, emissive: true,
            });
          }
        }
      }
    });
    return;
  }

  // --- 山稜(3層のリング状カーテン。稜線は決定論ノイズ)---
  LAYERS.forEach((L) => {
    const base = layerCol(L, 0);
    const ridge = layerCol(L, 0.16);
    const hAt = (i) => {
      const a = i / L.seg;
      // 3周波の重ね合わせ(端で必ず一周する周期数=継ぎ目なし)
      const n = 0.5 + 0.5 * (Math.sin(a * Math.PI * 2 * 3 + L.seed) * 0.5
        + Math.sin(a * Math.PI * 2 * 7 + L.seed * 2.3) * 0.3
        + Math.sin(a * Math.PI * 2 * 13 + L.seed * 3.7) * 0.2);
      const j = hash(i * 2.11 + L.seed) * 0.28;
      return L.hMin + (L.hMax - L.hMin) * Math.min(1, Math.max(0, n * 0.85 + j));
    };
    for (let i = 0; i < L.seg; i++) {
      const a0 = (i / L.seg) * Math.PI * 2, a1 = ((i + 1) / L.seg) * Math.PI * 2;
      const h0 = hAt(i), h1 = hAt((i + 1) % L.seg);
      const x0 = cx + Math.cos(a0) * L.rad, z0 = cz + Math.sin(a0) * L.rad;
      const x1 = cx + Math.cos(a1) * L.rad, z1 = cz + Math.sin(a1) * L.rad;
      // 稜線側を霞色にする2枚(下=暗い基部 / 上=明るい稜線)=空気遠近法の縦グラデ
      const mid0 = h0 * 0.55, mid1 = h1 * 0.55;
      push([[x0, -40, z0], [x1, -40, z1], [x1, mid1, z1], [x0, mid0, z0]], base);
      push([[x0, mid0, z0], [x1, mid1, z1], [x1, h1, z1], [x0, h0, z0]], ridge);
    }
  });
}


// ==================== 共有定数・テーマ・カメラ director ====================

const WORLD_UP = [0, 1, 0];
const GROUND_Y = 0;
export const ARENA_CX = 500, ARENA_CZ = 500;

// 配色テーマ: scene.theme が 'arena' の場合のみ切替(未指定/'training'は従来と完全一致=下記値は
// 既存の色リテラルをそのまま移設したもの)。機体色・エフェクト色(シーンから渡る値)はここでは
// 扱わない=見分けを守る。sky/ground は render() のグラデーション、gridLine は地平線グリッド、
// mountain(shade) は旧ソフト版の遠景の山の色関数(現状未使用・テーマ定義の完全性のため残置)。
export const THEMES = {
  training: {
    sky: ['#0a1030', '#1c3350', '#2e4a56', '#57806e'],
    ground: ['#20342c', '#131f1a', '#0a1410'],
    gridLine: [120, 220, 180],
    mountain(shade) {
      return `rgba(${Math.round(20 + shade * 60)},${Math.round(30 + shade * 70)},${Math.round(40 + shade * 90)},1)`;
    },
  },
  arena: {
    // 闘技場: 夜の紫黒〜暗赤の空、赤銅〜暗褐色の地面、琥珀のグリッド/地平線、黒シルエットの遠景。
    sky: ['#150318', '#2c0a1c', '#4a1410', '#5c2410'],
    ground: ['#3a1a10', '#210f08', '#100603'],
    gridLine: [214, 150, 60],
    mountain(shade) {
      const v = Math.round(6 + shade * 10);
      return `rgba(${v + 3},${v},${Math.max(0, v - 2)},1)`;
    },
  },
};
export function themeOf(scene) { return scene && scene.theme === 'arena' ? THEMES.arena : THEMES.training; }


// 余韻(決着後)の勝者が敗者の周りを回る半径。**シム単位の正本**で、game.js の演出(R2)と
// r3d.js のカメラ距離の下限が同じ数を見るために置く(片方だけ変えるとカメラが旋回円の内側に入る)。
// 描画のワールド単位では ×WORLD_SCALE ≈ 10.35m。
export const AFTERMATH_ORBIT_R_SIM = 23;
const AFTERMATH_ORBIT_R = AFTERMATH_ORBIT_R_SIM * WORLD_SCALE;

// ==================== カメラ・ディレクター(camera:'auto') ====================
// 手動カメラ(scene.camera.eye指定)はレンダラ側(r3d-three.js updateCamera)で不変のまま分岐する。
// 'auto' はディレクター(以下の決定論的なショット割り)が毎フレーム「目標 eye/target」を出し、
// レンダラ側の camSt が表示カメラを指数平滑(時定数τ)で追従させる。機体のストレイフ振動や
// ノックバックへの剛結合を断つのが目的。カット(ショット番号の変化)の瞬間だけ平滑状態を目標値で
// リセット=スナップし、切れ味を残す。シーク/倍速でも「カット境界でスナップ」は保たれる
// (ショット割り自体は tSec と固定シード(camSt.seed=初回フレームで確定)の決定論のまま)。
//
// 「両機が常にフレーム内」を満たすための必要距離(旧autoカムの傾き0.95・クランプを踏襲)。
// aspect<1(縦画面)は奥行き構図を優先する既存方針を継いで、より距離を取る。
// dist2d には EMA 済みの機体間距離(τ≈0.8s)が渡り、間合いの脈動でズームがポンピングしない。
function framingDistance(dist2d, aspect) {
  const spread = dist2d * (aspect < 1 ? 1.3 : 1.0);
  return Math.max(16 * MECH_SCALE, Math.min(230, 14 * MECH_SCALE + spread));
}

// ---- 両機フレームショット(ハード包含つき。中距離以上で時間の約30%。近距離では使わない) ----
function shotTrack(c) {
  // 横トラック: 機体軸と平行にゆっくり移動(移動レートは旧実装の半分)
  const d = framingDistance(c.dist2d, c.aspect) * 0.85;
  const h = 5 * MECH_SCALE + d * 0.22;
  const span = Math.min(20, c.dist2d * 0.3 + 5);
  const along = (c.localT / c.dur - 0.5) * span;
  const perp = c.axisAng + Math.PI / 2;
  const eye = [
    c.midx + Math.cos(perp) * d * c.side + Math.cos(c.axisAng) * along,
    h,
    c.midz + Math.sin(perp) * d * c.side + Math.sin(c.axisAng) * along,
  ];
  return { eye, target: [c.midx, 3.2 * MECH_SCALE, c.midz] };
}
function shotTripod(c) {
  // 本物の三脚: ショット開始時に固定した世界座標(c.tripodEye)から動かず、パンだけで追う。
  return { eye: c.tripodEye, target: [c.midx, 3 * MECH_SCALE, c.midz] };
}
function shotDolly(c) {
  // ドリーイン・アウト: 視軸に沿って寄る/引く(移動量は旧0.42→0.18に減速)
  const dBase = framingDistance(c.dist2d, c.aspect);
  const p = clamp01(c.localT / c.dur);
  const amp = dBase * 0.18;
  const dd = c.dollyDir > 0 ? dBase * 1.12 - p * amp : dBase * 0.94 + p * amp;
  const h = 6 * MECH_SCALE + dd * 0.25;
  const eye = [c.midx + Math.cos(c.angleOff) * dd, h, c.midz + Math.sin(c.angleOff) * dd];
  return { eye, target: [c.midx, 3 * MECH_SCALE, c.midz] };
}
function shotCrane(c) {
  // 低空クレーン: 下から上へ(または逆)。移動は全高低差の半分だけ=旧実装の半速。
  const d = framingDistance(c.dist2d, c.aspect) * 0.9;
  const p = clamp01(c.localT / c.dur) * 0.5;
  const hLow = 1.6 * MECH_SCALE, hHigh = 9 * MECH_SCALE + d * 0.3;
  const h = c.craneUp ? hLow + (hHigh - hLow) * p : hHigh - (hHigh - hLow) * p;
  const eye = [c.midx + Math.cos(c.angleOff) * d, h, c.midz + Math.sin(c.angleOff) * d];
  return { eye, target: [c.midx, 3 * MECH_SCALE, c.midz] };
}
function shotOrbit(c) {
  // 緩いオービット: 小さな弧をゆっくり回る(掃引角は旧0.5→0.22rad)
  const d = framingDistance(c.dist2d, c.aspect);
  const sweep = 0.22;
  const p = clamp01(c.localT / c.dur);
  const ang = c.angleOff + c.orbitDir * sweep * (p - 0.5);
  const h = 7 * MECH_SCALE + d * 0.18;
  const eye = [c.midx + Math.cos(ang) * d, h, c.midz + Math.sin(ang) * d];
  return { eye, target: [c.midx, 3.2 * MECH_SCALE, c.midz] };
}
const BASE_SHOT_FNS = [shotTrack, shotTripod, shotDolly, shotCrane, shotOrbit];

// ---- ハード包含(両機フレーム内の毎フレーム保証) ----
// ただし v5 以降、表示側の最後に**足場クランプ**(r3d-three updateCamera / cameraFloorAt)が入る。
// 瓦礫の天端より下に eye が来るときだけ持ち上がるので包含がわずかに緩むことがある=
// 「めり込まない」が包含より優先(土砂で画面が埋まるほうが破綻が大きい)。
// 基本ショット/aftermathでは、ディレクターが出した目標カメラに対し両機の射影を検査し、
// どちらかが安全枠(NDCの±SAFE_FRAME=画面の約88%)から出るなら視線軸に沿って後退して収める。
// 後退は eye を -forward 方向へ動かすだけなので視線の向き(基底)は変わらない=純粋なドリーバック。
// EMA距離による framingDistance は「下限(基準の画角)」で、この検査が最終権威。
export const FOV_Y = 55 * DEG;   // 縦画角の正本(r3d-three のカメラ・ハーネスもこれを読む)
const SAFE_FRAME = 0.88;
function framePoints(mechs, right) {
  // 各機体の包含チェック点: 足元/頭上(全高4.2m+マージン≒1.3m)を左右マージン(±2.1m)付きで。
  // 横倒し(全長4.2mが水平に伸びる)も左右マージン+安全枠の余白でカバーする。
  const pts = [];
  const top = 9.1 * MECH_SCALE;
  const lat = 3.5 * MECH_SCALE;
  for (let i = 0; i < 2; i++) {
    const mm = mechs[i];
    if (!mm) continue;
    const x = mm.x || 0, z = mm.y || 0;
    const e = mm.elev || 0;   // v5: 足場の標高。0固定だと瓦礫の上の機体が上端からはみ出す
    for (const s of [-1, 1]) {
      pts.push([x + right[0] * lat * s, e, z + right[2] * lat * s]);
      pts.push([x + right[0] * lat * s, e + top, z + right[2] * lat * s]);
    }
  }
  return pts;
}
function pullbackFor(eye, forward, right, up, aspect, points) {
  // 各点 p のカメラ座標 (cx,cy,cz) に対し、後退量 m は
  //   |cx|*f/(aspect*(cz+m)) <= SAFE_FRAME  →  m >= |cx|*f/(aspect*SAFE_FRAME) - cz
  //   |cy|*f/(cz+m)          <= SAFE_FRAME  →  m >= |cy|*f/SAFE_FRAME - cz
  // (後退で cz が増える=必ず解ける単調な制約)。近接面 cz+m>=2m も併せて全点の最大を取る。
  const f = 1 / Math.tan(FOV_Y / 2);
  let m = 0;
  for (const p of points) {
    const rel = sub(p, eye);
    const cx = dot(rel, right), cy = dot(rel, up), cz = dot(rel, forward);
    m = Math.max(m,
      Math.abs(cx) * f / (aspect * SAFE_FRAME) - cz,
      Math.abs(cy) * f / SAFE_FRAME - cz,
      2 - cz);
  }
  return m;
}
export function containEye(eye, target, aspect, mechs) {
  const fwd = normalize(sub(target, eye));
  let rgt = normalize(cross(fwd, WORLD_UP));
  if (length(rgt) < 1e-6) rgt = [1, 0, 0];
  const upv = normalize(cross(rgt, fwd));
  const m = pullbackFor(eye, fwd, rgt, upv, aspect, framePoints(mechs || [], rgt));
  return m > 0 ? sub(eye, scaleV(fwd, m)) : eye;
}

// ---- ダイナミックショット(迫力担当。片方が画面からはみ出してよい=包含免除) ----
function shotOverShoulder(M, O, sideSign) {
  // 肩越し: M(手前機)の肩の後ろ・やや上から相手Oを見据える。手前の機体が画面端に大きく、
  // 相手は奥に小さく=ロボアニメの定番構図。eyeの横オフセットで手前機を左右どちらかの端へ寄せる。
  let fwdMO = normalize([O.x - M.x, 0, O.y - M.y]);
  if (length(fwdMO) < 1e-5) fwdMO = [1, 0, 0];
  const rightMO = [-fwdMO[2], 0, fwdMO[0]];
  const back = 3.2 * MECH_SCALE;  // 肩の後ろ ≈1.9m
  const lat = 1.9 * MECH_SCALE;   // 横へ ≈1.1m(手前機を画面端へ)
  // v5: 肩の高さは足場の標高込み。瓦礫の上に立つ機体の肩越しを地上高で撮ると、カメラが塚の中に埋まる。
  const hgt = 4.8 * MECH_SCALE + (M.elev || 0);   // 肩上 ≈2.9m(全高4.2mの肩口より少し上)
  const eye = [
    M.x - fwdMO[0] * back + rightMO[0] * lat * sideSign,
    hgt,
    M.y - fwdMO[2] * back + rightMO[2] * lat * sideSign,
  ];
  return { eye, target: [O.x, 3 * MECH_SCALE + (O.elev || 0), O.y] };
}
function shotPOV(a, b, povSide, tSec) {
  // コックピットPOV: 頭部/胴上部=コクピット高(4.0*MECH_SCALE)から相手を見据える一人称。
  // eye は視線方向へ少し前(≈1.3m)に出す=胸前で開く自弾マズルフラッシュ(ビルボード)が
  // カメラを覆うのを避ける。歩行の揺れ(横スウェイ+速い縦バブ)を tSec から決定論で加え、
  // 「機体に乗っている」感を出す(振幅は照準リングの読みを壊さない小ささに抑える)。
  const src = povSide > 0 ? a : b, tgt = povSide > 0 ? b : a;
  let fwd = normalize([tgt.x - src.x, 0, tgt.y - src.y]);
  if (length(fwd) < 1e-5) fwd = [1, 0, 0];
  const rgt = [-fwd[2], 0, fwd[0]];
  const t = tSec || 0;
  const sway = (Math.sin(t * 1.9) + 0.5 * Math.sin(t * 3.1 + 1.3)) * 0.22 * MECH_SCALE;
  const bob = Math.sin(t * 3.8) * 0.10 * MECH_SCALE;
  const ahead = 2.2 * MECH_SCALE;
  // v5: コクピット高も足場の標高込み(瓦礫の上の機体で撮ると、地上高のままでは土の中からの一人称になる)
  const eye = [
    src.x + fwd[0] * ahead + rgt[0] * sway,
    4.0 * MECH_SCALE + (src.elev || 0) + bob,
    src.y + fwd[2] * ahead + rgt[2] * sway,
  ];
  return { eye, target: [tgt.x, 3 * MECH_SCALE + (tgt.elev || 0), tgt.y], povIdx: povSide > 0 ? 0 : 1 };
}
function shotProjectileFollow(shot, localT, dur) {
  // 弾追跡: 弾の背後から着弾まで追う速い画(全弾種対応。beamは光条の走りを駆け抜ける)。
  const p = clamp01(dur > 0 ? localT / dur : 0);
  const age = clamp01(shot.age01 == null ? p : shot.age01);
  const srcY = shot.y0 != null ? shot.y0 : MUZZLE_Y;
  const dstY = shot.y1 != null ? shot.y1 : 2.9;   // 追跡カメラは胴高さ狙いで安定させる
  const A = [shot.x, srcY, shot.y], B = [shot.tx, dstY, shot.ty];
  const pos = lerpP(A, B, Math.min(1, age));
  let dir = normalize(sub(B, A));
  if (length(dir) < 1e-5) dir = [0, 0, 1];
  const eye = sub(pos, scaleV(dir, 6 * MECH_SCALE));
  eye[1] += 2.2 * MECH_SCALE;
  return { eye, target: add(pos, scaleV(dir, 8)) };
}
function shotMeleeClose(c) {
  // v5: 白兵至近は eye が 0.84m まで下がる=足場の標高を無視すると、瓦礫の上の殴り合いで
  // カメラが塚の中に埋まる。高いほうの足場に合わせて持ち上げる(低いほうに合わせると埋まる)。
  const d = 9 * MECH_SCALE;
  const ang = c.axisAng + Math.PI / 2 + c.angleOff * 0.4;
  const eye = [c.midx + Math.cos(ang) * d, 1.4 * MECH_SCALE + c.midElev, c.midz + Math.sin(ang) * d];
  return { eye, target: [c.midx, 2.6 * MECH_SCALE + c.midElev, c.midz] };
}
// 弾追跡の対象選定: ショット開始時に scene.shots からハッシュで1発選び、その識別子
// (kind+着弾先)を camSt に控えて以後のフレームで同じ弾を追い続ける。弾が消えた(着弾済み)なら
// null=肩越しへフォールバック。ショット開始時に弾が無くても、発射され次第そこから追い始める。
function findTrackedProjectile(scene, schIdx, seed, camSt) {
  const shots = scene.shots || [];
  if (camSt.projIdx === schIdx && camSt.projSig) {
    const sig = camSt.projSig;
    return shots.find((s) => s.kind === sig.kind && Math.abs(s.tx - sig.tx) < 0.5 && Math.abs(s.ty - sig.ty) < 0.5) || null;
  }
  if (!shots.length) return null;
  const pick = shots[Math.floor(hash(schIdx * 4.9 + seed + 8.8) * shots.length) % shots.length];
  camSt.projIdx = schIdx;
  camSt.projSig = { kind: pick.kind, tx: pick.tx, ty: pick.ty };
  return pick;
}

// ---- ショット割り: idx(ショット番号)=累積時間から決定論で求める ----
// (aftermath 中はショットスケジュール自体を使わない=専用モードが computeAutoCamera 冒頭で分岐)
// スロット種: FRAMED=両機フレーム(ハード包含つき) / SHOULDER=肩越し(主力) / PROJ=弾追跡 /
// POV / MELEE=白兵至近。SHOULDER/PROJ/POV/MELEE は「ダイナミック」=片方のはみ出しを許容する。
// 出現率×平均尺で「両機フレーム≈時間の30% / ダイナミック≈70%」の配分:
//   FRAMED 16%×avg4.75s ≈ 0.76 vs ダイナミック 84%×avg2.12s ≈ 1.78 → FRAMED時間比 ≈ 30%。
// PROJ/MELEE の条件不成立時は SHOULDER へフォールバック=ダイナミック比は下がらない。
// 近距離(<120m)ではFRAMEDスロットも肩越しへ差し替え=ほぼ全編ダイナミック(尺の割付は不変)。
const SLOT_FRAMED = 0, SLOT_SHOULDER = 1, SLOT_PROJ = 2, SLOT_POV = 3, SLOT_MELEE = 4;
const FRAMED_MIN_DIST = 120; // 両機フレームショットを使う機体間距離(EMA)の目安
const POV_MIN_DIST = 60;     // コックピットPOVを使う下限距離(EMA)=中距離以遠の迫力用。近距離では敵が画面を覆い照準の画にならない
function slotTypeFor(idx, seed) {
  const r = hash(idx * 3.37 + seed * 1.13 + 7.7);
  if (r < 0.16) return SLOT_FRAMED;
  const r2 = hash(idx * 5.53 + seed * 0.31 + 2.2);
  return r2 < 0.5 ? SLOT_SHOULDER : r2 < 0.7 ? SLOT_PROJ : r2 < 0.85 ? SLOT_POV : SLOT_MELEE;
}
function shotDurationFor(idx, seed) {
  const st = slotTypeFor(idx, seed);
  const r = hash(idx * 2.713 + seed);
  if (st === SLOT_FRAMED) return 3.5 + r * 2.5;   // 両機フレーム 3.5〜6s
  if (st === SLOT_PROJ) return 0.8 + r * 0.8;     // 弾追跡 0.8〜1.6s(速い画)
  if (st === SLOT_SHOULDER) return 1.8 + r * 1.4; // 肩越し 1.8〜3.2s(主力)
  if (st === SLOT_POV) return 2.2 + r * 1.0;      // コックピットPOV 2.2〜3.2s(照準リングと距離読みを読ませる尺)
  return 1.6 + r * 1.0;                           // 白兵 1.6〜2.6s
}
function locateShot(tSec, seed) {
  let acc = 0, idx = 0;
  while (idx < 8000) {
    const dur = shotDurationFor(idx, seed);
    if (tSec < acc + dur) return { idx, dur, localT: Math.max(0, tSec - acc) };
    acc += dur;
    idx++;
  }
  return { idx, dur: 5, localT: 0 };
}
function baseShotTypeIndex(idx, seed, aspect) {
  let roll = hash(idx * 1.91 + seed * 0.7 + 3.1);
  if (aspect < 1) roll = roll * 0.6 + 0.2; // 縦画面: 奥行き系(dolly/crane)へ寄せる
  return Math.max(0, Math.min(BASE_SHOT_FNS.length - 1, Math.floor(roll * BASE_SHOT_FNS.length)));
}
function baseShotTypeIndexNoRepeat(idx, seed, aspect) {
  const ti = baseShotTypeIndex(idx, seed, aspect);
  if (idx > 0 && ti === baseShotTypeIndex(idx - 1, seed, aspect)) return (ti + 1) % BASE_SHOT_FNS.length;
  return ti;
}

// ⑥ イマジナリーライン(180度ルール): カメラを常に A→B の一方の側(既定=左)に保つ。反対側に出る
// ショットは A-B 線に対して鏡映して同じ側へ戻す。これで両機の画面左右の位置関係が一貫し、カットが
// 変わっても軸を越えない。lineSide は最初の通常ショットで確定し、以後固定(reset で解除=新規試合)。
// POV(機体上)や弾の追従(線上付近)は s≈0 なのでほぼ不変。midx/midz を狙点にする画は鏡映しても
// 両機は線上=フレーミング不変。
function enforceLine(eye, a, b, camSt) {
  const dx = b.x - a.x, dz = b.y - a.y;
  const nlen = Math.hypot(dx, dz);
  if (nlen < 1e-3) return eye;
  const nx = -dz / nlen, nz = dx / nlen;                 // A→B の左法線(単位)
  const s = (eye[0] - a.x) * nx + (eye[2] - a.y) * nz;   // eye の符号付き側(=線からの距離)
  if (camSt.lineSide == null) { camSt.lineSide = s >= 0 ? 1 : -1; return eye; }
  if ((s >= 0 ? 1 : -1) !== camSt.lineSide && Math.abs(s) > 1e-3) {
    const d = 2 * s;                                      // 線に対して鏡映(法線成分を反転)
    return [eye[0] - nx * d, eye[1], eye[2] - nz * d];
  }
  return eye;
}

// ディレクター本体: 目標 eye/target を返す(表示カメラの平滑化は呼び出し側=r3d-three.js が行う)。
// camSt(閉包状態)には seed(初回フレームで確定する固定シード)・distEMA(機体間距離のEMA)・
// tripodIdx/tripodEye(三脚ショットの固定位置)・amAng(aftermathの基準方位)を読み書きする。
// dt=フレーム間実時間(上限0.1s)、reset=初回/巻き戻し時のEMAリセット指示。
// 返り値 contain=true のショットは「両機フレーム内」のハード保証対象(基本ショット/aftermath)。
export function computeAutoCamera(scene, tSec, aspect, camSt, dt, reset) {
  const mechs = scene.mechs || [];
  const a = mechs[0] || { x: 500, y: 400, h: 0 };
  const b = mechs[1] || { x: 500, y: 600, h: Math.PI };
  const distRaw = Math.hypot(b.x - a.x, b.y - a.y);
  const midx = (a.x + b.x) / 2, midz = (a.y + b.y) / 2;
  const axisAng = Math.atan2(b.y - a.y, b.x - a.x);

  // 新規試合/巻き戻し(reset)では**カメラの記憶をすべて捨てる**。camSt はレンダラ1インスタンスに
  // 1個=ページ寿命で共有されるので、消し忘れた状態はそのまま次の試合へ持ち越される。とりわけ
  // **amLock(余韻カメラのラッチ)が残ると、2戦目の決着で初回フレームからいきなり1戦目の座標へ
  // 固定され、敗者も勝者も画面に入らない**(=「決着後の周回が行われない事がある」の再現条件は
  // 「同一セッションの2戦目以降」。1戦目だけを見ていると再現しない。レビュー指摘 2026-08-01)。
  // seed も落とす: 残すと2戦目のショット割りが1戦目の初期位置由来のシードで決まり、
  // 「同じリプレイコードなら同じ画」が何戦目に見たかで崩れる。
  if (reset) {
    camSt.seed = null; camSt.distEMA = null;
    camSt.amLock = null; camSt.amAng = null;
    camSt.tripodIdx = -1; camSt.tripodEye = null;
    camSt.projIdx = -1; camSt.projSig = null;
    camSt.lineSide = null; camSt.povIdx = -1; camSt.povOk = false;   // ⑥ イマジナリーラインの基準側とPOVラッチも取り直す
  }

  // シードは初回フレームの機体位置から一度だけ確定する(毎フレーム再計算すると機体移動で
  // ショット割りが揺れて画がバタつく)。以後の全ハッシュ選択はこの固定値に基づく決定論。
  if (camSt.seed == null) camSt.seed = hash(a.x * 0.021 + b.y * 0.019 + 11.3) * 1000;
  const seed = camSt.seed;

  // 機体間距離のEMA(τ≈0.8s): 間合いの脈動(ストレイフ/ノックバック)がフレーミング距離に
  // 直結してズームがポンピングするのを防ぐ。フレーミングの「下限(基準画角)」にのみ使い、
  // 包含のハード検査(containEye)は生の機体位置で行う=最終権威。
  if (camSt.distEMA == null) camSt.distEMA = distRaw;
  else camSt.distEMA += (distRaw - camSt.distEMA) * (1 - Math.exp(-dt / 0.8));
  const dist2d = camSt.distEMA;

  // ---- 決着カット: 敗者が崩れ落ちる間(deadAge<3.0)は強制的にクローズアップ ----
  // ショットスケジュール/aftermath より優先(破壊決着では aftermath が deadAge≈1.1s頃に立つが、
  // 3秒経過まではこのアップを見せ、その後スナップで余韻カメラへ引き継ぐ)。両機に deadAge がある
  // 場合(相打ち)は小さい方=決定打を受けた側を映す。
  let dying = null;
  for (let i = 0; i < 2; i++) {
    const m = mechs[i];
    if (m && m.deadAge != null && m.deadAge < 3.0) {
      if (!dying || m.deadAge < dying.deadAge) dying = m;
    }
  }
  if (dying) {
    // 構図: 距離13m→10mへゆっくり寄り(deadAge 0→3のease)、目線高さ≈1.0mのやや低めから、
    // 崩れ落ちる胴体を追って狙点も1.56m→0.72mへ下げる=倒れ込み(fallCurve 1.4s)が画面中央で
    // 大きく展開する。方位はシードから固定(敗者は静止しているのでeyeは安定)。
    const ang = hash(seed * 1.31 + 6.6) * Math.PI * 2;
    const d = 13 - 3 * easeOutCubic(clamp01(dying.deadAge / 3.0));
    const tgtY = (2.6 - 1.4 * easeOutCubic(clamp01(dying.deadAge / 1.4))) * MECH_SCALE + (dying.elev || 0);
    const F = mechFocus(dying, dying.mesh);   // 横倒しした胴の実中心を追う(feet基準ではズレる)
    // 目線高さは敗者の足場から測る(v5: 瓦礫の上で崩れ落ちると、地上高のままではカメラが塚の中)
    const eye = [F.x + Math.cos(ang) * d, 1.7 * MECH_SCALE + (dying.elev || 0), F.z + Math.sin(ang) * d];
    const target = [F.x, tgtY, F.z];
    return { eye, target, showMarkers: false, shotIdx: -2000, tau: 0.6, contain: false };
  }

  // ---- aftermath 専用モード(勝敗決着後の余韻。カット切替なし=スケジュール停止) ----
  const am = scene.aftermath;
  if (am) {
    const loser = (typeof am === 'object' && am.loser != null) ? am.loser : -1;
    // 勝者が近づききったら(勝者-敗者距離EMA<14m)、その時点のカメラを一度きりラッチして以後固定。
    // ドリフトも包含補正も停止(旋回中も解除しない)。勝者が画面を出入りしても
    // 「敗者の周りを回っている」ことは伝わる。
    if ((loser === 0 || loser === 1) && camSt.amLock) {
      return { eye: camSt.amLock.eye, target: camSt.amLock.target, showMarkers: true, shotIdx: -1000, tau: 0.8, contain: false };
    }
    if (camSt.amAng == null) camSt.amAng = hash(seed * 0.77 + 5.5) * Math.PI * 2;
    const ang = camSt.amAng + tSec * 0.04; // ごくゆっくり流れる方位(完全静止を避ける)
    let eye, target;
    if (loser === 0 || loser === 1) {
      // 敗者を画面中心に。勝者-敗者距離(EMA)に応じてカメラ距離を縮める=勝者が近づくほど寄る。
      // ただし**旋回半径より内側に入ってはいけない**: 勝者は敗者の周りを半径≈10.4m(game.js の R2=23
      // ×WORLD_SCALE)で回るので、camDist がそれと同程度だとカメラが旋回円の上に乗り、勝者は周回の
      // 大半を画面外(真横〜背後)で過ごす。ラッチ(amLock)はその構図を固定してしまうため、
      // 「決着後の周回が行われない」ように見えていた(実測 2026-08-01: camDist 10.3m / 旋回半径 10.4m)。
      // 画面内に収まる条件は asin(旋回半径/camDist) ≦ 水平半画角なので、係数は **aspect から出す**
      // (16:9 で 1.69。3Dタブがほぼ正方形になる非コックピット幅では 2.2 まで開く)。1.15 は安全余裕
      // =狙点が胴中心のぶん実効半径が旋回半径より大きいことへの手当て。上限2.2は縦画面のため:
      // 幾何の要求どおり(縦画面で4倍超)引くと敗者が豆粒になり、余韻の主役が読めなくなる。
      // 下限は**機体間距離ではなく旋回半径そのもの**から出すこと: 距離比例にすると、撃破の無い決着
      // (判定勝ち・降参)では決着カットの猶予が無いぶん「決着間合いのまま」初回フレームでラッチし、
      // カメラが旋回円の内側に取り残される(実測 2026-08-01: 判定勝ち4件中1件が camDist 10.2m<半径10.35m)。
      // 遠方(接近中)は従来どおり 3.5+dist/2 が効く。
      const L = mechs[loser] || a;
      const F = mechFocus(L, L.mesh);   // 横倒しした胴の実中心を画面中心に(feet基準だと機体が中央から外れる)
      const orbitK = Math.min(2.2, 1.15 / Math.sin(Math.atan(aspect * Math.tan(FOV_Y / 2))));
      const camDist = Math.max(9 * MECH_SCALE, 3.5 + dist2d * 0.5, AFTERMATH_ORBIT_R * orbitK);
      const h = 3 * MECH_SCALE + camDist * 0.22;
      eye = [F.x + Math.cos(ang) * camDist, h, F.z + Math.sin(ang) * camDist];
      target = [F.x, F.y, F.z]; // 横たわった敗者の胴中心の高さに合わせる
    } else {
      // 引き分け: 従来どおり両機フレームの静かな画
      const d = framingDistance(dist2d, aspect);
      eye = [midx + Math.cos(ang) * d, 7 * MECH_SCALE + d * 0.18, midz + Math.sin(ang) * d];
      target = [midx, 3.2 * MECH_SCALE, midz];
    }
    eye = containEye(eye, target, aspect, mechs); // 勝者も画角内に(ハード保証)
    if ((loser === 0 || loser === 1) && dist2d < 14) {
      camSt.amLock = { eye: eye.slice(), target: target.slice() }; // 一度きり(以後このカメラで固定)
    }
    return { eye, target, showMarkers: true, shotIdx: -1000, tau: 0.8, contain: true };
  }

  // ---- クライマックスカット: パリィ/大打撃の直後(~0.85s)、着弾点へ至近オービットで殺陣を強調 ----
  // 撃破は上の「決着カット」が受け持つ。決定論(方位は着弾点ハッシュ固定)。shotIdx=-1500 でスナップ切替。
  const cut = scene.camCut;
  if (cut && cut.age >= 0 && cut.age < cut.dur) {
    const p = clamp01(cut.age / cut.dur);
    const ang0 = hash(cut.x * 0.031 + cut.y * 0.021 + 3.1) * Math.PI * 2;
    const orbitDir = hash(cut.x * 0.017 + cut.y * 0.029 + 5.7) < 0.5 ? -1 : 1;
    const ang = ang0 + orbitDir * 0.55 * easeOutCubic(p);   // ゆっくり半周弱
    const d = 17 * MECH_SCALE;                               // 至近
    const eye = [cut.x + Math.cos(ang) * d, 2.6 * MECH_SCALE, cut.y + Math.sin(ang) * d];
    const target = [cut.x, 2.1 * MECH_SCALE, cut.y];
    return { eye, target, showMarkers: false, shotIdx: -1500, tau: 0.3, contain: false };
  }

  const sch = locateShot(tSec, seed);
  const idxHashA = hash(sch.idx * 1.7 + seed * 0.53 + 4.4);
  const angleOff = idxHashA * Math.PI * 2;
  const side = idxHashA < 0.5 ? -1 : 1;
  const heightOff = (5 + idxHashA * 14) * MECH_SCALE;
  const dollyDir = hash(sch.idx * 4.1 + seed) < 0.5 ? 1 : -1;
  const craneUp = hash(sch.idx * 6.3 + seed + 1) < 0.5;
  const orbitDir = hash(sch.idx * 8.9 + seed + 2) < 0.5 ? -1 : 1;

  const baseCtx = {
    midx, midz, axisAng, dist2d, aspect, side, angleOff, heightOff,
    midElev: Math.max(a.elev || 0, b.elev || 0),   // v5: 至近ショットの床(高いほうの足場に合わせる)
    localT: sch.localT, dur: sch.dur, dollyDir, craneUp, orbitDir,
    tripodEye: null,
  };

  // スロット種の決定と実行時オーバーライド(尺の割付=タイムラインは slotTypeFor のまま不変。
  // 差し替えは「何を映すか」だけ): FRAMED は中距離以上(distEMA>120m)のみ=近距離では肩越しへ。
  // PROJ は追える弾が無ければ肩越しへ。MELEE は機間<30mでなければ肩越しへ。
  // POV は中距離以遠(distEMA≥60m)のみ=近距離では肩越しへ(コックピット越しの照準が成立する距離帯)。
  // 判定は**ショット開始時に一度だけ**行いラッチする(三脚の tripodIdx と同じ流儀)。毎フレーム判定だと
  // 接近戦へ向かう途中で distEMA が閾値を跨ぎ、ショット途中でPOV→肩越しへ滑り替わってHUDが消える。
  let type = slotTypeFor(sch.idx, seed);
  if (type === SLOT_FRAMED && dist2d <= FRAMED_MIN_DIST) type = SLOT_SHOULDER;
  if (type === SLOT_MELEE && dist2d >= 30) type = SLOT_SHOULDER;
  if (type === SLOT_POV) {
    if (camSt.povIdx !== sch.idx) { camSt.povIdx = sch.idx; camSt.povOk = dist2d >= POV_MIN_DIST; }
    if (!camSt.povOk) type = SLOT_SHOULDER;
  }
  let proj = null;
  if (type === SLOT_PROJ) {
    proj = findTrackedProjectile(scene, sch.idx, seed, camSt);
    if (!proj) type = SLOT_SHOULDER;
  }

  let eye, target, showMarkers = true, tau = 0.5, contain = false, pov = null;
  if (type === SLOT_FRAMED) {
    const ti = baseShotTypeIndexNoRepeat(sch.idx, seed, aspect);
    if (BASE_SHOT_FNS[ti] === shotTripod) {
      // 三脚: ショット開始時(idxが変わった時)に世界座標の固定位置を保存し、以後は据え置き。
      // (包含のドリーバックが必要な場合のみ containEye が視線軸に沿って後退させる=包含優先)
      if (camSt.tripodIdx !== sch.idx || !camSt.tripodEye) {
        const d = framingDistance(dist2d, aspect) * 1.05;
        camSt.tripodEye = [midx + Math.cos(angleOff) * d, heightOff, midz + Math.sin(angleOff) * d];
        camSt.tripodIdx = sch.idx;
      }
      baseCtx.tripodEye = camSt.tripodEye;
    }
    const r = BASE_SHOT_FNS[ti](baseCtx);
    // 両機フレームショットのみハード保証: 目標カメラ自体を包含補正してから返す
    // (平滑化はこの補正後の目標へ向かう。残余のはみ出しは表示側の最終補正が受け持つ)。
    eye = containEye(r.eye, r.target, aspect, mechs);
    target = r.target;
    contain = true;
  } else if (type === SLOT_PROJ) {
    const r = shotProjectileFollow(proj, sch.localT, sch.dur);
    eye = r.eye; target = r.target; showMarkers = false;
    tau = 0.12; // 速い画: 追従を軽く(それでも高周波は落ちる)
  } else if (type === SLOT_POV) {
    const povSide = hash(sch.idx * 9.9 + seed + 3) < 0.5 ? 1 : -1;
    const r = shotPOV(a, b, povSide, tSec);
    eye = r.eye; target = r.target; showMarkers = false;
    pov = r.povIdx;   // 視点機インデックス(レンダラが自機メッシュを隠しコックピットHUDを出す)
    tau = 0.12;       // 一人称は頭部に追従(τが遅いと歩行速度×τぶんカメラが胴内に取り残される)
  } else if (type === SLOT_MELEE) {
    const r = shotMeleeClose(baseCtx);
    eye = r.eye; target = r.target; showMarkers = false;
  } else {
    // SLOT_SHOULDER(主力+各種フォールバック): 誰の肩か(自機60%/敵機40%)と左右をidxハッシュで。
    const overSelf = hash(sch.idx * 7.7 + seed + 6.6) < 0.6;
    const shSide = hash(sch.idx * 6.1 + seed + 7.7) < 0.5 ? -1 : 1;
    const r = overSelf ? shotOverShoulder(a, b, shSide) : shotOverShoulder(b, a, shSide);
    eye = r.eye; target = r.target; // 手前機のはみ出しは意図(マーカーは有効のまま)
  }

  // ⑥ イマジナリーラインの一方の側に保つ。POV は軸(A-B線)そのものの上=180度ルールの対象外とし、
  // 鏡映を免除する(横スウェイが線を跨ぐたび鏡映されて |sin| 状の不自然な片側往復になるのを避ける)。
  if (pov == null) eye = enforceLine(eye, a, b, camSt);
  return { eye, target, showMarkers, shotIdx: sch.idx, tau, contain, pov };
}

// シーンの全ワールド座標をアリーナ中心(ARENA_CX,ARENA_CZ)まわりに WORLD_SCALE 倍で相似縮小する。
// 機体サイズ・エフェクトサイズ・各種「高さ」は据え置き(機体が相対的に大きくなる)。手動カメラ(工廠プレビュー)は
// 機体が中心にあり縮小の影響を受けないため、そのまま。'auto'カメラは縮小後の機体位置から自動で寄る。
export function scaleScene(scene) {
  const S = WORLD_SCALE;
  if (S === 1) return scene;
  // 手動カメラ(工廠プレビュー)のシーンは座標を直接オーサリングしている(機体もカメラも同じ生座標)。
  // ここで機体位置だけ縮小するとカメラ注視点(縮小しない)とズレ、機体が原点から離れると画面外へ流れる。
  // 手動カメラ時は縮小を一切かけない=機体とカメラの座標系を一致させる(battleは常にauto=この分岐に入らない)。
  if (scene.camera && Array.isArray(scene.camera.eye)) return scene;
  const sx = (v) => ARENA_CX + ((v == null ? ARENA_CX : v) - ARENA_CX) * S;
  const sz = (v) => ARENA_CZ + ((v == null ? ARENA_CZ : v) - ARENA_CZ) * S;
  const out = { ...scene };
  if (scene.mechs) out.mechs = scene.mechs.map((m) => ({ ...m, x: sx(m.x), y: sz(m.y) }));
  if (scene.shots) out.shots = scene.shots.map((s) => ({ ...s, x: sx(s.x), y: sz(s.y), tx: s.tx != null ? sx(s.tx) : s.tx, ty: s.ty != null ? sz(s.ty) : s.ty }));
  if (scene.blasts) out.blasts = scene.blasts.map((b) => ({ ...b, x: sx(b.x), y: sz(b.y) }));
  if (scene.obstacles) out.obstacles = scene.obstacles.map((o) => ({ ...o, x: sx(o.x), y: sz(o.y), r: o.r != null ? o.r * S : o.r }));
  if (scene.camCut) out.camCut = { ...scene.camCut, x: sx(scene.camCut.x), y: sz(scene.camCut.y) };
  return out;
}

// 旧・自作ソフトウェアラスタライザ createR3D は St2第3段完了をもって撤去(人間承認 2026-07-24)。
// 観戦3Dは Three 版(r3d-three.js)のみ。姿勢/演出の共有関数群(computeMechPose・poseMechFaces・
// SHOT_STYLES 系・obstacleWorldFaces・カメラ director)はこのファイルが唯一の真実として残る。
