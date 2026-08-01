// 鋼機工廠 — 統合(親)。状態機械・戦闘再生・メタ進行・ネット対戦。
import { PARTS, COSMETICS, deriveStats, defaultBuild, getPart, codename, buildCost } from './parts.js';
import { simulate, FIELDS, getField, losBlockedBy } from './sim.js';
// 余韻演出だけが使う(シムが計算していない位置の足元の標高)。描画側の都合なので sim 経由にしない。
// リプレイでも res.field(凍結バンドル側の戦場)を引数で渡すので、形はその試合のものになる。
import { footYAt } from './fields.js';
import { encodeReplay, decodeReplay, loadSimBundle } from './replay.js';
import { narrate, VOICE_ROLES } from './voice.js';
import { LINES } from './voice-lines.js';
import { createUI, makeLogLine } from './ui.js';
import { createRadar } from './radar.js';
import { mechMesh, mechFocus, decorLiftAt, AFTERMATH_ORBIT_R_SIM } from './r3d.js';
import { createR3DThree } from './r3d-three.js';

export const CAMPAIGN = [
  { rank:'E', fights: [
    { name:'TR-01 カカシ',   reward:100, build:{ frame:'fr1', legs:'lg2', gen:'gn1', armor:'ar1', wpnR:'wp1', wpnL:'wp5', ai:'ai2', color:'#7d8894', decal:'none', name:'' } },
    { name:'TR-02 マト',     reward:100, build:{ frame:'fr2', legs:'lg2', gen:'gn1', armor:'ar1', wpnR:'wp1', wpnL:'wp5', ai:'ai2', color:'#7d8894', decal:'none', name:'' } },
    { name:'TR-03 イノシシ', reward:140, build:{ frame:'fr1', legs:'lg1', gen:'gn2', armor:'ar1', wpnR:'wp5', wpnL:'wp5', ai:'ai1', color:'#9a6a4f', decal:'none', name:'' } },
  ]},
  { rank:'D', fights: [
    { name:'KG-11 アシガル', reward:160, build:{ frame:'fr2', legs:'lg1', gen:'gn2', armor:'ar2', wpnR:'wp1', wpnL:'wp2', ai:'ai2', color:'#5d7a8c', decal:'none', name:'' } },
    { name:'KG-12 ヤグラ',   reward:160, build:{ frame:'fr2', legs:'lg3', gen:'gn2', armor:'ar2', wpnR:'wp1', wpnL:'wp8', ai:'ai2', color:'#5d7a8c', decal:'none', name:'' } },
    { name:'KG-13 スズメ',   reward:180, build:{ frame:'fr1', legs:'lg4', gen:'gn2', armor:'ar1', wpnR:'wp8', wpnL:'wp5', ai:'ai3', color:'#6d8f5a', decal:'none', name:'' } },
  ]},
  { rank:'C', fights: [
    { name:'MK-21 ドテ',     reward:220, build:{ frame:'fr3', legs:'lg2', gen:'gn2', armor:'ar2', wpnR:'wp1', wpnL:'wp3', ai:'ai2', color:'#4d5a66', decal:'none', name:'' } },
    { name:'MK-22 カマイタチ', reward:220, build:{ frame:'fr2', legs:'lg1', gen:'gn2', armor:'ar1', wpnR:'wp6', wpnL:'wp5', ai:'ai1', color:'#b0563e', decal:'none', name:'' } },
    { name:'MK-23 ツムジ',   reward:260, build:{ frame:'fr1', legs:'lg6', gen:'gn2', armor:'ar1', wpnR:'wp8', wpnL:'wp10', ai:'ai3', color:'#4d7ea8', decal:'none', name:'' } },
  ]},
  { rank:'B', fights: [
    { name:'SD-31 ガンリュウ', reward:320, build:{ frame:'fr3', legs:'lg3', gen:'gn3', armor:'ar3', wpnR:'wp2', wpnL:'wp8', ai:'ai2', color:'#3a4047', decal:'none', name:'' } },
    { name:'SD-32 カゲキリ', reward:320, build:{ frame:'fr4', legs:'lg1', gen:'gn2', armor:'ar1', wpnR:'wp6', wpnL:'wp5', ai:'ai1', color:'#b0563e', decal:'none', name:'' } },
    { name:'SD-33 ヨミカゼ', reward:360, build:{ frame:'fr2', legs:'lg4', gen:'gn3', armor:'ar1', wpnR:'wp7', wpnL:'wp3', ai:'ai4', color:'#6d8f5a', decal:'none', name:'' } },
  ]},
  { rank:'A', fights: [
    { name:'GH-41 オオヌマ', reward:450, build:{ frame:'fr5', legs:'lg5', gen:'gn3', armor:'ar3', wpnR:'wp4', wpnL:'wp8', ai:'ai2', color:'#3a4047', decal:'none', name:'' } },
    { name:'GH-42 シデン',   reward:450, build:{ frame:'fr3', legs:'lg7', gen:'gn3', armor:'ar4', wpnR:'wp9', wpnL:'wp5', ai:'ai1', color:'#7d6bb0', decal:'none', name:'' } },
    { name:'GH-43 フクロウノメ', reward:500, build:{ frame:'fr3', legs:'lg4', gen:'gn4', armor:'ar1', wpnR:'wp7', wpnL:'wp3', ai:'ai4', color:'#6d8f5a', decal:'none', name:'' } },
  ]},
  { rank:'S', fights: [
    { name:'ZP-51 ドンリュウ', reward:600, build:{ frame:'fr5', legs:'lg5', gen:'gn4', armor:'ar4', wpnR:'wp4', wpnL:'wp1', ai:'ai2', color:'#2e3338', decal:'none', name:'' } },
    { name:'ZP-52 ムラサメ', reward:600, build:{ frame:'fr5', legs:'lg7', gen:'gn4', armor:'ar3', wpnR:'wp6', wpnL:'wp5', ai:'ai1', color:'#c2a35c', decal:'none', name:'' } },
    { name:'ZP-53 テンガン', reward:800, build:{ frame:'fr5', legs:'lg7', gen:'gn4', armor:'ar4', wpnR:'wp9', wpnL:'wp10', ai:'ai1', color:'#d8dee4', decal:'none', name:'' } },
  ]},
];

// 日替わり演習の敵(日付シードで決定論生成)
// ランクごとの既定戦場(選択が「ランダム」のとき使用)。演習平原(plain)は候補から除外
// (変化がなく単調なため。人間指示 2026-07-24。明示選択では従来どおり選べる)。
export const RANK_FIELDS = { E: ['sekichu','deitan','crater'], D: ['haikyo','sekichu','deitan'],
  C: ['sekichu','ibara','crater'], B: ['crater','sekichu','haikyo'],
  A: ['deitan','ibara','crater'], S: ['sekichu','crater','haikyo'] };

export function dailyEnemy(dateStr) {
  let h = 0; for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = CAMPAIGN.flatMap(r => r.fights.map(f => f.build));
  const b = Object.assign({}, pool[h % pool.length]);
  b.color = ['#b0563e','#4d7ea8','#6d8f5a','#7d6bb0','#c2a35c'][(h >>> 8) % 5];
  const fpool = FIELDS.filter(f => f.id !== 'plain');   // ランダム候補から演習平原を除外(単調のため)
  const fh = (Math.imul(h ^ (h >>> 13), 2654435761) >>> 0);   // 上位ビット偏り対策の攪拌(日付間で戦場が満遍なく回る)
  return { name: codename('daily:' + dateStr), reward: 250, build: b,
           fieldId: fpool[fh % fpool.length].id };
}

// ================= ここからブラウザ実行部 =================
if (typeof document !== 'undefined') boot();

function boot() {
const Q = new URLSearchParams(location.search);
const AUTO = Q.get('auto') === '1';
const STILL = Q.get('still') === '1';
const FAST = Math.max(0.1, Number(Q.get('fast')) || 1);
const SKIPT = Number(Q.get('t')) || 0;
const MUTE = Q.get('mute') === '1' || AUTO && !Q.has('sound');
const QSEED = Q.has('seed') ? (Number(Q.get('seed')) >>> 0) : null;
const RCODE = Q.get('r');   // リプレイ共有コード(あればリプレイ観戦モードで起動)
// ---- 運用フラグ(リプレイ互換の掟5・6/make-dev.mjs 参照) ----
const DEV = true;           // kouki-dev(開発版)生成時に make-dev.mjs が true へ書き換える。
                            // 開発版=シム調整の試験場: 通信(ログイン/闘技場)とリプレイ発行/再生を無効化
const REPLAY_ISSUE = true;  // 例外運用: 本番でシムを直接調整する間だけ false(発行のみ停止。再生は全版生きる)
const QTHEME = Q.get('theme');   // 'arena' で闘技場配色を強制(撮影・検証用)
const QFIELD = Q.get('field');   // 戦場idを強制(撮影デモ/検証用。?auto=1&field=shigai 等)
window.__promoDbg = { events: [], meta: { slug: 'kouki' } };
const dbg = (type, extra) => __promoDbg.events.push(Object.assign({ t: performance.now() / 1000, type }, extra));

// St2第3段完了: 旧ソフトウェアラスタライザは撤去(人間承認 2026-07-24)。観戦3Dは Three(WebGL)のみ。
// WebGL 初期化に失敗した端末では 3D 描画だけ無効化して劣化継続(組立/ログ/レーダー等の UI は生かす)。
function makeR3D(canvas) {
  try { return createR3DThree(canvas); }
  catch (e) { console.warn('[r3d] Three(WebGL) init 失敗 — 3D描画を無効化', e); return { render() {}, resetCamera() {} }; }
}

const PROD_API = 'https://fable-kouki.d3j.workers.dev';
let api = null;
try { api = !DEV && window.FableData ? FableData.create({ base: PROD_API }) : null; } catch (e) { api = null; }

// ---- セーブ v4(v3+パイロット3人制・名誉・墓場) ----
const SKEY = 'kouki_save_v4';
function freshPilotNamed(name) {
  return { name: String(name || '新人').trim().slice(0, 12), xp: 0, injury: 0, honor: 50, sorties: 0, wins: 0 };
}
function freshSave() {
  return { v: 4, credits: 3000, medals: 0, cosmetics: ['c-ash', 'c-navy'],
           progress: {}, daily: { date: '', done: false }, slots: Array(8).fill(null),
           current: defaultBuild(), muted: false,
           pilots: [freshPilotNamed('アサヒ'), null, null], active: 0, graveyard: [],
           history: {} };   // 敵キー → 直近5勝の構成ハッシュ(同構成連戦の報酬減衰)
}
const migPilot = (p) => Object.assign(freshPilotNamed('アサヒ'), p || {}, { honor: (p && p.honor) != null ? p.honor : 50, sorties: (p && p.sorties) || 0, wins: (p && p.wins) || 0 });
let S = freshSave();
try {
  const raw = localStorage.getItem(SKEY);
  if (raw) S = Object.assign(freshSave(), JSON.parse(raw));
  else {
    const v3 = localStorage.getItem('kouki_save_v3');    // v3/v2→v4: 単独パイロットをスロット0へ
    const v2 = localStorage.getItem('kouki_save_v2');
    const v1 = localStorage.getItem('kouki_save_v1');    // v1(解放制)→v4
    const oldRaw = v3 || v2;
    if (oldRaw) {
      const o = JSON.parse(oldRaw);
      S = Object.assign(freshSave(), o, { v: 4, pilots: [migPilot(o.pilot), null, null], active: 0, graveyard: [] });
      if (!v3) S.history = {};
      delete S.pilot;
    } else if (v1) {
      const o = JSON.parse(v1);
      S.credits = 3000 + (o.credits || 0);
      for (const k of ['progress', 'daily', 'slots', 'current', 'muted', 'cosmetics']) if (o[k] != null) S[k] = o[k];
    }
  }
  if (!Array.isArray(S.pilots) || S.pilots.length !== 3) S.pilots = [freshPilotNamed('アサヒ'), null, null];
  if (!S.graveyard) S.graveyard = [];
  if (!S.history) S.history = {};
} catch (e) {}
// 構成ハッシュ(色・名前は含まない=戦闘性能を決める7部位のみ)
function buildHash(b) {
  const s = [b.frame, b.legs, b.gen, b.armor, b.wpnR, b.wpnL, b.ai].join('|');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}
if (AUTO || STILL) S = freshSave();  // 撮影はクリーンな状態から(保存もしない)
const save = () => { if (!AUTO && !STILL) try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} };
const activePilot = () => (S.pilots && S.pilots[S.active]) || null;
const pilotLevel = (p) => { const q = p || activePilot(); return Math.min(8, 1 + Math.floor(((q && q.xp) || 0) / 120)); };
// パイロット補正(演習/デイリーのみ。闘技場は脱出装置義務のイコールコンディション)
function pilotMods() {
  const p = activePilot(); if (!p) return { acc: 0, eva: 0 };
  const lv = pilotLevel(p);
  return { acc: 0.006 * (lv - 1) - (p.injury > 0 ? 0.03 : 0),
           eva: 0.004 * (lv - 1) - (p.injury > 0 ? 0.02 : 0) };
}
// リプレイの表示名: 自由入力を URL に載せない代わりに、演習/日替わりは静的データから復元し、
// それ以外(アリーナ等)はコードから識別コード風に決定論生成する
function replayEnemyName(ref, code) {
  if (ref && ref[0] === 'c') {
    const r = CAMPAIGN.find(x => x.rank === ref[1]);
    const f = r && r.fights[Number(ref.slice(2))];
    if (f) return f.name;
  }
  if (ref && ref[0] === 'd') return codename('daily:' + ref.slice(1));
  return codename('RPL-B:' + code);
}

