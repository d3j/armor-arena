// 鋼機工廠 — 決定論戦闘シミュレーション Ver4(pure ESM・DOM非依存・Math.random禁止)
// フロント(観戦再生)と Worker(サーバ権威対戦)が同一コードを共有する。
// Ver2: バトルフィールド(壁/泥/トゲ・射線遮断・破壊)・弾数・攻撃3段ロール(外れ/回避/パリィ)。
// Ver4: 全高4.2m級スケール・武器帯域(bandMult)・部位破壊(pd)・被弾ノックバック・
//        適応交戦距離(撃ち負け側が距離を変える)・ミサイル近接自爆。
// Ver6: 弾速別回避(evadeMult=遅弾ほど躱しやすくビーム/レールは貫く)・爆発弾の割れダメージ
//        (ミサイル回避でもsplash%)・パリィ後の反撃窓(riposte=次射に命中/威力ボーナス+踏み込み)。
//        いずれも3段ロールのrng呼出数を変えない=決定論不変(掟3)。
// Ver7(REPLAY_V=5): 小障害物 rubble=踏破可能。乗っている間だけ 速度×CLIMB_FACTOR[脚種] /
//        回避↓ / 命中↑(標高 h による露出と見晴らし)。ハザード認知に「渡る/迂回」に次ぐ
//        第3の選択肢「乗る」を足した。rng は一切増やしていない(判断は機体状態のみ)。
import { deriveStats, bandMult, BANDS } from './parts.js';
import { getField, MUD_FACTOR, SPIKE_DPS, MUD_SINK, losBlockedBy, CLIMB_FACTOR,
         CLIMB_EVA_PENALTY, CLIMB_ACC_BONUS, CLIMB_TOP_FRAC, climbExposure } from './fields.js';
export { losBlockedBy } from './fields.js';
export { validateBuild } from './parts.js';
export { FIELDS, getField } from './fields.js';

export const ARENA = 1000;      // m四方(rect基準)
export const DT = 0.05;         // シム刻み
export const SAMPLE = 0.1;      // states サンプル間隔
export const TMAX = 180;        // 最長試合時間(秒)
const MECH_R = 2.2;             // 機体の衝突半径(全高4.2m級)

// ---- Ver4: 部位破壊(pd = [腕R,腕L,脚,炉,胴] 各0健在/1小破/2中破/3大破) ----
export const PART_KEYS = ['armR', 'armL', 'legs', 'gen', 'body'];
export const PART_JA = { armR: '右腕', armL: '左腕', legs: '脚部', gen: '動力炉', body: '胴体' };
export const LVL_JA = ['', '小破', '中破', '大破'];
const LEG_SPD = [1, 0.88, 0.72, 0.5];      // 脚損傷 → 速度倍率
const LEG_EVA = [1, 0.85, 0.65, 0.4];      // 脚損傷 → 回避倍率
const GEN_OUT = [1, 0.85, 0.65, 0.42];     // 炉損傷 → EN出力倍率
const ARM_ACC = [0, -0.06, -0.14, -1];     // 腕損傷 → 命中加算(大破は発射不能)

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angNorm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const isMelee = (w) => w.kind === 'blade' || w.kind === 'drill';
const isParryableRanged = (w) => w.kind === 'rifle' || w.kind === 'shotgun' || w.kind === 'rocketpunch';

// Ver6: 弾速→回避係数。速い弾ほど躱しづらい(<1)、遅い弾ほど躱しやすい(>1)。
// beam/即着(projSpeed=0)は「光速級=横っ飛びの間に合わない」で最小、railgun(超音速)も低め、
// 実弾は600m/s基準で1.0、それ以下(散弾450/ミサイル175等)を緩やかに持ち上げる。距離には依存させない
// (帯域bandMultが既に距離で命中/威力を削っており、飛翔時間を足すと遠距離が二重に弱る)。
export function evadeMult(w) {
  if (w.kind === 'beam' || w.projSpeed === 0) return 0.80;   // ビーム=即着、横っ飛びが間に合わない
  if (w.kind === 'railgun') return 0.85;                     // 超高速の一撃、避けづらい
  const ps = w.projSpeed || 600;
  if (ps >= 600) return 1.00;                                // ライフル級以上は素の回避
  return clamp(1.00 + (600 - ps) / 425 * 0.15, 1.00, 1.15);  // 遅弾ほど+(下限175m/s=+0.15)
}

function mkMech(build, x, y, h, pilot) {
  const st = deriveStats(build);
  if (!st.valid) throw new Error('invalid build: ' + st.errors.join(','));
  const wpns = [st.parts.wr, st.parts.wl].map(w => ({
    def: w, t: 0.5 + w.cooldown * 0.3,
    a: (w.ammo == null ? Infinity : w.ammo),       // 残弾(∞=EN/近接兵装)
    dry: false,
  }));
  return { build, st, ai: st.parts.ai, x, y, h, hp: st.hp, en: st.enCap, wpns,
           pilotAcc: (pilot && pilot.acc) || 0, pilotEva: (pilot && pilot.eva) || 0,
           alive: true, walk: 0, strafePhase: 0, spdNow: 0, hzAcc: 0, hzT: 0, stance: 'hd',
           hzSide: 0, hzAt: -9, hzEscOn: false,       // ハザード迂回方向ラッチ+脱出ヒステリシス(振動防止)
           hzWant: 0, hzWantAt: -9,                   // 「踏む意欲」の慣性(判断の毎tick反転防止)
           climbH: 0, footY: 0,                       // Ver7: 足場の標高(climbH=露出用の正値 / footY=描画用。泥は負)
           climbOn: false, climbAt: -9,               // 「踏破」電文のヒステリシス+クールダウン
           pd: [0, 0, 0, 0, 0],                       // 部位状態(armR,armL,legs,gen,body)
           curEngage: st.parts.ai.engage, cand: null, candIdx: 0,   // 適応交戦距離
           riposteUntil: -1,                          // Ver6: パリィ後の反撃窓の終了時刻
           dIn: 0, dOut: 0, epochT: 0, dmgCum: 0 };   // 5秒エポックの被与ダメ・累計与ダメ
}

