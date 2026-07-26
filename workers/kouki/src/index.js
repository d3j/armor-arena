/* =====================================================================
   workers/kouki — 『鋼機工廠』バックエンド(Cloudflare Worker)
   ---------------------------------------------------------------------
   workers/_template から派生。CGM(みんなが書ける投稿の公開)ではないため
   admin/ソフト削除/ブロック/通報/NGフィルタ/Turnstile/mod_log は持たない
   (契約は promo/2026-07-05-kouki/making.md「■仕様(契約)」節)。

   このWorkerが持つ責務:
     - CORS(オリジン固定・credentials付き) / CSRF(状態変更はOrigin必須)
     - Googleサインイン(F4)・KVセッション
     - ガレージ(機体保存。8スロット。build には私的名 name を含む=非公開)
     - アリーナ登録(公開面はサーバ生成の codename のみ。name は保存しない)
     - 非同期対戦: サーバがrating近傍の相手を選び、サーバ権威で simulate() を実行し
       Elo(K=32)でrating更新。クライアントは返ってきた seed で同じ試合を再生する。

   必要な env(wrangler.toml の vars / secret):
     ALLOWED_ORIGINS     (var)    : CORS 許可オリジン(カンマ区切り)
     GOOGLE_CLIENT_ID    (var)    : Google OAuth クライアントID(公開可)
     GOOGLE_CLIENT_SECRET(secret) : `wrangler secret put GOOGLE_CLIENT_SECRET`
   バインディング: DB(D1) / KV(KV)
   ===================================================================== */

import { simulate, validateBuild, FIELDS } from '../../../public/sim.js';
import { codename, sanitizeBuild } from '../../../public/parts.js';

const SESSION_TTL = 60 * 60 * 24 * 30;   // 30日
const STATE_TTL = 60 * 10;               // OAuth state は10分
const ELO_K = 32;
const RATE_LIMITS = {
  fight: { windowSec: 60, max: 10 },     // 対戦は重い(サーバ側simulate実行)ので厳しめ
  write: { windowSec: 60, max: 20 }      // garage保存 / arena登録
};

// プロバイダ定義。増やすときはここに1エントリ追加し、client_id/secret を env に入れるだけ。
const PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    clientId: env => env.GOOGLE_CLIENT_ID,
    clientSecret: env => env.GOOGLE_CLIENT_SECRET,
    normalize: u => ({ id: 'google:' + u.sub, name: u.name || u.email || 'user', email: u.email, avatar: u.picture })
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin') || '', env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      return (await route(request, env, url, cors)) || json({ error: 'not found' }, 404, cors);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, 500, cors);
    }
  }
};