// 敵パイロット(クローン)の呼称 — 敵機名から決定論生成
const EPILOT_NAMES = ['ノル', 'ザッハ', 'クルツ', 'ヴェスタ', 'ギド', 'レーム', 'ドルフ', 'ハウル', 'イェジ', 'モロ'];
function enemyPilotName(enemyName) {
  let h = 0; for (const c of String(enemyName || '敵機')) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return EPILOT_NAMES[h % EPILOT_NAMES.length];
}
const overBudget = (b) => buildCost(b) > S.credits;

// ---- 音(合成SFX・autoplayゲート) ----
let AC = null;
const ac = () => { if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} return AC; };
const canSfx = () => AC && AC.state === 'running' && !S.muted && !MUTE;
document.addEventListener('pointerdown', () => { const c = ac(); if (c && c.state === 'suspended') c.resume(); }, { once: false });
function sfx(kind) {
  if (!canSfx()) return;
  const c = AC, t0 = c.currentTime;
  const g = c.createGain(); g.connect(c.destination);
  const o = c.createOscillator(); o.connect(g);
  if (kind === 'beam') { o.type = 'sawtooth'; o.frequency.setValueAtTime(1400, t0); o.frequency.exponentialRampToValueAtTime(220, t0 + 0.18); g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2); o.start(t0); o.stop(t0 + 0.22); }
  else if (kind === 'fire') { o.type = 'square'; o.frequency.setValueAtTime(180, t0); g.gain.setValueAtTime(0.04, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09); o.start(t0); o.stop(t0 + 0.1); }
  else if (kind === 'hit') { o.type = 'triangle'; o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.15); g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.17); o.start(t0); o.stop(t0 + 0.2); }
  else if (kind === 'boom') { o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(28, t0 + 0.8); g.gain.setValueAtTime(0.14, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9); o.start(t0); o.stop(t0 + 1); }
  else if (kind === 'parry') { o.type = 'triangle'; o.frequency.setValueAtTime(2600, t0); o.frequency.exponentialRampToValueAtTime(1400, t0 + 0.1); g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14); o.start(t0); o.stop(t0 + 0.16); }
  else if (kind === 'click') { o.type = 'square'; o.frequency.setValueAtTime(620, t0); g.gain.setValueAtTime(0.03, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05); o.start(t0); o.stop(t0 + 0.06); }
  else if (kind === 'win') { o.type = 'triangle'; [523, 659, 784, 1047].forEach((f, i) => o.frequency.setValueAtTime(f, t0 + i * 0.12)); g.gain.setValueAtTime(0.06, t0); g.gain.setValueAtTime(0.001, t0 + 0.6); o.start(t0); o.stop(t0 + 0.62); }
}

// 戦闘中の環境音(低ドローン+レーダーping)。canSfx が偽の間は無音のまま。
let ambNodes = null, ambTimer = 0;
function ambientStart() {
  ambientStop();
  ambTimer = setInterval(() => {
    if (!canSfx() || !battle) return;
    if (!ambNodes) {   // ドローンは resume 後に一度だけ張る
      const c = AC, g2 = c.createGain(); g2.gain.value = 0.028; g2.connect(c.destination);
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 46; o1.connect(g2); o1.start();
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 92.5; o2.connect(g2); o2.start();
      ambNodes = { g: g2, os: [o1, o2] };
    }
    const c = AC, t0 = c.currentTime;   // ping
    const g3 = c.createGain(); g3.connect(c.destination);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1180, t0);
    o.frequency.exponentialRampToValueAtTime(880, t0 + 0.25);
    g3.gain.setValueAtTime(0.02, t0); g3.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.5);
    o.connect(g3); o.start(t0); o.stop(t0 + 0.55);
  }, 2000);
}
function ambientStop() {
  clearInterval(ambTimer);
  if (ambNodes) { try { ambNodes.g.gain.linearRampToValueAtTime(0, AC.currentTime + 0.4); ambNodes.os.forEach(o => o.stop(AC.currentTime + 0.5)); } catch (e) {} ambNodes = null; }
}

// ---- UI ----
const ui = createUI(document.getElementById('app'), {
  onPartChange(build) { S.current = build; save(); return deriveStats(build); },
  onDeriveStats(build) { return deriveStats(build); },   // 鑑賞用コピーの表示専用(S.current に触れず保存もしない)
  onSaveBuild(build, slot) {
    S.slots[slot] = { build: JSON.parse(JSON.stringify(build)), cloud: false }; save();
    if (user && api) {
      api.post(`/garage/${slot}`, { build }).then(() => {
        S.slots[slot].cloud = true; save(); refreshHangar();
      }).catch(() => {});
    }
    ui.toast(`スロット${slot + 1}に保存しました`); refreshHangar();
  },
  onEquip(build) {
    if (overBudget(build)) { ui.toast(`予算超過(総額${buildCost(build)} / 予算${S.credits}C)— 構成を見直してください`); return; }
    S.current = build; save(); ui.toast('出撃機体に設定しました'); refreshCampaign(); ui.showScreen('sortie');
  },
  onBuy() { ui.toast('パーツは購入不要 — 機体総額が予算(所持金)内なら調達できます'); },
  onBuyCosmetic(id) {
    const csm = COSMETICS.colors.find(c => c.id === id); if (!csm) return;
    if (S.cosmetics.includes(id)) return;
    const pm = medalPrice(csm);
    if ((S.medals || 0) < pm) { ui.toast(`勲章が足りません(必要 🎖${pm})`); return; }
    S.medals -= pm; S.cosmetics.push(id); save(); ui.toast(`${csm.name} を入手!`); refreshCollection(); refreshTitle();
  },
  onRegisterPilot(name, idx) {
    if (idx < 0 || idx > 2 || S.pilots[idx]) return;
    const nm = String(name || '').trim().slice(0, 12);
    if (!nm) { ui.toast('パイロット名を入力してください'); return; }
    S.pilots[idx] = freshPilotNamed(nm);
    if (!activePilot()) S.active = idx;
    save(); refreshTitle(); ui.toast(`${nm} が着任しました(名は生涯変わらない)`);
  },
  onFirePilot(idx) {
    const p = S.pilots[idx]; if (!p) return;
    if (!window.confirm(`${p.name} を解雇しますか?(記録は残りません)`)) return;
    S.pilots[idx] = null;
    if (S.active === idx) { const na = S.pilots.findIndex(Boolean); S.active = na < 0 ? 0 : na; }
    save(); refreshTitle(); ui.toast(`${p.name} は工廠を去った`);
  },
  onSelectPilot(idx) {
    if (!S.pilots[idx]) return;
    S.active = idx; save(); refreshTitle();
  },
  onShowGrave() { refreshGrave(); ui.showScreen('grave'); },
  onLogin() {
    if (!api) { ui.toast('通信部が読み込めていません'); return; }
    if (apiDead) { ui.toast('対戦サーバは準備中です(開通までお待ちください)'); return; }
    location.href = api.loginUrl('google');
  },
  onLogout() { if (api) api.logout().catch(() => {}).then(() => { user = null; ui.setUser(null); ui.toast('ログアウトしました'); }); },
  onFight(mode, payload) {
    payload = payload || {};
    // 戦場: 明示選択ならそれ、「ランダム/未指定」はランク既定 or 日替わり既定
    const pickField = (fallback) => {
      if (payload.fieldId && payload.fieldId !== 'random') return payload.fieldId;
      return fallback;
    };
    if ((mode === 'campaign' || mode === 'daily') && overBudget(S.current)) {
      ui.toast(`予算超過で出撃できません(総額${buildCost(S.current)} / 予算${S.credits}C)`); return;
    }
    if ((mode === 'campaign' || mode === 'daily') && !AUTO && !STILL && !activePilot()) {
      ui.toast('搭乗できるパイロットがいません — タイトルで登録してください'); return;
    }
    if (mode === 'campaign') {
      // rank は数値index('auto'デモ)と文字('E'〜'S'、UIから)の両方を受ける
      const ri = typeof payload.rank === 'number' ? payload.rank : CAMPAIGN.findIndex(x => x.rank === payload.rank);
      const r = CAMPAIGN[ri]; if (!r) { ui.toast('不明なランクです'); return; }
      const f = r.fights[payload.idx]; if (!f) return;
      const fieldId = pickField((RANK_FIELDS[r.rank] || [])[payload.idx] || 'sekichu');
      startBattle(S.current, f.build, pickSeed(), { mode, rank: r.rank, idx: payload.idx, reward: f.reward, enemyName: f.name, fieldId });
    } else if (mode === 'daily') {
      const d = dailyEnemy(todayStr());
      startBattle(S.current, d.build, pickSeed(), { mode, reward: d.reward, enemyName: d.name, fieldId: pickField(d.fieldId) });
    }
  },
  async onArenaSubmit() {
    if (!requireLogin()) return;
    try {
      if (overBudget(S.current)) { ui.toast('予算超過の機体は登録できません'); return; }
      const r = await api.post('/arena/submit', { build: stripName(S.current) });
      arenaSelf = { codename: r.codename, rating: r.rating, wins: r.wins || 0, losses: r.losses || 0 };
      ui.toast(`登録完了 — あなたの識別コードは「${r.codename}」`); refreshArena();
    }
    catch (e) { ui.toast('登録失敗: ' + e.message); }
  },
  onArenaFight() { doArenaFight(); },
});
let fightBusy = false;
async function doArenaFight() {
    if (!requireLogin()) return;
    if (fightBusy) return;           // 連打で並行fightを起こさない
    fightBusy = true;
    try {
      const r = await api.post('/arena/fight');
      arenaSelf = { codename: r.mine.codename, rating: r.myRating, wins: (arenaSelf && arenaSelf.wins) || 0, losses: (arenaSelf && arenaSelf.losses) || 0 };
      startBattle(r.mine.build, r.opp.build, r.seed >>> 0, { mode: 'arena', enemyName: r.opp.codename, myName: r.mine.codename, rating: r.myRating, delta: r.delta, serverWinner: r.winner, fieldId: r.fieldId });
    } catch (e) { ui.toast('対戦失敗: ' + e.message); }
    finally { fightBusy = false; }
}
let user = null, arenaCtx = null, arenaSelf = null, apiDead = false;

