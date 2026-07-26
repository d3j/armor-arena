# workers/kouki — 『鋼機工廠』バックエンド

`workers/_template` から派生。契約は `promo/2026-07-05-kouki/making.md` の「■仕様(契約)」節を参照。
CGM(みんなが書ける投稿の公開)ではないため、雛形の admin/ソフト削除/ブロック/通報/NGフィルタ/
Turnstile/mod_log は持たない(公開面に出るのはサーバ生成の codename のみ。プレイヤーの私的な
機体名 `build.name` は garage(本人専用)にのみ保存し、arena/battles には保存しない)。

## エンドポイント
```
GET  /auth/google/login | /auth/google/callback | /auth/me | POST /auth/logout   … _template標準
GET  /garage                     要ログイン。{slots:[{slot,build,updated_at}]}
PUT  /garage/:slot(0-7)           要ログイン。{build} → validateBuild NGなら400。name含む(非公開)
POST /arena/submit                要ログイン。{build} → codenameはサーバ生成(決定論)。nameは保存しない
POST /arena/fight                 要ログイン。rating近傍の相手(いなければbot)とサーバ権威でsimulate実行
GET  /arena/top                   公開。上位20 {top:[{codename,rating,wins,losses}]}(build/name無し)
GET  /arena/history               要ログイン。直近10戦 {history:[{opp_codename,winner_mine,seed,created_at}]}
```

## デプロイ手順(AIが `wrangler` で自走)
前提: 人間が一度だけ Cloudflare アカウント＋API トークン＋Google OAuth App を用意済み
(`tools/cloudflare/README.md`。GOOGLE_CLIENT_ID は kodama と同じ値を wrangler.toml に転記済み)。

```sh
cd workers/kouki
npm i

# 1) 資源作成(非冪等・一度だけ。得た id を wrangler.toml の TBD-* 箇所に書く)
npx wrangler d1 create fable-kouki
npx wrangler kv namespace create fable-kouki-kv

# 2) 秘密(コミットしない。kodamaと同じGoogle OAuth Appを使うならkodamaと同じ値)
npx wrangler secret put GOOGLE_CLIENT_SECRET

# 3) スキーマ適用(bot 3体もこの時点でINSERTされる) → デプロイ
npx wrangler d1 execute fable-kouki --remote --file=schema.sql
npx wrangler deploy
```

デプロイで得た公開URL(`https://fable-kouki.<sub>.workers.dev`)を、フロント
`public/` の `FableData.create({ base })` に渡す。

## ローカル検証(アカウント不要)
```sh
npx wrangler d1 execute fable-kouki --local --file=schema.sql
npx wrangler dev --local        # http://127.0.0.1:8787
node test-local.mjs             # Miniflare によるインメモリ検証(下記「注意」参照)
```

## 注意(親/後任が統合時にやること)
1. **`public/parts.js` と `sim.js` の完成待ち**: `src/index.js` はこの2ファイルを
   `import { simulate, validateBuild } from '../../../public/sim.js'` /
   `import { codename } from '../../../public/parts.js'` として参照する(未完成の間は
   `wrangler dev` / `node test-local.mjs` ともにモジュール解決エラーで起動できない)。
2. **bot機体のパーツid整合確認**: `schema.sql` 末尾の bot 3体(`bot:alpha/beta/gamma`)の
   `build_json` は暫定値(`fr2/lg1/gn2/ar2/wp1/wp2/ai1`)。`parts.js` 確定後、実在するパーツidに
   置き換えること(存在しないidだと `validateBuild` はパスしても `deriveStats`/`simulate` が壊れる)。
3. **`test-local.mjs` の実行**: sim.js/parts.js 完成後に `npm i && node test-local.mjs` で通すこと
   (未ログイン401・CSRF403・garage往復・不正slot/build 400・submitの非公開性(topにname/build無し)・
   fight成立とElo変動・fight連打の429を確認する)。
4. **D1/KV の実資源作成**: `wrangler.toml` の `database_id`/`kv id` は `"TBD-d1-create"` /
   `"TBD-kv-create"` のプレースホルダ。上記コマンドで実資源を作り、id を書き換えてからデプロイする。
