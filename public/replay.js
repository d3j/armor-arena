// 鋼機工廠 — リプレイ共有コード v2(pure ESM・DOM非依存)
// シムは完全決定論なので「seed+両機体+戦場+パイロット補正」だけで試合全体を再生できる。
//
// 形式 v2: "?r=" + <版番号1字(36進)> + <base64url(ビットパック+チェックサム)>(実測43〜45字)
//   ビット割り: seed32 / 戦場8 / 機体=(パーツ接尾辞8×7+色24)×2 / パイロット補正8×2 /
//               敵参照2+(0|8|20) / チェックサム24(salt付きFNV-1a)
//   8bit幅=カテゴリ255種・戦場256面まで拡張可(現行の25〜100倍)。それを超える改修は版分岐を足す。
//
// チェックサムは「雑な改変・URL欠損」を弾くためのもの(1字でも変わると再生拒否)。
// salt は公開JSに載るため、ソースを読んで再実装する相手には偽造可能= 厳密な真正性保証ではない
// (それが必要になったらサーバ発行短IDへ。making.md ■Ver13 の採否メモ参照)。
//
// 自由入力(機体名・パイロット名・識別コード)は一切含めない:
//   URLは誰でも書き換えられる=公開面に自由テキストを出さない方針(CGM回避)の踏襲。
//   表示名はコードから codename() で決定論生成する(game.js 側)。
//
// ── リプレイ互換の掟(破ると過去の共有URLが壊れる) ─────────────────────
// 1. パーツid・戦場idは追記専用。欠番の再利用禁止(廃止は永久欠番)。
// 2. FIELD_CODES の並びは追記専用(末尾にのみ追加。並べ替え・挿入・削除禁止)。
// 3. シムの挙動を変える改修をしたら REPLAY_V を +1 し、sims/v<新>/ に
//    sim.js / parts.js / fields.js をコピーする(check-freeze.mjs で等価性を検証)。
//    リプレイ再生は常に版別スナップショットを使う(live は新規戦闘のみ)。
// 4. ビット割り(レイアウト)を変える場合は decodeReplay に旧版の分岐を残すこと。
//    旧版エンコーダのチェックサムは新レイアウトでは一致しないため、分岐漏れは
//    「壊れた別試合」ではなく安全側(再生拒否)に倒れる。
// 5. シム調整は本番 kouki/ で直接行わない: make-dev.mjs で生成する kouki-dev(開発版)で
//    反復し、確定後に release-sim.mjs で一括リリース(トリオコピー+REPLAY_V+1+凍結作成)。
//    バージョン数は「調整回数」ではなく「リリース回数」でのみ増える。中間状態を本番に
//    置くと、同版スタンプのコードが確定版スナップショットで誤再生される事故が起きる。
// 6. 例外的に本番シムを直接いじる間は game.js の REPLAY_ISSUE=false にする
//    (コード発行のみ停止。過去URLの再生は全版そのまま生きる)。
//    スクリプトはともに promo/2026-07-05-kouki/_work/。
// ─────────────────────────────────────────────────────────────────

export const REPLAY_V = 4;   // 挙動版。シム挙動を変えたら +1(掟3)

// 戦場のビット表現(FIELD_CODES のインデックス)。追記専用(掟2)。
export const FIELD_CODES = ['plain', 'sekichu', 'deitan', 'crater', 'haikyo', 'ibara'];

const SALT = 'KOUKI-RPL/鋼機工廠/2026';
const CATS = [['frame', 'fr'], ['legs', 'lg'], ['gen', 'gn'], ['armor', 'ar'],
              ['wpnR', 'wp'], ['wpnL', 'wp'], ['ai', 'ai']];
const RANKS = 'EDCBAS';   // CAMPAIGN のランク並び(追記するなら末尾のみ)
const DEF_COLOR = 0x8fa3b0;

/* ---- ビット読み書き ---- */
class BitW {
  constructor() { this.buf = []; this.acc = 0; this.n = 0; }
  w(val, bits) {
    for (let i = bits - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((val >>> i) & 1);
      if (++this.n === 8) { this.buf.push(this.acc & 0xff); this.acc = 0; this.n = 0; }
    }
  }
  bytes() { const b = this.buf.slice(); if (this.n) b.push((this.acc << (8 - this.n)) & 0xff); return b; }
}
class BitR {
  constructor(bytes) { this.b = bytes; this.p = 0; }
  r(bits) {   // 範囲外に達したら null(コード欠損)
    let v = 0;
    for (let i = 0; i < bits; i++) {
      const byte = this.b[this.p >> 3];
      if (byte === undefined) return null;
      v = v * 2 + ((byte >>> (7 - (this.p & 7))) & 1);   // *2 で 32bit 超もしない(seed32用)
      this.p++;
    }
    return v;
  }
}

