# タスク追跡 — armor-arena

**2026-07-28 に fable-playground から移管(以後の kouki/ARMOR ARENA 開発の正本はこのリポ)。**
完了したら `[x]` にして「完了メモ(日付・commit)」を1行残す。
2026-07-25 以前の制作記・仕様(契約)・git 履歴は
[fable-playground の making.md](https://github.com/d3j/fable-playground/blob/main/promo/2026-07-05-kouki/making.md) にある。
このリポでの表記: 本番=`public/`・開発版=`public/dev/`(旧 kouki / kouki-dev)。検証ハーネスは `tools/harness/`。

---

## 第29作「鋼機工廠」(kouki) — St2: 観戦3DをThree.jsへ移行

**背景**: 旧・自作ソフトウェアラスタライザ `public/r3d.js`(約2200行)から Three.js への段階移行。
描画方式のみ差し替え=**シム挙動不変(REPLAY_V は上げない)**。歩容/IK は純関数 `computeMechPose` に抽出し
ソフト版(`r3d.js`)と Three版(`r3d-three.js`)が同一の真実を共有。開発は `public/dev/` で行い各段レビュー。
既定=Three、`?soft=1` で旧ソフト版のA/B比較。Three初期化失敗時は自動でソフト版へ(常にgreen)。

**共通の掟**:
- 本番リリースは `r3d.js` / `r3d-three.js` / `game.js` を **手動コピー**(release-sim.mjs は sim/parts/fields 専用=使わない。
  REPLAY_V は据え置き)。`vendor/three.module.min.js` `three.core.min.js` も本番へ同梱。
- 歩容/動作を変えたら **物理ハーネスで検証**: `node tools/harness/gait-harness.mjs [--phys]`
  (`poseWorld`/`computeMechPose` を使い plantError/接地スリップ/重心マージン/cannon-es倒れテストを assert)。
- 「かっこよさ」の演出(カメラ・アニメ・撃破ラグドール)は**描画側**なら決定論リスクゼロ(LESSONS「描画側=安全/シム側=クロス環境FP発散」)。

### 完了
- [x] **第1段=二脚**: Three導入(buildless)・剛体パーツ木・motions→ボーン回転・ライティング+接地シャドウ・カメラdirector再利用・
  空/グリッド/フォグ。(2026-07-19, commit fce2c30)
- [x] **第1段レビュー反映**: 歩容の後退/横移動/重心を物理修正(横方向IK外転・接地脚フル到達・重心横シフト)+
  歩容物理ハーネス(cannon-es)導入。二脚 ALL GREEN。(2026-07-20, commit 3836059)
- [x] **プレビュー修正**: 歩行↔地面連動(機体を実際にワールド移動+カメラ周回追従)+grid-follow(無限地面)+
  フレームアウト修正(手動カメラ時は scaleScene を無効化=機体とカメラの座標系を一致)。(2026-07-20〜21, commit 0c7d142)
- [x] **第2段=四脚**: ①ハーネスに四脚の足接地計測を整備(poseWorld に toe=接地パーツ底面中心を追加。
  脛centroidの計測バイアスを解消したら運動学は既に正しく即緑)→四脚を緑判定ゲートに追加・ALL GREEN
  ②膝向きを前脚=前折れ/後脚=後折れのX字ミラーに調整(見え方のみ・IK到達不変)。Three/ソフト両経路+
  戦場TR-01決着周回を実機確認・console 0。(2026-07-24)
- [x] **第1+2段を本番リリース**: r3d.js/r3d-three.js/game.js(DEV=false戻し)手動コピー+vendor同梱。
  シム3ファイルはdev==本番=REPLAY_V=3据置・worker再デプロイ不要。check-freeze OK・ハーネス --dir . ALL GREEN・
  実機確認済。public/dev は第3段作業場として残置。(2026-07-24)

### レビューOK・本番昇格待ち(開発版 public/dev)
- [x] **動作モーションの拡充**(人間提案 2026-07-21): 4点とも public/dev に実装済。人間レビューOK
  (2026-07-24 工廠プレビュー確認)→ **本番昇格済**(2026-07-24: r3d.js/game.js 手動コピー・DEV=false戻し・
  REPLAY_V=3据置。check-freeze OK・ハーネス --dir . ALL GREEN・実機Three/soft両経路 console 0)。
  すべて描画側=computeMechPose への純関数加算(シム非改変・REPLAY_V据置)。工廠プレビューに
  アクション実演(juke→flinch→右腕攻撃→低速歩行→左腕攻撃の20s周期)を追加=戦闘を待たず確認可。
  ハーネス ALL GREEN・数値プローブ12項目 OK・Codex correctness 3巡収束。(2026-07-24)
  - [x] **回避(juke)**: dodge イベントで横っ飛びスウェイ(足は planted のまま上体でかわす)。
  - [x] **被弾(flinch/stagger)**: hit の押し込み方向へ上体のけぞり/よろけ+膝折れ(dmg比例)。hazard も小よろけ。
  - [x] **射撃/白兵の follow-through**: 攻撃窓 0.65→0.9s。射撃=全身反動+戻りの余韻、白兵=踏み込み前傾+前進シフト+振り抜き。
  - [x] **低速移動**: 低magほど歩幅+60%/接地デューティ+0.14(2乗カーブ=旋回歩行の中速域に効かせない)。位相は step/stride のその場積分へ。

### 完了(続き)
- [x] **第3段=残り全要素の移植**(Three版へ): ①脚種の見え(逆関節は planted 歩容化+接地修正=ハーネス
  緑判定入り・toe方式) ②8武装の攻撃演出・弾・爆風・マズルフラッシュ・砂煙(演出フェイス生成関数を
  r3d.js の module スコープへ純移動し両レンダラ共有) ③地形(泥/岩/沼) ④撃破余韻+敵機マーカーHUD
  ⑤リプレイ整合。**人間レビューOK(2026-07-24)→ 旧ソフトレンダラ(createR3D)撤去済**(?soft=1 は
  無視され Three のみ。WebGL不可端末は3Dだけ無効化の劣化継続)。**本番昇格はしない(人間指示)=
  public/dev のみ**。詳細 making.md「■St2 第3段」。(2026-07-24)
### レビューOK・本番昇格待ち(開発版 public/dev)(続き)
- [x] **コックピットビュー**(人間提案 2026-07-21): public/dev に実装済・**人間レビューOK(2026-07-24「動作確認OK。かっこいいね」)**。
  本番昇格は第3段以降と同様に人間判断待ち。
  中距離以遠(distEMA≥60・ショット開始時ラッチ)で SLOT_POV をコックピット目線に発展: コクピット高+前方
  オフセット+歩行スウェイ・POV専用尺2.2〜3.2s・tau0.12・照準リング(遮蔽=橙破線+距離読み)+計器枠
  (カメラ子の全画面スプライト)・自機メッシュ全hide。**カメラ/スクリーン装飾のみ=シム非改変(REPLAY_V=3据置)**。
  ハーネス --phys ALL GREEN・check-freeze OK・実機 console 0・Codex correctness 冷読み Med2 → 2件採用済。
  詳細 making.md「■St2 コックピットビュー」。(2026-07-24)
- [ ] **機体鑑賞モード**(2026-07-26 別セッションが public/dev に実装・**人間レビュー待ち**): 工廠プレビュー直下の
  「⛶ 機体鑑賞」ボタン→専用画面 `data-screen="viewer"`。移動/歩調/旋回/動作/カメラ/構成送りを全ボタン操作、
  姿勢は戦闘と同じ computeMechPose。previewLoop→previewTick 化を含む。※未コミットWIPだったものを 2026-07-28 の
  移設コミット(da0eb64)が同梱して公開済み。実機確認=viewer 表示・canvas 描画・console 0(2026-07-28)。

### 保留/検討(要人間判断)
- [ ] **撃破ラグドールを物理で**(描画側): cannon-es をブラウザにも載せ撃破の崩れ落ちを物理ラグドール化。決定論安全だが
  ランタイムコスト増。演出の作り込み段で検討。
- [ ] **物理をシム本体に入れる**(大工事): 物理駆動の"結果"(実座標ノックバック/地形衝突が移動を決める等)が要る機能が出たら。
  クロス環境(browser V8/JSC × workerd)決定論のため **WASM決定論エンジン(Rapier enhanced-determinism 等)or 固定小数点**+
  固定タイムステップ+**エンジン版を REPLAY_V ごとに凍結**+「browser vs workerd 再現一致」ゲートが必須。純JSの cannon-es は不可。
  物理駆動の結果が要る機能が出るまで**やらない**(結論: LESSONS「3D/レンダラ移行」節)。

---

## kouki — St1 以前からの既存申し送り(未消化)
- [x] 戦場ハザードの設計(泥/棘などのギミック拡充)→ **public/dev に実装済・人間レビュー待ち**(2026-07-24):
  ①sim.js にハザード認知AI(踏む意欲×踏む価値で「渡る/迂回」を決定論判断・rng不使用・振動防止3点)
  ②deitan=泥の大河・crater=茨の堡塁・新戦場 ibara「茨の回廊」(FIELD_CODES 末尾追記)
  ③hazard-probe.mjs でジレンマを数値実証(wheel 泥滞在31.7→2.2s・突入率83%・判定ゲート4件)。
  harness ALL GREEN(hover支配なし)・check-freeze OK・実機 console 0・Codex 冷読み3件採否済。
  **リリース(release-sim.mjs で REPLAY_V 3→4+凍結+workers/kouki 再デプロイ)は人間承認後の別段取り**。
  詳細 making.md「■戦場ハザードのジレンマ設計」。
- [ ] オンボーディング(初見導線)の作り込み。
- [ ] OAuth の kodama・kouki 分離(secret 再作成の巻き添え確認)。
