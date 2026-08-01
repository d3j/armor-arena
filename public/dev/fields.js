// 鋼機工廠 — バトルフィールド定義(pure ESM・DOM非依存。sim/game/worker で共有)
// obstacles: {kind:'wall'|'mud'|'spike'|'rubble', x, y, r, hp}
//   wall   … 移動衝突+射線遮断(ミサイルは越える)。hp 数値=破壊可 / null=不壊
//   mud    … 内部で移動速度×泥係数(脚種別。hoverは免疫)
//   spike  … 内部で 8dps(hoverは免疫)
//   rubble … v5 追加。**踏破可能な小障害物**。止めも遮りもせず「乗り越える」。追加属性 h(足場の標高m)。
//            乗っている間: 速度×CLIMB_FACTOR[脚種] / 回避↓(露出) / 命中↑(見晴らし)。hover は免疫。
//            射線は切らない(高さ数mでは12〜20mの壁越しは見えない)=遮蔽としては数えない。
//   deco   … render-only の見た目ヒント(シムは読まない)。同じ判定円を街では車・崩落塊・
//            歩道の段差に描き分けるためだけの文字列。省略時は既定の土盛り。
//
// ── 装飾(render-only)からシムへ「昇格」させる線引き ─────────────────────
// シムの障害物は円ひとつ。だから昇格の条件は2つだけ:
//   ⑴ 円1個で素直に表せること。細長い縁石・区画線・電線・焼け跡は表せない=装飾のまま。
//   ⑵ 半径が機体半径 MECH_R=2.2m と同オーダー以上(実務上 r≥8m)。それ未満を判定にすると
//      機体より小さい「見えない点」になり、避けたのか通ったのか観戦者に読めない。
// この2条件に落ちない装飾(街灯/電柱の支柱 r≈1.2m 等)は昇格せず、**装飾側を機体が
// すり抜けても嘘に見えない高さへ落とす**(崩落市街なら「折れた街灯」)。
// 「可動域に立つ実体はシムが知っている」を不変条件にするのが狙い。
// ─────────────────────────────────────────────────────────────────