function requireLogin() {
  if (!api || apiDead) { ui.toast('対戦サーバは準備中です'); return false; }
  if (!user) { ui.toast('先にログインしてください'); return false; }
  return true;
}
const stripName = (b) => { const c = JSON.parse(JSON.stringify(b)); c.name = ''; return c; };
async function pullCloudGarage() {   // ログイン時: クラウドのスロットを取り込む(クラウド優先)
  try {
    const r = await api.get('/garage');
    for (const s of (r.slots || [])) if (s && s.build) S.slots[s.slot] = { build: s.build, cloud: true };
    save(); refreshHangar();
  } catch (e) {}
}
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const pickSeed = () => QSEED != null ? QSEED : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

// ---- 画面リフレッシュ ----
function refreshTitle() {
  ui.renderTitle({ credits: S.credits, medals: S.medals || 0,
    graveyardCount: (S.graveyard || []).length,
    pilots: S.pilots.map((p, i) => p ? { name: p.name, level: pilotLevel(p), injury: p.injury || 0,
      honor: p.honor == null ? 50 : p.honor, active: i === S.active } : null) });
}
function refreshGrave() { ui.renderGraveyard({ list: (S.graveyard || []).slice().reverse() }); }
function medalPrice(csm) { return csm.price <= 0 ? 0 : csm.price <= 200 ? 1 : csm.price <= 300 ? 1 : 2; }
function refreshHangar() {
  ui.renderHangar({ build: S.current, stats: deriveStats(S.current), parts: PARTS,
    budget: S.credits, credits: S.credits,
    slots: S.slots.map((s, i) => s ? { slot: i, build: s.build, cloud: !!s.cloud } : null) });
}
function refreshCampaign() {
  ui.renderCampaign({
    ranks: CAMPAIGN.map((r, ri) => ({ rank: r.rank,
      fights: r.fights.map((f, fi) => ({ idx: fi, cleared: !!(S.progress[r.rank] || [])[fi], reward: f.reward, name: f.name,
        locked: ri > 0 && !(S.progress[CAMPAIGN[ri - 1].rank] || []).some(Boolean) })) })),
    daily: { cleared: S.daily.date === todayStr() && S.daily.done, reward: 250, label: '日替わり演習 — ' + dailyEnemy(todayStr()).name },
    fields: FIELDS.map(f => ({ id: f.id, name: f.name, desc: f.desc })),
    selectedField: 'random',
  });
}
async function refreshArena() {
  let top = [], myEntry = null, history = [];
  if (api) {
    try { top = (await api.get('/arena/top')).top || []; } catch (e) {}
    if (user) {
      try { const h = await api.get('/arena/history'); history = (h.history || []).map(x => ({ opponent: x.opp_codename, result: x.winner_mine === true ? 'win' : x.winner_mine === false ? 'lose' : 'draw' })); } catch (e) {}
      myEntry = arenaSelf;
    }
  }
  ui.renderArena({ loggedIn: !!user, myEntry, top, history });
}
function refreshCollection() {
  ui.renderCollection({ parts: PARTS, credits: S.credits, medals: S.medals || 0,
    cosmetics: COSMETICS.colors.map(c => ({ id: c.id, name: c.name, price: c.price, priceMedals: medalPrice(c), color: c.hex, owned: S.cosmetics.includes(c.id) })) });
}

// ---- 工廠の機体プレビュー(回転展示。canvasが可視のときだけ描く) ----
let pvR3d = null, pvCanvas = null, pvMesh = null, pvKey = '';
let pvWalk = 0, pvLastNow = 0;
let pvX = 500, pvY = 500;   // プレビュー機体のワールド位置(実際に地面を移動させる=歩行と地面が連動する)
const PV_SPEED = 12;        // 見せ場用の歩行速度[m/s](落ち着いた大股)。歩容は実移動距離で駆動される。
// 工廠プレビューの移動デモ: 前進→停止→後退→停止→右ストレイフ→左ストレイフ を巡回して見せる(③④)。
// 戦闘と同じ moveLocal を合成し、脚の運び・体幹リーン・上下バウンス・砂煙が工廠でも出るようにする。
const PV_CYCLE = 20;   // プレビュー実演の1周期[s](移動デモ+アクション実演)
function previewMove(t) {
  const cy = t % PV_CYCLE;   // 周期内の経過秒
  let fwd = 0, lat = 0;
  // 前進/後退・右/左ストレイフを同距離で対にし、1周期の正味変位≈0=機体は原点付近で往復する
  // (地面/グリッドが常に足元にある)。停止区間にアクション実演(previewFx)、後半に低速の重い足取り。
  if (cy < 2.8) fwd = 1;                     // 前進(全速)
  else if (cy < 3.4) { }                     // 停止 → 回避juke 実演
  else if (cy < 6.2) fwd = -1;               // 後退(前進と同距離=正味0)
  else if (cy < 6.8) { }                     // 停止 → 被弾flinch 実演
  else if (cy < 9.2) lat = 1;                // 右ストレイフ
  else if (cy < 11.6) lat = -1;              // 左ストレイフ(右と同距離=正味0)
  else if (cy < 12.2) { }                    // 停止 → 右腕攻撃 実演
  else if (cy < 16.6) fwd = 0.35;            // 低速前進(大股のゆっくりした重い足取り)
  else if (cy < 17.2) { }                    // 停止 → 左腕攻撃 実演
  else if (cy < 18.74) fwd = -1;             // 後退(低速前進ぶんを戻す=正味0)
  else { }                                   // 停止
  return { fwd, lat, mag: Math.min(1, Math.hypot(fwd, lat)) };
}
// 停止区間で新モーション(攻撃フォロースルー/被弾flinch/回避juke)を実演する(戦闘と同じ入力契約)。
function previewFx(t) {
  const cy = t % PV_CYCLE;
  const age = (t0, dur) => { const a = (cy - t0) / dur; return a >= 0 && a < 1 ? a : null; };
  let attack = null, hitFx = null, dodgeFx = null;
  const ja = age(2.9, 0.45);                 // 回避juke(0.45s)
  if (ja != null) dodgeFx = { age01: ja, side: 1 };
  const fa = age(6.3, 0.55);                 // 被弾flinch: 正面からの着弾(h=0 → 押し込みは -x 向き)
  if (fa != null) hitFx = { age01: fa, dirX: -1, dirZ: 0, mag: 0.85 };
  const ra = age(11.7, 0.9);                 // 右腕攻撃(装備中の武器種で実演)
  const la = age(16.7, 0.9);                 // 左腕攻撃
  if (ra != null || la != null) {
    const slot = ra != null ? 'wpnR' : 'wpnL';
    const w = getPart('wpn', S.current[slot]);
    if (w) attack = { kind: w.kind, age01: ra != null ? ra : la, side: ra != null ? 'R' : 'L' };
  }
  return { attack, hitFx, dodgeFx };
}
function previewTick(now) {
  const c = document.querySelector('.mech-preview');
  if (!c || c.offsetParent === null) return;      // 工廠画面が出ていない間は何もしない
  if (c !== pvCanvas) {                            // renderHangar が作り直したら追従
    pvCanvas = c; pvR3d = makeR3D(c); pvKey = '';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rct = c.getBoundingClientRect();
    if (rct.width > 0) { c.width = Math.round(rct.width * dpr); c.height = Math.round(rct.height * dpr); }
  }
  const key = JSON.stringify([S.current.frame, S.current.legs, S.current.gen, S.current.armor, S.current.wpnR, S.current.wpnL, S.current.color]);
  if (key !== pvKey) { pvKey = key; try { pvMesh = mechMesh(S.current, PARTS, S.current.color); } catch (e) { pvMesh = null; } }
  if (!pvMesh) return;
  const t = now / 1000;
  const dt = pvLastNow ? Math.min(0.1, (now - pvLastNow) / 1000) : 0; pvLastNow = now;
  const mv = previewMove(t);
  pvWalk += dt * (mv.mag * 30) * 0.22;   // 非脚パーツ(履帯揺れ等)用。二脚/四脚の歩容は実移動距離で駆動される。
  // 機体を実際にワールド移動させる=足が地面を掴み、地面が流れる(歩行の向きと地面が連動)。
  // 向き h は固定し、カメラ周回で全方位を見せる(前進=+x / 右ストレイフ=-z を地面のスクロールとして見せる)。
  const h = 0;
  const fwdX = Math.cos(h), fwdZ = Math.sin(h), rgtX = Math.sin(h), rgtZ = -Math.cos(h);
  pvX += (fwdX * mv.fwd + rgtX * mv.lat) * PV_SPEED * dt;
  pvY += (fwdZ * mv.fwd + rgtZ * mv.lat) * PV_SPEED * dt;
  const camAng = t * 0.35;
  const fx = previewFx(t);
  pvR3d.render({
    mechs: [{ mesh: pvMesh, x: pvX, y: pvY, h, hp: 999, alive: true, walkPhase: pvWalk, moveLocal: mv,
      attack: fx.attack, hitFx: fx.hitFx, dodgeFx: fx.dodgeFx }],
    shots: [], blasts: [],
    // カメラは移動する機体を周回追従(機体は常に中央、地面が流れる)。
    camera: { eye: [pvX + Math.cos(camAng) * 7.2, 3.84, pvY + Math.sin(camAng) * 7.2], target: [pvX, 2.46, pvY] },
  }, t);
}
// ---- 機体鑑賞(viewer): 工廠の機体を手で動かして眺める ----
// 入力は ui.viewerInput()(ボタンで選んだ移動/歩調/旋回/カメラ + 単発アクションの待ち行列)。
// ここが持つのは「時計」だけ: アクションを踏んだ時刻を覚え、r3d の age01(0..1)へ焼き直して scene に載せる。
// 姿勢/歩容/演出は戦闘とまったく同じ computeMechPose を通る(鑑賞用の別実装を作らない)。sim.js には
// 触れないので REPLAY_V の互換とは無関係。
const VW_SPEED = 12;          // 全速の対地速度[m/s](工廠プレビューと同じ見せ場速度)
const VW_TURN = 1.15;         // 旋回速度[rad/s]
const VW_DUR = { atk: 0.9, hit: 0.55, dodge: 0.45 };   // 各モーションの尺[s](プレビュー実演と同値)
const VW_REPEAT_GAP = 0.45;   // くり返し再生の間合い[s]
const VW_TARGET_Y = 2.46;     // 注視点の高さ(胴のあたり)
const VW_MOVE_DIR = { stop: [0, 0], fwd: [1, 0], back: [-1, 0], left: [0, -1], right: [0, 1] };  // [fwd, lat] lat:+1=右
let vwR3d = null, vwCanvas = null, vwMesh = null, vwKey = '', vwCssW = 0, vwCssH = 0;
let vwX = 500, vwY = 500, vwH = 0, vwWalk = 0, vwLastNow = 0, vwOrbitAz = 38;
let vwAtk = null, vwHit = null, vwDodge = null;   // 発動時刻 t0 つき(null=未発動/終了済)
let vwDeadT = null;                               // 撃破した時刻(null=生存)
let vwLastAct = null, vwActEnd = 0;               // くり返し再生用(最後に押した動作とその終了時刻)
let vwFocus = [0, 2.46, 0];                       // カメラ狙点の「足元からのオフセット」(撃破時に胴へ降りる)