async function route(request, env, url, cors) {
  const path = url.pathname;
  const method = request.method;

  /* ---------- CSRF 対策(状態変更はオリジン固定) ----------
     SameSite=None cookie はクロスサイトでも送られるため、CORS だけでは
     form/simple POST による CSRF を防げない。状態変更メソッドは Origin が
     ALLOWED_ORIGINS に一致することをサーバ側で必須化する(正規フロントは必ず
     Origin を送る)。OAuth の GET コールバック等は対象外。 */
  if (method !== 'GET' && method !== 'OPTIONS' && !originAllowed(request, env)) {
    return json({ error: 'forbidden origin' }, 403, cors);
  }

  /* ---------- 認証(F4) ---------- */
  const login = path.match(/^\/auth\/([a-z]+)\/login$/);
  if (login) return oauthLogin(env, url, login[1]);
  const cb = path.match(/^\/auth\/([a-z]+)\/callback$/);
  if (cb) return oauthCallback(env, url, cb[1]);
  if (path === '/auth/me') {
    const user = await currentUser(request, env);
    return json({ user: publicUser(user) }, 200, cors);
  }
  if (path === '/auth/logout' && method === 'POST') return logout(request, env, cors);

  /* ---------- ガレージ(F2。要ログイン。build には私的名 name を含む=非公開領域) ---------- */
  if (path === '/garage' && method === 'GET') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'login required' }, 401, cors);
    const { results } = await env.DB.prepare(
      'SELECT slot, build_json, updated_at FROM garage WHERE user_id = ? ORDER BY slot'
    ).bind(user.id).all();
    const slots = results.map(r => ({ slot: r.slot, build: JSON.parse(r.build_json), updated_at: r.updated_at }));
    return json({ slots }, 200, cors);
  }
  const slotMatch = path.match(/^\/garage\/(\d+)$/);
  if (slotMatch && (method === 'PUT' || method === 'POST')) { // api.js に put が無いため POST も受ける
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'login required' }, 401, cors);
    if (await rateLimit(request, env, 'write')) return json({ error: 'rate limited' }, 429, cors);
    const slot = parseInt(slotMatch[1], 10);
    if (!(slot >= 0 && slot <= 7)) return json({ error: 'slot は0〜7' }, 400, cors);
    const body = await readJson(request);
    const build = sanitizeBuild(body && body.build, { keepName: true });  // 余剰プロパティ遮断(name本人専用領域のみ保持)
    if (!build) return json({ error: 'build required' }, 400, cors);
    const v = validateBuild(build);
    if (!v.ok) return json({ error: 'invalid build', errors: v.errors }, 400, cors);
    const now = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO garage (user_id, slot, build_json, updated_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(user_id, slot) DO UPDATE SET build_json = excluded.build_json, updated_at = excluded.updated_at'
    ).bind(user.id, slot, JSON.stringify(build), now).run();
    return json({ ok: true, slot, updated_at: now }, 200, cors);
  }

  /* ---------- アリーナ登録(F2/F3。公開面には codename のみ。name は保存しない) ---------- */
  if (path === '/arena/submit' && method === 'POST') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'login required' }, 401, cors);
    if (await rateLimit(request, env, 'write')) return json({ error: 'rate limited' }, 429, cors);
    const body = await readJson(request);
    const arenaBuild = sanitizeBuild(body && body.build);  // ホワイトリスト再構築(name含む自由入力は一切保存しない)
    if (!arenaBuild) return json({ error: 'build required' }, 400, cors);
    const v = validateBuild(arenaBuild);
    if (!v.ok) return json({ error: 'invalid build', errors: v.errors }, 400, cors);
    const now = new Date().toISOString();
    const existing = await env.DB.prepare(
      'SELECT codename, rating, wins, losses FROM arena WHERE user_id = ?'
    ).bind(user.id).first();
    if (existing) {
      await env.DB.prepare('UPDATE arena SET build_json = ?, updated_at = ? WHERE user_id = ?')
        .bind(JSON.stringify(arenaBuild), now, user.id).run();
      return json({ ok: true, codename: existing.codename, rating: existing.rating,
        wins: existing.wins, losses: existing.losses }, 200, cors);
    }
    const cname = codename(user.id);   // 決定論(同じuser.idなら常に同じcodename)
    await env.DB.prepare(
      'INSERT INTO arena (user_id, codename, build_json, rating, wins, losses, updated_at) ' +
      'VALUES (?, ?, ?, 1200, 0, 0, ?)'
    ).bind(user.id, cname, JSON.stringify(arenaBuild), now).run();
    return json({ ok: true, codename: cname, rating: 1200, wins: 0, losses: 0 }, 201, cors);
  }

  /* ---------- 対戦(F3。サーバ権威で simulate() 実行 → Elo更新) ---------- */
  if (path === '/arena/fight' && method === 'POST') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'login required' }, 401, cors);
    if (await rateLimit(request, env, 'fight')) return json({ error: 'rate limited' }, 429, cors);

    const mine = await env.DB.prepare(
      'SELECT codename, build_json, rating, wins, losses FROM arena WHERE user_id = ?'
    ).bind(user.id).first();
    if (!mine) return json({ error: 'not_submitted' }, 400, cors);

    // 相手選択: rating差が近い順に最大5件(自分以外)から乱数で1件。いなければ bot 行を使う。
    let candList = (await env.DB.prepare(
      'SELECT user_id, codename, build_json, rating, wins, losses FROM arena WHERE user_id != ? ' +
      'ORDER BY ABS(rating - ?) ASC LIMIT 5'
    ).bind(user.id, mine.rating).all()).results;
    if (!candList || candList.length === 0) {
      const bot = await env.DB.prepare(
        "SELECT user_id, codename, build_json, rating, wins, losses FROM arena " +
        "WHERE user_id LIKE 'bot:%' ORDER BY RANDOM() LIMIT 1"
      ).first();
      if (!bot) return json({ error: 'no_opponent' }, 400, cors);
      candList = [bot];
    }
    const opp = candList[pickInt(candList.length)];

    const seedArr = new Uint32Array(1);
    crypto.getRandomValues(seedArr);
    const seed = seedArr[0];

    const myBuild = JSON.parse(mine.build_json);
    const oppBuild = JSON.parse(opp.build_json);
    const fieldId = FIELDS[seed % FIELDS.length].id;   // 戦場はseedから決定論(クライアント再生と一致)
    const result = simulate(myBuild, oppBuild, seed, { fieldId });
    const winner = result.winner;   // 0=自分(A側) 1=相手 -1=引き分け

    const { a: myNew, b: oppNew } = eloUpdate(mine.rating, opp.rating, winner);
    const now = new Date().toISOString();
    const myWinsDelta = winner === 0 ? 1 : 0;
    const myLossDelta = winner === 1 ? 1 : 0;
    const oppWinsDelta = winner === 1 ? 1 : 0;
    const oppLossDelta = winner === 0 ? 1 : 0;

    // rating は相対更新(rating = rating + delta)にして並行 fight での lost update を防ぐ
    await env.DB.batch([
      env.DB.prepare('UPDATE arena SET rating = rating + ?, wins = wins + ?, losses = losses + ?, updated_at = ? WHERE user_id = ?')
        .bind(myNew - mine.rating, myWinsDelta, myLossDelta, now, user.id),
      env.DB.prepare('UPDATE arena SET rating = rating + ?, wins = wins + ?, losses = losses + ?, updated_at = ? WHERE user_id = ?')
        .bind(oppNew - opp.rating, oppWinsDelta, oppLossDelta, now, opp.user_id),
      env.DB.prepare('INSERT INTO battles (a_user, b_user, seed, winner, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(user.id, opp.user_id, seed, winner, now)
    ]);

    return json({
      seed,
      fieldId,
      mine: { build: myBuild, codename: mine.codename, rating: myNew },
      opp: { codename: opp.codename, build: oppBuild, rating: oppNew },
      winner,
      myRating: myNew,
      delta: myNew - mine.rating
    }, 200, cors);
  }

  /* ---------- ランキング(F3。公開・ログイン不要。build/name は出さない) ---------- */
  if (path === '/arena/top' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT codename, rating, wins, losses FROM arena ORDER BY rating DESC LIMIT 20'
    ).all();
    return json({ top: results }, 200, cors);
  }

  /* ---------- 自分の対戦履歴(要ログイン) ---------- */
  if (path === '/arena/history' && method === 'GET') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'login required' }, 401, cors);
    const { results } = await env.DB.prepare(
      'SELECT bt.seed, bt.winner, bt.created_at, bt.a_user, bt.b_user, ' +
      '       aa.codename AS a_codename, ab.codename AS b_codename ' +
      'FROM battles bt ' +
      'LEFT JOIN arena aa ON aa.user_id = bt.a_user ' +
      'LEFT JOIN arena ab ON ab.user_id = bt.b_user ' +
      'WHERE bt.a_user = ? OR bt.b_user = ? ' +
      'ORDER BY bt.id DESC LIMIT 10'
    ).bind(user.id, user.id).all();
    const history = results.map(r => {
      const iAmA = r.a_user === user.id;
      const oppCodename = iAmA ? r.b_codename : r.a_codename;
      const winnerMine = r.winner === -1 ? null : (iAmA ? r.winner === 0 : r.winner === 1);
      return { opp_codename: oppCodename, winner_mine: winnerMine, seed: r.seed, created_at: r.created_at };
    });
    return json({ history }, 200, cors);
  }

  return null;
}