export const FIELDS = [
  {
    // rubble は射線を切らないので「遮蔽なしの正面決戦」は保たれる。足すのは起伏だけ:
    // 中央の塚が唯一の高所=乗れば当てやすいが躱せない。丘の頂点を巡る主導権争いを一つ置く。
    id: 'plain', name: '演習平原', desc: '遮蔽なしの正面決戦。ただ中央の塚だけが高い。',
    shape: { kind: 'rect', w: 1000, h: 1000 },
    obstacles: [
      { kind: 'rubble', x: 500, y: 500, r: 34, h: 3.2, hp: null },
      { kind: 'rubble', x: 305, y: 320, r: 26, h: 1.4, hp: null },
      { kind: 'rubble', x: 695, y: 680, r: 26, h: 1.4, hp: null },
      { kind: 'rubble', x: 300, y: 700, r: 22, h: 0.9, hp: null },
      { kind: 'rubble', x: 700, y: 300, r: 22, h: 0.9, hp: null },
    ],
  },
  {
    id: 'sekichu', name: '石柱回廊', desc: '砕ける石柱が射線を切る。回り込みと破壊の駆け引き。',
    shape: { kind: 'rect', w: 1000, h: 1000 },
    obstacles: [
      { kind: 'wall', x: 500, y: 500, r: 58, hp: 300 },
      { kind: 'wall', x: 350, y: 330, r: 44, hp: 240 },
      { kind: 'wall', x: 650, y: 670, r: 44, hp: 240 },
      { kind: 'wall', x: 330, y: 700, r: 38, hp: 200 },
      { kind: 'wall', x: 670, y: 300, r: 38, hp: 200 },
      { kind: 'wall', x: 500, y: 160, r: 34, hp: 190 },
      { kind: 'wall', x: 500, y: 840, r: 34, hp: 190 },
      // 砕けた石柱の裾。回廊の東西端の崩落塊だけは高く、乗れば回廊全体を見下ろせる。
      { kind: 'rubble', x: 500, y: 590, r: 26, h: 1.6, hp: null },
      { kind: 'rubble', x: 350, y: 250, r: 20, h: 1.1, hp: null },
      { kind: 'rubble', x: 650, y: 750, r: 20, h: 1.1, hp: null },
      { kind: 'rubble', x: 150, y: 500, r: 24, h: 2.6, hp: null },
      { kind: 'rubble', x: 850, y: 500, r: 24, h: 2.6, hp: null },
    ],
  },
  {
    // ジレンマ設計: 中央を横断する泥の大河。スポーンは必ず帯の南北に分かれる(帯が中心を通るため)
    // =「渡れば近道だが脚を取られる / 東の細い回廊へ回れば無傷だが遠い」を毎試合強制する。
    // 岩は帯の南北に1つずつ(渡り切った側の褒美)+回廊の出口を睨む1つ(迂回も楽はさせない)。
    id: 'deitan', name: '泥炭湿地', desc: '泥の大河が戦場を分かつ。渡るか、回るか。',
    shape: { kind: 'rect', w: 1000, h: 1000 },
    obstacles: [
      { kind: 'mud', x: 155, y: 470, r: 115, hp: null },
      { kind: 'mud', x: 360, y: 515, r: 135, hp: null },
      { kind: 'mud', x: 585, y: 470, r: 140, hp: null },
      { kind: 'mud', x: 800, y: 525, r: 125, hp: null },
      { kind: 'wall', x: 250, y: 240, r: 36, hp: 220 },
      { kind: 'wall', x: 750, y: 760, r: 36, hp: 220 },
      { kind: 'wall', x: 930, y: 330, r: 30, hp: 180 },
      // 泥炭の掘り出し堆積。泥円とは重ねない(泥×踏破の二重減速は「足場」の意味を裏返してしまう)。
      // 東の回廊(迂回路)にも踏み段を置き、回り込みにも小さな代償を付ける。
      { kind: 'rubble', x: 330, y: 285, r: 26, h: 2.2, hp: null },
      { kind: 'rubble', x: 670, y: 715, r: 26, h: 2.2, hp: null },
      { kind: 'rubble', x: 940, y: 430, r: 20, h: 1.2, hp: null },
      { kind: 'rubble', x: 120, y: 700, r: 22, h: 1.0, hp: null },
    ],
  },
  {
    // ジレンマ設計: 中央岩(不壊の盾)を東西南北の茨堡塁が囲む。堡塁を突っ切れば岩陰や敵への最短路、
    // 対角の安全路へ回れば無傷だが遠い。対角には壊れる壁(安全だが恒久でない遮蔽)。
    // 岩の斥力圏(r+46)と堡塁内縁の間に53mの周回域を確保(岩周りの近接戦が茨に押し込まれない)。
    id: 'crater', name: '環状クレーター', desc: '中央の岩は永遠の盾。だが四方は茨の堡塁。',
    shape: { kind: 'circle', cx: 500, cy: 500, r: 470 },
    obstacles: [
      { kind: 'wall', x: 500, y: 500, r: 66, hp: null },
      { kind: 'spike', x: 750, y: 500, r: 85, hp: null },
      { kind: 'spike', x: 500, y: 750, r: 85, hp: null },
      { kind: 'spike', x: 250, y: 500, r: 85, hp: null },
      { kind: 'spike', x: 500, y: 250, r: 85, hp: null },
      { kind: 'wall', x: 267, y: 267, r: 40, hp: 200 },
      { kind: 'wall', x: 733, y: 733, r: 40, hp: 200 },
      // 中央岩から崩れた岩塊。堡塁の隙間(対角の安全路)に置き、安全路にも段差の代償を作る。
      { kind: 'rubble', x: 620, y: 620, r: 26, h: 2.8, hp: null },
      { kind: 'rubble', x: 380, y: 380, r: 26, h: 2.8, hp: null },
      // スポーン円(中心から半径220m)の上には置かない: sim.js の初期配置は8回試行なので、
      // 円周上の障害物は角度窓を潰してフォールバック(水平配置=堡塁の中)率を押し上げる。
      { kind: 'rubble', x: 691, y: 309, r: 22, h: 1.3, hp: null },
      { kind: 'rubble', x: 309, y: 691, r: 22, h: 1.3, hp: null },
    ],
  },
  {
    // ジレンマ設計の見本戦場: 中央を縦断する茨帯が最短路。帯の中心に不壊岩(渡った者だけの盾)。
    // 南北の縁に細い安全路(幅~50m)。東西の壁は安全な遮蔽だが撃てば壊れる。
    id: 'ibara', name: '茨の回廊', desc: '茨を突っ切れば最短、岩陰も待つ。回れば無傷、だが遠い。',
    shape: { kind: 'rect', w: 1000, h: 1000 },
    obstacles: [
      { kind: 'spike', x: 500, y: 160, r: 90, hp: null },
      { kind: 'spike', x: 500, y: 355, r: 95, hp: null },
      { kind: 'spike', x: 500, y: 645, r: 95, hp: null },
      { kind: 'spike', x: 500, y: 840, r: 90, hp: null },
      { kind: 'wall', x: 500, y: 500, r: 42, hp: null },
      { kind: 'wall', x: 235, y: 500, r: 38, hp: 180 },
      { kind: 'wall', x: 765, y: 500, r: 38, hp: 180 },
      // 中央岩の脇の崩落塊=「岩陰を取る前に段差を越える」。南北の細い安全路にも瓦礫を置く。
      { kind: 'rubble', x: 385, y: 500, r: 22, h: 2.4, hp: null },
      { kind: 'rubble', x: 615, y: 500, r: 22, h: 2.4, hp: null },
      { kind: 'rubble', x: 180, y: 110, r: 24, h: 1.4, hp: null },
      { kind: 'rubble', x: 820, y: 890, r: 24, h: 1.4, hp: null },
    ],
  },
  {
    // ジレンマ設計: 十字に走る大通りが最短かつ最速だが遮蔽が無く、長距離武器の射線を丸ごと通す。
    // 街区の中(路地)へ入れば必ず遮蔽が得られるが遠回り。大通りの唯一の盾は交差点広場の不壊塔だけ。
    // 大通りの南北の端に崩落瓦礫(鉄筋=踏めば痛い)、東西の端に冠水(足を取る)を置き、
    // 「大通りを端まで走り切る」逃げ道にも代償を付ける。外周の高層2棟は不壊=永遠の遮蔽。
    id: 'shigai', name: '崩落市街', desc: '大通りは速い。だが遮蔽はない。路地は遠い。だが生きて着く。',
    shape: { kind: 'rect', w: 1000, h: 1000 },
    obstacles: [
      { kind: 'wall', x: 400, y: 400, r: 44, hp: 380 },
      { kind: 'wall', x: 600, y: 400, r: 44, hp: 380 },
      { kind: 'wall', x: 400, y: 600, r: 44, hp: 380 },
      { kind: 'wall', x: 600, y: 600, r: 44, hp: 380 },
      { kind: 'wall', x: 250, y: 250, r: 56, hp: null },
      { kind: 'wall', x: 750, y: 750, r: 56, hp: null },
      { kind: 'wall', x: 750, y: 250, r: 50, hp: 460 },
      { kind: 'wall', x: 250, y: 750, r: 50, hp: 460 },
      { kind: 'wall', x: 500, y: 500, r: 24, hp: null },
      { kind: 'spike', x: 500, y: 180, r: 70, hp: null },
      { kind: 'spike', x: 500, y: 820, r: 70, hp: null },
      { kind: 'mud', x: 180, y: 500, r: 74, hp: null },
      { kind: 'mud', x: 820, y: 500, r: 74, hp: null },
      // ── v5: 街の家具のうちシムへ昇格させた分(上記の線引き⑴⑵を満たすものだけ)──
      // 大通りを塞ぐ崩落塊。「大通り=速いが遮蔽ゼロ」に「瓦礫を越える間だけ遅く・高く晒される」を足す。
      // 半径180の位置に置く(スポーン円=半径220 を避ける。crater の項の理由と同じ)
      { kind: 'rubble', x: 500, y: 320, r: 16, h: 3.0, hp: null, deco: 'slab' },
      { kind: 'rubble', x: 500, y: 680, r: 16, h: 3.0, hp: null, deco: 'slab' },
      { kind: 'rubble', x: 320, y: 500, r: 16, h: 3.0, hp: null, deco: 'slab' },
      { kind: 'rubble', x: 680, y: 500, r: 16, h: 3.0, hp: null, deco: 'slab' },
      // 焼けた廃車。装飾の WRECKS を廃してここが唯一の実体になる(座標はこちらが正)。
      // 冠水/瓦礫の判定円とは重ねない=「今どの地形の上に居るか」が観戦者に一意に読めるようにする。
      { kind: 'rubble', x: 454, y: 268, r: 9, h: 2.4, hp: null, deco: 'car' },
      { kind: 'rubble', x: 538, y: 640, r: 9, h: 2.4, hp: null, deco: 'car' },
      { kind: 'rubble', x: 265, y: 452, r: 9, h: 2.4, hp: null, deco: 'car' },
      { kind: 'rubble', x: 735, y: 546, r: 9, h: 2.4, hp: null, deco: 'car' },
      { kind: 'rubble', x: 556, y: 900, r: 9, h: 2.4, hp: null, deco: 'car' },
      { kind: 'rubble', x: 443, y: 105, r: 9, h: 2.4, hp: null, deco: 'car' },
      // 崩れた縁石と歩道の段差(大通りの縁 x=429/571・y=429/571 の線上)。低いが路地への出入りに要る。
      { kind: 'rubble', x: 429, y: 240, r: 11, h: 1.1, hp: null, deco: 'curb' },
      { kind: 'rubble', x: 571, y: 320, r: 11, h: 1.1, hp: null, deco: 'curb' },
      { kind: 'rubble', x: 429, y: 760, r: 11, h: 1.1, hp: null, deco: 'curb' },
      { kind: 'rubble', x: 571, y: 940, r: 11, h: 1.1, hp: null, deco: 'curb' },
      { kind: 'rubble', x: 240, y: 429, r: 11, h: 1.1, hp: null, deco: 'curb' },
      { kind: 'rubble', x: 320, y: 571, r: 11, h: 1.1, hp: null, deco: 'curb' },
      { kind: 'rubble', x: 760, y: 429, r: 11, h: 1.1, hp: null, deco: 'curb' },
      { kind: 'rubble', x: 760, y: 571, r: 11, h: 1.1, hp: null, deco: 'curb' },
    ],
  },
  {
    id: 'haikyo', name: '廃棄工廠', desc: 'コンテナと瓦礫と油泥。すべてが使える、すべてが壊れる。',
    shape: { kind: 'rect', w: 1000, h: 1000 },
    obstacles: [
      { kind: 'wall', x: 400, y: 420, r: 46, hp: 190 },
      { kind: 'wall', x: 610, y: 560, r: 46, hp: 190 },
      { kind: 'wall', x: 300, y: 650, r: 40, hp: 170 },
      { kind: 'wall', x: 700, y: 330, r: 40, hp: 170 },
      { kind: 'spike', x: 500, y: 810, r: 70, hp: null },
      { kind: 'spike', x: 180, y: 380, r: 55, hp: null },
      { kind: 'mud', x: 820, y: 700, r: 110, hp: null },
      // 廃材の山。中央の一山だけ高く、工廠のど真ん中に「登れる高所」を置く。
      { kind: 'rubble', x: 500, y: 500, r: 30, h: 2.6, hp: null },
      { kind: 'rubble', x: 250, y: 470, r: 22, h: 1.2, hp: null },
      { kind: 'rubble', x: 640, y: 180, r: 24, h: 1.8, hp: null },
      { kind: 'rubble', x: 380, y: 780, r: 24, h: 1.5, hp: null },
      { kind: 'rubble', x: 880, y: 400, r: 20, h: 0.9, hp: null },
    ],
  },
];