/* ---- base64url(自前・依存なし) ---- */
const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    s += B64C[a >> 2] + B64C[((a & 3) << 4) | (b == null ? 0 : b >> 4)];
    if (b != null) s += B64C[((b & 15) << 2) | (c == null ? 0 : c >> 6)];
    if (c != null) s += B64C[c & 63];
  }
  return s;
}
function b64ToBytes(s) {
  const out = []; let acc = 0, n = 0;
  for (const ch of s) {
    const v = B64C.indexOf(ch);
    if (v < 0) return null;
    acc = ((acc << 6) | v) & 0x3fff; n += 6;
    if (n >= 8) { n -= 8; out.push((acc >>> n) & 0xff); }
  }
  return out;
}

/* ---- チェックサム: 全フィールドの正準文字列+salt を FNV-1a → 下位24bit ---- */
function fnv1a(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
const checksum = (fields) => fnv1a(fields.join('|') + '|' + SALT) & 0xffffff;

/* ---- 色: 3/6/8桁hexを6桁RGBの24bit整数へ正規化(それ以外は既定色) ---- */
function colorInt(c) {
  let h = String(c || '').replace('#', '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  else if (/^[0-9a-f]{8}$/.test(h)) h = h.slice(0, 6);
  else if (!/^[0-9a-f]{6}$/.test(h)) return DEF_COLOR;
  return parseInt(h, 16);
}
const colorStr = (n) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');

/* ---- 機体 → パーツ接尾辞7個(各1..255)。構造チェックのみ(実在検証は版別バンドル側) ---- */
function buildNums(b) {
  if (!b || typeof b !== 'object') return null;
  const nums = CATS.map(([key, pre]) => {
    const id = String(b[key] || '');
    if (id.slice(0, pre.length) !== pre) return null;
    const n = Number(id.slice(pre.length));
    return Number.isInteger(n) && n >= 1 && n <= 255 ? n : null;
  });
  return nums.some(n => n == null) ? null : nums;
}
function numsToBuild(nums, col) {
  const b = { decal: 'none', name: '', color: colorStr(col) };
  for (let i = 0; i < 7; i++) b[CATS[i][0]] = CATS[i][1] + nums[i];
  return b;
}

/* ---- 敵参照 "cB1"/"d20260717" ⇔ (type, val) ---- */
function refToBits(ref) {
  let m;
  if ((m = /^c([A-Z])(\d{1,2})$/.exec(ref || ''))) {
    const ri = RANKS.indexOf(m[1]), fi = Number(m[2]);
    if (ri >= 0 && fi <= 15) return { type: 1, val: (ri << 4) | fi };
  }
  if ((m = /^d(\d{8})$/.exec(ref || ''))) {
    const y = Number(m[1].slice(0, 4)), md = Number(m[1].slice(4));
    if (y >= 2000 && y <= 2104) return { type: 2, val: (y - 2000) * 10000 + md };
  }
  return { type: 0, val: 0 };
}
function bitsToRef(type, val) {
  if (type === 1) {
    const ri = (val >> 4) & 15, fi = val & 15;
    return ri < RANKS.length ? 'c' + RANKS[ri] + fi : null;
  }
  if (type === 2) return 'd' + (2000 + Math.floor(val / 10000)) + String(val % 10000).padStart(4, '0');
  return null;
}
const REF_BITS = { 0: 0, 1: 8, 2: 20 };

/* ================================================================
   encodeReplay: { seed, fieldId, buildA, buildB, pilots?, enemyRef? } → コード or null
   ================================================================ */
export function encodeReplay(r) {
  if (!r) return null;
  const fIdx = FIELD_CODES.indexOf(String(r.fieldId || ''));
  const nA = buildNums(r.buildA), nB = buildNums(r.buildB);
  if (fIdx < 0 || !nA || !nB) return null;
  const cA = colorInt(r.buildA.color), cB = colorInt(r.buildB.color);
  const p = (r.pilots && r.pilots[0]) || null;
  const clamp8 = (v) => Math.max(-128, Math.min(127, Math.round(v))) & 0xff;
  const acc = clamp8(((p && p.acc) || 0) * 1000), eva = clamp8(((p && p.eva) || 0) * 1000);
  const seed = r.seed >>> 0;
  const ref = refToBits(r.enemyRef);

  const fields = [REPLAY_V, seed, fIdx, ...nA, cA, ...nB, cB, acc, eva, ref.type, ref.val];
  const w = new BitW();
  w.w(seed, 32); w.w(fIdx, 8);
  for (const n of nA) w.w(n, 8); w.w(cA, 24);
  for (const n of nB) w.w(n, 8); w.w(cB, 24);
  w.w(acc, 8); w.w(eva, 8);
  w.w(ref.type, 2); if (REF_BITS[ref.type]) w.w(ref.val, REF_BITS[ref.type]);
  w.w(checksum(fields), 24);
  return REPLAY_V.toString(36) + bytesToB64(w.bytes());
}

/* ================================================================
   decodeReplay: コード → { v, seed, fieldId, buildA, buildB, pilots?, enemyRef? } or null
   チェックサム不一致・欠損・旧v1形式はすべて null(壊れた別試合を黙って見せない)。
   パーツの実在検証はしない — 呼び側が loadSimBundle(v).validateBuild で行う
   (旧版で存在し現行で廃止されたパーツも、旧版バンドルでは正当に再生できるため)。
   ================================================================ */
export function decodeReplay(code) {
  const s = String(code || '').trim();
  if (s.length < 30 || s.length > 80) return null;
  const v = parseInt(s[0], 36);
  if (!Number.isInteger(v) || v < 2 || v > 35) return null;   // v1(ドット区切り)は廃止済み
  const bytes = b64ToBytes(s.slice(1));
  if (!bytes) return null;
  const rd = new BitR(bytes);
  const seed = rd.r(32), fIdx = rd.r(8);
  const nA = [], nB = [];
  for (let i = 0; i < 7; i++) nA.push(rd.r(8));
  const cA = rd.r(24);
  for (let i = 0; i < 7; i++) nB.push(rd.r(8));
  const cB = rd.r(24);
  const acc = rd.r(8), eva = rd.r(8);
  const refType = rd.r(2);
  if (refType == null || REF_BITS[refType] == null) return null;
  const refVal = REF_BITS[refType] ? rd.r(REF_BITS[refType]) : 0;
  const sum = rd.r(24);
  if (sum == null || [seed, fIdx, cA, cB, acc, eva, refVal].some(x => x == null) ||
      nA.some(x => !x) || nB.some(x => !x)) return null;
  if (checksum([v, seed, fIdx, ...nA, cA, ...nB, cB, acc, eva, refType, refVal]) !== sum) return null;
  if (fIdx >= FIELD_CODES.length) return null;   // 未知の戦場(このクライアントが古い可能性)

  const toSigned = (b) => b > 127 ? b - 256 : b;
  const pa = toSigned(acc) / 1000, pe = toSigned(eva) / 1000;
  const out = {
    v, seed: seed >>> 0, fieldId: FIELD_CODES[fIdx],
    buildA: numsToBuild(nA, cA), buildB: numsToBuild(nB, cB),
    pilots: (pa || pe) ? [{ acc: pa, eva: pe }, null] : undefined,
    enemyRef: bitsToRef(refType, refVal),
  };
  // 正準性: 現行版コードは encode(decode(s)) === s を要求(末尾パディング改変・伸長の変種を排除)。
  // 将来版(v > REPLAY_V)は再エンコードできないためチェックサムのみで受ける。
  if (v === REPLAY_V && encodeReplay(out) !== s) return null;
  return out;
}

/* ================================================================
   loadSimBundle: 版番号 → 凍結スナップショット(sims/v<n>/)の動的import。
   リプレイ再生は現行版でも必ずこれを使う(掟3)— live のシムが版バンプ忘れのまま
   変わっても、過去URLはスナップショットで正しく再生される。
   ================================================================ */
export async function loadSimBundle(v) {
  if (!Number.isInteger(v) || v < 2 || v > 35) return null;
  try {
    const [sim, parts] = await Promise.all([
      import(`./sims/v${v}/sim.js`),
      import(`./sims/v${v}/parts.js`),
    ]);
    return { simulate: sim.simulate, validateBuild: parts.validateBuild, hasField: (id) => sim.FIELDS.some(f => f.id === id),
             deriveStats: parts.deriveStats, getPart: parts.getPart, PARTS: parts.PARTS };
  } catch (e) {
    return null;
  }
}
