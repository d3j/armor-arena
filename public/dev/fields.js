// 鋼機工廠 — バトルフィールド定義(pure ESM・DOM非依存。sim/game/worker で共有)
// obstacles: {kind:'wall'|'mud'|'spike', x, y, r, hp}
//   wall  … 移動衝突+射線遮断(ミサイルは越える)。hp 数値=破壊可 / null=不壊
//   mud   … 内部で移動速度×泥係数(脚種別。hoverは免疫)
//   spike … 内部で 8dps(hoverは免疫)

export const FIELDS = [
  {
    id: 'plain', name: '演習平原', desc: '遮蔽なしの正面決戦。機体性能が素直に出る。',
    shape: { kind: 'rect', w: 1000, h: 1000 },
    obstacles: [],
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
    ],
  },
];

export function getField(id) {
  for (const f of FIELDS) if (f.id === id) return f;
  return FIELDS[0];
}

// 脚種別の泥係数(mud内の速度倍率)。hover は泥・トゲとも免疫。
export const MUD_FACTOR = { biped: 0.6, quad: 0.7, hover: 1.0, tank: 0.65, wheel: 0.35, reverse: 0.6 };
export const SPIKE_DPS = 8;

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