function vwFire(a, t, build) {
  let dur = 0;
  if (a === 'atkR' || a === 'atkL') {
    const w = getPart('wpn', a === 'atkR' ? build.wpnR : build.wpnL);
    if (!w) return;
    vwAtk = { kind: w.kind, side: a === 'atkR' ? 'R' : 'L', t0: t }; dur = VW_DUR.atk;
  } else if (a === 'hit') { vwHit = { t0: t }; dur = VW_DUR.hit; }
  else if (a === 'dodgeR' || a === 'dodgeL') { vwDodge = { side: a === 'dodgeR' ? 1 : -1, t0: t }; dur = VW_DUR.dodge; }
  else if (a === 'down') { if (vwDeadT == null) vwDeadT = t; return; }   // 撃破/再起動はくり返し対象外
  else if (a === 'rise') { vwDeadT = null; return; }
  else return;
  vwLastAct = a; vwActEnd = t + dur;
}
const vwAge = (fx, dur, t) => { if (!fx) return null; const a = (t - fx.t0) / dur; return a >= 0 && a < 1 ? a : null; };

function viewerTick(now) {
  const c = document.querySelector('.mech-viewer');
  if (!c || c.offsetParent === null) return;       // 鑑賞画面が出ていない間は何もしない
  if (c !== vwCanvas) { vwCanvas = c; vwR3d = makeR3D(c); vwKey = ''; vwCssW = 0; }
  const rct = c.getBoundingClientRect();
  if (rct.width > 0 && (rct.width !== vwCssW || rct.height !== vwCssH)) {   // 回転/リサイズ追従
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    vwCssW = rct.width; vwCssH = rct.height;
    c.width = Math.round(rct.width * dpr); c.height = Math.round(rct.height * dpr);
  }
  // 描画対象は鑑賞用コピー(ui.viewerBuild)。出撃機体(S.current)は鑑賞では書き換わらない。
  const build = (ui.viewerBuild && ui.viewerBuild()) || S.current;
  const key = JSON.stringify([build.frame, build.legs, build.gen, build.armor, build.wpnR, build.wpnL, build.color]);
  if (key !== vwKey) { vwKey = key; try { vwMesh = mechMesh(build, PARTS, build.color); } catch (e) { vwMesh = null; } }
  if (!vwMesh) return;

  const v = ui.viewerInput();
  const t = now / 1000;
  const dt = vwLastNow ? Math.min(0.1, (now - vwLastNow) / 1000) : 0; vwLastNow = now;
  while (v.queue.length) vwFire(v.queue.shift(), t, build);
  if (v.repeat && vwLastAct && t > vwActEnd + VW_REPEAT_GAP) vwFire(vwLastAct, t, build);
  const alive = vwDeadT == null;

  // 移動: ボタンで選んだ向き × 歩調。fwd/lat(機体ローカル -1..1)が対地速度と歩容の両方を決める
  // (低速ほど歩幅が伸びて重い足取りになる=戦闘と同じ moveLocal 契約)。
  const dir = VW_MOVE_DIR[v.move] || VW_MOVE_DIR.stop;
  const sp = alive ? (v.speedMul || 0) : 0;
  const mv = { fwd: dir[0] * sp, lat: dir[1] * sp, mag: Math.min(1, Math.hypot(dir[0], dir[1]) * sp) };
  if (alive) vwH += (v.turn || 0) * VW_TURN * dt;
  const fwdX = Math.cos(vwH), fwdZ = Math.sin(vwH), rgtX = Math.sin(vwH), rgtZ = -Math.cos(vwH);
  vwX += (fwdX * mv.fwd + rgtX * mv.lat) * VW_SPEED * dt;
  vwY += (fwdZ * mv.fwd + rgtZ * mv.lat) * VW_SPEED * dt;
  vwWalk += dt * (mv.mag * 30) * 0.22;   // 非脚パーツ(履帯揺れ等)用

  const aAtk = vwAge(vwAtk, VW_DUR.atk, t), aHit = vwAge(vwHit, VW_DUR.hit, t), aDod = vwAge(vwDodge, VW_DUR.dodge, t);
  const mech = {
    mesh: vwMesh, x: vwX, y: vwY, h: vwH, hp: alive ? 999 : 0,
    alive, deadAge: alive ? 0 : t - vwDeadT, walkPhase: vwWalk, moveLocal: mv,
    attack: aAtk != null ? { kind: vwAtk.kind, age01: aAtk, side: vwAtk.side } : null,
    // 被弾は「正面からの着弾」= 押し込みは機体後方へ
    hitFx: aHit != null ? { age01: aHit, dirX: -fwdX, dirZ: -fwdZ, mag: 0.85 } : null,
    dodgeFx: aDod != null ? { age01: aDod, side: vwDodge.side } : null
  };

  // カメラ: 機体の向きを基準にした方位角(0=正面から顔を見る)。自動周回はその方位角を回すだけなので、
  // 手動へ切り替えた瞬間に画が飛ばない。
  if (v.cam === 'orbit') vwOrbitAz = (vwOrbitAz + dt * 20) % 360; else vwOrbitAz = v.az || 0;
  const az = vwOrbitAz * Math.PI / 180, el = (v.el || 0) * Math.PI / 180, dist = v.dist || 7.6;
  // 狙点は「足元からのオフセット」で持ち、撃破で機体が横倒しになったら mechFocus(倒れた胴中心)へ
  // ゆっくり降りる。オフセットだけを平滑化するので、歩行中の追従は遅れない。
  const want = alive ? [0, VW_TARGET_Y, 0]
    : (function (f) { return [f.x - vwX, f.y + 0.35, f.z - vwY]; })(mechFocus(mech, vwMesh));
  const k = dt > 0 ? 1 - Math.exp(-dt / 0.28) : 0;
  for (let i = 0; i < 3; i++) vwFocus[i] += (want[i] - vwFocus[i]) * k;
  const target = [vwX + vwFocus[0], vwFocus[1], vwY + vwFocus[2]];
  const rad = dist * Math.cos(el);
  const eye = [target[0] + Math.cos(vwH + az) * rad, Math.max(0.35, target[1] + dist * Math.sin(el)), target[2] + Math.sin(vwH + az) * rad];

  vwR3d.render({ mechs: [mech], shots: [], blasts: [], camera: { eye, target } }, t);
}

// 工廠プレビューと機体鑑賞は同じ rAF で回す(表示中の canvas 側だけが描画する)。
function studioLoop(now) {
  requestAnimationFrame(studioLoop);
  previewTick(now);
  viewerTick(now);
}
requestAnimationFrame(studioLoop);

// ---- 戦闘再生 ----
const els = ui.battleEls();

// ---- 実況行の追加(無線の話者名=パイロット名)+読み上げ(Web Speech API・既定OFF) ----
let ttsOn = false;
if (els.ttsBtn) {
  if (!window.speechSynthesis) els.ttsBtn.hidden = true;
  els.ttsBtn.onclick = () => {
    ttsOn = !ttsOn;
    els.ttsBtn.classList.toggle('primary', ttsOn);
    els.ttsBtn.textContent = ttsOn ? '🔊読み上げ中' : '🔊読み上げ';
    if (!ttsOn && window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) {}
  };
}
function speak(role, text) {
  if (!ttsOn || !window.speechSynthesis) return;
  if (speechSynthesis.pending) return;   // 溜まったら間引く(実況は流れが命)
  const u = new SpeechSynthesisUtterance(String(text));
  u.lang = 'ja-JP';
  const pr = { ana: [1.3, 1.25], kai: [0.8, 1.05], pilotA: [1.05, 1.15], pilotB: [0.9, 1.15], sys: [0.6, 1.3] }[role] || [1, 1];
  u.pitch = pr[0]; u.rate = pr[1]; u.volume = 0.9;
  try { speechSynthesis.speak(u); } catch (e) {}
}
function appendVoiceLine(role, text) {
  const meta = VOICE_ROLES[role] || { name: role, color: '#9ab8ff' };
  let label = role === 'sys' ? '' : meta.name;
  if (battle && role === 'pilotA') label = battle.pilotNames[0];
  if (battle && role === 'pilotB') label = battle.pilotNames[1];
  els.logview.appendChild(makeLogLine(role, label, meta.color, text));
  if (role !== 'sys') speak(role, text);
}
const radar = createRadar(els.cradar);
const r3d = makeR3D(els.c3d);
let battle = null, rafId = 0, lastNow = 0;

function sizeCanvases() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const c of [els.c3d, els.cradar]) {
    const r = c.getBoundingClientRect();
    if (r.width > 0) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  }
}
window.addEventListener('resize', () => { if (battle) sizeCanvases(); });

