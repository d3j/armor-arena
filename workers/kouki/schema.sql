-- =====================================================================
-- workers/kouki/schema.sql — 『鋼機工廠』D1(SQLite)スキーマ
-- 適用: npx wrangler d1 execute fable-kouki --local --file=schema.sql            (ローカル)
--       npx wrangler d1 execute fable-kouki --remote --file=schema.sql           (本番)
-- ※ 既存DBへの後方互換変更は migrations/ にファイルを置く(列追加のみ・破壊変更しない)。
--
-- 非CGM設計: build_json の name(機体の私的名)は garage にのみ保存し、arena には保存しない。
-- 公開面(ランキング・対戦相手)に出るのはサーバ生成の codename のみ(本人以外の自由入力を公開しない)。
-- =====================================================================

CREATE TABLE IF NOT EXISTS garage (
  user_id     TEXT NOT NULL,          -- 認証ユーザの id(google:...)
  slot        INTEGER NOT NULL,       -- 0..7
  build_json  TEXT NOT NULL,          -- {frame,legs,gen,armor,wpnR,wpnL,ai,color,decal,name} name含む(非公開)
  updated_at  TEXT NOT NULL,          -- ISO8601
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE IF NOT EXISTS arena (
  user_id     TEXT PRIMARY KEY,       -- 認証ユーザの id、または 'bot:*'(コールドスタート対策)
  codename    TEXT NOT NULL,          -- サーバ生成の識別コード(公開)。parts.js の codename() で決定論生成
  build_json  TEXT NOT NULL,          -- name を含まないコピー(公開面用)
  rating      REAL NOT NULL DEFAULT 1200,
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arena_rating ON arena (rating);

CREATE TABLE IF NOT EXISTS battles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  a_user      TEXT NOT NULL,          -- 対戦を要求した側(A側)
  b_user      TEXT NOT NULL,          -- 選ばれた相手(B側)
  seed        INTEGER NOT NULL,       -- simulate() の乱数種(クライアントが同一試合を再生できる)
  winner      INTEGER NOT NULL,       -- 0=a_user勝ち, 1=b_user勝ち, -1=引き分け
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_battles_a ON battles (a_user, id DESC);
CREATE INDEX IF NOT EXISTS idx_battles_b ON battles (b_user, id DESC);

-- =====================================================================
-- コールドスタート対策(bot): 対戦相手がいない状態でも /arena/fight が成立するよう
-- 常設の bot 3体をアリーナに常駐させる(INSERT OR IGNORE で冪等)。
-- build_json は暫定値(下記コメント参照。parts.js 確定後に親がパーツid整合を確認すること)。
-- =====================================================================
INSERT OR IGNORE INTO arena (user_id, codename, build_json, rating, wins, losses, updated_at) VALUES
  ('bot:alpha', 'TR-01 カカシ',
   '{"frame":"fr2","legs":"lg1","gen":"gn2","armor":"ar2","wpnR":"wp1","wpnL":"wp2","ai":"ai1","color":"#8899aa","decal":"none"}',
   1100, 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('bot:beta', 'TR-02 マト',
   '{"frame":"fr2","legs":"lg1","gen":"gn2","armor":"ar2","wpnR":"wp1","wpnL":"wp2","ai":"ai1","color":"#aa8899","decal":"none"}',
   1200, 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('bot:gamma', 'TR-03 オニ',
   '{"frame":"fr2","legs":"lg1","gen":"gn2","armor":"ar2","wpnR":"wp1","wpnL":"wp2","ai":"ai1","color":"#99aa88","decal":"none"}',
   1300, 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
