// 鋼機工廠 ハザード関与プローブ — node hazard-probe.mjs
// KOUKI_DIR=../../public/dev で開発版(既定は本番)。
// 「ジレンマ(踏む/迂回の選択)が実際に起きているか」を states から数値で示す:
//   - 泥/棘の滞在時間(脚種別) … 迂回AIが働けば wheel(泥0.35)は quad(0.7) より滞在が短くなるはず
//   - 横断エピソード数(外→内の遷移) … 「突っ込む」選択の実数
//   - hazard イベント率 / hazard 決着率 / 泥内滞在の分布
const DIR = process.env.KOUKI_DIR || '../../public';
console.log(`対象: ${DIR}  (開発版は KOUKI_DIR=../../public/dev)`);
const { simulate, FIELDS } = await import(`${DIR}/sim.js`);

const A = {
  assault:  { frame:'fr4', legs:'lg1', gen:'gn2', armor:'ar1', wpnR:'wp6', wpnL:'wp5', ai:'ai1', color:'#b0563e', decal:'none', name:'' },
  standard: { frame:'fr2', legs:'lg1', gen:'gn2', armor:'ar2', wpnR:'wp1', wpnL:'wp2', ai:'ai2', color:'#8fa3b0', decal:'none', name:'' },
  heavy:    { frame:'fr5', legs:'lg5', gen:'gn3', armor:'ar3', wpnR:'wp4', wpnL:'wp8', ai:'ai2', color:'#3a4047', decal:'none', name:'' },
  sniper:   { frame:'fr2', legs:'lg4', gen:'gn3', armor:'ar1', wpnR:'wp7', wpnL:'wp3', ai:'ai4', color:'#6d8f5a', decal:'none', name:'' },
  skirmish: { frame:'fr1', legs:'lg4', gen:'gn3', armor:'ar1', wpnR:'wp8', wpnL:'wp3', ai:'ai3', color:'#4d7ea8', decal:'none', name:'' },
  driller:  { frame:'fr3', legs:'lg7', gen:'gn3', armor:'ar4', wpnR:'wp9', wpnL:'wp5', ai:'ai1', color:'#c2a35c', decal:'none', name:'' },
  wheeler:  { frame:'fr1', legs:'lg6', gen:'gn2', armor:'ar1', wpnR:'wp1', wpnL:'wp10', ai:'ai3', color:'#7d6bb0', decal:'none', name:'' },
};
const LEG_KIND = { assault:'biped', standard:'biped', heavy:'tank', sniper:'hover', skirmish:'hover', driller:'reverse', wheeler:'wheel' };
const HFIELDS = FIELDS.filter(f => f.obstacles.some(o => o.kind === 'mud' || o.kind === 'spike')).map(f => f.id);
const N = 14;
const keys = Object.keys(A);
const perField = {};

const inside = (mm, o) => Math.hypot(mm.x - o.x, mm.y - o.y) < o.r;