// 命中(射手側)ロール確率 — 帯域倍率+腕損傷ペナルティ
function pAcc(w, dist, shooter, slot) {
  const bm = bandMult(w, dist);
  if (bm.acc <= 0) return 0;
  // 照準補正(脚)は帯域倍率の内側: 帯域外では台座が安定していても照準系が追いつかない
  // (帯域内 bm.acc=1 では従来と同値。加算だと帯域外射撃がペナルティを踏み倒せてしまう)
  // Ver7: 高所からの射撃は見晴らしのぶん当てやすい(俯角+遮蔽の切れ目が見える)
  return clamp((w.acc + shooter.st.aimBonus) * bm.acc + (shooter.pilotAcc || 0) + ARM_ACC[shooter.pd[slot]]
               + CLIMB_ACC_BONUS * climbExposure(shooter.climbH),
               0.05, 0.97);
}
// 回避(目標側)ロール確率 — 今の移動速度でスケール(×0.6スケール後の基準36m/s)+脚損傷+弾速係数
// Ver7: 瓦礫の上に居る間は露出が大きい(足場が悪く、シルエットが空に抜ける)= 躱せない。
function pDodge(target, w) {
  const ms = 0.6 + 0.8 * clamp((target.spdNow || 0) / 36, 0, 1);
  const em = w ? evadeMult(w) : 1;
  const cl = 1 - CLIMB_EVA_PENALTY * climbExposure(target.climbH);
  return clamp(target.st.evasion * LEG_EVA[target.pd[2]] * ms * em * cl + (target.pilotEva || 0), 0, 0.62);
}
// パリィ(目標側)— melee武器を持ち EN が足りるとき
function pParry(w, target) {
  const hasMelee = target.wpns.some(wp => isMelee(wp.def));
  if (!hasMelee || target.en < 6) return 0;
  if (isMelee(w)) return 0.30;
  if (isParryableRanged(w)) return 0.10;
  return 0;   // beam/railgun/missile は弾けない
}

// 延長線上の壁(距離 from〜to の範囲で最初に当たる壁)— 流れ弾の着弾先
function rayWall(x, y, ux, uy, from, to, walls) {
  let best = null, bestT = Infinity;
  for (const o of walls) {
    if (!o.alive) continue;
    const relx = o.x - x, rely = o.y - y;
    const t = relx * ux + rely * uy;              // 射線上の射影距離
    if (t < from || t > to) continue;
    const d = Math.hypot(relx - ux * t, rely - uy * t);
    if (d < o.r && t < bestT) { best = o; bestT = t; }
  }
  return best ? { wall: best, t: bestT } : null;
}

function shapeClamp(me, shape) {
  if (shape.kind === 'circle') {
    const dx = me.x - shape.cx, dy = me.y - shape.cy;
    const d = Math.hypot(dx, dy) || 1;
    const maxR = shape.r - 20;
    if (d > maxR) { me.x = shape.cx + dx / d * maxR; me.y = shape.cy + dy / d * maxR; }
  } else {
    me.x = clamp(me.x, 20, (shape.w || ARENA) - 20);
    me.y = clamp(me.y, 20, (shape.h || ARENA) - 20);
  }
}