function startBattle(myBuild, foeBuild, seed, ctx) {
  const myName = ctx.myName || (S.current.name || 'マイ鋼機');
  let res;
  const pl = ctx.mode === 'replay' ? ctx.pilots
    : (ctx.mode === 'campaign' || ctx.mode === 'daily') && !AUTO && !STILL ? [pilotMods(), null] : undefined;
  // リプレイは版別凍結バンドル(sims/v<n>/)のシム・パーツで再生する(live は新規戦闘専用)
  const SIM = ctx.simBundle || null;
  try { res = (SIM ? SIM.simulate : simulate)(myBuild, foeBuild, seed, { nameA: myName, nameB: ctx.enemyName || '敵機', fieldId: ctx.fieldId, pilots: pl }); }
  catch (e) { ui.toast('機体が不正です: ' + e.message); return; }
  dbg('battle_start', { mode: ctx.mode, seed, field: res.fieldId });
  const evs = res.events.slice().sort((a, b) => a.t - b.t);
  const voice = narrate(res, { nameA: myName, nameB: ctx.enemyName || '敵機', seed,
    buildA: myBuild, buildB: foeBuild });   // St3: パーツ連動実況(ロードアウト紹介・脚種別回避/破損)
  battle = { res, evs, voice, ctx, t: 0, evIdx: 0, logIdx: 0,
    obsState: res.field.obstacles.map((o, i2) => ({ kind: o.kind, x: o.x, y: o.y, r: o.r, h: o.h || 0,
      deco: o.deco, alive: true, hpFrac: 1, hp0: o.hp, idx: i2 })),
    lastAtk: [null, null],
    _ba: myBuild, _bb: foeBuild,
    stA: (SIM ? SIM.deriveStats : deriveStats)(myBuild), stB: (SIM ? SIM.deriveStats : deriveStats)(foeBuild),
    wpnNames: [myBuild, foeBuild].map(bd => [(SIM ? SIM.getPart : getPart)('wpn', bd.wpnR), (SIM ? SIM.getPart : getPart)('wpn', bd.wpnL)].map(w => w ? w.name : '?')),
    meshes: [mechMesh(myBuild, SIM ? SIM.PARTS : PARTS, myBuild.color || '#8fa3b0'), mechMesh(foeBuild, SIM ? SIM.PARTS : PARTS, foeBuild.color || '#9a6a4f')],
    colors: [myBuild.color || '#8fa3b0', foeBuild.color || '#9a6a4f'],
    pilotNames: [ctx.mode === 'replay' ? enemyPilotName(myName) : (activePilot() && activePilot().name) || 'パイロット',
                 enemyPilotName(ctx.enemyName)],
    diedAt: [0, 1].map(i2 => { const d = res.events.find(e2 => e2.kind === 'destroyed' && e2.who === i2); return d ? d.t : null; }),
    walk: [0, 0], done: false, paused: false, surrendered: false, summary: null,
    hitstopUntil: 0, shakeUntil: 0, shakeDur: 240, shakeMag: 0,   // Ver6演出: ヒットストップ/画面シェイク(実時計・決定論の外)
    hitFlash: [-9, -9], hitFlashMag: [0, 0],   // Ver6演出: 被弾フラッシュ(機体が一瞬白熱)
    lastHit: [null, null], lastDodge: [null, null],   // St2演出: 被弾flinch/回避juke(描画のみ・シム非改変)
    groundLift: [0, 0], groundSeeded: false,   // v5: 足元の地面高(シムの足場と装飾の踏み面の高いほう。なまし済み・描画のみ)
    camCut: { t0: -9, dur: 0, x: 0, y: 0 }, camCutCool: -9,   // Ver6演出: クライマックス強制カメラカット(パリィ/大打撃)
    // リプレイ共有: この試合を再生するためのコード(自由入力は含めない)。args はもう一度観る用。
    // リプレイ観戦中は元コードをそのまま使う(再エンコードすると旧版の試合が現行版スタンプになるため)
    replayCode: ctx.mode === 'replay' ? (ctx.srcCode || null)
      : DEV || !REPLAY_ISSUE ? null   // 開発版・発行停止中はコードを発行しない(再生には影響しない)
      : encodeReplay({ seed, fieldId: res.fieldId, buildA: myBuild, buildB: foeBuild, pilots: pl,
          enemyRef: ctx.mode === 'campaign' ? 'c' + ctx.rank + ctx.idx
            : ctx.mode === 'daily' ? 'd' + todayStr() : null }),
    replayArgs: [myBuild, foeBuild, seed, ctx] };
  // カメラの記憶(シード・余韻カメラのラッチ等)を明示的に捨てる。director 側も時計の逆行で reset するが、
  // **レーダー/実況タブのまま試合を始めると3Dが1フレームも回らず、逆行を見逃したまま次の試合へ入る**
  // (前の試合のラッチが残り、決着した瞬間に前試合の座標へカメラが固定される)。開始点で断ち切る。
  if (r3d.resetCamera) r3d.resetCamera();
  els.logview.textContent = '';   // 全行クリア(div でも有効)
  // 右ペイン: TGT-A(機体名) / TGT-B(機体名) — 機械的呼称+実名の併記
  if (els.hud.tgtSubA) els.hud.tgtSubA.textContent = `(${myName})`;
  if (els.hud.tgtSubB) els.hud.tgtSubB.textContent = `(${ctx.enemyName || '敵機'})`;
  window.__kb = battle;   // デバッグ/検証用(秘密情報なし)
  ui.showScreen('battle');
  sizeCanvases();
  if (STILL) { battle.t = res.duration + 10; }        // 静止画=即結末
  else if (SKIPT > 0) battle.t = Math.min(SKIPT, res.duration);
  lastNow = performance.now();
  ambientStart();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
  if (els.hud.skipBtn) els.hud.skipBtn.onclick = () => { const b = battle; if (b) b.t = b.res.duration + 1.1; };
  // 一時停止(停止/再開)
  if (els.hud.pauseBtn) {
    els.hud.pauseBtn.textContent = '停止';
    els.hud.pauseBtn.onclick = () => {
      const b = battle; if (!b || b.done) return;
      b.paused = !b.paused;
      els.hud.pauseBtn.textContent = b.paused ? '再開' : '停止';
    };
  }
  // 降参(演習/デイリーのみ。闘技場はスキップで足りる+パイロット不関与の公式戦)
  if (els.hud.surrenderBtn) {
    const canSur = (ctx.mode === 'campaign' || ctx.mode === 'daily') && !AUTO && !STILL;
    els.hud.surrenderBtn.hidden = !canSur;
    els.hud.surrenderBtn.onclick = () => {
      const b = battle; if (!b || b.done || !canSur) return;
      if (!window.confirm('降参しますか? 機体とパイロットは安全に帰還しますが、名誉を失います。')) return;
      b.surrendered = true; b.paused = false;
      appendSurrenderLines();
      b.t = b.res.duration + 1.1;   // 即終了処理へ
    };
  }
  if (ui.hideAftermath) ui.hideAftermath();
}

// 降参の無線・実況(メタ演出=決定論の外でよい)
function appendSurrenderLines() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sub = (s) => s.replace(/\{ME\}/g, battle.ctx.myName || 'マイ鋼機').replace(/\{FOE\}/g, battle.ctx.enemyName || '敵機')
                      .replace(/\{A\}/g, battle.ctx.myName || 'マイ鋼機').replace(/\{B\}/g, battle.ctx.enemyName || '敵機');
  const L2 = LINES.surrender || {};
  const lines = [['sys', `[降参] TGT-A 戦闘中止信号を送信 — 交戦終了`]];
  if (L2.pilotA) lines.push(['pilotA', sub(pick(L2.pilotA))]);
  if (L2.ana) lines.push(['ana', sub(pick(L2.ana))]);
  if (L2.kai) lines.push(['kai', sub(pick(L2.kai))]);
  for (const [role, text] of lines) appendVoiceLine(role, text);
}

