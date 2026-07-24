/* =====================================================================
   FableData — 作品共通のバックエンド・クライアント
   ---------------------------------------------------------------------
   静的フロント(GitHub Pages / Cloudflare Pages)から、作品ごとの
   Cloudflare Worker バックエンドを叩くための薄いヘルパー。

   設計の前提(憲法 §1/§2):
   - フロントは静的。秘密鍵は一切持たない。鍵は Worker 側(Secrets)に隔離。
   - クライアントが持つのは「Worker の公開 URL」と、利用者自身のセッション
     cookie(HttpOnly。JS からは読めない)だけ。
   - 認証は「利用者が自分の GitHub 等でサインイン」方式(§2 の鍵自前主義の踏襲)。

   使い方:
     <script src="../lib/api.js"></script>
     const api = FableData.create({ base: 'https://kodama.<sub>.workers.dev' });
     const list = await api.get('/posts');
     await api.post('/posts', { text: 'こんにちは' });
     const { user } = await api.me();           // 未ログインなら user=null
     location.href = api.loginUrl('github');    // サインインへ
     await api.logout();

   base は作品ごとに固定値で渡す(本番 Worker URL)。ローカル検証時は
   ?api=http://127.0.0.1:8787 を URL に付ければ上書きできる(下記 resolveBase)。
   ===================================================================== */
(function () {
  'use strict';

  /* ローカル検証用に ?api= で base を上書きできる(本番では無視される設計)。
     許可するのは localhost / 127.0.0.1 のみ(任意オリジンへの誘導を防ぐ)。 */
  function resolveBase(base) {
    try {
      var q = new URLSearchParams(location.search).get('api');
      if (q && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(q)) return q.replace(/\/$/, '');
    } catch (e) {}
    return (base || '').replace(/\/$/, '');
  }

  function create(opts) {
    opts = opts || {};
    var base = resolveBase(opts.base);
    if (!base) throw new Error('FableData.create: base(Worker URL) が必要です');

    /* fetch ラッパ。cookie を必ず送る(credentials:include)。
       Worker 側は CORS で this オリジンを許可し credentials を有効にする必要がある。 */
    function req(method, path, body) {
      var init = {
        method: method,
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      };
      if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      return fetch(base + path, init).then(function (res) {
        return res.text().then(function (t) {
          var data = null;
          try { data = t ? JSON.parse(t) : null; } catch (e) { data = { raw: t }; }
          if (!res.ok) {
            var err = new Error((data && data.error) || ('HTTP ' + res.status));
            err.status = res.status;
            err.data = data;
            throw err;
          }
          return data;
        });
      });
    }

    return {
      base: base,
      get: function (path) { return req('GET', path); },
      post: function (path, body) { return req('POST', path, body || {}); },
      del: function (path) { return req('DELETE', path); },

      /* 認証状態。{ user: {...} | null } を返す。 */
      me: function () { return req('GET', '/auth/me').catch(function () { return { user: null }; }); },

      /* サインインへ遷移する URL(戻り先=現在のページ)。既定プロバイダは google。 */
      loginUrl: function (provider) {
        return base + '/auth/' + (provider || 'google') + '/login?redirect=' +
          encodeURIComponent(location.href);
      },

      logout: function () { return req('POST', '/auth/logout'); }
    };
  }

  window.FableData = { create: create };
})();
