// 鋼機工廠 初期価格帯(予算3000C)バランスハーネス — node harness-budget.mjs
// 対象は既定で開発版(public/dev)。KOUKI_DIR=../../public で本番にも当てられる。
// 本体 harness.mjs は本番全体の健全性、こちらは「初期予算で組める構成の多様性と均衡」を見る。
const DIR = process.env.KOUKI_DIR || '../../public/dev';
const { simulate, TMAX } = await import(`${DIR}/sim.js`);
const { PARTS, validateBuild, deriveStats, buildCost } = await import(`${DIR}/parts.js`);

const BUDGET = 3000;
// 初期予算の代表構成(全パーツ tier0・総額 ≤ 3000C)。脚種・武器帯の広がりを網羅する。
const B = {
  rifle:  { frame:'fr2', legs:'lg1',  gen:'gn2', armor:'ar2', wpnR:'wp1',  wpnL:'wp2',  ai:'ai2', color:'#8fa3b0', decal:'none', name:'' }, // 既定機(基準)
  melee:  { frame:'fr1', legs:'lg12', gen:'gn2', armor:'ar5', wpnR:'wp11', wpnL:'wp5',  ai:'ai1', color:'#b0563e', decal:'none', name:'' }, // 逆関節×重刃
  sniper: { frame:'fr2', legs:'lg11', gen:'gn5', armor:'ar1', wpnR:'wp13', wpnL:'wp12', ai:'ai5', color:'#6d8f5a', decal:'none', name:'' }, // 車輪カイト×長距離
  hover:  { frame:'fr1', legs:'lg10', gen:'gn2', armor:'ar1', wpnR:'wp14', wpnL:'wp5',  ai:'ai6', color:'#4d7ea8', decal:'none', name:'' }, // ホバー×短距離一撃離脱
  tank:   { frame:'fr6', legs:'lg9',  gen:'gn1', armor:'ar6', wpnR:'wp1',  wpnL:'wp2',  ai:'ai2', color:'#3a4047', decal:'none', name:'' }, // 厚殻×鋳鉄の砲座
  wheel:  { frame:'fr7', legs:'lg11', gen:'gn6', armor:'ar1', wpnR:'wp5',  wpnL:'wp14', ai:'ai1', color:'#7d6bb0', decal:'none', name:'' }, // 車輪×懐入り
  quad:   { frame:'fr2', legs:'lg8',  gen:'gn5', armor:'ar2', wpnR:'wp2',  wpnL:'wp1',  ai:'ai2', color:'#c2a35c', decal:'none', name:'' }, // 四脚×中距離砲戦
};
const FIELD_IDS = ['plain', 'sekichu', 'deitan', 'crater', 'haikyo'];

let fail = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? `  ${extra}` : '')); if (!cond) fail++; };

console.log('== ロスター健全性 ==');
{
  const all = Object.values(PARTS).flat();
  ok('全パーツ price>0', all.every(p => p.price > 0));
  const ids = all.map(p => p.id);
  ok('id 重複なし', new Set(ids).size === ids.length);
  ok('id 接尾辞 1..255(リプレイ8bit幅)', all.every(p => { const n = Number(p.id.replace(/^[a-z]+/, '')); return Number.isInteger(n) && n >= 1 && n <= 255; }));
  const t0legs = new Set(PARTS.legs.filter(p => p.tier === 0).map(p => p.kind));
  ok('tier0 で全脚種が選べる', ['biped','quad','hover','tank','wheel','reverse'].every(k => t0legs.has(k)),
     [...t0legs].join(','));
  const t0bands = new Set(PARTS.wpn.filter(p => p.tier === 0).map(p => p.band));
  ok('tier0 で全武器帯が選べる', ['melee','short','mid','long'].every(b => t0bands.has(b)), [...t0bands].join(','));
  ok('tier0 に kite OS がある', PARTS.ai.some(p => p.tier === 0 && p.kite));
  for (const cat of ['frame','legs','gen','armor','wpn','ai'])
    ok(`${cat}: tier0 が3種以上`, PARTS[cat].filter(p => p.tier === 0).length >= 3,
       `${PARTS[cat].filter(p => p.tier === 0).length}種`);
}

console.log('== 廉価版が上位版を陳腐化させない(支配チェック) ==');
{
  // A が B より安い(≤)のに全キー性能で同等以上かつどれかで真に上 → B は死にパーツ。
  const KEYS = {
    frame: { up: ['hp','capacity'], down: ['weight'] },
    legs:  { up: ['speed','turn','evasion','aimBonus'], down: ['drain','weight'] },
    gen:   { up: ['output','cap'], down: ['weight'] },
    armor: { up: ['defense'], down: ['evaPenalty','weight'] },
    ai:    { up: [], down: [] },   // OS は数値の大小に優劣がない(性格の違い)ため対象外
  };
  let bad = 0;
  for (const [cat, k] of Object.entries(KEYS)) {
    for (const a of PARTS[cat]) for (const b of PARTS[cat]) {
      if (a === b || a.price > b.price) continue;
      if (cat === 'legs' && a.kind !== b.kind) continue;   // 脚種が違えば別の土俵
      const ge = k.up.every(f => (a[f] || 0) >= (b[f] || 0)) && k.down.every(f => (a[f] || 0) <= (b[f] || 0));
      const gt = k.up.some(f => (a[f] || 0) > (b[f] || 0)) || k.down.some(f => (a[f] || 0) < (b[f] || 0));
      if (ge && gt) { bad++; console.log(`  ✗ ${cat}: ${a.id}(${a.price}C) が ${b.id}(${b.price}C) を支配`); }
    }
  }
  ok('支配ペアなし(frame/legs/gen/armor)', bad === 0);
}