function interp(res, t) {
  const st = res.states;
  const fi = Math.min(st.length - 1, Math.max(0, Math.floor(t * 10)));
  const a = st[fi], b = st[Math.min(st.length - 1, fi + 1)];
  const k = Math.max(0, Math.min(1, t * 10 - fi));
  return a.m.map((ma, i) => { const mb = b.m[i]; return {
    x: ma.x + (mb.x - ma.x) * k, y: ma.y + (mb.y - ma.y) * k,
    h: ma.h + ((((mb.h - ma.h) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k,
    // cy=足場の標高(v5)。乗り降りを補間すると機体が段差を「滑らかに登る」ように見える
    // (シムは0.05sで切り替わるが、描画で瞬間移動させると足が地面から飛ぶ)。
    cy: (ma.cy || 0) + ((mb.cy || 0) - (ma.cy || 0)) * k,
    hp: ma.hp, en: ma.en }; });
}

let frameN = 0;
function frame(now) {
  if (!battle) return;
  // タブ切替や回転でcanvasの実寸が変わったら追従(可視のものだけ)
  if ((frameN++ & 15) === 0) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [els.c3d, els.cradar]) {
      const r = c.getBoundingClientRect();
      if (r.width > 0 && Math.abs(c.width - r.width * dpr) > 2) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    }
  }
  const dtReal = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
  const sp = (Number(els.hud.speedBtn.dataset.speed) || 1) * FAST;
  // Ver6演出: ヒットストップ中は時計を止める(大打撃/パリィ/撃破の一瞬のタメ)。STILL(静止画)は対象外。
  const frozen = !STILL && now < battle.hitstopUntil;
  if (!battle.paused && !frozen) battle.t += dtReal * sp;   // 終了後も時計は止めない(弾・エフェクトが然るべく消える)
  const res = battle.res, t = Math.min(battle.t, res.duration);
  const tFx = battle.t;   // エフェクト・実況・死亡アニメ用の非クランプ時計
  const mst = interp(res, t);
  // 余韻演出: 勝者は「終了時の位置から敗者へ近づき、十分近づいたら周回」(攻撃なし)。敗者は静止。
  // **足元の高さ・歩容・弾道より前に置くこと**: ここは interp が返した凍結位置を勝者ぶんだけ
  // 上書きする=以降のブロック(groundLift / walk / moveLocal / prevPos)が「勝者の実位置」を見る。
  // 後ろに置いていた頃は、勝者の足場標高が決着時の座標のまま凍り、塚際で決着すると勝者が埋まった/
  // 浮いたまま一周していた(人間判断 2026-08-01 で今回直す)。
  if (battle.done && battle.summary && battle.summary.myWin != null) {
    const wIdx = battle.summary.myWin ? 0 : 1, lIdx = 1 - wIdx;
    // 旋回半径(sim単位)。3D描画は WORLD_SCALE≈0.45 で縮むため、視覚で約10mになるよう補正
    // (後演出のみ・バランス無関係)。**正本は r3d.js**=余韻カメラの距離下限が同じ数を見る。
    const R2 = AFTERMATH_ORBIT_R_SIM;
    const dt2 = battle.paused ? 0 : dtReal * sp;   // 再生倍速も効く
    // 周回/接近の中心は「横倒しした敗者の胴中心」(feet基準だと機体が画面中央から外れる)。
    // v5: elev を渡さないと、瓦礫の上で撃破されたとき狙点だけ地面に残る。
    // 撃破決着でないとき(時間切れ判定・降参)は敗者が**立ったまま**描かれるので、横倒しの姿勢を
    // 渡してはいけない=余韻カメラ(r3d.js aftermath は実際の生死で mechFocus する)と中心が食い違う。
    const lDead = !!battle.loserDestroyed;
    const LF = mechFocus({ x: mst[lIdx].x, y: mst[lIdx].y, h: mst[lIdx].h,
                           alive: !lDead, deadAge: lDead ? 99 : null,
                           elev: battle.groundLift[lIdx] }, battle.meshes[lIdx]);
    const lcx = LF.x, lcy = LF.z;
    if (!battle.post) {
      // 接近速度は**開始時の距離から一度だけ**決める(APPROACH_SEC で到着)。毎フレーム dd から出すと
      // 近づくほど遅くなり、実測 p50=249単位で12.5s・最遠720単位で21s かかっていた(コメントの「8秒」は
      // 実現していなかった)。周回に入る前に画面を閉じられる=「決着後の周回が行われない」の正体。
      const dd0 = Math.max(0, Math.hypot(lcx - mst[wIdx].x, lcy - mst[wIdx].y) - R2);
      const APPROACH_SEC = 5;
      battle.post = { x: mst[wIdx].x, y: mst[wIdx].y, mode: 'approach', ang: 0,
                      spd: Math.max(14, Math.min(46, dd0 / APPROACH_SEC)) };   // 上限=標準二脚top(31)の1.5倍
    }
    const P = battle.post;
    const ddx = lcx - P.x, ddy = lcy - P.y, dd = Math.hypot(ddx, ddy) || 1;
    const SPD = P.spd;
    if (P.mode === 'approach') {
      if (dd > R2 + 0.5) {
        // 行き過ぎ防止: 1フレームの歩幅が残り距離を超えるなら、その分だけ進める(高速接近時のオーバーシュート)
        const step = Math.min(SPD * dt2, dd - R2);
        P.x += ddx / dd * step; P.y += ddy / dd * step;
        mst[wIdx].h = Math.atan2(ddy, ddx);          // 敗者の方を向いて歩く
      } else {
        P.mode = 'orbit';
        P.ang = Math.atan2(P.y - lcy, P.x - lcx);   // 今いる角度から滑らかに周回へ
        P.r = dd;                                    // 半径も**今いる距離から**始める(下の注記)
      }
    }
    if (P.mode === 'orbit') {
      // 半径を R2 へ**寄せながら**回る。いきなり `lcx + cos*R2` へ射影すると、決着時点で既に
      // 近い(dd ≤ R2+0.5=全決着の23.5%・最大21.8単位)場合に勝者が1フレームで旋回円までワープする。
      // 歩容が位置差分から出るようになった今は、それが「脚が0.8周期ぶん飛ぶ」として画に出る。
      const dr = R2 - P.r;
      P.r += (dr < 0 ? -1 : 1) * Math.min(Math.abs(dr), SPD * dt2);
      // 角速度は半径で割る=対地の周回速度(0.55×R2≈12.65)を半径によらず一定に保つ
      P.ang += 0.55 * R2 / Math.max(4, P.r) * dt2;
      P.x = lcx + Math.cos(P.ang) * P.r;
      P.y = lcy + Math.sin(P.ang) * P.r;
      mst[wIdx].h = P.ang + Math.PI / 2;             // 進行方向を向いて周回
    }
    mst[wIdx].x = P.x; mst[wIdx].y = P.y;
    // 足元の標高も勝者の**今の位置**で取り直す。cy は interp が返す凍結値=シムが最後に計算した
    // 決着時の座標のものなので、そのままだと塚際で決着したとき勝者が埋まった/浮いたまま一周する。
    // **脚種を渡すこと**: hover は乗りも沈みもしない(渡さないと、試合中は塚を突っ切っていた同じ機体が
    // 余韻でだけ天端に乗り上げる)。泥の沈み込みも同じ式で拾うので、沈んだまま決着しても浮き上がらない。
    mst[wIdx].cy = footYAt(res.field, P.x, P.y, battle.meshes[wIdx].legsKind);
    // 歩行位相(walk)と移動方向(moveLocal)は**下の共通ブロックに任せる**。このブロックが前に出た
    // ことで勝者の移動が prevPos との差分に現れるようになり、実対地速度がそのまま歩容に乗る
    // (以前はここが後ろにあって差分が0=脚が止まるため、速度を手で与えていた。手で与える版は
    // 接近速度のまま周回に入ってフットスケートする穴があった)。
    // くすぶる残骸の煙は r3d(poseMechFaces)側で横倒しした胴の実位置に出す(mech.smolder)。
  }

  // v5: 足元の地面高。cy=シムが知る足場(瓦礫の天端+ / 泥の沈み込み−)、decorLiftAt=装飾の踏み面
  // (縁石・折れた街灯・コンクリ塊。シムは知らない=乗って降りるだけで進路も速度も変わらない)。
  // **両者は「地面の高さ」なので足し算ではなく高いほう**。装飾が無い所(dl=0)では泥の沈み込みを
  // 潰さないよう cy をそのまま採る。0.09s のなましは実時計ではなく**試合の時計**で回す
  // (倍速再生・一時停止・ヒットストップに追従させる)。
  // 描画ブロックの中ではなく**ここ**で更新するのが肝: 3Dを描かないタブ(レーダー/実況)でも
  // 進み続けるので、そのまま決着しても敗者カメラの狙点が地面に取り残されない。
  { const dtG = (battle.paused || frozen) ? 0 : dtReal * sp;
    const k = dtG > 0 ? 1 - Math.exp(-dtG / 0.09) : 1;
    for (let i = 0; i < 2; i++) {
      const dl = decorLiftAt(battle.res.fieldId, mst[i].x, mst[i].y, 2.2);
      const cy = mst[i].cy || 0;
      const want = dl > 0 ? Math.max(cy, dl) : cy;
      // 初回フレームは種を置く(?still=1 は1フレームしか回らないので、なますと途中値で固まる)
      battle.groundLift[i] = battle.groundSeeded ? battle.groundLift[i] + (want - battle.groundLift[i]) * k : want;
    }
    battle.groundSeeded = true; }
  // イベント消化(SFX・promoDbg・カメラ演出用)
  while (battle.evIdx < battle.evs.length && battle.evs[battle.evIdx].t <= t) {
    const e = battle.evs[battle.evIdx++];
    if (e.kind === 'fire') {
      sfx(e.wpn === 'beam' || e.wpn === 'blade' ? 'beam' : 'fire'); dbg('fire', { wpn: e.wpn });
      battle.lastAtk[e.who] = { kind: e.wpn, t: e.t, side: e.slot === 1 ? 'L' : 'R' };
    }
    else if (e.kind === 'hit') { sfx('hit'); dbg('hit', { dmg: e.dmg });
      // Ver6演出: 被弾した機体を一瞬白熱させる(小打撃は淡く・大打撃は強く)
      battle.hitFlash[e.targ] = tFx; battle.hitFlashMag[e.targ] = Math.max(0.25, Math.min(1, e.dmg / 45));
      // St2演出: 被弾flinch(押し込みの向き=射手→標的。描画のみ)
      { const sh = mst[e.who], hdx = e.x - sh.x, hdy = e.y - sh.y, hd = Math.hypot(hdx, hdy);
        battle.lastHit[e.targ] = { t: e.t, dx: hd > 1e-6 ? hdx / hd : 0, dy: hd > 1e-6 ? hdy / hd : 0,
                                   mag: Math.max(0.3, Math.min(1, e.dmg / 45)) }; }
      // 大打撃はタメ(ヒットストップ)+シェイクで重みを出す。小口径の連射では発火しない。
      if (e.dmg >= 55) { battle.hitstopUntil = now + 95; battle.shakeUntil = now + 240; battle.shakeDur = 240; battle.shakeMag = Math.min(10, 4 + e.dmg / 20);
        // クライマックスカット: 大打撃の着弾点へ至近オービット(1.6s間隔で乱発を防ぐ)。撃破は決着カットに任せる。
        if (tFx - battle.camCutCool > 1.6) { battle.camCut = { t0: tFx, dur: 0.85, x: e.x, y: e.y }; battle.camCutCool = tFx; } } }
    else if (e.kind === 'parry') { sfx('parry'); dbg('parry', {}); battle.hitstopUntil = now + 75; battle.shakeUntil = now + 160; battle.shakeDur = 160; battle.shakeMag = 4.5;
      if (tFx - battle.camCutCool > 1.6) { battle.camCut = { t0: tFx, dur: 0.85, x: e.x, y: e.y }; battle.camCutCool = tFx; } }
    else if (e.kind === 'ammo_out') { sfx('click'); dbg('ammo_out', { wpn: e.wpn }); }
    // St2演出: 回避juke(横っ飛び)。側は「イベント時刻の偶奇」で決める=決定論(同じ再生で同じ側へ飛ぶ)
    else if (e.kind === 'dodge') { battle.lastDodge[e.targ] = { t: e.t, side: (Math.round(e.t * 10) & 1) ? 1 : -1 }; }
    // St2演出: ハザード被弾は向きのない小さなよろけ(沈み込みのみ)
    else if (e.kind === 'hazard') { battle.lastHit[e.who] = { t: e.t, dx: 0, dy: 0, mag: 0.5 }; }
    else if (e.kind === 'obs_hit') { const o = battle.obsState[e.idx]; if (o && o.hp0) o.hpFrac = Math.max(0, e.hp / o.hp0); }
    else if (e.kind === 'obs_down') { const o = battle.obsState[e.idx]; if (o) { o.alive = false; o.hpFrac = 0; } sfx('boom'); dbg('obs_down', {}); }
    else if (e.kind === 'destroyed') { sfx('boom'); dbg('destroyed', { who: e.who });
      battle.hitstopUntil = now + 145; battle.shakeUntil = now + 440; battle.shakeDur = 440; battle.shakeMag = 11; }
  }
  // 多視点実況の流し込み(役割色つき行。無線の話者名=パイロット名)。tFx=終了後のセリフ(t>duration)も流れる
  let logDirty = false;
  while (battle.logIdx < battle.voice.length && battle.voice[battle.logIdx].t <= tFx) {
    const v = battle.voice[battle.logIdx++];
    appendVoiceLine(v.role, v.text);
    logDirty = true;
  }
  if (logDirty) els.logview.scrollTop = els.logview.scrollHeight;
  // 発射エフェクト(直近ウィンドウ。tFx=終了後も経過して然るべく消える)
  const shots = [], blasts = [];
  // v5: 弾道と炸裂の高さは「そのイベント時刻に、その座標で機体が立っていた地面の高さ」に合わせる。
  // 生きている groundLift ではなく states を引くのは、2.4秒前のイベントを今の高さで描くと外れるため。
  // **足元と同じ式(装飾の踏み面も含む)にすること**: cy だけ見ると、装飾の瓦礫に乗って撃ったとき
  // マズルフラッシュ(computeMechPose 経由=踏み面込み)だけが上がって弾道が地上高に残る
  // (実測 2026-08-01: 崩落市街のイベントの16.9%・最大1.80=機体全高の43%が割れていた)。
  const liftAt = (t2, who, x, y) => {
    const s2 = res.states[Math.min(res.states.length - 1, Math.max(0, Math.round(t2 * 10)))];
    const cy = (s2 && s2.m[who] && s2.m[who].cy) || 0;
    const dl = decorLiftAt(battle.res.fieldId, x, y, 2.2);
    return dl > 0 ? Math.max(cy, dl) : cy;
  };
  for (let i = battle.evIdx - 1; i >= 0; i--) {
    const e = battle.evs[i]; if (tFx - e.t > 2.4) break;
    if (e.kind === 'fire') {
      const d = Math.hypot(e.tx - e.x, e.ty - e.y);
      const dur = e.wpn === 'beam' || e.wpn === 'blade' ? 0.22 : Math.max(0.15, d / (getPart('wpn', findWpnId(e.wname)) ? getPart('wpn', findWpnId(e.wname)).projSpeed || 600 : 600));
      const age = (tFx - e.t) / dur;
      if (age <= 1) shots.push({ x: e.x, y: e.y, tx: e.tx, ty: e.ty, kind: e.wpn, age01: age,
        ey0: liftAt(e.t, e.who, e.x, e.y), ey1: liftAt(e.t, e.targ, e.tx, e.ty) });
    } else if (e.kind === 'hit') {
      const age = (tFx - e.t) / 0.5; if (age <= 1) blasts.push({ x: e.x, y: e.y, age01: age, big: false, kind: 'hit', wpn: e.wpn, ey: liftAt(e.t, e.targ, e.x, e.y) });
    } else if (e.kind === 'parry') {
      const age = (tFx - e.t) / 0.45; if (age <= 1) blasts.push({ x: e.x, y: e.y, age01: age, big: false, kind: 'parry', ey: liftAt(e.t, e.targ, e.x, e.y) });
    } else if (e.kind === 'dodge' && e.splash > 0) {
      // Ver6: ミサイルを躱しても爆風だけ被る=小さめの炸裂(機構②の可視化)
      const age = (tFx - e.t) / 0.5; if (age <= 1) blasts.push({ x: e.x, y: e.y, age01: age, kind: 'hit', wpn: 'missile', scale: 0.5, ey: liftAt(e.t, e.targ, e.x, e.y) });
    } else if (e.kind === 'hazard') {
      // Ver6: 茨(棘)を踏んだ火花=地形が効いている感(rifleヒットの火花を流用)
      const age = (tFx - e.t) / 0.5; if (age <= 1) blasts.push({ x: e.x, y: e.y, age01: age, kind: 'hit', wpn: 'rifle', ey: liftAt(e.t, e.who, e.x, e.y) });
    } else if (e.kind === 'obs_down') {
      const age = (tFx - e.t) / 1.6; if (age <= 1) blasts.push({ x: e.x, y: e.y, age01: age, big: true, kind: 'boom' });
    } else if (e.kind === 'destroyed') {
      const age = (tFx - e.t) / 2.2; if (age <= 1) blasts.push({ x: e.x, y: e.y, age01: age, big: true, kind: 'boom', ey: liftAt(e.t, e.who, e.x, e.y) });
    }
  }
  // 歩行位相 + 移動方向(②: 機体ローカルの前後/横速度をEMAで平滑してレンダラへ渡す。
  // 前進/後退/ストレイフ/静止で脚の運びと体幹リーンを変える。決定論=同じ再生で同じ姿勢)
  const MV_REF = 30;                              // 正規化基準速度(標準二脚top≈31m/s → だいたい±1)
  const dtMove = battle.paused ? 0 : dtReal * sp; // このフレームのシム時間進み(秒)
  if (!battle.moveLocal) battle.moveLocal = [{ fwd: 0, lat: 0, mag: 0 }, { fwd: 0, lat: 0, mag: 0 }];
  for (let i = 0; i < 2; i++) {
    const prev = battle.prevPos ? battle.prevPos[i] : mst[i];
    const dx = mst[i].x - prev.x, dy = mst[i].y - prev.y;
    battle.walk[i] += Math.hypot(dx, dy) * 0.22;
    const ml = battle.moveLocal[i];
    let tf = ml.fwd, tl = ml.lat;                 // 異常フレーム(dt≈0/シーク)は前値を保持
    if (dtMove > 1e-4) {
      const vx = dx / dtMove, vy = dy / dtMove, h = mst[i].h || 0;
      const cos = Math.cos(h), sin = Math.sin(h);
      tf = Math.max(-1.3, Math.min(1.3, (vx * cos + vy * sin) / MV_REF));  // 前後(forward=(cos,sin))
      tl = Math.max(-1.3, Math.min(1.3, (vx * sin - vy * cos) / MV_REF));  // 横(right=(sin,-cos))
    }
    const a = dtMove > 1e-4 ? Math.max(0, Math.min(1, dtMove / 0.18)) : 0; // EMA時定数≈0.18s
    ml.fwd += (tf - ml.fwd) * a;
    ml.lat += (tl - ml.lat) * a;
    ml.mag = Math.min(1, Math.hypot(ml.fwd, ml.lat));
  }
  battle.prevPos = mst.map(m2 => ({ x: m2.x, y: m2.y }));
  const aliveArr = [resAlive(res, t, 0), resAlive(res, t, 1)];
  // HUD
  const st0 = battle.stA, st1 = battle.stB;
  // 撃破された機体はHPを0表示にする(胴大破など致命弾以外の撃破では最終サンプルにHPが残るため)。
  const hpDisp0 = aliveArr[0] ? Math.max(0, mst[0].hp) : 0;
  const hpDisp1 = aliveArr[1] ? Math.max(0, mst[1].hp) : 0;
  els.hud.hpAFill.style.width = 100 * hpDisp0 / st0.hp + '%';
  els.hud.hpBFill.style.width = 100 * hpDisp1 / st1.hp + '%';
  els.hud.enAFill.style.width = Math.max(0, 100 * mst[0].en / st0.enCap) + '%';
  els.hud.enBFill.style.width = Math.max(0, 100 * mst[1].en / st1.enCap) + '%';
  els.hud.hpAText.textContent = hpDisp0;
  els.hud.hpBText.textContent = hpDisp1;
  els.hud.timeText.textContent = t.toFixed(1) + 's';
  // 武装(名前+残弾)と戦術状態(states のサンプル値。-1=∞)
  const rawS = res.states[Math.min(res.states.length - 1, Math.max(0, Math.floor(t * 10)))];
  const amm = (v) => v < 0 ? '∞' : String(v);
  const STANCE_LABEL = { ap: '接近', hd: '距離維持', bk: '後退', fl: '離脱', ru: '突撃', ev: '回避行動' };
  for (let mi = 0; mi < 2; mi++) {
    const key = mi === 0 ? 'A' : 'B';
    const arr = rawS.m[mi].a || [];
    const pd = rawS.m[mi].pd || [0, 0, 0, 0, 0];
    for (let wi = 0; wi < 2; wi++) {
      const el = els.hud['wpn' + key + (wi + 1)];
      if (el) el.textContent = `${battle.wpnNames[mi][wi]}${pd[wi] >= 3 ? '(損)' : ''} ${amm(arr[wi])}`;
    }
    // 部位チップ(腕R/腕L/脚/炉。胴大破は即敗北なのでチップ対象外)
    const chips = els.hud['pd' + key];
    if (chips) for (let ci = 0; ci < 4; ci++) if (chips[ci]) chips[ci].dataset.lv = String(pd[ci] || 0);
    const stEl = els.hud['stance' + key];
    if (stEl) stEl.textContent = STANCE_LABEL[rawS.m[mi].s] || '—';
    const legacy = els.hud['ammo' + key];
    if (legacy) legacy.textContent = arr.length ? `R:${amm(arr[0])} L:${amm(arr[1])}` : '';
  }
  // 描画(通常=アクティブタブのみ。コックピットHUD時は3D+レーダーを毎フレーム両方描く)
  const mode = els.tabs.mode;
  const cockpit = !!els.tabs.cockpit;
  // St2: 攻撃モーション窓 0.65→0.9s(反動の戻り・振り抜きのフォロースルーを含める)
  const atk = battle.lastAtk.map(la => la && (t - la.t) >= 0 && (t - la.t) < 0.9 ? { kind: la.kind, age01: (t - la.t) / 0.9, side: la.side } : null);
  const aliveWalls = battle.obsState.filter(o => o.kind === 'wall' && o.alive);
  const occluded = aliveWalls.length ? !!losBlockedBy(mst[0].x, mst[0].y, mst[1].x, mst[1].y, aliveWalls) : false;
  const theme = QTHEME || (battle.ctx.mode === 'arena' ? 'arena' : 'training');   // 闘技場=公式戦の配色
  if (cockpit || mode === 'radar') {
    radar.render({ mechs: mst.map((m2, i) => ({ x: m2.x, y: m2.y, h: m2.h, hp: m2.hp, en: m2.en, color: battle.colors[i], alive: aliveArr[i] })), shots, blasts, obstacles: battle.obsState, sweep: tFx, theme }, tFx);
  }
  if (cockpit || (mode !== 'radar' && mode !== 'log')) {
    r3d.render({ mechs: mst.map((m2, i) => ({ mesh: battle.meshes[i], x: m2.x, y: m2.y, h: m2.h, hp: m2.hp, alive: aliveArr[i],
        elev: battle.groundLift[i],
        deadAge: battle.diedAt[i] != null && tFx >= battle.diedAt[i] ? tFx - battle.diedAt[i] : undefined,
        flash01: Math.max(0, 1 - (tFx - battle.hitFlash[i]) / 0.14) * (battle.hitFlashMag[i] || 0),   // Ver6: 被弾フラッシュ
        walkPhase: battle.walk[i], attack: atk[i], occluded: i === 1 && occluded,
        moveLocal: battle.moveLocal[i],
        // St2演出: 被弾flinch(0.55s)/回避juke(0.45s)。イベント時刻起点=決定論(同じ再生で同じ動き)
        hitFx: battle.lastHit[i] && (tFx - battle.lastHit[i].t) >= 0 && (tFx - battle.lastHit[i].t) < 0.55
          ? { age01: (tFx - battle.lastHit[i].t) / 0.55, dirX: battle.lastHit[i].dx, dirZ: battle.lastHit[i].dy, mag: battle.lastHit[i].mag } : null,
        dodgeFx: battle.lastDodge[i] && (tFx - battle.lastDodge[i].t) >= 0 && (tFx - battle.lastDodge[i].t) < 0.45
          ? { age01: (tFx - battle.lastDodge[i].t) / 0.45, side: battle.lastDodge[i].side } : null,
        // ② 撃破機のくすぶり煙は r3d 側で横倒しした胴の実位置に出す(位置ズレ解消)
        smolder: !!battle.loserDestroyed && !aliveArr[i] })),
      shots, blasts, obstacles: battle.obsState, camera: 'auto', theme,
      field: battle.res.fieldId,   // St4: 戦場id(描画のみ。地形の見え・遠景・街の装飾を戦場別に切替える)
      camCut: (tFx - battle.camCut.t0) < battle.camCut.dur   // Ver6: クライマックス強制カット(有効窓のみ)
        ? { x: battle.camCut.x, y: battle.camCut.y, age: tFx - battle.camCut.t0, dur: battle.camCut.dur } : null,
      aftermath: battle.done && battle.summary
        ? { loser: battle.summary.myWin == null ? -1 : (battle.summary.myWin ? 1 : 0) } : null }, tFx);
  }
  // Ver6演出: 画面シェイク(3DキャンバスへのCSS transform=描画に非干渉・実時計で減衰)
  if (els.c3d) {
    if (now < battle.shakeUntil && battle.shakeMag > 0.1) {
      const frac = Math.max(0, Math.min(1, (battle.shakeUntil - now) / (battle.shakeDur || 240)));
      const mag = battle.shakeMag * frac * frac;   // 二乗減衰=最後は静かに収まる
      const jx = (Math.sin(now * 0.091) + Math.sin(now * 0.033)) * 0.5 * mag;
      const jy = (Math.cos(now * 0.077) + Math.sin(now * 0.045)) * 0.5 * mag;
      els.c3d.style.transform = `translate(${jx.toFixed(1)}px, ${jy.toFixed(1)}px)`;
    } else if (els.c3d.style.transform) {
      els.c3d.style.transform = '';
    }
  }
  if (!battle.done && battle.t >= res.duration + 1.1) {
    battle.done = true;
    finishBattle();   // 戦果を確定しログに流す(画面遷移しない=余韻の中で実況を読める)
    if (AUTO || STILL) { showResultNow(); return; }
    if (ui.showAftermath) ui.showAftermath(battle.summary);   // 戦果はCONTROLの下に
    if (els.hud.pauseBtn) els.hud.pauseBtn.textContent = '停止';
    if (els.hud.surrenderBtn) els.hud.surrenderBtn.hidden = true;
    els.logview.scrollTop = els.logview.scrollHeight;
  }
  rafId = requestAnimationFrame(frame);
}
function resAlive(res, t, i) {
  for (const e of res.events) if (e.kind === 'destroyed' && e.who === i && e.t <= t) return false;
  return true;
}
function findWpnId(wname) { const w = PARTS.wpn.find(x => x.name === wname); return w ? w.id : null; }

function finishBattle() {
  const { res, ctx } = battle;
  // アリーナはサーバ権威の勝敗を最終とする(万一クライアント再生と食い違えばサーバ側を信じる)
  const effWinner = (ctx.mode === 'arena' && typeof ctx.serverWinner === 'number') ? ctx.serverWinner : res.winner;
  if (ctx.mode === 'arena' && effWinner !== res.winner) console.warn('kouki: server/client winner mismatch', ctx.serverWinner, res.winner);
  const myWin = battle.surrendered ? false : effWinner === 0 ? true : effWinner === 1 ? false : null;
  let credits = 0, medalGain = 0, decayed = false; const unlockedNames = [];
  if (!battle.surrendered) {
    if (ctx.mode === 'campaign') {
      if (myWin) {
        const arr = S.progress[ctx.rank] || (S.progress[ctx.rank] = [false, false, false]);
        credits = ctx.reward * (arr[ctx.idx] ? 0.4 : 1) | 0;
        if (!arr[ctx.idx]) medalGain = 1;      // 初回クリアで勲章(コスメ通貨)
        arr[ctx.idx] = true;
      }
    } else if (ctx.mode === 'daily') {
      if (myWin && !(S.daily.date === todayStr() && S.daily.done)) { credits = ctx.reward; medalGain = 1; S.daily = { date: todayStr(), done: true }; }
      else if (myWin) credits = 60;
    } else if (ctx.mode === 'arena') {
      credits = myWin ? 80 : 30;
    }
  }
  // 同じ構成で同じ敵に勝ち続けると報酬が減る(連打での賞金稼ぎ防止。過去5勝分を記憶)
  if (myWin && (ctx.mode === 'campaign' || ctx.mode === 'daily') && !AUTO && !STILL) {
    const bkey = ctx.mode === 'campaign' ? ctx.rank + ':' + ctx.idx : 'daily';
    const bh = buildHash(battle._ba);
    const hist = S.history[bkey] || [];
    const n = hist.filter(h2 => h2 === bh).length;
    const mult = [1, 0.5, 0.25, 0.1, 0.1, 0.1][Math.min(n, 5)];
    if (mult < 1 && credits > 0) { credits = credits * mult | 0; decayed = true; }
    hist.push(bh); S.history[bkey] = hist.slice(-5);
  }
  S.credits += credits; S.medals = (S.medals || 0) + medalGain;
  // ---- パイロット(演習/デイリーのみ。闘技場は脱出装置義務のイコールコンディション=不関与) ----
  const pilotLines = [];
  const p = activePilot();
  const endEvt = res.events[res.events.length - 1];
  if ((ctx.mode === 'campaign' || ctx.mode === 'daily') && !AUTO && !STILL && p) {
    p.sorties = (p.sorties || 0) + 1;
    let honorDelta = 0;
    // 僅差(名誉+): 時間切れ=残HP%差15以内 / 撃破決着=勝者の残HP%が18以下の死闘
    const hpA0 = battle.stA.hp, hpB0 = battle.stB.hp;
    const pctA = Math.max(0, endEvt.hpA) * 100 / hpA0, pctB = Math.max(0, endEvt.hpB) * 100 / hpB0;
    const close = endEvt.reason === 'time' ? Math.abs(pctA - pctB) <= 15
      : (myWin === true ? pctA <= 18 : myWin === false ? pctB <= 18 : false);
    if (battle.surrendered) {
      honorDelta -= 8;
      pilotLines.push(`${p.name} は降参し、無傷で帰還した(名誉 -8)`);
    } else {
      const lvBefore = pilotLevel(p);
      const ri = ctx.mode === 'campaign' ? Math.max(0, CAMPAIGN.findIndex(r2 => r2.rank === ctx.rank)) : 1;
      const gain = myWin ? 40 + ri * 10 : 15;
      p.xp = (p.xp || 0) + gain;
      if (p.injury > 0) p.injury--;
      const lvNow = pilotLevel(p);
      pilotLines.push(`PILOT ${p.name} +${gain}XP · Lv${lvNow}${lvNow > lvBefore ? '(昇格!)' : ''}`);
      if (myWin) { p.wins = (p.wins || 0) + 1; honorDelta += 2; }
      // 胴体大破(core)で敗北した場合は脱出が困難=死傷リスク上昇
      const coreDown = res.events.some(e2 => e2.kind === 'destroyed' && e2.who === 0 && e2.reason === 'core');
      if (myWin === false && (endEvt.reason === 'destroy' || endEvt.reason === 'hazard' || endEvt.reason === 'core' || endEvt.reason === 'self')) {
        honorDelta += 1;   // 撃破されるまで戦った
        const roll = Math.random();   // メタ進行のみ(リプレイ決定論の外)
        if (roll < (coreDown ? 0.20 : 0.06)) {
          pilotLines.push(`${p.name}、脱出ならず——帰還せず`);
          S.graveyard.push({ name: p.name, level: pilotLevel(p), honor: clamp01(p.honor + honorDelta + (close ? 2 : 0)),
                             sorties: p.sorties, wins: p.wins || 0, kia: todayStr() });
          S.kiaTotal = (S.kiaTotal || 0) + 1;
          S.pilots[S.active] = null;
          const na = S.pilots.findIndex(Boolean);
          if (na >= 0) { S.active = na; pilotLines.push(`${S.pilots[na].name} が次の出撃を引き継ぐ`); }
          else pilotLines.push('搭乗員がいない — タイトルで新パイロットを登録せよ');
          pilotLines.push(`${p.name} は墓場に眠る(⚰)`);
        } else if (roll < (coreDown ? 0.60 : 0.41)) {
          p.injury = 2;
          pilotLines.push(`${p.name} 負傷 — 2戦の間、調子が落ちる`);
        } else {
          pilotLines.push(`${p.name} は無事に脱出した`);
        }
      }
    }
    if (close && !battle.surrendered) { honorDelta += 2; pilotLines.push('死闘 — 名誉 +2'); }
    if (decayed) honorDelta -= 1;    // 勝った相手との同構成連戦は誉れにならない
    if (S.pilots[S.active] === p) p.honor = clamp01((p.honor == null ? 50 : p.honor) + honorDelta);
  }
  save();
  ambientStop();
  // 読み上げは止めない(余韻。止めるのは戦闘画面を去る stopBattle のみ)
  if (myWin) sfx('win');
  battle.loserDestroyed = myWin != null &&
    res.events.some(e2 => e2.kind === 'destroyed' && e2.who === (myWin ? 1 : 0));
  dbg('result', { win: myWin, duration: res.duration, credits });
  // 戦果を管制電文+実況としてログに流す(結果画面へは「結果を見る」で)
  const verdict = battle.surrendered ? '降参' : myWin === true ? '勝利' : myWin === false ? '敗北' : '引き分け';
  if (ctx.mode === 'replay') appendVoiceLine('sys', `[リプレイ] 記録再生終了 — ${verdict}(TGT-A視点)`);
  else appendVoiceLine('sys', `[戦果] ${verdict} — 報酬 ${credits}C${decayed ? '(同構成連戦により減額)' : ''}`);
  if (medalGain) appendVoiceLine('sys', `[戦果] 勲章 +${medalGain}`);
  for (const pl2 of pilotLines) appendVoiceLine('sys', `[人事] ${pl2}`);
  if (myWin && LINES.reward && LINES.reward.ana) {
    const line = LINES.reward.ana[Math.floor(Math.random() * LINES.reward.ana.length)]
      .replace(/\{A\}/g, ctx.myName || (S.current.name || 'マイ鋼機')).replace(/\{B\}/g, ctx.enemyName || '敵機');
    appendVoiceLine('ana', line);
  }
  const statLines = [
    `戦場: ${res.field.name}`,
    `残存HP TGT-A ${Math.max(0, endEvt.hpA)} / TGT-B ${Math.max(0, endEvt.hpB)}`,
    ...(ctx.mode === 'replay' ? ['📼 共有リプレイの再生(報酬・戦績への影響なし)'] : []),
    ...(battle.surrendered ? ['🏳 降参 — 機体・パイロットは無傷(名誉 -8)'] : []),
    ...(decayed ? ['⚠ 同構成の連戦により報酬減(構成か相手を変えると満額)'] : []),
    ...(medalGain ? [`🎖 勲章 +${medalGain}`] : []),
    ...pilotLines,
    ctx.mode === 'arena' ? `レート ${ctx.rating}(${ctx.delta >= 0 ? '+' : ''}${ctx.delta})` : `対戦相手: ${ctx.enemyName}`,
  ];
  // リプレイ共有URL(コードが作れた試合のみ。降参は途中打切り=記録と再生が一致しないので出さない)
  const replayUrl = battle.replayCode && !battle.surrendered
    ? location.origin + location.pathname + '?r=' + battle.replayCode : null;
  const rArgs = battle.replayArgs;
  battle.summary = {
    winTxt: battle.surrendered ? 'SURRENDER' : myWin === true ? 'WIN' : myWin === false ? 'LOSE' : 'DRAW',
    myWin, duration: res.duration, credits, unlocked: unlockedNames, statLines, replayUrl,
    retryLabel: ctx.mode === 'arena' ? 'もう一度(再マッチ)' : ctx.mode === 'replay' ? 'もう一度観る' : '出撃選択へ',
    onRetry: () => {
      if (ctx.mode === 'arena') { doArenaFight(); return; }  // アリーナ再戦はサーバへ(ローカル再生で報酬を稼がせない)
      if (ctx.mode === 'replay') { startBattle(rArgs[0], rArgs[1], rArgs[2], rArgs[3]); return; }
      stopBattle(); refreshTitle(); refreshCampaign(); ui.showScreen('sortie');   // 同構成連戦を誘導しない
    },
    onTitle: () => { stopBattle(); ui.showScreen('title'); refreshTitle(); refreshCampaign(); },
    shareData: {
      text: replayUrl
        ? `『鋼機工廠』 ${verdict} — ${res.duration}s ${ctx.enemyName ? 'vs ' + ctx.enemyName : ''}|この交戦記録はリンクからそのまま再生できます⚙ #FablePlayground #fable5`
        : `『鋼機工廠』 ${verdict} — ${res.duration}s ${ctx.enemyName ? 'vs ' + ctx.enemyName : ''} #FablePlayground #fable5`,
      url: replayUrl || 'https://d3j.github.io/armor-arena/',
      title: '鋼機工廠',
    },
  };
}
const clamp01 = (v) => Math.max(0, Math.min(100, Math.round(v)));
function showResultNow() {
  if (!battle || !battle.summary) return;
  cancelAnimationFrame(rafId);
  ui.showResult(battle.summary);
}
function stopBattle() {
  cancelAnimationFrame(rafId); ambientStop(); battle = null;
  if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) {}
}

