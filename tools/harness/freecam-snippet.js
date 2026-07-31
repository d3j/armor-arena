// 地形/遠景/装飾の目視検証スニペット(St4)。ブラウザの devtools コンソールに貼って実行する。
//
// 何のためにあるか:
//   観戦カメラ(director)は狙点を追うので、「戦場の特定の場所」を確実に見せてくれない。
//   冠水がちゃんと見えるか、ビルが全壊したらどうなるか、遠景が地平でどう見えるか——を
//   確かめるには、手動カメラ(scene.camera.eye)で任意の座標を覗く必要がある。
//   これで実際に見つかった不具合(2026-07-31): 冠水が道路パッチに塗り潰されて消えていた /
//   縁石に岩肌テクスチャが9倍拡大されて巨大なジグザグになっていた / 遠景ビルが白い書割に見えていた。
//
// 使い方:
//   1. 開発版を開く: http://localhost:8899/dev/index.html?mute=1
//      (python3 -m http.server 8899 を public/ で起動しておく)
//   2. このファイルの中身をコンソールへ貼って実行。画面全面に検証用のコマ割りが出る。
//   3. SHOTS を書き換えれば任意の戦場/座標/テーマ/破壊状態を覗ける。
//   4. 消すには document.getElementById('freecam').remove()
//
// 注意: 手動カメラのシーンには scaleScene が効かない(r3d.js の掟)。障害物の座標は
//       自前で WORLD_SCALE 倍しておく必要がある(下の scaled がそれ)。
(async () => {
  const r3t = await import('./r3d-three.js');
  const { FIELDS } = await import('./fields.js');
  const S = 0.45, C = 500;                          // WORLD_SCALE / アリーナ中心
  const P = (x, z) => [C + (x - C) * S, 0, C + (z - C) * S];

  // fid=戦場id / at=[シムm,シムm] 見たい場所 / dist=カメラ距離(ワールド単位) / h=カメラ高さ
  // th='training'|'arena' / dead=true で壊せる壁を全壊状態にする
  const SHOTS = [
    { fid: 'shigai', at: [180, 500], dist: 60, h: 14, th: 'training' },   // 冠水した街路
    { fid: 'shigai', at: [500, 180], dist: 60, h: 14, th: 'training' },   // 崩落瓦礫と鉄筋
    { fid: 'shigai', at: [500, 500], dist: 300, h: 120, th: 'arena' },    // 交差点と街の全景(夜)
    { fid: 'shigai', at: [400, 400], dist: 150, h: 40, th: 'training', dead: true },  // 全壊ビル
  ];

  document.getElementById('freecam')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'freecam';
  wrap.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;display:flex;flex-wrap:wrap;gap:2px;overflow:auto';
  document.body.appendChild(wrap);

  for (const s of SHOTS) {
    const field = FIELDS.find((f) => f.id === s.fid);
    const cv = document.createElement('canvas');
    cv.width = 660; cv.height = 400;
    cv.style.cssText = 'width:660px;height:400px';
    wrap.appendChild(cv);
    const r = r3t.createR3DThree(cv);
    const tgt = P(s.at[0], s.at[1]);
    const scaled = field.obstacles.map((o, i) => ({
      kind: o.kind, x: C + (o.x - C) * S, y: C + (o.y - C) * S, r: o.r * S, hp0: o.hp, idx: i,
      alive: !(s.dead && o.kind === 'wall' && o.hp != null),
      hpFrac: s.dead && o.kind === 'wall' ? 0 : 1,
    }));
    const sc = {
      mechs: [], shots: [], blasts: [], obstacles: scaled, field: s.fid, theme: s.th,
      camera: { eye: [tgt[0] + s.dist * 0.7, s.h, tgt[2] + s.dist * 0.7], target: [tgt[0], 5, tgt[2]] },
    };
    r.render(sc, 1.0);
    r.render(sc, 1.05);   // 2フレーム描く(初回はテクスチャ生成とシェーダコンパイルで間に合わないことがある)
  }
  console.log('freecam: ' + SHOTS.length + ' コマ描画。消すには document.getElementById("freecam").remove()');
})();

// おまけ: 生成された質感テクスチャを一覧する(柄そのものを目で見て直すとき)。
// 上のブロックと同じ手順でコンソールに貼る。
/*
(async () => {
  const tex = await import('./tex.js');
  const r3d = await import('./r3d.js');
  document.getElementById('texdump')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'texdump';
  wrap.style.cssText = 'position:fixed;inset:0;background:#111;z-index:99999;display:flex;flex-wrap:wrap;gap:6px;padding:6px;overflow:auto';
  document.body.appendChild(wrap);
  const show = (t, label) => {
    const box = document.createElement('div');
    box.style.cssText = 'color:#8f8;font:11px monospace';
    let cv;
    if (t.image instanceof HTMLCanvasElement) cv = t.image;                 // CanvasTexture
    else {                                                                   // DataTexture(法線)
      cv = document.createElement('canvas'); cv.width = t.image.width; cv.height = t.image.height;
      const c = cv.getContext('2d'); const d = c.createImageData(cv.width, cv.height);
      d.data.set(t.image.data); c.putImageData(d, 0, 0);
    }
    cv.style.cssText = 'width:158px;height:158px;display:block;image-rendering:pixelated';
    box.appendChild(cv);
    const l = document.createElement('div'); l.textContent = label; box.appendChild(l);
    wrap.appendChild(box);
  };
  const g = tex.groundMaps(r3d.THEMES.training, 'dirt');
  show(g.map, 'dirt'); show(g.normalMap, 'dirt N');
  const rk = tex.rockMaps(); show(rk.map, 'rock'); show(rk.normalMap, 'rock N');
  const cc = tex.concreteMaps(); show(cc.map, 'concrete');
  for (const cls of ['panel','plate','cast','weave','fluid','era','gunmetal','blade','drill','rubber','grille','thermal','pod']) {
    show(tex.partMatSet(cls).map, cls);
  }
  const b = tex.buildingMaps(0); show(b.map, 'building'); show(b.emissiveMap, 'bld windows');
})();
*/