console.log('== 予算内構成の妥当性 ==');
for (const [k, b] of Object.entries(B)) {
  const v = validateBuild(b), s = deriveStats(b), c = buildCost(b);
  ok(`${k} valid・${c}C ≤ ${BUDGET}C`, v.ok && c <= BUDGET,
     v.ok ? `w${s.weight}/${s.capacity} spd${s.speed.toFixed(0)} hp${s.hp} en+${s.enOut.toFixed(1)}` : v.errors.join(','));
}

console.log('== 予算帯 総当たり(各16シード×フィールド回転) ==');
{
  const keys = Object.keys(B);
  const N = 16;
  const wins = {}; keys.forEach(k => wins[k] = 0);
  const pair = {};
  const durs = []; let draws = 0, total = 0;
  for (let i = 0; i < keys.length; i++) for (let j = 0; j < keys.length; j++) {
    if (i === j) continue;
    for (let s = 0; s < N; s++) {
      const r = simulate(B[keys[i]], B[keys[j]], 5000 + i * 131 + j * 17 + s * 7919, { fieldId: FIELD_IDS[s % FIELD_IDS.length] });
      total++; durs.push(r.duration);
      if (r.winner === -1) draws++;
      else wins[keys[r.winner === 0 ? i : j]]++;
      pair[keys[i] + '>' + keys[j]] = (pair[keys[i] + '>' + keys[j]] || 0) + (r.winner === 0 ? 1 : 0);
    }
  }
  durs.sort((a, b2) => a - b2);
  const med = durs[(durs.length / 2) | 0];
  const games = 2 * (keys.length - 1) * N;
  console.log(`  試合数 ${total} / 引分 ${(100 * draws / total).toFixed(1)}% / 時間 med ${med}s p90 ${durs[(durs.length * .9) | 0]}s`);
  console.log('  勝率: ' + keys.map(k => `${k} ${(100 * wins[k] / games).toFixed(0)}%`).join(' / '));
  console.log('  ペア別(行が列に勝つ率):');
  for (const a of keys) console.log('    ' + a.padEnd(7) + keys.map(b2 => a === b2 ? ' -- ' : String(Math.round(100 * ((pair[a + '>' + b2] || 0) + (N - (pair[b2 + '>' + a] || 0))) / (2 * N))).padStart(3) + '%').join(' '));
  const rates = keys.map(k => wins[k] / games);
  ok('一強なし(最高勝率 ≤ 68%)', Math.max(...rates) <= 0.68, `max=${(Math.max(...rates) * 100).toFixed(0)}%`);
  ok('产廃なし(最低勝率 ≥ 25%)', Math.min(...rates) >= 0.25, `min=${(Math.min(...rates) * 100).toFixed(0)}%`);
  ok('膠着しすぎない(引分 ≤ 12%)', draws / total <= 0.12, `${(100 * draws / total).toFixed(1)}%`);
  ok('速攻すぎない(中央値 ≥ 25s)', med >= 25, `med=${med}`);
  ok('だれない(p90 ≤ 180s)', durs[(durs.length * .9) | 0] <= 180);
}

console.log('== 脚種の傾向が廉価帯でも出る ==');
{
  // ホバー(泥免疫) vs 車輪(泥0.35): 泥地(deitan)では平地よりホバー側に勝率が寄るはず
  const N = 40;
  const wr = (fid) => { let w = 0; for (let s = 0; s < N; s++) if (simulate(B.hover, B.wheel, 9000 + s * 271, { fieldId: fid }).winner === 0) w++; return w / N; };
  const plain = wr('plain'), deitan = wr('deitan');
  ok('ホバー対車輪: 泥地で優位が増す', deitan > plain, `plain ${(plain * 100).toFixed(0)}% → deitan ${(deitan * 100).toFixed(0)}%`);
  // 四脚/履帯(aimBonus)の照準安定: 同構成で脚だけ替えると命中率(hit/全ロール)が上がる
  const hitRate = (legs) => {
    const b = Object.assign({}, B.rifle, { legs });
    let hit = 0, roll = 0;
    for (let s = 0; s < N; s++) {
      const r = simulate(b, B.rifle, 11000 + s * 137, { fieldId: 'plain' });
      for (const e of r.events) {
        if (e.who !== 0) continue;
        if (e.kind === 'hit') { hit++; roll++; }
        else if (e.kind === 'miss' || e.kind === 'dodge' || e.kind === 'parry') roll++;
      }
    }
    return hit / roll;
  };
  const hQuad = hitRate('lg8'), hBiped = hitRate('lg2');
  ok('四脚は二脚より命中率が高い(照準補正)', hQuad > hBiped,
     `lg8 ${(hQuad * 100).toFixed(1)}% vs lg2 ${(hBiped * 100).toFixed(1)}%`);
  // 白兵OSを積んだ機はパリィが出る(廉価重刃でも白兵の旨みが立つ)
  let parry = 0;
  for (let s = 0; s < 12; s++) parry += simulate(B.melee, B.rifle, 13000 + s * 173, { fieldId: 'plain' }).events.filter(e => e.kind === 'parry' && e.targ === 0).length;
  ok('廉価重刃でパリィが発生', parry > 0, `${parry}件/12戦`);
}

console.log(fail ? `\nFAIL x${fail}` : '\nALL GREEN');
process.exit(fail ? 1 : 0);
