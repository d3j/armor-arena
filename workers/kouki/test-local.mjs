// 『鋼機工廠』(kouki) worker のインメモリ検証(Miniflare dispatchFetch)。
// 実行: node test-local.mjs   (※ workerd がポートを listen するため sandbox 無効が要る)
//
// 注意(親/後任へ): このファイルは public/sim.js と public/parts.js の完成前は
// 実行できない(src/index.js がそれらを import するため Miniflare のバンドルで解決できずエラーになる)。
// 両ファイルが揃ってから `npm i && node test-local.mjs` で実行すること。
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// workerd はモジュール名の ".." を許さないため、wrangler 同様に esbuild で単一ファイルへバンドルして渡す
execSync('npx --no-install esbuild src/index.js --bundle --format=esm --outfile=.test-bundle.mjs --log-level=warning', { stdio: 'inherit' });

// 行内コメント(-- 以降)も除去してから結合する
const schema = readFileSync('./schema.sql', 'utf8')
  .split('\n').map(l => { const i = l.indexOf('--'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');

const mf = new Miniflare({
  modules: true,
  scriptPath: './.test-bundle.mjs',
  compatibilityDate: '2024-11-01',
  d1Databases: { DB: 'fable-kouki' },
  kvNamespaces: ['KV'],
  bindings: {
    ALLOWED_ORIGINS: 'https://d3j.github.io,http://localhost:8742',
    GOOGLE_CLIENT_ID: '',
  },
});

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log((cond ? '  ✓' : '  ✗') + ' ' + name + (extra ? '  ' + extra : '')); };
const O = { Origin: 'https://d3j.github.io', 'Content-Type': 'application/json' };
const J = async r => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

// テスト用の機体(parts.js 確定後、実在するパーツidに合わせて調整すること)
const sampleBuild = () => ({
  frame: 'fr2', legs: 'lg1', gen: 'gn2', armor: 'ar2',
  wpnR: 'wp1', wpnL: 'wp2', ai: 'ai1', color: '#8fb3c7', decal: 'none', name: 'わたしの機体'
});

try {
  // スキーマ適用(bot 3体もこの時点でINSERTされる)
  const db = await mf.getD1Database('DB');
  for (const stmt of schema.split(';').map(s => s.trim()).filter(Boolean)) await db.exec(stmt.replace(/\n/g, ' '));

  // 1) 未ログイン GET /garage → 401
  let r = await mf.dispatchFetch('http://x/garage', { headers: O }); let d = await J(r);
  ok('未ログイン GET /garage→401', r.status === 401, 'status=' + r.status);

  // 2) CSRF: Origin無しの POST /arena/submit → 403
  r = await mf.dispatchFetch('http://x/arena/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ build: sampleBuild() }) });
  ok('Origin無しのPOST→403(CSRF)', r.status === 403, 'status=' + r.status);

  // ---- ログイン状態を KV に仕込む ----
  const kv = await mf.getKVNamespace('KV');
  await kv.put('sess:testsid', JSON.stringify({ id: 'google:T1', name: 'テスト太郎', email: 't@example.com', avatar: 'a' }));
  await kv.put('sess:testsid2', JSON.stringify({ id: 'google:T2', name: 'テスト次郎', email: 't2@example.com', avatar: 'a' }));
  const AUTH = { ...O, Cookie: '__session=testsid' };
  const AUTH2 = { ...O, Cookie: '__session=testsid2' };

  // 3) auth/me はログイン名を返すが email は返さない
  r = await mf.dispatchFetch('http://x/auth/me', { headers: AUTH }); d = await J(r);
  ok('auth/me ログイン名を返す', d.user && d.user.name === 'テスト太郎');
  ok('auth/me は email を返さない', d.user && d.user.email === undefined);

  // 4) 不正slot(8)→400
  r = await mf.dispatchFetch('http://x/garage/8', { method: 'PUT', headers: AUTH, body: JSON.stringify({ build: sampleBuild() }) });
  ok('不正slot(8)→400', r.status === 400, 'status=' + r.status);

  // 5) 不正build(validateBuild NG)→400。parts.js 完成前は sim.js 未実装のため実行不可(要 sim.js 完成後の実機確認)
  r = await mf.dispatchFetch('http://x/garage/0', { method: 'PUT', headers: AUTH, body: JSON.stringify({ build: { frame: 'not-exist' } }) });
  ok('不正build→400', r.status === 400, 'status=' + r.status);

  // 6) garage PUT→GET 往復
  const build0 = sampleBuild();
  r = await mf.dispatchFetch('http://x/garage/0', { method: 'PUT', headers: AUTH, body: JSON.stringify({ build: build0 }) });
  ok('garage PUT slot0→200', r.status === 200, 'status=' + r.status);
  r = await mf.dispatchFetch('http://x/garage', { headers: AUTH }); d = await J(r);
  ok('garage GET に slot0 が入っている(nameも保存される)', d.slots.length === 1 && d.slots[0].slot === 0 && d.slots[0].build.name === 'わたしの機体');

  // 7) アリーナ未登録で fight→400 {error:'not_submitted'}
  r = await mf.dispatchFetch('http://x/arena/fight', { method: 'POST', headers: AUTH }); d = await J(r);
  ok('未登録で fight→400 not_submitted', r.status === 400 && d.error === 'not_submitted', JSON.stringify(d));

  // 8) submit→201、codename が発行される(nameは含まれない=arenaに保存されるのはコピー)
  r = await mf.dispatchFetch('http://x/arena/submit', { method: 'POST', headers: AUTH, body: JSON.stringify({ build: sampleBuild() }) });
  d = await J(r);
  ok('submit→201、rating初期1200', r.status === 201 && d.rating === 1200 && typeof d.codename === 'string', JSON.stringify(d));

  // 9) 同一userでもう一度submit→200(更新。rating維持)
  r = await mf.dispatchFetch('http://x/arena/submit', { method: 'POST', headers: AUTH, body: JSON.stringify({ build: sampleBuild() }) });
  d = await J(r);
  ok('再submit→200、rating維持', r.status === 200 && d.rating === 1200, JSON.stringify(d));

  // 10) top に codename が出て、build/nameが出ないこと
  r = await mf.dispatchFetch('http://x/arena/top'); d = await J(r);
  const myRow = await db.prepare('SELECT codename FROM arena WHERE user_id=?').bind('google:T1').first();
  ok('top に自分のcodenameが出る', d.top.some(t => t.codename === myRow.codename));
  ok('top の行に build/name フィールドが無い', d.top.every(t => t.build === undefined && t.name === undefined));

  // 11) fight→bot 相手に成立(2人目の実ユーザがいない段階ではbotが相手になる)
  r = await mf.dispatchFetch('http://x/arena/fight', { method: 'POST', headers: AUTH }); d = await J(r);
  ok('fight→200、winner が 0/1/-1', r.status === 200 && [0, 1, -1].includes(d.winner), JSON.stringify(d));
  ok('fight レスポンスに seed/mine/opp が入る', typeof d.seed === 'number' && d.mine && d.opp && typeof d.opp.codename === 'string');
  ok('opp に build/name(私的名)は含まれるが機体構成のみ(nameフィールドは無い)', d.opp.build && d.opp.build.name === undefined);

  let brow = await db.prepare('SELECT COUNT(*) c FROM battles').first();
  ok('battles に1件記録', brow && brow.c === 1, 'count=' + (brow && brow.c));

  let arow = await db.prepare('SELECT rating, wins, losses FROM arena WHERE user_id=?').bind('google:T1').first();
  ok('自分のrating/wins/lossesが更新されている', arow && (arow.rating !== 1200 || arow.wins > 0 || arow.losses > 0), JSON.stringify(arow));

  // 12) history に直近1戦が出る
  r = await mf.dispatchFetch('http://x/arena/history', { headers: AUTH }); d = await J(r);
  ok('history に1件、winner_mine が bool|null', d.history.length === 1 && (typeof d.history[0].winner_mine === 'boolean' || d.history[0].winner_mine === null), JSON.stringify(d));

  // 13) 2人目のユーザも登録→次の fight では実プレイヤーが選ばれ得る(相手選択ロジックの疎通確認)
  r = await mf.dispatchFetch('http://x/arena/submit', { method: 'POST', headers: AUTH2, body: JSON.stringify({ build: sampleBuild() }) });
  ok('2人目 submit→201', r.status === 201, 'status=' + r.status);
  r = await mf.dispatchFetch('http://x/arena/fight', { method: 'POST', headers: AUTH2 });
  ok('2人目の fight→200', r.status === 200, 'status=' + r.status);

  // 14) fight 連打で rate limit 429(fight は60秒10回)
  let last = 200;
  for (let i = 0; i < 12; i++) {
    const rr = await mf.dispatchFetch('http://x/arena/fight', { method: 'POST', headers: AUTH });
    last = rr.status;
  }
  ok('fight 連打で429が発生する', last === 429, 'last=' + last);

} catch (e) {
  console.error('ERROR', e && e.stack || e); fail++;
} finally {
  await mf.dispose();
  console.log(`\n結果: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