for (const fid of HFIELDS) {
  const field = FIELDS.find(f => f.id === fid);
  const muds = field.obstacles.filter(o => o.kind === 'mud');
  const spikes = field.obstacles.filter(o => o.kind === 'spike');
  let games = 0, hazardEv = 0, hazardDmg = 0, hazardEnd = 0, gamesWithHazardEv = 0;
  // 脚種別集計 { dwellMud, dwellSpike, crossMud, crossSpike, mechGames }
  const leg = {};
  const L = (k) => leg[k] || (leg[k] = { dwellMud: 0, dwellSpike: 0, crossMud: 0, crossSpike: 0, mechGames: 0 });
  let bothAvoided = 0, someCrossed = 0;   // 泥/棘に1度でも入った機体がいる試合か(hover除く)
  for (let i = 0; i < keys.length; i++) for (let j = 0; j < keys.length; j++) {
    if (i === j) continue;
    for (let s = 0; s < N; s++) {
      const r = simulate(A[keys[i]], A[keys[j]], 5000 + i * 131 + j * 17 + s * 7919, { fieldId: fid });
      games++;
      const hz = r.events.filter(e => e.kind === 'hazard');
      hazardEv += hz.length;
      hazardDmg += hz.reduce((a, e) => a + e.dmg, 0);
      if (hz.length) gamesWithHazardEv++;
      const endE = r.events[r.events.length - 1];
      if (endE.reason === 'hazard') hazardEnd++;
      let crossedThis = false, groundMechs = 0;
      for (let mi = 0; mi < 2; mi++) {
        const kind = LEG_KIND[keys[mi === 0 ? i : j]];
        const st = L(kind); st.mechGames++;
        if (kind !== 'hover') groundMechs++;
        // 「渡渉」= 0.5s 以上のエピソードのみ数える(縁かすり・ノックバックの瞬間接触は除外)
        let mudRun = 0, spkRun = 0;
        const closeRun = (run, key) => { if (run >= 5) { st[key]++; if (kind !== 'hover') crossedThis = true; } return 0; };
        for (const s2 of r.states) {
          const mm = s2.m[mi];
          const im = muds.some(o => inside(mm, o));
          const is2 = spikes.some(o => inside(mm, o));
          if (im) { st.dwellMud += 0.1; mudRun++; } else mudRun = closeRun(mudRun, 'crossMud');
          if (is2) { st.dwellSpike += 0.1; spkRun++; } else spkRun = closeRun(spkRun, 'crossSpike');
        }
        closeRun(mudRun, 'crossMud'); closeRun(spkRun, 'crossSpike');
      }
      if (groundMechs) { if (crossedThis) someCrossed++; else bothAvoided++; }
    }
  }
  console.log(`== ${fid} (${field.name}) — ${games}戦 ==`);
  console.log(`  hazardイベント: ${hazardEv}件(${(hazardEv / games).toFixed(2)}/戦・発生試合率${(100 * gamesWithHazardEv / games).toFixed(0)}%) 計${hazardDmg}損 / hazard決着 ${hazardEnd}戦(${(100 * hazardEnd / games).toFixed(1)}%)`);
  console.log(`  地上機のいる試合: 突入あり ${someCrossed} / 全員迂回 ${bothAvoided}  (突入率 ${(100 * someCrossed / (someCrossed + bothAvoided || 1)).toFixed(0)}%)`);
  for (const [k, v] of Object.entries(leg)) {
    const im = k === 'hover' ? ' ※免疫(比較対象)' : '';
    console.log(`  ${k.padEnd(8)} 泥滞在 ${(v.dwellMud / v.mechGames).toFixed(1)}s/戦 (突入${(v.crossMud / v.mechGames).toFixed(2)}回) / 棘滞在 ${(v.dwellSpike / v.mechGames).toFixed(1)}s/戦 (突入${(v.crossSpike / v.mechGames).toFixed(2)}回)${im}`);
  }
  perField[fid] = { leg, someCrossed, bothAvoided };
}

// ジレンマ回帰の番人(dev で成立していることの機械判定。本番=認知なし旧配置では FAIL してよい)
let fail = 0;
const gate = (name, cond, extra = '') => { console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? `  ${extra}` : '')); if (!cond) fail++; };
console.log('== ジレンマ判定 ==');
{
  const d = perField.deitan, avg = (v) => v.dwellMud / v.mechGames;
  if (d && d.leg.wheel && d.leg.biped) {
    gate('泥の死地は迂回する(deitan: wheel泥滞在 < bipedの半分)', avg(d.leg.wheel) < avg(d.leg.biped) * 0.5,
      `wheel=${avg(d.leg.wheel).toFixed(1)}s biped=${avg(d.leg.biped).toFixed(1)}s`);
    gate('渡る者と回る者が共存(deitan: 突入率50〜100%未満)',
      d.someCrossed / (d.someCrossed + d.bothAvoided) >= 0.5 && d.bothAvoided > 0,
      `突入${d.someCrossed}/迂回${d.bothAvoided}`);
  }
  for (const fid of ['crater', 'ibara']) {
    const f = perField[fid];
    if (!f || !f.leg.hover) continue;
    const spk = (v) => v.dwellSpike / v.mechGames;
    const ground = ['biped', 'tank', 'wheel'].filter(k => f.leg[k]);
    const gAvg = ground.reduce((a, k) => a + spk(f.leg[k]), 0) / (ground.length || 1);
    gate(`免疫の自由(${fid}: hover棘滞在 > 地上系平均の2倍)`, spk(f.leg.hover) > gAvg * 2,
      `hover=${spk(f.leg.hover).toFixed(1)}s 地上avg=${gAvg.toFixed(1)}s`);
  }
}
console.log(fail ? `\nFAIL x${fail}` : '\nALL GREEN');
process.exit(fail ? 1 : 0);