/* =====================================================================
   ゲームロジック小物
   ===================================================================== */
// build から私的名(name)を除いたコピーを返す(公開/アリーナ保存用)。
function stripName(build) {
  const { name, ...rest } = build || {};
  return rest;
}

// Elo更新(K=32)。winner: 0=A勝ち, 1=B勝ち, -1=引き分け(期待値0.5として扱う)。
function eloUpdate(ratingA, ratingB, winner) {
  const expA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expB = 1 - expA;
  const scoreA = winner === 0 ? 1 : winner === 1 ? 0 : 0.5;
  const scoreB = 1 - scoreA;
  return { a: ratingA + ELO_K * (scoreA - expA), b: ratingB + ELO_K * (scoreB - expB) };
}

// crypto由来の一様乱数で [0, n) の整数を1つ選ぶ(Math.random不使用。サーバの相手選択に使う)。
function pickInt(n) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % n;
}

/* =====================================================================
   OAuth(プロバイダ汎用。既定=Google)
   ===================================================================== */
async function oauthLogin(env, url, provider) {
  const p = PROVIDERS[provider];
  if (!p) return new Response('unknown provider', { status: 404 });
  const state = crypto.randomUUID();
  await env.KV.put('state:' + state, url.searchParams.get('redirect') || '', { expirationTtl: STATE_TTL });
  const a = new URL(p.authUrl);
  a.searchParams.set('client_id', p.clientId(env) || '');
  a.searchParams.set('redirect_uri', url.origin + '/auth/' + provider + '/callback');
  a.searchParams.set('scope', p.scope);
  a.searchParams.set('response_type', 'code');
  a.searchParams.set('state', state);
  return Response.redirect(a.toString(), 302);
}

