// 鋼機工廠 脚種×EN収支プローブ — node legbal-probe.mjs
// KOUKI_DIR=../../public で本番にも当てられる(既定は開発版)。
//
// 何のためにあるか:
//   ⑴ 地形の追加で特定の脚種が強くなっていないかの切り分け。同じseed・同じ戦場で
//      rubble の有無だけを変えて総当たりし、差分を脚種別に出す(2026-08-01 の
//      「小障害物でホバーが強くなるのでは」を否定した根拠: hover +0.8pt で最弱のまま)。
//   ⑵ EN 収支の一覧(炉出力−脚drain / cap / 武器の連続消費EN/s / EN兵装の門数)。
//      docs/tasks.md「装備・脚種ごとのバランス調整」に着手するときの出発点。
//      ※「兵装のEN依存度 × 脚種」のクロス集計はまだ無い。着手時に足すこと。
const DIR = process.env.KOUKI_DIR || '../../public/dev';
const { simulate, FIELDS } = await import(`${DIR}/sim.js`);
const { deriveStats } = await import(`${DIR}/parts.js`);

const A = {
  assault:  { frame:'fr4', legs:'lg1', gen:'gn2', armor:'ar1', wpnR:'wp6', wpnL:'wp5', ai:'ai1', color:'#b0563e', decal:'none', name:'' },
  standard: { frame:'fr2', legs:'lg1', gen:'gn2', armor:'ar2', wpnR:'wp1', wpnL:'wp2', ai:'ai2', color:'#8fa3b0', decal:'none', name:'' },
  heavy:    { frame:'fr5', legs:'lg5', gen:'gn3', armor:'ar3', wpnR:'wp4', wpnL:'wp8', ai:'ai2', color:'#3a4047', decal:'none', name:'' },
  sniper:   { frame:'fr2', legs:'lg4', gen:'gn3', armor:'ar1', wpnR:'wp7', wpnL:'wp3', ai:'ai4', color:'#6d8f5a', decal:'none', name:'' },
  skirmish: { frame:'fr1', legs:'lg4', gen:'gn3', armor:'ar1', wpnR:'wp8', wpnL:'wp3', ai:'ai3', color:'#4d7ea8', decal:'none', name:'' },
  driller:  { frame:'fr3', legs:'lg7', gen:'gn3', armor:'ar4', wpnR:'wp9', wpnL:'wp5', ai:'ai1', color:'#c2a35c', decal:'none', name:'' },
  wheeler:  { frame:'fr1', legs:'lg6', gen:'gn2', armor:'ar1', wpnR:'wp1', wpnL:'wp10', ai:'ai3', color:'#7d6bb0', decal:'none', name:'' },
  lancer:   { frame:'fr8', legs:'lg13', gen:'gn7', armor:'ar2', wpnR:'wp17', wpnL:'wp15', ai:'ai3', color:'#8fd0ff', decal:'none', name:'' },
  bombard:  { frame:'fr5', legs:'lg14', gen:'gn3', armor:'ar7', wpnR:'wp18', wpnL:'wp16', ai:'ai5', color:'#c2a35c', decal:'none', name:'' },
};
const keys = Object.keys(A);
const LEG = {}; for (const k of keys) LEG[k] = deriveStats(A[k]).parts.lg.kind;
const IDS = FIELDS.map(f => f.id);
const N = 20;
const orig = FIELDS.map(f => f.obstacles);

function run(label, strip) {
  FIELDS.forEach((f, i) => { f.obstacles = strip ? orig[i].filter(o => o.kind !== 'rubble') : orig[i]; });
  const wins = {}; keys.forEach(k => wins[k] = 0);
  const games = {}; keys.forEach(k => games[k] = 0);
  for (let i = 0; i < keys.length; i++) for (let j = 0; j < keys.length; j++) {
    if (i === j) continue;
    for (let s = 0; s < N; s++) {
      const r = simulate(A[keys[i]], A[keys[j]], 1000 + i * 100 + j * 10 + s * 7919, { fieldId: IDS[s % IDS.length] });
      games[keys[i]]++; games[keys[j]]++;
      if (r.winner === 0) wins[keys[i]]++; else if (r.winner === 1) wins[keys[j]]++;
    }
  }
  const byLeg = {};
  for (const k of keys) {
    const L = byLeg[LEG[k]] || (byLeg[LEG[k]] = { w: 0, g: 0 });
    L.w += wins[k]; L.g += games[k];
  }
  return { label, arch: Object.fromEntries(keys.map(k => [k, wins[k] / games[k]])), byLeg };
}

const withR = run('rubbleあり', false);
const noR = run('rubbleなし', true);
FIELDS.forEach((f, i) => { f.obstacles = orig[i]; });

const pc = (x) => (100 * x).toFixed(1) + '%';
console.log('== アーキタイプ別勝率(同一seed・同一戦場・rubble の有無だけを変えた)==');
for (const k of keys) {
  const d = withR.arch[k] - noR.arch[k];
  console.log(`  ${k.padEnd(9)} ${LEG[k].padEnd(8)} なし ${pc(noR.arch[k])} → あり ${pc(withR.arch[k])}  (${d >= 0 ? '+' : ''}${(100 * d).toFixed(1)}pt)`);
}
console.log('== 脚種別 ==');
for (const kind of Object.keys(withR.byLeg)) {
  const a = withR.byLeg[kind], b = noR.byLeg[kind];
  const d = a.w / a.g - b.w / b.g;
  console.log(`  ${kind.padEnd(8)} なし ${pc(b.w / b.g)} → あり ${pc(a.w / a.g)}  (${d >= 0 ? '+' : ''}${(100 * d).toFixed(1)}pt)`);
}
console.log('== EN収支(炉出力 − 脚drain)と武器のEN依存 ==');
for (const k of keys) {
  const st = deriveStats(A[k]);
  const ws = [st.parts.wr, st.parts.wl];
  const enOnly = ws.filter(w => w.ammo == null).length;   // 弾数∞=EN/近接兵装
  const cps = ws.map(w => (w.encost * w.burst / w.cooldown).toFixed(1)).join('+');
  console.log(`  ${k.padEnd(9)} ${st.parts.lg.kind.padEnd(8)} 炉${st.parts.gn.output} - drain${st.parts.lg.drain} = enOut ${st.enOut.toFixed(1)}/s`
    + ` / cap ${st.enCap} / 武器の連続消費 ${cps} EN/s / EN兵装 ${enOnly}門`);
}
