// 鋼機工廠 ハザード関与プローブ — node hazard-probe.mjs
// KOUKI_DIR=../../public/dev で開発版(既定は本番)。
// 「ジレンマ(踏む/迂回/乗る の選択)が実際に起きているか」を states から数値で示す:
//   - 泥/棘の滞在時間(脚種別) … 迂回AIが働けば wheel(泥0.35)は quad(0.7) より滞在が短くなるはず
//   - 横断エピソード数(外→内の遷移) … 「突っ込む」選択の実数
//   - hazard イベント率 / hazard 決着率 / 泥内滞在の分布
//   - v5: 瓦礫(rubble)の踏破 … 乗上滞在/回数(脚種別)・高所での減速・高所での回避低下(露出)
//     踏破の判定ゲートは末尾「踏破判定」節。踏む/迂回のジレンマと同じ流儀で数値実証する。
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
const HFIELDS = FIELDS.filter(f => f.obstacles.some(o => o.kind === 'mud' || o.kind === 'spike' || o.kind === 'rubble')).map(f => f.id);
console.log(`戦場 ${HFIELDS.length}種: ${HFIELDS.join(' ')}`);
const N = 14;
const keys = Object.keys(A);
const perField = {};

const inside = (mm, o) => Math.hypot(mm.x - o.x, mm.y - o.y) < o.r;