export function getField(id) {
  for (const f of FIELDS) if (f.id === id) return f;
  return FIELDS[0];
}

// 脚種別の泥係数(mud内の速度倍率)。hover は泥・トゲ・瓦礫とも免疫。
export const MUD_FACTOR = { biped: 0.6, quad: 0.7, hover: 1.0, tank: 0.65, wheel: 0.35, reverse: 0.6 };
export const SPIKE_DPS = 8;
// 泥の沈み込み量(m)= MUD_SINK×(1−泥係数)。脚を取られる脚種ほど深く沈む
// (車輪1.17m / 二脚・逆関節0.72m / 履帯0.63m / 四脚0.54m / hoverは浮いたまま0)。
// **なぜ遅いのかが目で分かる**ようにするための描画用の値で、シムの当たり判定は変えない
// (露出率 climbExposure は負の標高を0に丸めるので、沈んでも被弾しにくくはならない)。
export const MUD_SINK = 1.8;

// 脚種別の踏破係数(rubble 内の速度倍率)。泥とは得意不得意をわざと入れ替えてある:
// 履帯は泥では鈍い(0.65)が段差には強い(0.86)/ 逆関節は泥では並(0.6)だが跳んで越える(0.82)/
// 車輪は泥も段差も最弱(0.35 / 0.45)。「泥の戦場に強い脚」と「瓦礫の戦場に強い脚」を分ける。
export const CLIMB_FACTOR = { biped: 0.72, quad: 0.80, hover: 1.0, tank: 0.86, wheel: 0.45, reverse: 0.82 };
// 露出率の基準高(m)。機体全高4.2m級=自分の背丈だけ高い所に立つと露出率1.0。
export const CLIMB_H_REF = 4.0;
// 天端の割合: 判定円の内側 CLIMB_TOP_FRAC×r までが平らな足場で、そこから縁へ向かって高さが0に落ちる。
// **シム(標高の計算)と描画(塚のテーパー rTop)が同じ値を使う**のが肝で、片方だけ変えると
// 「斜面の上に機体が浮く/めり込む」が出る(実測 2026-08-01: 天端を 0.62 に固定したまま
// シムが円全体で持ち上げていたため、乗っているサンプルの 55.4% が斜面の上に浮いていた)。
export const CLIMB_TOP_FRAC = 0.62;
// 乗っている間の効き: 回避×(1-0.42e) / 命中+0.10e。人間の言葉の「丘の頂点は露出が大きい」を
// 「躱せないが当てやすい」の一対にした。射線(losBlockedBy)には触れない=数mの高低差では
// 12〜20mの壁越しは見えないので、遮蔽の勘定を変えないほうが観戦者の理解と一致する。
export const CLIMB_EVA_PENALTY = 0.42;
export const CLIMB_ACC_BONUS = 0.10;
// 標高 h(m) → 露出率 0..1
export function climbExposure(h) {
  const e = (h || 0) / CLIMB_H_REF;
  return e < 0 ? 0 : e > 1 ? 1 : e;
}

// 射線遮断: 線分と壁円の交差(最初に当たる wall を返す。alive===false は無視)。sim/game 共用。
export function losBlockedBy(x1, y1, x2, y2, walls) {
  let best = null, bestT = Infinity;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  for (const o of walls) {
    if (o.alive === false) continue;
    let t = ((o.x - x1) * dx + (o.y - y1) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x1 + dx * t, cy = y1 + dy * t;
    const d = Math.hypot(o.x - cx, o.y - cy);
    if (d < o.r && t < bestT) { best = o; bestT = t; }
  }
  return best;
}
