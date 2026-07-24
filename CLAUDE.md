# CLAUDE.md — armor-arena

『ARMOR ARENA(鋼機工廠)』の独立リポジトリ。d3j/fable-playground の作品 `kouki` を分離したもの
(2026-07-25。それ以前の開発履歴は fable-playground 側の git 履歴と `promo/2026-07-05-kouki/making.md` にある)。

## 構成と制約
- `public/` が GitHub Pages の公開ルート(main push で `.github/workflows/pages.yml` が自動デプロイ)。
  サブパス配信(`/armor-arena/`)のためアセット参照は**相対パス**。
- `public/dev/` は開発版(noindex)。新機能はまず dev に入れ、人間レビュー承認後に `public/` 直下へ昇格する。
- `public/sims/` は本番シムの世代アーカイブ(REPLAY_V ごと)。**本番 `sim.js` の互換を壊す変更は
  REPLAY_V を上げ、旧世代を sims/ に残す**(リプレイコードの再現性が契約)。
- バックエンドは `workers/kouki/`(Cloudflare Worker + D1 + KV、デプロイ名 `fable-kouki`)。
  サーバ権威はレーティングのみ。秘密は Worker Secrets に置き、クライアントに露出しない。
- 公開面にユーザーの自由入力を出さない(機体名は本人のみ閲覧=CGM回避設計)。この設計を壊さない。
- ビルドは常に green(main push で Pages デプロイが成功する状態を保つ)。

## 出自ルール
- 元ネタ MM(マッチメーカー・篠崎砂美氏考案)の名称・データは使わない。「MM風の新作」を保つ。