for (const fid of HFIELDS) {
  const field = FIELDS.find(f => f.id === fid);
  const muds = field.obstacles.filter(o => o.kind === 'mud');
  const spikes = field.obstacles.filter(o => o.kind === 'spike');
  let games = 0, hazardEv = 0, hazardDmg = 0, hazardEnd = 0, gamesWithHazardEv = 0;
  // 高所の露出/減速の実測: 「高所に居た間」と「地上に居た間」で回避率と移動速度を分けて集計する。
  // 攻撃判定は発射時の標高で決まるが、イベント時刻は着弾時刻。乗上エピソードは数秒あるので
  // 統計としては足りる(飛翔時間ぶんの取りこぼしは滞在の端に限られる)。
  const hi = { dodge: 0, land: 0, spd: 0, n: 0 }, lo = { dodge: 0, land: 0, spd: 0, n: 0 };
  // 脚種別集計 { dwellMud, dwellSpike, crossMud, crossSpike, dwellHigh, climbs, mechGames }
  const leg = {};
  const L = (k) => leg[k] || (leg[k] = { dwellMud: 0, dwellSpike: 0, crossMud: 0, crossSpike: 0,
                                         dwellRub: 0, climbs: 0, mechGames: 0 });
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
        let mudRun = 0, spkRun = 0, rubRun = 0;
        const closeRun = (run, key) => { if (run >= 5) { st[key]++; if (kind !== 'hover') crossedThis = true; } return 0; };
        // 乗上は「高さのある足場(h≥1.0)に0.5s以上」を1回と数える。縁石級(h=1.1未満)の
        // かすりを踏破と呼ぶと数が水増しされて「乗っている」の意味が薄まる。
        let prev = null;
        for (const s2 of r.states) {
          const mm = s2.m[mi];
          const im = muds.some(o => inside(mm, o));
          const is2 = spikes.some(o => inside(mm, o));
          if (im) { st.dwellMud += 0.1; mudRun++; } else mudRun = closeRun(mudRun, 'crossMud');
          if (is2) { st.dwellSpike += 0.1; spkRun++; } else spkRun = closeRun(spkRun, 'crossSpike');
          const cy = mm.cy || 0;
          if (cy >= 1.0) { st.dwellRub += 0.1; rubRun++; } else if (rubRun >= 5) { st.climbs++; rubRun = 0; } else rubRun = 0;
          if (prev) {
            const v = Math.hypot(mm.x - prev.x, mm.y - prev.y) / 0.1;
            const b = cy > 0 ? hi : lo; b.spd += v; b.n++;
          }
          prev = mm;
        }
        if (rubRun >= 5) st.climbs++;
      }
      // 高所での被弾/回避(標高は states から時刻引き)
      for (const e of r.events) {
        if (e.kind !== 'hit' && e.kind !== 'dodge' && e.kind !== 'parry') continue;
        const s2 = r.states[Math.min(r.states.length - 1, Math.max(0, Math.round(e.t * 10)))];
        if (!s2) continue;
        const b = (s2.m[e.targ].cy || 0) > 0 ? hi : lo;
        if (e.kind === 'dodge') b.dodge++; else b.land++;
      }
      if (groundMechs) { if (crossedThis) someCrossed++; else bothAvoided++; }
    }
  }
  console.log(`== ${fid} (${field.name}) — ${games}戦 ==`);
  console.log(`  hazardイベント: ${hazardEv}件(${(hazardEv / games).toFixed(2)}/戦・発生試合率${(100 * gamesWithHazardEv / games).toFixed(0)}%) 計${hazardDmg}損 / hazard決着 ${hazardEnd}戦(${(100 * hazardEnd / games).toFixed(1)}%)`);
  console.log(`  地上機のいる試合: 突入あり ${someCrossed} / 全員迂回 ${bothAvoided}  (突入率 ${(100 * someCrossed / (someCrossed + bothAvoided || 1)).toFixed(0)}%)`);
  const rate = (b) => b.dodge / (b.dodge + b.land || 1);
  console.log(`  高所(cy>0): 回避率 ${(100 * rate(hi)).toFixed(1)}% (n=${hi.dodge + hi.land}) 平均速度 ${(hi.spd / (hi.n || 1)).toFixed(1)}m/s`
            + ` / 地上: 回避率 ${(100 * rate(lo)).toFixed(1)}% (n=${lo.dodge + lo.land}) 平均速度 ${(lo.spd / (lo.n || 1)).toFixed(1)}m/s`);
  for (const [k, v] of Object.entries(leg)) {
    const im = k === 'hover' ? ' ※免疫(比較対象)' : '';
    console.log(`  ${k.padEnd(8)} 泥滞在 ${(v.dwellMud / v.mechGames).toFixed(1)}s/戦 (突入${(v.crossMud / v.mechGames).toFixed(2)}回) / 棘滞在 ${(v.dwellSpike / v.mechGames).toFixed(1)}s/戦 (突入${(v.crossSpike / v.mechGames).toFixed(2)}回)`
              + ` / 高所滞在 ${(v.dwellRub / v.mechGames).toFixed(1)}s/戦 (乗上${(v.climbs / v.mechGames).toFixed(2)}回)${im}`);
  }
  perField[fid] = { leg, someCrossed, bothAvoided, hi, lo };
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
// v5 踏破判定: rubble に「乗る/迂回する」の選択が実在し、脚種で答えが割れ、
// 乗った代償(遅い・躱せない)が数値で出ていることを確かめる。
console.log('== 踏破判定(v5 小障害物) ==');
{
  const RF = HFIELDS.filter(fid => FIELDS.find(f => f.id === fid).obstacles.some(o => o.kind === 'rubble'));
  const dw = (v) => v.dwellRub / v.mechGames;
  // 全戦場を束ねた実測(単一戦場だと配置の偶然に振られる)
  const all = { hiD: 0, hiL: 0, loD: 0, loL: 0, hiS: 0, hiN: 0, loS: 0, loN: 0 };
  const legAll = {};
  for (const fid of RF) {
    const f = perField[fid];
    all.hiD += f.hi.dodge; all.hiL += f.hi.land; all.loD += f.lo.dodge; all.loL += f.lo.land;
    all.hiS += f.hi.spd; all.hiN += f.hi.n; all.loS += f.lo.spd; all.loN += f.lo.n;
    for (const [k, v] of Object.entries(f.leg)) {
      const a = legAll[k] || (legAll[k] = { dwellRub: 0, climbs: 0, mechGames: 0 });
      a.dwellRub += v.dwellRub; a.climbs += v.climbs; a.mechGames += v.mechGames;
    }
  }
  gate('踏破が実際に起きる(全戦場合計で乗上 0.2回/戦 以上)',
    Object.values(legAll).reduce((a, v) => a + v.climbs, 0) /
    Object.values(legAll).reduce((a, v) => a + v.mechGames, 0) >= 0.2,
    `${(Object.values(legAll).reduce((a, v) => a + v.climbs, 0) /
        Object.values(legAll).reduce((a, v) => a + v.mechGames, 0)).toFixed(2)}回/戦`);
  gate('乗る者と迂回する者が共存(地上系で最長滞在 ≥ 最短滞在の2倍。全員同じ答えなら選択が無い)',
    (() => { const g = ['biped', 'tank', 'wheel', 'reverse'].filter(k => legAll[k]).map(k => dw(legAll[k]));
             return g.length >= 3 && Math.max(...g) >= Math.min(...g) * 2; })(),
    ['biped', 'tank', 'wheel', 'reverse'].filter(k => legAll[k]).map(k => `${k}=${dw(legAll[k]).toFixed(1)}s`).join(' '));
  // 脚種の分かれ方は「乗る回数」ではなく「1回あたり何秒居座るか」に出る。逆関節は回数こそ多いが
  // 跳び越えて即降りる(回避が持ち味なので高所に留まる価値が無い)。履帯は乗ったら砲座にする。
  const per = (v) => v.dwellRub / (v.climbs || 1);
  gate('脚種で踏破選択が分かれる(履帯は高所に居座り、逆関節は跳び越えるだけ: 1回あたり滞在 tank > reverse×2)',
    legAll.tank && legAll.reverse && per(legAll.tank) > per(legAll.reverse) * 2,
    legAll.tank && legAll.reverse ? `tank=${per(legAll.tank).toFixed(1)}s/回 reverse=${per(legAll.reverse).toFixed(1)}s/回` : 'n/a');
  gate('段差に弱い脚は乗らない(車輪 wheel < 履帯 tank の1/4)',
    legAll.wheel && legAll.tank && dw(legAll.wheel) < dw(legAll.tank) * 0.25,
    legAll.wheel && legAll.tank ? `wheel=${dw(legAll.wheel).toFixed(2)}s tank=${dw(legAll.tank).toFixed(2)}s` : 'n/a');
  gate('ホバーは踏破しない(免疫=標高を得ない)', !legAll.hover || dw(legAll.hover) === 0,
    legAll.hover ? `hover=${dw(legAll.hover).toFixed(2)}s` : 'n/a');
  gate('乗り越えは遅い(高所の平均速度 < 地上の95%)',
    all.hiN > 500 && all.hiS / all.hiN < all.loS / all.loN * 0.95,
    `高所=${(all.hiS / (all.hiN || 1)).toFixed(1)}m/s 地上=${(all.loS / (all.loN || 1)).toFixed(1)}m/s n=${all.hiN}`);
  gate('高所は露出する(高所の回避率 < 地上の90%)',
    all.hiD + all.hiL > 300 && (all.hiD / (all.hiD + all.hiL)) < (all.loD / (all.loD + all.loL)) * 0.9,
    `高所=${(100 * all.hiD / (all.hiD + all.hiL || 1)).toFixed(1)}% 地上=${(100 * all.loD / (all.loD + all.loL || 1)).toFixed(1)}% n=${all.hiD + all.hiL}`);
}
console.log(fail ? `\nFAIL x${fail}` : '\nALL GREEN');
process.exit(fail ? 1 : 0);