async function oauthCallback(env, url, provider) {
  const p = PROVIDERS[provider];
  if (!p) return new Response('unknown provider', { status: 404 });
  const code = url.searchParams.get('code'), state = url.searchParams.get('state');
  if (!code || !state) return new Response('bad request', { status: 400 });
  const redirect = await env.KV.get('state:' + state);
  if (redirect === null) return new Response('state expired', { status: 400 });
  await env.KV.delete('state:' + state);

  const form = new URLSearchParams({
    client_id: p.clientId(env) || '', client_secret: p.clientSecret(env) || '',
    code, redirect_uri: url.origin + '/auth/' + provider + '/callback', grant_type: 'authorization_code'
  });
  const tokRes = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  const tok = await tokRes.json();
  if (!tok.access_token) {
    // 原因切り分け用にGoogleのエラー種別だけ出す(invalid_client=secret不一致 / invalid_grant=code失効等。秘密は含まれない)
    const detail = (tok.error || 'http ' + tokRes.status) + (tok.error_description ? ' — ' + tok.error_description : '');
    return new Response('token failed: ' + detail, { status: 400 });
  }

  const meRes = await fetch(p.userUrl, {
    headers: { 'Authorization': 'Bearer ' + tok.access_token, 'User-Agent': 'fable-playground', 'Accept': 'application/json' }
  });
  const user = p.normalize(await meRes.json());
  if (!user.id || /:(undefined)?$/.test(user.id)) return new Response('user failed', { status: 400 });

  const sid = crypto.randomUUID();
  await env.KV.put('sess:' + sid, JSON.stringify(user), { expirationTtl: SESSION_TTL });
  return new Response(null, {
    status: 302,
    headers: { 'Location': safeRedirect(redirect, env), 'Set-Cookie': sessionCookie(sid, SESSION_TTL) }
  });
}

async function logout(request, env, cors) {
  const sid = getCookie(request, '__session');
  if (sid) await env.KV.delete('sess:' + sid);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie('', 0) }, cors)
  });
}

async function currentUser(request, env) {
  const sid = getCookie(request, '__session');
  if (!sid) return null;
  const raw = await env.KV.get('sess:' + sid);
  return raw ? JSON.parse(raw) : null;
}

// 公開してよいユーザ情報だけに絞る(email 等は返さない)。
function publicUser(u) {
  return u ? { id: u.id, name: u.name, avatar: u.avatar } : null;
}

/* =====================================================================
   レート制限(KV 固定ウィンドウ。書き込み系のみ)
   注: KV 無料枠は書込 ~1000/日。高頻度・厳密性が要るなら Durable Objects へ。
   ===================================================================== */
async function rateLimit(request, env, bucket) {
  const cfg = RATE_LIMITS[bucket] || RATE_LIMITS.write;
  const ipKey = await ipHash(request, env);   // 生IPはKVキーにも残さない(ハッシュで数える)
  const win = Math.floor(Date.now() / 1000 / cfg.windowSec);
  const key = 'rl:' + bucket + ':' + ipKey + ':' + win;
  const cur = parseInt((await env.KV.get(key)) || '0', 10);
  if (cur >= cfg.max) return true;
  await env.KV.put(key, String(cur + 1), { expirationTtl: cfg.windowSec + 5 });
  return false;
}

/* ---------- 小物 ---------- */
// 生IPは保存しない。SHA-256 の先頭8バイトをハッシュID に(レート制限のみに使用)。
async function ipHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  const salt = (env && env.IP_SALT) || 'fable-dev';   // 本番は `wrangler secret put IP_SALT` 推奨
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + ip));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
// 許可オリジン一覧(CORS と CSRF/Origin 検証で共用)
function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}
// 状態変更リクエストの Origin がフロントの許可オリジンか(CSRF 一次防御)
function originAllowed(request, env) {
  return allowedOrigins(env).includes(request.headers.get('Origin') || '');
}
// OAuth 後のリダイレクト先は許可オリジン配下のみ(オープンリダイレクト/フィッシング防止)
function safeRedirect(redirect, env) {
  const origins = allowedOrigins(env);
  try {
    const u = new URL(redirect);
    if (origins.some(o => { try { return new URL(o).origin === u.origin; } catch (e) { return false; } })) return redirect;
  } catch (e) {}
  return (origins[0] || '/');
}
function corsHeaders(origin, env) {
  const allowed = allowedOrigins(env);
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400', 'Vary': 'Origin'
  };
  if (allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Credentials'] = 'true';
  }
  return h;
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors || {}) });
}
async function readJson(request) { try { return await request.json(); } catch (e) { return null; } }
function sessionCookie(sid, ttl) {
  const base = '__session=' + sid + '; Path=/; HttpOnly; Secure; SameSite=None';
  return ttl > 0 ? base + '; Max-Age=' + ttl : base + '; Max-Age=0';
}
function getCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? m[1] : null;
}