// buildA/buildB: build オブジェクト。seed: 32bit int。
// opts: { nameA, nameB, fieldId }
export function simulate(buildA, buildB, seed, opts = {}) {
  const rng = mulberry32(seed >>> 0);
  const names = [opts.nameA || 'α機', opts.nameB || 'β機'];
  const field = getField(opts.fieldId);
  // 障害物の実行時状態(hpはコピー)
  const obs = field.obstacles.map((o, i) => ({ kind: o.kind, x: o.x, y: o.y, r: o.r, h: o.h || 0,
    hp: o.hp, hp0: o.hp, alive: true, idx: i }));
  const walls = obs.filter(o => o.kind === 'wall');
  const muds = obs.filter(o => o.kind === 'mud');
  const spikes = obs.filter(o => o.kind === 'spike');
  const rubbles = obs.filter(o => o.kind === 'rubble');
  // 「進路上で判断が要る地形」= 泥/棘/瓦礫。渡る・迂回する・乗る、の3択をここで回す。
  const hzds = obs.filter(o => o.kind === 'mud' || o.kind === 'spike' || o.kind === 'rubble');

  const pilots = opts.pilots || [];
  // 初期配置: seed由来の中心対称ランダム(=公平)。障害物から25m超・境界内を8回試行、失敗時は従来の水平配置
  const cx0 = field.shape.kind === 'circle' ? field.shape.cx : (field.shape.w || ARENA) / 2;
  const cy0 = field.shape.kind === 'circle' ? field.shape.cy : (field.shape.h || ARENA) / 2;
  let sx = 220, sy = 0;
  for (let tries = 0; tries < 8; tries++) {
    const th = rng() * Math.PI * 2;
    const ox = Math.cos(th) * 220, oy = Math.sin(th) * 220;
    const pts = [[cx0 - ox, cy0 - oy], [cx0 + ox, cy0 + oy]];
    const okPos = pts.every(([px, py]) => {
      if (field.shape.kind === 'circle') {
        if (Math.hypot(px - field.shape.cx, py - field.shape.cy) > field.shape.r - 40) return false;
      } else if (px < 40 || py < 40 || px > (field.shape.w || ARENA) - 40 || py > (field.shape.h || ARENA) - 40) return false;
      // 瓦礫は踏破可能なので余裕を詰める(25m を課すと小障害物を増やした戦場でスポーンが通らなくなる)。
      // 0 にはしない=開幕から露出ペナルティを背負って始まるのは不公平(配置は中心対称でも瓦礫は非対称)。
      return obs.every(o => Math.hypot(px - o.x, py - o.y) > o.r + (o.kind === 'rubble' ? 6 : 25));
    });
    if (okPos) { sx = ox; sy = oy; break; }
  }
  const m = [mkMech(buildA, cx0 - sx, cy0 - sy, Math.atan2(sy, sx), pilots[0]),
             mkMech(buildB, cx0 + sx, cy0 + sy, Math.atan2(-sy, -sx), pilots[1])];
  m[0].strafePhase = rng() * 6.28; m[1].strafePhase = rng() * 6.28;
  shapeClamp(m[0], field.shape); shapeClamp(m[1], field.shape);
  // 適応交戦距離の候補(自武器の帯中心+AI既定。seedシャッフル=決定論)
  for (const k of m) {
    const cands = [];
    for (const wp of k.wpns) {
      const w = wp.def;
      if (w.band === 'melee') cands.push(Math.max(6, w.range * 0.7));
      else { const b = BANDS[w.band] || BANDS.mid; cands.push(Math.min((b.min + b.max) / 2, w.range * 0.9)); }
    }
    cands.push(k.ai.engage);
    for (let a2 = cands.length - 1; a2 > 0; a2--) {
      const j2 = Math.floor(rng() * (a2 + 1));
      const tmp = cands[a2]; cands[a2] = cands[j2]; cands[j2] = tmp;
    }
    k.cand = cands;
  }

  const events = [];
  const states = [];
  const pending = [];   // 着弾待ち { tImpact, type:'shot'|'obshit', ... }
  const groups = [];    // 点射グループ(ログ集約用)
  const ev = (t, kind, extra) => { const e = Object.assign({ t: Math.round(t * 10) / 10, kind }, extra); events.push(e); return e; };

  ev(0, 'spawn', { who: 0, x: m[0].x, y: m[0].y });
  ev(0, 'spawn', { who: 1, x: m[1].x, y: m[1].y });

  let t = 0, winner = -1, endReason = 'time';
  let nextSample = 0, nextPhaseLog = 60, nextDmgSample = 0;
  const dmgHist = [];   // [t, 与ダメ累計A, 与ダメ累計B] を1秒毎(逃げ回り=時間切れ引き分け判定)

  while (t < TMAX && m[0].alive && m[1].alive) {
    // --- サンプル ---
    if (t >= nextSample - 1e-9) {
      states.push({ t: Math.round(t * 10) / 10,
        m: m.map(k => {
          const s0 = { x: Math.round(k.x * 10) / 10, y: Math.round(k.y * 10) / 10,
                       h: Math.round(k.h * 100) / 100, hp: Math.round(k.hp), en: Math.round(k.en),
                       s: k.stance, a: k.wpns.map(w => w.a === Infinity ? -1 : w.a),
                       pd: k.pd.slice() };
          // cy=足元の標高オフセット(描画側が機体を持ち上げる/沈める)。0のときは載せない=
          // 毎サンプルの "cy":0 は states 全体で数十KBになり、サーバ権威対戦の応答をただ太らせる。
          if (k.footY !== 0) s0.cy = Math.round(k.footY * 100) / 100;
          return s0;
        }) });
      nextSample += SAMPLE;
    }
    // --- スナップショットからAI決定 ---
    const snap = m.map(k => ({ x: k.x, y: k.y }));
    for (let i = 0; i < 2; i++) {
      const me = m[i], foe = snap[1 - i], foeM = m[1 - i];
      const dx = foe.x - me.x, dy = foe.y - me.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const lgKind = me.st.parts.lg.kind;

      // 弾切れ・腕大破時の戦術変更: melee持ちは肉薄・丸腰は離脱
      const usableRanged = me.wpns.some((wp, s2) => wp.def.range > 120 && wp.a > 0 && me.pd[s2] < 3);
      const hasMelee = me.wpns.some((wp, s2) => isMelee(wp.def) && me.pd[s2] < 3);
      let engage = me.curEngage, aggr = me.ai.aggression, kite = me.ai.kite;
      // 追撃: 明確に削り勝っているなら逃げずに押し切る(低HP同士が互いに回避して膠着するのを防ぐ)
      if (foeM.hp / foeM.st.hp < (me.hp / me.st.hp) * 0.75) { kite = false; aggr = clamp(aggr + 0.35, 0, 1); }
      if (t < me.riposteUntil) { kite = false; aggr = clamp(aggr + 0.3, 0, 1); }   // Ver6: 弾いた直後は踏み込む
      if (!usableRanged) {
        if (hasMelee) { engage = 7; aggr = 1; kite = false; }
        else { engage = 720; kite = true; }
      }

      const err = dist - engage;
      const db = clamp(engage * 0.3, 6, 40);   // 交戦距離に比例するデッドバンド(白兵の間合いを潰さない)
      let fwd = 0;
      if (err > db) fwd = 0.55 + 0.45 * aggr;
      else if (err < -db) fwd = -0.8;
      else if (err > 0 && engage < 20) fwd = 0.35;   // 白兵の詰め(間合いの内側まで匍匐)
      const minCost = Math.min(me.wpns[0].def.encost, me.wpns[1].def.encost);
      const reloading = me.wpns[0].t > 0.3 && me.wpns[1].t > 0.3;
      if (kite && (reloading || me.en < minCost) && dist < engage * 1.25) fwd = -0.8;
      const flee = kite && dist < engage * 0.55 && me.en > me.st.enCap * 0.25;
      // 戦術状態(HUD表示用): fl=離脱 ru=突撃 ev=回避行動 ap=接近 bk=後退 hd=距離維持
      me.stance = flee ? 'fl' : (!usableRanged ? (hasMelee ? 'ru' : 'ev') : fwd > 0 ? 'ap' : fwd < 0 ? 'bk' : 'hd');

      // 射線チェック(壁越しには撃てない → 撃てる側へ回り込む)
      const blocker = walls.length ? losBlockedBy(me.x, me.y, foe.x, foe.y, walls) : null;
      let sw = Math.sin(t * 0.55 + me.strafePhase) > 0 ? 1 : -1;
      if (blocker) {
        // 壁中心が射線からずれている側へさらにずれる(正帰還)=最短で射線が開く。
        // 逆符号だと「壁を射線の中心に保つ」平衡に吸着して永久に撃てなくなる(実測でハマった)
        const cross = (blocker.x - me.x) * dy - (blocker.y - me.y) * dx;
        sw = cross > 0 ? 1 : -1;
      }
      const strafe = (err > 120 && !blocker ? 0.22 : 0.5) * sw;

      const effSpeed = me.st.speed * LEG_SPD[me.pd[2]];   // 脚損傷で減速
      let vx, vy, spd;
      if (flee) {
        const cx0 = field.shape.kind === 'circle' ? field.shape.cx : (field.shape.w || ARENA) / 2;
        const cy0 = field.shape.kind === 'circle' ? field.shape.cy : (field.shape.h || ARENA) / 2;
        let ax = -ux + (cx0 - me.x) / 700, ay = -uy + (cy0 - me.y) / 700;
        const al = Math.hypot(ax, ay) || 1;
        spd = effSpeed;
        vx = ax / al * spd; vy = ay / al * spd;
      } else {
        vx = (ux * fwd - uy * strafe); vy = (uy * fwd + ux * strafe);
        if (fwd < 0) {
          // 後退にも flee 同様の中央寄せをブレンド(直線後退は角に詰まり、距離を潰されて死ぬ)
          const ccx = field.shape.kind === 'circle' ? field.shape.cx : (field.shape.w || ARENA) / 2;
          const ccy = field.shape.kind === 'circle' ? field.shape.cy : (field.shape.h || ARENA) / 2;
          vx += (ccx - me.x) / 800; vy += (ccy - me.y) / 800;
        }
        const vlen = Math.hypot(vx, vy) || 1;
        spd = effSpeed * clamp(Math.abs(fwd) + 0.35, 0.75, 1);
        if (fwd > 0 && err > 150) spd *= 1.12;   // 突撃スプリント(間合いが遠いときの詰め)
        if (fwd < 0) spd *= 0.45;
        vx = vx / vlen * spd; vy = vy / vlen * spd;
        // 遮蔽経由の接近: 長距離を詰めるときは「自分と敵の間に壁が来る影の点」へ操舵をブレンド
        if (fwd > 0 && err > 150 && walls.length) {
          let best = null, bestD = 320;
          for (const o of walls) {
            if (!o.alive) continue;
            const d0 = Math.hypot(o.x - me.x, o.y - me.y);
            const tproj = ((o.x - me.x) * dx + (o.y - me.y) * dy) / (dist * dist);
            if (d0 < bestD && tproj > 0.05 && tproj < 0.9) { best = o; bestD = d0; }
          }
          if (best) {
            const fdx = best.x - foe.x, fdy = best.y - foe.y;
            const fl = Math.hypot(fdx, fdy) || 1;
            const px2 = best.x + fdx / fl * (best.r + 50), py2 = best.y + fdy / fl * (best.r + 50);
            const sdx = px2 - me.x, sdy = py2 - me.y;
            const sl = Math.hypot(sdx, sdy) || 1;
            if (sl > 12) {
              vx = vx * 0.65 + sdx / sl * spd * 0.35; vy = vy * 0.65 + sdy / sl * spd * 0.35;
              const vl2 = Math.hypot(vx, vy) || 1; vx = vx / vl2 * spd; vy = vy / vl2 * spd;
            }
          }
        }
      }
      // ハザード認知: 進行方向の泥/棘/瓦礫を「踏む価値」で判定し、価値が無ければ接線迂回。
      // hover は免疫=常に直進。判断は機体状態のみから決まる(rng不使用=呼出数不変)。
      // ジレンマ(不利承知で突っ込む)は fields.js の配置(近道=危険地帯)とこの判断の積で生まれる。
      if (lgKind !== 'hover' && hzds.length && spd > 0.01) {
        // 踏む意欲: 攻勢・遠い間合いを詰めたい・追い込み・反撃窓・白兵専は前へ出たい。逃走中はゼロ。
        let want = 0.2 * aggr;
        if (fwd > 0) want += clamp(err / 400, 0, 0.25);
        if (foeM.hp / foeM.st.hp < 0.4) want += 0.15;
        if (t < me.riposteUntil) want += 0.2;
        if (!usableRanged && hasMelee) want += 0.25;
        // 意思の慣性: 1.5秒ごとにのみ更新。fwd/追撃の項が接敵境界で毎tick反転して
        // 「渡る/引き返す」を高頻度で往復する判断フリッカーの防止(状態のみ=決定論)
        if (t - me.hzWantAt >= 1.5) { me.hzWant = want; me.hzWantAt = t; }
        want = me.hzWant;
        if (flee) want = 0;
        const uvx = vx / spd, uvy = vy / spd;
        let steer = null, steerT = Infinity, esc = null, rpx = 0, rpy = 0;
        for (const o of hzds) {
          if (o.alive === false) continue;
          const relx = o.x - me.x, rely = o.y - me.y;
          const d0 = Math.hypot(relx, rely);
          const margin = o.r + 8;
          // 踏む価値: 泥=脚種係数(速いほど失う時間が少ない)+意欲 / 棘=横断被弾の見込みと残HPの体力勘定
          // 瓦礫=踏破係数+意欲+「高所から撃ちたい」−「回避を捨てる損」。回避が持ち味の機体ほど
          // 乗る価値が下がるので、同じ瓦礫でも履帯は乗り、跳兵は避ける=脚種で選択が分かれる。
          let cross, halo = 26;
          if (o.kind === 'mud') {
            cross = (MUD_FACTOR[lgKind] != null ? MUD_FACTOR[lgKind] : 0.6) + want >= 0.85;
          } else if (o.kind === 'rubble') {
            const cf = CLIMB_FACTOR[lgKind] != null ? CLIMB_FACTOR[lgKind] : 0.72;
            const e = climbExposure(o.h);
            // 見晴らしは「撃ち合える距離に居て、撃てる遠距離武器がある」ときだけ値が付く
            const perch = (usableRanged && dist < 340) ? 0.55 * e : 0;
            const expo = 1.35 * e * clamp(me.st.evasion / 0.34, 0, 1.2);
            cross = cf + want + perch - expo >= 0.85;
            halo = 12;   // 小さいので斥力圏も小さい(26mだと瓦礫だらけの戦場が斥力の海になる)
          } else {
            const dmgEst = SPIKE_DPS * (2 * o.r) / Math.max(spd, 6);   // 直径横断の被弾見込み
            cross = me.hp > dmgEst * 4 && want >= 0.3;
          }
          if (cross) continue;
          const edge = d0 - o.r;                            // 縁からの距離(負=内側)
          if (esc == null || edge < esc.edge) {
            esc = { edge, ux: relx / (d0 || 1), uy: rely / (d0 || 1) };
          }
          if (edge >= 0 && edge < halo) {
            // 縁に貼りつく振動対策: 踏まないと決めた地帯には近づくだけで緩い斥力(壁回避と同思想・弱め)
            const push = (1 - edge / halo) * 1.0;
            rpx += (me.x - o.x) / d0 * push; rpy += (me.y - o.y) / d0 * push;
          }
          const tAhead = relx * uvx + rely * uvy;           // 進行方向への射影距離(中心まで)
          const tEdge = Math.max(0, tAhead - o.r);          // 縁までの残り(大径の泥円でも縁基準で発動)
          if (tAhead < 0 || tEdge > 110 || tEdge >= steerT) continue;
          const lz = uvx * rely - uvy * relx;               // +なら中心は進路の左
          if (Math.abs(lz) >= margin) continue;             // 衝突コースでない
          steer = { lz, margin, tEdge }; steerT = tEdge;
        }
        // 脱出ヒステリシス: 一度踏んだら縁から10m離れるまで外向きに抜ける
        // (縁±1mで「脱出→即再突入」を毎tick繰り返す極限サイクルの防止。泥円の継ぎ目のくぼみで実測)
        if (esc && esc.edge < 0) me.hzEscOn = true;
        else if (!esc || esc.edge > 10) me.hzEscOn = false;
        if (esc && me.hzEscOn) { vx = -esc.ux * spd; vy = -esc.uy * spd; }
        else {
          let nvx = uvx, nvy = uvy;
          if (steer) {
            // 中心が居る側と逆へ旋回(接線迂回)。近く・正面ほど強く曲げる。
            // 迂回の側は3秒間グローバルに保持: 重なった泥円の継ぎ目で2円が交互に最寄りになると
            // 旋回が打ち消し合いくぼみに嵌まる+ストレイフ正弦で左右が毎周期反転する、の両振動を防ぎ
            // 「帯全体を一つの塊として同じ側へ滑る」挙動にする(ラッチは機体状態のみ=決定論)
            let side = steer.lz > 0 ? -1 : 1;               // -1=右旋回 / +1=左旋回
            if (me.hzSide !== 0 && t - me.hzAt < 3) side = me.hzSide;
            else me.hzAt = t;                               // 3秒ごとに側を再評価
            me.hzSide = side;
            const px2 = side === 1 ? -uvy : uvy, py2 = side === 1 ? uvx : -uvx;
            const k = (1 - Math.abs(steer.lz) / steer.margin) * (1 - steer.tEdge / 110);
            nvx += px2 * (0.5 + 1.5 * k); nvy += py2 * (0.5 + 1.5 * k);
          }
          nvx += rpx; nvy += rpy;
          if (steer || rpx !== 0 || rpy !== 0) {
            const nl = Math.hypot(nvx, nvy) || 1;
            vx = nvx / nl * spd; vy = nvy / nl * spd;
          }
        }
      }
      // 泥: 脚種別の速度低下(hoverは免疫)
      let mudded = false;
      for (const o of muds) { if (Math.hypot(me.x - o.x, me.y - o.y) < o.r) { mudded = true; break; } }
      const mudF = lgKind === 'hover' ? 1 : (MUD_FACTOR[lgKind] != null ? MUD_FACTOR[lgKind] : 0.6);
      if (mudded) { vx *= mudF; vy *= mudF; spd *= mudF; }
      // 足元の標高オフセット(m): 瓦礫に乗れば+、泥に沈めば−。hover はどちらも起きない(浮いている)。
      //   瓦礫 … 乗り越えている間は減速し、そのぶん高くなる。重なりはいちばん高い足場を採る。
      //   泥   … 脚を取られる脚種ほど深く沈む。**なぜ遅いのかを目で見せる**ための値で、
      //          当たり判定は変えない(露出率は正の標高だけを読む=沈んでも的は小さくならない)。
      let footY = 0;
      if (lgKind !== 'hover') {
        let onRubble = false;
        for (const o of rubbles) {
          const d0 = Math.hypot(me.x - o.x, me.y - o.y);
          if (d0 >= o.r) continue;
          onRubble = true;
          // 標高は縁に向けて落とす。天端(CLIMB_TOP_FRAC×r)までが平らで、そこから縁で0。
          // 描画の塚と同じ形なので「斜面の上に浮く」が起きない。重なりはいちばん高い所を採る。
          const y = o.h * clamp((1 - d0 / o.r) / (1 - CLIMB_TOP_FRAC), 0, 1);
          if (y > footY) footY = y;
        }
        if (onRubble) {
          // 踏破の重さは円の全体にかかる(瓦礫の上は縁でも一様に歩きにくい)。
          // 高いのは真ん中だけ=丘の頂上に立った者だけが露出と見晴らしを引き受ける。
          const cf = CLIMB_FACTOR[lgKind] != null ? CLIMB_FACTOR[lgKind] : 0.72;
          vx *= cf; vy *= cf; spd *= cf;
        } else if (mudded) {
          footY = -MUD_SINK * (1 - mudF);
        }
      }
      // 電文に出す「踏破」は天端に達した瞬間だけ。縁を出入りするたび鳴らないよう
      // ヒステリシス(1.5で入り1.0で抜ける)+3秒のクールダウン(状態のみ=決定論)。
      if (footY >= 1.5) {
        if (!me.climbOn) {
          me.climbOn = true;
          if (t - me.climbAt >= 3) { me.climbAt = t; ev(t, 'climb', { who: i, h: Math.round(footY * 100) / 100, x: me.x, y: me.y }); }
        }
      } else if (footY < 1.0) me.climbOn = false;
      me.climbH = footY > 0 ? footY : 0;   // 露出/見晴らしの入力は正の標高だけ
      me.footY = footY;
      // 壁の回避(斥力)
      for (const o of walls) {
        if (!o.alive) continue;
        const d0 = Math.hypot(me.x - o.x, me.y - o.y);
        const rr = o.r + 46;
        if (d0 < rr && d0 > 1) {
          const push = (rr - d0) / 46 * effSpeed * 0.9;
          vx += (me.x - o.x) / d0 * push; vy += (me.y - o.y) / d0 * push;
        }
      }
      me.x += vx * DT; me.y += vy * DT;
      // 壁との衝突解決
      for (const o of walls) {
        if (!o.alive) continue;
        const d0 = Math.hypot(me.x - o.x, me.y - o.y);
        if (d0 < o.r + MECH_R && d0 > 0.01) {
          me.x = o.x + (me.x - o.x) / d0 * (o.r + MECH_R);
          me.y = o.y + (me.y - o.y) / d0 * (o.r + MECH_R);
        }
      }
      shapeClamp(me, field.shape);
      me.spdNow = spd;
      me.walk += spd * DT;
      // トゲ: 8dps(hover免疫)。1秒集約で hazard イベント
      if (lgKind !== 'hover') {
        for (const o of spikes) {
          if (Math.hypot(me.x - o.x, me.y - o.y) < o.r) { me.hzAcc += SPIKE_DPS * DT; break; }
        }
      }
      me.hzT += DT;
      if (me.hzT >= 1.0) {
        me.hzT = 0;
        if (me.hzAcc >= 1) {
          const dmg = Math.round(me.hzAcc); me.hzAcc = 0;
          me.hp -= dmg;
          ev(t, 'hazard', { who: i, dmg, remain: Math.max(0, Math.round(me.hp)), x: me.x, y: me.y });
          if (me.hp <= 0 && me.alive) {
            me.alive = false; winner = 1 - i; endReason = 'hazard';
            ev(t, 'destroyed', { who: i, by: -1, x: me.x, y: me.y });
          }
        }
      }
      if (!me.alive) break;

      const dAng = angNorm((flee ? Math.atan2(vy, vx) : Math.atan2(dy, dx)) - me.h);
      me.h = angNorm(me.h + clamp(dAng, -me.st.turn * DT, me.st.turn * DT));
      const effOut = me.st.parts.gn.output * GEN_OUT[me.pd[3]] - me.st.parts.lg.drain;  // 炉損傷で出力低下
      me.en = clamp(me.en + (effOut - (flee ? 18 : 0)) * DT, 0, me.st.enCap);

      // 適応交戦距離(5秒エポック): 撃ち負けている側は距離を変える。そうでなくても微ドリフト
      me.epochT += DT;
      if (me.epochT >= 5 - 1e-9) {
        me.epochT = 0;
        if (me.dIn > me.dOut * 1.35 + 15) {
          me.candIdx++;
          const next = me.cand[me.candIdx % me.cand.length];
          if (Math.abs(next - me.curEngage) > 15) ev(t, 'shift', { who: i, dist: Math.round(next) });
          me.curEngage = next;
        } else {
          me.curEngage = clamp(me.curEngage * (0.92 + 0.16 * rng()), 6, 700);
        }
        me.dIn = 0; me.dOut = 0;
      }

      // --- 射撃 ---
      const facing = Math.abs(dAng) < 1.1;
      for (let s2 = 0; s2 < me.wpns.length; s2++) {
        const wp = me.wpns[s2];
        wp.t -= DT;
        if (wp.t > 0) continue;
        const w = wp.def;
        if (me.pd[s2] >= 3) continue;                 // 腕大破=その武器は使えない
        if (!facing || dist > w.range || me.en < w.encost) continue;
        if (wp.a <= 0) continue;
        // ミサイルのアーミング距離未満: 他に「安全に使える」武器がある限り撃たない(自爆回避)
        const underArm = w.kind === 'missile' && dist < (w.arm || 0);
        if (underArm) {
          const o2 = me.wpns[1 - s2];
          const o2ok = o2 && o2.a > 0 && me.pd[1 - s2] < 3 && dist <= o2.def.range &&
                       !(o2.def.kind === 'missile' && dist < (o2.def.arm || 0));   // 相方もアーム内ミサイルなら頼れない
          if (o2ok) continue;
        }
        // 射線: ミサイルは越える。近接(range≤120)は影に入らない限り成立
        if (w.kind !== 'missile' && w.range > 120 && blocker) continue;
        me.en -= w.encost; wp.t = w.cooldown;
        // Ver6: パリィ後の反撃窓(riposte)。弾いた直後の一斉射だけ命中+/威力×。追加rngなし=決定論不変。
        const riposte = t < me.riposteUntil;
        if (riposte) me.riposteUntil = -1;
        const accBonus = riposte ? 0.15 : 0;
        const dmgMul = riposte ? 1.3 : 1;
        const rounds = wp.a === Infinity ? w.burst : Math.min(w.burst, wp.a);
        if (wp.a !== Infinity) {
          wp.a -= rounds;
          if (wp.a <= 0 && !wp.dry) { wp.dry = true; ev(t, 'ammo_out', { who: i, wpn: w.kind, wname: w.name }); }
        }
        const group = { t, si: i, wname: w.name, kind: w.kind, dist,
          nHit: 0, dmgSum: 0, nDodge: 0, nParry: 0, nMiss: 0, nSplash: 0, splashSum: 0, remain: 0, n: rounds };
        groups.push(group);
        ev(t, 'fire', { who: i, targ: 1 - i, wpn: w.kind, wname: w.name, burst: rounds,
                        slot: s2,   // 0=右腕 1=左腕(3Dの攻撃モーション用)
                        rip: riposte ? 1 : 0,   // 反撃射(実況/演出用)
                        x: me.x, y: me.y, tx: foeM.x, ty: foeM.y, dist: Math.round(dist) });
        const bm = bandMult(w, dist);
        for (let j = 0; j < rounds; j++) {
          const tFire = t + j * 0.12;
          const fly = w.projSpeed > 0 ? dist / w.projSpeed : 0;
          // 3段ロール: 外れ → 回避 → パリィ(riposte窓は命中率に加点。rng呼数は不変)
          let outcome = 'hit';
          if (rng() > clamp(pAcc(w, dist, me, s2) + accBonus, 0.05, 0.97)) outcome = 'miss';
          else if (rng() < pDodge(foeM, w)) outcome = 'dodge';
          else if (rng() < pParry(w, foeM)) { outcome = 'parry'; foeM.en = Math.max(0, foeM.en - 6); }
          // ダメージ(帯域倍率×装甲×反撃倍率。ドリルは装甲貫通=defenseの40%を無視)
          const defEff = foeM.st.defense * (1 - (w.pierce || 0));   // pierce=装甲貫通率(ドリル/溶断系)
          const dmg = Math.round(w.dmg * bm.dmg * dmgMul * (1 - defEff));
          pending.push({ type: 'shot', tImpact: tFire + fly, si: i, ti: 1 - i, w, outcome, dmg, group,
                         kx: ux, ky: uy });   // ノックバック方向(射線)
          // 外れ/回避弾は延長線上の壁に当たり得る(流れ弾で遮蔽物が壊れる)
          if ((outcome === 'miss' || outcome === 'dodge') && w.projSpeed > 0 && walls.length) {
            const hitW = rayWall(me.x, me.y, ux, uy, dist + 12, dist + 260, walls);
            if (hitW) pending.push({ type: 'obshit', tImpact: tFire + hitW.t / w.projSpeed,
              wall: hitW.wall, dmg: Math.round(w.dmg), si: i });
          }
        }
        // アーミング距離未満での発射=自爆スプラッシュ(自装甲は適用)
        if (underArm) {
          pending.push({ type: 'selfhit', tImpact: t + 0.3, si: i,
            dmg: Math.round(w.dmg * 0.5 * (1 - me.st.defense)) });
        }
      }
    }
    // --- 着弾処理(時刻順) ---
    pending.sort((a, b) => a.tImpact - b.tImpact);
    while (pending.length && pending[0].tImpact <= t + DT) {
      const p = pending.shift();
      if (p.type === 'obshit') {
        const o = p.wall;
        if (!o.alive || o.hp == null) continue;
        o.hp -= p.dmg;
        ev(p.tImpact, 'obs_hit', { idx: o.idx, dmg: p.dmg, hp: Math.max(0, o.hp), x: o.x, y: o.y });
        if (o.hp <= 0) { o.alive = false; ev(p.tImpact, 'obs_down', { idx: o.idx, x: o.x, y: o.y }); }
        continue;
      }
      if (p.type === 'selfhit') {                     // ミサイル近接自爆
        const sm = m[p.si];
        if (!sm.alive || p.dmg <= 0) continue;
        sm.hp -= p.dmg;
        ev(p.tImpact, 'self_hit', { who: p.si, dmg: p.dmg, remain: Math.max(0, Math.round(sm.hp)), x: sm.x, y: sm.y });
        if (sm.hp <= 0) {
          sm.alive = false; winner = 1 - p.si; endReason = 'self';
          ev(p.tImpact, 'destroyed', { who: p.si, by: -1, x: sm.x, y: sm.y });
        }
        continue;
      }
      const tgt = m[p.ti];
      const g = p.group;
      if (!tgt.alive) continue;
      if (p.outcome === 'hit') {
        tgt.hp -= p.dmg;
        m[p.si].dOut += p.dmg; tgt.dIn += p.dmg; m[p.si].dmgCum += p.dmg;   // 撃ち負け判定/逃げ回り検出用の集計
        g.nHit++; g.dmgSum += p.dmg; g.remain = Math.max(0, Math.round(tgt.hp));
        // ノックバック: 大きな着弾の衝撃で射線方向へ後ずさる(小口径では動じない・重い機体ほど動じない)
        const kb = Math.min(24, Math.max(0, p.dmg - 16) * 300 / tgt.st.weight);
        if (kb > 0.5) {
          tgt.x += p.kx * kb; tgt.y += p.ky * kb;
          for (const o of walls) {
            if (!o.alive) continue;
            const d0 = Math.hypot(tgt.x - o.x, tgt.y - o.y);
            if (d0 < o.r + MECH_R && d0 > 0.01) {
              tgt.x = o.x + (tgt.x - o.x) / d0 * (o.r + MECH_R);
              tgt.y = o.y + (tgt.y - o.y) / d0 * (o.r + MECH_R);
            }
          }
          shapeClamp(tgt, field.shape);
        }
        ev(p.tImpact, 'hit', { who: p.si, targ: p.ti, wpn: p.w.kind, wname: p.w.name, dmg: p.dmg,
                               x: tgt.x, y: tgt.y, remain: g.remain, kb: Math.round(kb * 10) / 10 });
        if (tgt.hp <= 0) {
          tgt.alive = false; winner = p.si; endReason = 'destroy';
          ev(p.tImpact, 'destroyed', { who: p.ti, by: p.si, x: tgt.x, y: tgt.y });
        } else if (rng() < (p.w.breakPower || 0)) {
          // 部位破壊ロール(武器の部品破壊力)。胴はHP>35%の間は中破まで
          const r2 = rng();
          const idx = r2 < 0.21 ? 0 : r2 < 0.42 ? 1 : r2 < 0.68 ? 2 : r2 < 0.82 ? 3 : 4;
          const cap = idx === 4 && tgt.hp > 0.35 * tgt.st.hp ? 2 : 3;
          if (tgt.pd[idx] < cap) {
            tgt.pd[idx]++;
            ev(p.tImpact, 'pbreak', { who: p.ti, part: PART_KEYS[idx], lvl: tgt.pd[idx], wname: p.w.name,
                                      x: tgt.x, y: tgt.y });
            if (idx === 4 && tgt.pd[4] >= 3) {        // 胴体大破=即敗北
              tgt.alive = false; winner = p.si; endReason = 'core';
              ev(p.tImpact, 'destroyed', { who: p.ti, by: p.si, reason: 'core', x: tgt.x, y: tgt.y });
            }
          }
        }
      } else {
        g.remain = Math.max(0, Math.round(tgt.hp));
        if (p.outcome === 'dodge') {
          g.nDodge++;
          // Ver6: 爆発弾は躱しても爆風で割れダメージ(ミサイル限定・命中側dmgの30%)。追加rngなし=部位破壊は回さない。
          let splash = 0;
          if (p.w.kind === 'missile') {
            splash = Math.round(p.dmg * 0.3);
            if (splash > 0) {
              tgt.hp -= splash;
              m[p.si].dOut += splash; tgt.dIn += splash; m[p.si].dmgCum += splash;
              g.nSplash++; g.splashSum += splash; g.remain = Math.max(0, Math.round(tgt.hp));
            }
          }
          ev(p.tImpact, 'dodge', { who: p.si, targ: p.ti, wpn: p.w.kind, wname: p.w.name, x: tgt.x, y: tgt.y,
                                   splash, remain: g.remain });
          if (splash > 0 && tgt.hp <= 0) {
            tgt.alive = false; winner = p.si; endReason = 'splash';
            ev(p.tImpact, 'destroyed', { who: p.ti, by: p.si, reason: 'splash', x: tgt.x, y: tgt.y });
          }
        }
        else if (p.outcome === 'parry') {
          g.nParry++;
          tgt.riposteUntil = p.tImpact + 1.2;   // Ver6: 弾いた側に反撃窓(次の一斉射だけ強化)
          ev(p.tImpact, 'parry', { who: p.si, targ: p.ti, wpn: p.w.kind, wname: p.w.name, x: tgt.x, y: tgt.y });
        }
        else { g.nMiss++; ev(p.tImpact, 'miss', { who: p.si, targ: p.ti, wpn: p.w.kind, wname: p.w.name, x: tgt.x, y: tgt.y }); }
      }
    }
    // 1秒毎: 与ダメ履歴+膠着判定(両者とも使用可能な武器ゼロ=弾切れ/腕大破 → 引き分けで打切り)
    if (t >= nextDmgSample - 1e-9) {
      dmgHist.push([t, m[0].dmgCum, m[1].dmgCum]);
      nextDmgSample += 1;
      const anyW = (k) => k.wpns.some((wp, s2) => wp.a > 0 && k.pd[s2] < 3);
      if (m[0].alive && m[1].alive && !anyW(m[0]) && !anyW(m[1])) { endReason = 'stalemate'; break; }
    }
    t += DT;
    if (t >= nextPhaseLog && m[0].alive && m[1].alive) {
      ev(t, 'phase', { hpA: Math.round(100 * m[0].hp / m[0].st.hp), hpB: Math.round(100 * m[1].hp / m[1].st.hp) });
      nextPhaseLog += 60;
    }
  }

  if (endReason === 'stalemate') {
    winner = -1;
  } else if (winner === -1) {
    // 逃げ回り検出: 直近60秒の与ダメが両者とも敵HPの3%未満なら「勝負がついていない」=引き分け
    let base = [0, 0];
    const cutoff = t - 60;
    for (const h2 of dmgHist) if (h2[0] <= cutoff) base = [h2[1], h2[2]];
    const dA = m[0].dmgCum - base[0], dB = m[1].dmgCum - base[1];
    if (dA < 0.03 * m[1].st.hp && dB < 0.03 * m[0].st.hp) {
      winner = -1;
    } else {
      const ra = m[0].hp / m[0].st.hp, rb = m[1].hp / m[1].st.hp;
      if (Math.abs(ra - rb) < 0.03) winner = -1;
      else winner = ra > rb ? 0 : 1;
    }
    endReason = 'time';
  }
  const duration = Math.round(Math.min(t, TMAX) * 10) / 10;
  ev(duration, 'end', { winner, reason: endReason,
    // 撃破された機体は残HP=0で報告する(胴大破など致命弾以外の撃破ではhpが正のまま残るため)。
    hpA: m[0].alive ? Math.max(0, Math.round(m[0].hp)) : 0, hpB: m[1].alive ? Math.max(0, Math.round(m[1].hp)) : 0 });

  return { winner, duration, states, events, fieldId: field.id, field,
           log: buildLog(events, groups, names, field) };
}

