// 鋼機工廠 — 多視点実況(選択ロジック)。セリフデータは voice-lines.js(Sonnet生成→Opusレビュー)。
// 管制(sys)は sim の電文ログをそのまま流用する(MMオマージュの正本・全文コピー対象)。
import { VOICE_ROLES, LINES } from './voice-lines.js';
import { mulberry32, PART_JA } from './sim.js';
import { getPart } from './parts.js';
export { VOICE_ROLES };

const BIG_DMG = 60;
const LONG_FIRE_DIST = 380;   // これ以上の距離からの発砲は「遠距離戦」として拾う

// narrate(result, {nameA, nameB, fieldName, seed, buildA, buildB}) → [{t, role, text}] (t昇順)
// buildA/buildB(任意)を渡すとパーツ連動の実況が乗る: 開幕ロードアウト紹介・脚種別の回避/脚部破損。
export function narrate(result, opts = {}) {
  const rng = mulberry32((opts.seed == null ? 1 : opts.seed) ^ 0x5bd1e995);
  const names = [opts.nameA || 'α機', opts.nameB || 'β機'];
  const fieldName = opts.fieldName || (result.field && result.field.name) || '';
  const out = [];

  // --- St3: build からパーツ連動の語彙を引く(未指定なら全て従来動作) ---
  const builds = [opts.buildA || null, opts.buildB || null];
  const legPart = builds.map((b) => (b ? getPart('legs', b.legs) : null));
  const legKind = legPart.map((lp) => (lp ? lp.kind : null));
  const wpnSummary = builds.map((b) => {
    if (!b) return '';
    const wr = getPart('wpn', b.wpnR), wl = getPart('wpn', b.wpnL);
    if (!wr || !wl) return '';
    return wr.name === wl.name ? `二挺の${wr.name}` : `${wr.name}と${wl.name}`;
  });

  // --- 管制: 電文ログをそのまま(タイムスタンプを剥がして t を取る) ---
  for (const line of (result.log || [])) {
    const m2 = line.match(/^T\+(\d+\.\d)\s+(.*)$/);
    if (m2) out.push({ t: Number(m2[1]), role: 'sys', text: m2[2] });
  }

  // --- テンプレ選択の道具 ---
  const lastPick = {};   // kind|role → 直前のindex(連続同文を避ける)
  const cool = { ana: -9, kai: -9, pilotA: -9, pilotB: -9 };
  const COOL = { ana: 3.5, kai: 5.0, pilotA: 4.0, pilotB: 4.0 };
  function ctxFor(role, e) {
    const meIdx = role === 'pilotA' ? 0 : role === 'pilotB' ? 1 : null;
    return {
      A: names[0], B: names[1], FIELD: fieldName,
      ME: meIdx == null ? '' : names[meIdx],
      FOE: meIdx == null ? '' : names[1 - meIdx],
      WPN: (e && (e.wname || e.wpn)) || '',
      DMG: e && e.dmg != null ? String(e.dmg) : '',
      DIST: e && e.dist != null ? String(e.dist) : '',
      HP: e && e.hpPct != null ? String(e.hpPct) : '',
      PART: e && e.part ? (PART_JA[e.part] || '') : '',
      LEGA: legPart[0] ? legPart[0].name : '',
      LEGB: legPart[1] ? legPart[1].name : '',
      WA: wpnSummary[0], WB: wpnSummary[1],
    };
  }
  function fill(tpl, ctx) {
    return tpl.replace(/\{(A|B|ME|FOE|WPN|DMG|DIST|HP|FIELD|PART|LEGA|LEGB|WA|WB)\}/g, (_, k) => ctx[k] || '');
  }
  // 武器カテゴリ(kind@cat のバンクがあれば優先=「ライフルにパンチと言わない」)
  const catOf = (wpnKind) => wpnKind === 'rifle' || wpnKind === 'shotgun' ? 'gun'
    : wpnKind === 'beam' ? 'beam' : wpnKind === 'railgun' ? 'rail' : wpnKind === 'missile' ? 'missile'
    : wpnKind === 'blade' || wpnKind === 'drill' ? 'melee' : wpnKind === 'rocketpunch' ? 'fist' : null;
  function say(t, role, kind, e, opt = {}) {
    const cat = opt.cat || (e && e.wpn ? catOf(e.wpn) : null);
    const catBank = cat && LINES[kind + '@' + cat] && LINES[kind + '@' + cat][role];
    const bank = catBank || (LINES[kind] && LINES[kind][role]);
    if (!bank || !bank.length) return false;
    if (!opt.force && t - cool[role] < (COOL[role] || 4)) return false;
    if (opt.p != null && rng() >= opt.p) return false;
    let idx = Math.floor(rng() * bank.length);
    const key = kind + '|' + role;
    if (bank.length > 1 && idx === lastPick[key]) idx = (idx + 1) % bank.length;
    lastPick[key] = idx;
    cool[role] = t;
    out.push({ t: Math.round((t + (opt.dt || 0)) * 10) / 10, role, text: fill(bank[idx], ctxFor(role, e)) });
    return true;
  }
  const pilotOf = (i) => i === 0 ? 'pilotA' : 'pilotB';

  // --- HP% の追跡(low_hp 検出用) ---
  const maxHp = [null, null];
  const endEv = result.events[result.events.length - 1];
  // states 先頭から初期HPを得る
  if (result.states && result.states.length) {
    maxHp[0] = result.states[0].m[0].hp; maxHp[1] = result.states[0].m[1].hp;
  }
  const lowFlag = [false, false];
  const hazardFlag = [false, false];
  let firstBlood = false;
  let meleeCool = -9;

  // --- 開戦 ---
  say(0, 'ana', 'start', { }, { force: true });
  say(0, 'kai', 'start', { }, { force: true, dt: 0.9 });
  say(0, 'pilotA', 'start', { }, { force: true, dt: 1.8 });
  say(0, 'pilotB', 'start', { }, { force: true, dt: 2.6 });
  // St3: ロードアウト紹介(builds があるときのみ。解説が主・実況は時々被せる)
  if (legPart[0] && legPart[1]) {
    say(0, 'kai', 'start_build', { }, { force: true, dt: 3.6 });
    say(0, 'ana', 'start_build', { }, { p: 0.4, force: true, dt: 5.0 });
  }

  for (const e of result.events) {
    if (e.kind === 'fire') {
      if (e.rip) {   // Ver6: パリィ直後の反撃射=見せ場。掛け合いで強めに拾う
        say(e.t, pilotOf(e.who), 'riposte', e, { p: 0.7, force: true });
        say(e.t, 'ana', 'riposte', e, { p: 0.6, dt: 0.3, force: true });
        say(e.t, 'kai', 'riposte', e, { p: 0.4, dt: 1.1 });
      }
      const melee = e.wpn === 'blade' || e.wpn === 'drill' || e.wpn === 'rocketpunch';
      if (melee && e.t - meleeCool > 6) {
        meleeCool = e.t;
        say(e.t, pilotOf(e.who), 'melee_fire', e, { p: 0.5 });
        say(e.t, 'ana', 'melee_fire', e, { p: 0.45, dt: 0.3 });
      }
      // St3: 遠距離からの発砲を時々拾う(fire@long バンク直指定。{DIST} は fire 系のみの掟に適合)
      if (!e.rip && e.dist != null && e.dist >= LONG_FIRE_DIST) {
        say(e.t, 'ana', 'fire', e, { p: 0.10, cat: 'long' });
        say(e.t, 'kai', 'fire', e, { p: 0.07, dt: 1.0, cat: 'long' });
      }
    } else if (e.kind === 'hit') {
      const hpPct = maxHp[e.targ] ? Math.round(100 * e.remain / maxHp[e.targ]) : null;
      const e2 = Object.assign({ hpPct }, e);
      if (!firstBlood) {
        firstBlood = true;
        say(e.t, 'ana', 'first_blood', e2, { force: true });
        // 掛け合い: 解説はアナの第一声を「受けて」返す
        say(e.t, 'kai', 'first_blood_reply', e2, { dt: 1.2, force: true }) ||
          say(e.t, 'kai', 'first_blood', e2, { dt: 1.2, force: true });
      } else if (e.dmg >= BIG_DMG) {
        say(e.t, 'ana', 'big_hit', e2, { force: true });
        say(e.t, 'kai', 'big_hit_reply', e2, { p: 0.8, dt: 1.3, force: true }) ||
          say(e.t, 'kai', 'big_hit', e2, { p: 0.55, dt: 1.0 });
        // 大ダメージ専用の take/deal があればそちらを優先(無ければ通常版)
        say(e.t, pilotOf(e.targ), 'big_hit_take', e2, { p: 0.75, dt: 0.5 }) ||
          say(e.t, pilotOf(e.targ), 'hit_take', e2, { p: 0.75, dt: 0.5 });
        say(e.t, pilotOf(e.who), 'big_hit_deal', e2, { p: 0.35, dt: 1.4 }) ||
          say(e.t, pilotOf(e.who), 'hit_deal', e2, { p: 0.35, dt: 1.4 });
      } else {
        say(e.t, 'ana', 'hit', e2, { p: 0.22 });
        say(e.t, pilotOf(e.targ), 'hit_take', e2, { p: 0.15, dt: 0.4 });
      }
      // 残30%割れの一度きり警報
      if (hpPct != null && hpPct <= 30 && !lowFlag[e.targ]) {
        lowFlag[e.targ] = true;
        say(e.t, pilotOf(e.targ), 'low_hp', e2, { force: true, dt: 0.9 });
        say(e.t, 'ana', 'low_hp', e2, { p: 0.8, dt: 1.4 });
      }
    } else if (e.kind === 'dodge') {
      if (e.splash > 0) {   // Ver6: 躱しても爆風を被った=graze。{DMG}枠に splash を渡す
        const e2 = Object.assign({}, e, { dmg: e.splash });
        say(e.t, pilotOf(e.targ), 'graze', e2, { p: 0.5 });
        say(e.t, 'ana', 'graze', e2, { p: 0.4, dt: 0.3 });
        say(e.t, 'kai', 'graze', e2, { p: 0.3, dt: 1.1 });
      } else {
        // St3: 回避側の脚種バンク(dodge@hover 等)があれば優先し、拾う確率も上げる(見せ場になった)
        const lk = legKind[e.targ];
        const flavored = lk && LINES['dodge@' + lk];
        say(e.t, pilotOf(e.targ), 'dodge', e, { p: 0.2 });
        say(e.t, 'ana', 'dodge', e, { p: flavored ? 0.3 : 0.15, dt: 0.3, cat: lk });
        if (flavored) say(e.t, 'kai', 'dodge', e, { p: 0.16, dt: 1.0, cat: lk });
      }
    } else if (e.kind === 'parry') {
      say(e.t, 'ana', 'parry', e, { p: 0.8, force: true });
      say(e.t, pilotOf(e.targ), 'parry', e, { p: 0.6, dt: 0.6 });
      say(e.t, 'kai', 'parry', e, { p: 0.45, dt: 1.2 });
    } else if (e.kind === 'miss') {
      say(e.t, 'kai', 'miss', e, { p: 0.06 });
    } else if (e.kind === 'ammo_out') {
      say(e.t, 'ana', 'ammo_out', e, { force: true });
      say(e.t, pilotOf(e.who), 'ammo_out', e, { force: true, dt: 0.7 });
      say(e.t, 'kai', 'ammo_out', e, { p: 0.5, dt: 1.4 });
    } else if (e.kind === 'obs_down') {
      say(e.t, 'ana', 'obs_down', e, { p: 0.85, force: true });
      say(e.t, 'kai', 'obs_down', e, { p: 0.4, dt: 1.0 });
    } else if (e.kind === 'pbreak') {
      // St3: 脚部破損は破損機の脚種バンク(pbreak@quad 等)を優先(履帯に「脚が折れた」と言わない)
      const pcat = e.part === 'legs' ? legKind[e.who] : null;
      say(e.t, pilotOf(e.who), 'pbreak', e, e.lvl >= 3 ? { force: true } : { p: e.lvl >= 2 ? 0.9 : 0.5 });
      say(e.t, 'ana', 'pbreak', e, { p: e.lvl >= 2 ? 0.7 : 0.25, dt: 0.5, cat: pcat });
      say(e.t, 'kai', 'pbreak', e, { p: 0.4, dt: 1.2, cat: pcat });
    } else if (e.kind === 'self_hit') {
      say(e.t, pilotOf(e.who), 'self_hit', e, { force: true });
      say(e.t, 'ana', 'self_hit', e, { p: 0.6, dt: 0.6 });
      say(e.t, 'kai', 'self_hit', e, { p: 0.5, dt: 1.4 });
    } else if (e.kind === 'shift') {
      say(e.t, pilotOf(e.who), 'shift', e, { p: 0.55 });
      say(e.t, 'kai', 'shift', e, { p: 0.5, dt: 0.8 });
      say(e.t, 'ana', 'shift', e, { p: 0.3, dt: 0.4 });
    } else if (e.kind === 'hazard') {
      if (!hazardFlag[e.who]) {
        hazardFlag[e.who] = true;
        say(e.t, pilotOf(e.who), 'hazard', e, { p: 0.8, force: true });
        say(e.t, 'kai', 'hazard', e, { p: 0.6, dt: 0.9 });
      }
    } else if (e.kind === 'phase') {
      say(e.t, 'kai', 'phase', e, { force: true });
      say(e.t, 'ana', 'phase', e, { p: 0.5, dt: 1.2 });
    } else if (e.kind === 'destroyed') {
      say(e.t, 'ana', 'destroyed', e, { force: true });
      say(e.t, pilotOf(e.who), 'destroyed', e, { force: true, dt: 0.6 });
      say(e.t, 'kai', 'destroyed_reply', e, { force: true, dt: 1.4 }) ||
        say(e.t, 'kai', 'destroyed', e, { force: true, dt: 1.4 });
    } else if (e.kind === 'end') {
      const kind = e.winner === -1 ? (e.reason === 'stalemate' ? 'end_stalemate' : 'end_draw') : 'end_win';
      // 勝者名を {A}/{B} で言い分けられるよう winner 名を WPN 枠でなく文脈で
      const e2 = Object.assign({}, e, { winnerName: e.winner === -1 ? '' : names[e.winner] });
      say(e.t + 0.5, 'ana', kind, e2, { force: true });
      say(e.t + 1.6, 'kai', kind, e2, { force: true });
      if (e.winner === 0 || e.winner === 1) say(e.t + 2.4, pilotOf(e.winner), kind, e2, { p: 0.8, force: true });
    }
  }
  out.sort((a, b) => a.t - b.t || (a.role === 'sys' ? -1 : 1));
  return out;
}