// ---- 起動 ----
(async function init() {
  refreshTitle(); refreshHangar(); refreshCampaign(); refreshCollection();
  ui.showScreen('title');
  if (api) {
    try { const r = await api.me(); user = r.user; ui.setUser(user); if (user) pullCloudGarage(); }
    catch (e) { user = null; apiDead = true; }
  }
  refreshArena();
  if (DEV) ui.toast('開発版(シム調整用)— 通信・リプレイは無効');
  // ---- リプレイ観戦(?r=コード): 共有された交戦記録を版別凍結シムで決定論再生。撮影デモより優先 ----
  if (RCODE && DEV) ui.toast('開発版ではリプレイ再生は無効です(本番 kouki/ で開いてください)');
  else if (RCODE && !AUTO && !STILL) {
    const rp = decodeReplay(RCODE);
    if (!rp) {
      ui.toast(RCODE.indexOf('1.') === 0
        ? '旧形式のリプレイURLは廃止されました(v2形式で共有し直してください)'
        : 'リプレイURLが壊れているか、改変されています');
    } else {
      const bundle = await loadSimBundle(rp.v);
      if (!bundle) ui.toast('この記録の再生データを読み込めませんでした(通信環境を確認してください)');
      else if (!bundle.validateBuild(rp.buildA).ok || !bundle.validateBuild(rp.buildB).ok || !bundle.hasField(rp.fieldId)) {
        ui.toast('リプレイの機体データが不正です');
      } else {
        startBattle(rp.buildA, rp.buildB, rp.seed, { mode: 'replay', pilots: rp.pilots, enemyRef: rp.enemyRef,
          myName: codename('RPL-A:' + RCODE), enemyName: replayEnemyName(rp.enemyRef, RCODE), fieldId: rp.fieldId,
          simBundle: bundle, srcCode: RCODE });
        appendVoiceLine('sys', '[リプレイ] 共有された交戦記録を再生中(報酬なし・機体は識別コード表示)');
        return;
      }
    }
  }
  if (AUTO || STILL || SKIPT > 0) {
    // 撮影デモ: ランクB2(強襲・見せ場が多い) vs 現機体、シード固定
    const f = CAMPAIGN[3].fights[1];
    const demoBuild = { frame:'fr2', legs:'lg1', gen:'gn2', armor:'ar2', wpnR:'wp1', wpnL:'wp2', ai:'ai2', color:'#4d7ea8', decal:'none', name:'シラサギ' };
    startBattle(demoBuild, f.build, QSEED != null ? QSEED : 20260705, { mode: 'campaign', rank: 3, idx: 1, reward: f.reward, enemyName: f.name, fieldId: QFIELD || 'sekichu' });
    if (AUTO && !STILL) {
      // タブ自動切替(3D→レーダー→実況→3D)
      const sched = [[9, 'radar'], [16, 'log'], [21, '3d']];
      for (const [sec, mode] of sched) setTimeout(() => {
        if (!battle) return;
        const btn = mode === '3d' ? els.tabs.btn3d : mode === 'radar' ? els.tabs.btnRadar : els.tabs.btnLog;
        btn.click();
      }, sec * 1000 / FAST);
    }
  }
})();
}