// MM オマージュ: 電文調の試合経過(全文コピーの正本。多視点実況は voice.js が別途生成)
function buildLog(events, groups, names, field) {
  const L = [];
  const T = (t) => 'T+' + t.toFixed(1).padStart(5, '0');
  const tag = (i) => i === 0 ? 'TGT-A' : 'TGT-B';   // 管制は機械的呼称(機体名は実況・無線が使う)
  L.push(`${T(0)} [交戦開始] ${tag(0)} × ${tag(1)} — 戦場: ${field.name}`);
  const doneGroups = new Set();
  for (const e of events) {
    if (e.kind === 'fire') {
      const g = groups.find(g2 => !doneGroups.has(g2) && g2.si === e.who && Math.abs(g2.t - e.t) < 0.06 && g2.wname === e.wname);
      if (!g) continue;
      doneGroups.add(g);
      const parts = [];
      if (g.nHit) parts.push(`${g.nHit}発命中 計${g.dmgSum}`);
      if (g.nDodge) parts.push(`${g.nDodge}発回避される` + (g.splashSum ? `(爆風${g.splashSum})` : ''));
      if (g.nParry) parts.push(`${g.nParry}発弾かれる`);
      if (g.nMiss) parts.push(`${g.nMiss}発それる`);
      const res = parts.length ? parts.join('・') : '不発';
      const rem = (g.nHit || g.splashSum) ? `(${tag(e.targ)}残${g.remain})` : '';
      L.push(`${T(e.t)} ${tag(e.who)} ${g.wname}発射(距離${e.dist}) → ${res}${rem}`);
    } else if (e.kind === 'ammo_out') {
      L.push(`${T(e.t)} [弾切れ] ${tag(e.who)} ${e.wname} 残弾ゼロ`);
    } else if (e.kind === 'obs_down') {
      L.push(`${T(e.t)} [障害物崩壊] 遮蔽物が破壊された`);
    } else if (e.kind === 'hazard') {
      L.push(`${T(e.t)} [地形損傷] ${tag(e.who)} 茨で${e.dmg}損耗(残${e.remain})`);
    } else if (e.kind === 'climb' && e.h >= 1.5) {
      // 低い段差(縁石級)まで書くと電文が埋まるので、姿勢が変わる高さだけ記録する
      L.push(`${T(e.t)} [踏破] ${tag(e.who)} 高所へ乗り上げる — 射界を得るが、身を晒す`);
    } else if (e.kind === 'pbreak') {
      L.push(`${T(e.t)} [部位損傷] ${tag(e.who)} ${PART_JA[e.part]}${LVL_JA[e.lvl]}`);
    } else if (e.kind === 'self_hit') {
      L.push(`${T(e.t)} [自爆] ${tag(e.who)} 近接起爆で${e.dmg}損耗(残${e.remain})`);
    } else if (e.kind === 'shift') {
      L.push(`${T(e.t)} [戦術変更] ${tag(e.who)} 交戦距離を${e.dist}m帯へ移行`);
    } else if (e.kind === 'destroyed') {
      L.push(`${T(e.t)} [撃破] ${tag(e.who)} ` + (e.reason === 'core' ? '胴体大破 — 機体構造崩壊'
        : e.reason === 'splash' ? '回避するも爆風に呑まれ — 機能を喪失' : '主機関停止 — 機能を喪失'));
    } else if (e.kind === 'phase') {
      L.push(`${T(e.t)} [経過] 残存 TGT-A:${e.hpA}% / TGT-B:${e.hpB}%`);
    } else if (e.kind === 'end') {
      if (e.reason === 'stalemate') L.push(`${T(e.t)} [膠着] 両機とも継戦能力を喪失 — 交戦打切り`);
      if (e.reason === 'time') L.push(`${T(e.t)} [時間切れ] 残存判定 TGT-A:${e.hpA} / TGT-B:${e.hpB}`);
      L.push(`${T(e.t)} [試合終了] ` + (e.winner === -1 ? '引き分け' : `勝者 ${tag(e.winner)}`));
    }
  }
  return L;
}
