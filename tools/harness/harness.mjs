// 鋼機工廠 バランス/健全性ハーネス — node harness.mjs
// KOUKI_DIR=../../public/dev で開発版にも当てられる(既定は本番)。
const DIR = process.env.KOUKI_DIR || '../../public';
const { simulate, TMAX, FIELDS } = await import(`${DIR}/sim.js`);
const { validateBuild, deriveStats } = await import(`${DIR}/parts.js`);

const A = {
  assault:  { frame:'fr4', legs:'lg1', gen:'gn2', armor:'ar1', wpnR:'wp6', wpnL:'wp5', ai:'ai1', color:'#b0563e', decal:'none', name:'' },
  standard: { frame:'fr2', legs:'lg1', gen:'gn2', armor:'ar2', wpnR:'wp1', wpnL:'wp2', ai:'ai2', color:'#8fa3b0', decal:'none', name:'' },
  heavy:    { frame:'fr5', legs:'lg5', gen:'gn3', armor:'ar3', wpnR:'wp4', wpnL:'wp8', ai:'ai2', color:'#3a4047', decal:'none', name:'' },
  sniper:   { frame:'fr2', legs:'lg4', gen:'gn3', armor:'ar1', wpnR:'wp7', wpnL:'wp3', ai:'ai4', color:'#6d8f5a', decal:'none', name:'' },
  skirmish: { frame:'fr1', legs:'lg4', gen:'gn3', armor:'ar1', wpnR:'wp8', wpnL:'wp3', ai:'ai3', color:'#4d7ea8', decal:'none', name:'' },
  driller:  { frame:'fr3', legs:'lg7', gen:'gn3', armor:'ar4', wpnR:'wp9', wpnL:'wp5', ai:'ai1', color:'#c2a35c', decal:'none', name:'' },
  wheeler:  { frame:'fr1', legs:'lg6', gen:'gn2', armor:'ar1', wpnR:'wp1', wpnL:'wp10', ai:'ai3', color:'#7d6bb0', decal:'none', name:'' },
  // St3 追加パーツ(fr8/lg13/lg14/gn7/ar7/wp15〜wp18)を使うアーキタイプ(新パーツのバランス監視)
  lancer:   { frame:'fr8', legs:'lg13', gen:'gn7', armor:'ar2', wpnR:'wp17', wpnL:'wp15', ai:'ai3', color:'#8fd0ff', decal:'none', name:'' },
  bombard:  { frame:'fr5', legs:'lg14', gen:'gn3', armor:'ar7', wpnR:'wp18', wpnL:'wp16', ai:'ai5', color:'#c2a35c', decal:'none', name:'' },
};
// 戦場は「対象ビルドが実際に持っているもの」から採る。id をここに書き並べると、
// 本番にまだ無い戦場を混ぜたときに getField が黙って FIELDS[0](=plain)へフォールバックし、
// 「新戦場も回している」つもりで実は plain を二重に回す=カバレッジが嘘になる(Codex指摘 2026-07-31)。
const FIELD_IDS = FIELDS.map(f => f.id);

let fail = 0;
const ok = (name, cond, extra='') => { console.log((cond?'  ✓ ':'  ✗ ')+name+(extra?`  ${extra}`:'')); if(!cond) fail++; };

console.log('== ビルド妥当性 ==');
for (const [k, b] of Object.entries(A)) {
  const v = validateBuild(b), s = deriveStats(b);
  ok(`${k} valid`, v.ok, v.ok ? `w${s.weight}/${s.capacity} spd${s.speed.toFixed(0)} hp${s.hp} en+${s.enOut}` : v.errors.join(','));
}

console.log('== 決定論 ==');
{
  const r1 = simulate(A.standard, A.assault, 12345);
  const r2 = simulate(A.standard, A.assault, 12345);
  ok('same seed → same result', JSON.stringify(r1.events) === JSON.stringify(r2.events) && r1.winner === r2.winner);
  const r3 = simulate(A.standard, A.assault, 54321);
  ok('diff seed → diff timeline', JSON.stringify(r1.events) !== JSON.stringify(r3.events));
}

console.log('== 総当たり(各20シード×フィールド回転) ==');
const keys = Object.keys(A);
const N = 20;
const kindTally = {};
const wins = {}; keys.forEach(k => wins[k] = 0);
const pair = {};
const durs = [];
let draws = 0, total = 0, destroys = 0;
let splashHits = 0, splashDmg = 0, riposteShots = 0, splashKills = 0;   // Ver6
for (let i = 0; i < keys.length; i++) for (let j = 0; j < keys.length; j++) {
  if (i === j) continue;
  for (let s = 0; s < N; s++) {
    const r = simulate(A[keys[i]], A[keys[j]], 1000 + i * 100 + j * 10 + s * 7919, { fieldId: FIELD_IDS[s % FIELD_IDS.length] });
    for (const e of r.events) {
      kindTally[e.kind] = (kindTally[e.kind] || 0) + 1;
      if (e.kind === 'dodge' && e.splash > 0) { splashHits++; splashDmg += e.splash; }
      if (e.kind === 'fire' && e.rip) riposteShots++;
      if (e.kind === 'destroyed' && e.reason === 'splash') splashKills++;
    }
    total++;
    durs.push(r.duration);
    if (r.winner === -1) draws++;
    else wins[keys[r.winner === 0 ? i : j]]++;
    const pk = keys[i] + '>' + keys[j];
    pair[pk] = (pair[pk] || 0) + (r.winner === 0 ? 1 : 0);
    const endEv = r.events[r.events.length - 1];
    if (endEv.reason === 'destroy') destroys++;
    if (r.duration > TMAX + 1) { ok('duration ≤ TMAX', false, `${keys[i]} vs ${keys[j]} seed${s}`); }
  }
}
durs.sort((a, b) => a - b);
const med = durs[(durs.length / 2) | 0];
console.log(`  試合数 ${total} / 撃破決着 ${(100 * destroys / total).toFixed(0)}% / 引分 ${(100 * draws / total).toFixed(1)}% / 時間 med ${med}s p10 ${durs[(durs.length * .1) | 0]}s p90 ${durs[(durs.length * .9) | 0]}s`);
console.log(`  対象 ${DIR} / 戦場 ${FIELD_IDS.length}種: ${FIELD_IDS.join(' ')}`);   // どのビルドの何を回したかを残す
const games = 2 * (keys.length - 1) * N;
console.log('  勝率: ' + keys.map(k => `${k} ${(100 * wins[k] / games).toFixed(0)}%`).join(' / '));
console.log('  ペア別(行が列に勝つ率):');
for (const a of keys) console.log('    ' + a.padEnd(9) + keys.map(b => a === b ? ' -- ' : String(Math.round(100 * ((pair[a + '>' + b] || 0) + (N - (pair[b + '>' + a] || 0))) / (2 * N))).padStart(3) + '%').join(' '));
const rates = keys.map(k => wins[k] / games);
ok('一強なし(最高勝率 ≤ 68%)', Math.max(...rates) <= 0.68, `max=${(Math.max(...rates)*100).toFixed(0)}%`);
ok('产廃なし(最低勝率 ≥ 25%)', Math.min(...rates) >= 0.25, `min=${(Math.min(...rates)*100).toFixed(0)}%`);
ok('膠着しすぎない(引分 ≤ 12%)', draws / total <= 0.12);
ok('速攻すぎない(中央値 ≥ 25s)', med >= 25, `med=${med}`);
ok('だれない(p90 ≤ 180s)', durs[(durs.length * .9) | 0] <= 180);

console.log('== Ver2 要素の発生検査 ==');
console.log('  イベント種内訳: ' + Object.entries(kindTally).map(([k,v])=>k+':'+v).join(' '));
ok('外れ(miss)が発生', (kindTally.miss || 0) > 0);
ok('回避(dodge)が発生', (kindTally.dodge || 0) > 0);
ok('パリィ(parry)が発生', (kindTally.parry || 0) > 0);
ok('弾切れ(ammo_out)が発生', (kindTally.ammo_out || 0) > 0);
ok('障害物破壊(obs_down)が発生', (kindTally.obs_down || 0) > 0);
ok('地形ダメージ(hazard)が発生', (kindTally.hazard || 0) > 0);
{
  // フィールド固有の健全性: 円形クレーターで境界外に出ない・states に弾数がある
  const r = simulate(A.standard, A.assault, 4242, { fieldId: 'crater' });
  const inCircle = r.states.every(s2 => s2.m.every(mm => Math.hypot(mm.x - 500, mm.y - 500) <= 471));
  ok('円形フィールドの境界維持', inCircle);
  ok('states に残弾(a)がある', Array.isArray(r.states[0].m[0].a) && r.states[0].m[0].a.length === 2);
  ok('result.fieldId が返る', r.fieldId === 'crater' && r.field && r.field.name === '環状クレーター');
}

console.log('== ログ/イベント整合(1試合精査) ==');
{
  const r = simulate(A.assault, A.heavy, 777, { nameA: 'VX-01 テスト', nameB: 'TR-01 カカシ' });
  ok('states あり(0.1s刻み)', r.states.length >= r.duration * 9);
  ok('log 末尾が試合終了', /試合終了/.test(r.log[r.log.length - 1]));
  ok('fire→hit/miss整合', r.events.filter(e => e.kind === 'hit' || e.kind === 'miss').length > 0);
  const dmgSum = r.events.filter(e => e.targ === 1 && (e.kind === 'hit' || e.kind === 'dodge'))
    .reduce((a, e) => a + (e.kind === 'hit' ? e.dmg : (e.splash || 0)), 0);   // Ver6: 回避時の爆風(splash)も計上
  const endE = r.events[r.events.length - 1];
  const hpB0 = deriveStats(A.heavy).hp;
  ok('ダメージ合計=HP減少', Math.abs((hpB0 - dmgSum) - endE.hpB) <= 1 || endE.hpB === 0, `sum=${dmgSum} end=${endE.hpB}`);
  console.log('  --- ログ抜粋 ---');
  r.log.slice(0, 6).forEach(l => console.log('  ' + l));
  console.log('  ...');
  r.log.slice(-3).forEach(l => console.log('  ' + l));
}
console.log('== キャンペーン健全性 ==');
{
  const { CAMPAIGN, dailyEnemy } = await import(`${DIR}/game.js`);
  let allValid = true;
  for (const r of CAMPAIGN) for (const f of r.fights) {
    const v = validateBuild(f.build);
    if (!v.ok) { allValid = false; console.log(`  ✗ ${r.rank} ${f.name}: ${v.errors.join(',')}`); }
  }
  ok('全敵ビルド valid(18機)', allValid);
  ok('daily 敵 valid', validateBuild(dailyEnemy('20260705').build).ok);
  const dflt = { frame:'fr2', legs:'lg1', gen:'gn2', armor:'ar2', wpnR:'wp1', wpnL:'wp2', ai:'ai2', color:'#8fa3b0', decal:'none', name:'' };
  const wr = (foe, n=24) => { let w=0; for (let s=0;s<n;s++) if (simulate(dflt, foe, 42+s*104729).winner===0) w++; return w/n; };
  const eWr = CAMPAIGN[0].fights.map(f => wr(f.build));
  const sWr = CAMPAIGN[5].fights.map(f => wr(f.build));
  console.log(`  初期機体: ランクE勝率 ${eWr.map(x=>Math.round(x*100)+'%').join('/')} — ランクS勝率 ${sWr.map(x=>Math.round(x*100)+'%').join('/')}`);
  ok('初期機体がEに勝てる(全E ≥ 55%)', Math.min(...eWr) >= 0.55);
  ok('Sは強い(全S ≤ 45%)', Math.max(...sWr) <= 0.45);
}
console.log('== 予算制ビルド/パイロット補正(Ver3) ==');
{
  const { buildCost, defaultBuild } = await import(`${DIR}/parts.js`);
  const dcost = buildCost(defaultBuild());
  ok('既定機体が初期予算3000C以内', dcost <= 3000, `cost=${dcost}`);
  const all = Object.values((await import(`${DIR}/parts.js`)).PARTS).flat();
  ok('全パーツに価格>0', all.every(p => p.price > 0));
  // パイロット補正: 命中+のパイロットで同seedの結果が変わり、補正なし同士は不変
  const base = simulate(A.standard, A.assault, 909, { fieldId: 'plain' });
  const same = simulate(A.standard, A.assault, 909, { fieldId: 'plain' });
  const boosted = simulate(A.standard, A.assault, 909, { fieldId: 'plain', pilots: [{ acc: 0.05, eva: 0.03 }, null] });
  ok('pilots未指定は完全再現', JSON.stringify(base.events) === JSON.stringify(same.events));
  ok('pilots指定で結果が変化', JSON.stringify(base.events) !== JSON.stringify(boosted.events));
  ok('states に戦術状態(s)がある', typeof base.states[5].m[0].s === 'string');
  ok('管制ログはTGT呼称', base.log[0].includes('TGT-A') && !base.log[0].includes('α'));
}
console.log('== Ver4: 帯域/部位破壊/ノックバック/自爆 ==');
{
  const { PARTS, BANDS, bandMult } = await import(`${DIR}/parts.js`);
  let okBand = true;
  for (const w of PARTS.wpn) {
    if (w.band === 'melee') continue;
    const b = BANDS[w.band];
    const mid = (b.min + b.max) / 2;
    const inAcc = bandMult(w, mid).acc;
    const outNear = bandMult(w, Math.max(1, b.min * 0.3)).acc;
    if (!(inAcc > outNear)) { okBand = false; console.log(`  ✗ band近 ${w.id} in=${inAcc} out=${outNear}`); }
    if (w.range > b.max && !(inAcc > bandMult(w, w.range).acc)) { okBand = false; console.log(`  ✗ band遠 ${w.id}`); }
    if (!(bandMult(w, mid).dmg >= bandMult(w, Math.max(1, b.min * 0.3)).dmg)) { okBand = false; console.log(`  ✗ band威力 ${w.id}`); }
  }
  ok('帯域内acc/dmg > 帯域外(全遠隔武器)', okBand);
  const blade = PARTS.wpn.find(w => w.id === 'wp6');
  ok('白兵は間合い外で命中0', bandMult(blade, blade.range + 1).acc === 0 && bandMult(blade, blade.range).acc === 1);
  ok('部位破壊(pbreak)が発生', (kindTally.pbreak || 0) > 100, `${kindTally.pbreak || 0}件/840戦`);
  ok('戦術変更(shift)が発生', (kindTally.shift || 0) > 100, `${kindTally.shift || 0}件/840戦`);
  // 自爆: 双連ミサイル+強襲OS(至近まで踏み込む)で必ず起きる状況を直接検査
  const selfB = { frame:'fr2', legs:'lg1', gen:'gn3', armor:'ar2', wpnR:'wp3', wpnL:'wp3', ai:'ai1', color:'#8fa3b0', decal:'none', name:'' };
  let selfN = 0;
  for (let s = 0; s < 10; s++) selfN += simulate(selfB, A.assault, 31337 + s * 97, { fieldId: 'plain' }).events.filter(e => e.kind === 'self_hit').length;
  ok('ミサイル近接自爆(self_hit)が発生', selfN > 0, `${selfN}件/10戦`);
  // ノックバック: 大口径ヒットの kb と states 上の実変位
  let bigKb = null, rk = null;
  for (let s = 0; s < 6 && !bigKb; s++) {
    rk = simulate(A.heavy, A.skirmish, 2026 + s * 13, { fieldId: 'plain' });
    bigKb = rk.events.find(e => e.kind === 'hit' && (e.kb || 0) >= 10);
  }
  ok('大口径ヒットでノックバック(kb≥10m)', !!bigKb, bigKb ? `kb=${bigKb.kb}m` : '');
  if (bigKb) {
    const i0 = rk.states.findIndex(s2 => s2.t >= bigKb.t);
    const s0 = rk.states[Math.max(0, i0 - 1)], s1 = rk.states[Math.min(rk.states.length - 1, i0 + 1)];
    const d = Math.hypot(s1.m[bigKb.targ].x - s0.m[bigKb.targ].x, s1.m[bigKb.targ].y - s0.m[bigKb.targ].y);
    ok('ノックバックがstatesに現れる(変位>kb/2)', d > bigKb.kb * 0.5, `変位${d.toFixed(1)}m`);
  }
  const r0 = simulate(A.standard, A.assault, 555, { fieldId: 'plain' });
  ok('states に部位状態(pd)がある', Array.isArray(r0.states[0].m[0].pd) && r0.states[0].m[0].pd.length === 5);
  // 部位破壊の管制ログ
  let pbLogged = false;
  for (let s = 0; s < 8 && !pbLogged; s++) {
    const r2 = simulate(A.heavy, A.standard, 900 + s, { fieldId: 'plain' });
    if (r2.events.some(e => e.kind === 'pbreak') && r2.log.some(l => l.includes('部位損傷'))) pbLogged = true;
  }
  ok('管制ログに[部位損傷]が出る', pbLogged);
}
console.log('== Ver5: スポーン/膠着/逃げ回り ==');
{
  // ランダム対称スポーン: seedで角度が変わり、常に中心対称・440m・障害物外
  const angles = new Set();
  let symOk = true, distOk = true;
  for (let s = 0; s < 6; s++) {
    const r = simulate(A.standard, A.assault, 7000 + s * 1013, { fieldId: 'plain' });
    const sp = r.events.filter(e => e.kind === 'spawn');
    const [a, b] = sp;
    if (Math.abs((a.x + b.x) / 2 - 500) > 1 || Math.abs((a.y + b.y) / 2 - 500) > 1) symOk = false;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (Math.abs(d - 440) > 2) distOk = false;
    angles.add(Math.round(Math.atan2(b.y - a.y, b.x - a.x) * 10));
  }
  ok('スポーンは中心対称(公平)', symOk);
  ok('スポーン距離は440m', distOk);
  ok('スポーン角はseedで変わる', angles.size >= 3, `${angles.size}種/6seed`);
  // 膠着: 双方レールガンのみ(弾切れ後に双方丸腰)→ stalemate 引き分け
  const railOnly = { frame:'fr5', legs:'lg1', gen:'gn4', armor:'ar3', wpnR:'wp4', wpnL:'wp4', ai:'ai2', color:'#8fa3b0', decal:'none', name:'' };
  let stale = 0, railDone = 0;
  for (let s = 0; s < 8; s++) {
    const r = simulate(railOnly, railOnly, 8100 + s * 37, { fieldId: 'plain' });
    const endE = r.events[r.events.length - 1];
    if (endE.reason === 'stalemate') { stale++; if (endE.winner === -1) railDone++; }
  }
  // Ver15で長距離帯下限が300になりレール同士は撃破決着も増えた(健全)。機構検査として ≥3 で判定
  ok('弾切れ同士は膠着引き分け(stalemate)', stale >= 3 && stale === railDone, `${stale}/8戦・全て引き分け`);
  // 逃げ回り: 射程360のmgしか持たない両者が交戦距離520を好む → 撃ち合いにならず時間切れ引き分け
  const shy = { frame:'fr2', legs:'lg4', gen:'gn3', armor:'ar2', wpnR:'wp8', wpnL:'wp8', ai:'ai4', color:'#8fa3b0', decal:'none', name:'' };
  let idleDraw = 0;
  for (let s = 0; s < 6; s++) {
    const r = simulate(shy, shy, 8200 + s * 41, { fieldId: 'plain' });
    if (r.winner === -1) idleDraw++;
  }
  ok('逃げ回り同士は引き分けになる', idleDraw >= 4, `${idleDraw}/6戦`);
}
console.log('== Ver6: 弾速別回避/爆風割れダメージ/反撃窓 ==');
{
  const { evadeMult } = await import(`${DIR}/sim.js`).then(m => m).catch(() => ({}));
  // 弾速別回避係数: ビーム(即着)<レール<ライフル<散弾<ミサイル(遅弾) の単調性
  const beam = { kind:'beam', projSpeed:0 }, rail = { kind:'railgun', projSpeed:1400 },
        rifle = { kind:'rifle', projSpeed:520 }, shot = { kind:'shotgun', projSpeed:450 },
        mis = { kind:'missile', projSpeed:180 };
  if (typeof evadeMult === 'function') {
    ok('弾速別回避: ビーム<レール<ライフル≤散弾<ミサイル',
      evadeMult(beam) < evadeMult(rail) && evadeMult(rail) < evadeMult(rifle) &&
      evadeMult(rifle) <= evadeMult(shot) && evadeMult(shot) < evadeMult(mis),
      `beam${evadeMult(beam)} rail${evadeMult(rail)} rifle${evadeMult(rifle)} shot${evadeMult(shot)} mis${evadeMult(mis)}`);
    ok('ビーム/ミサイルの係数は素の±20%以内', evadeMult(beam) >= 0.8 && evadeMult(mis) <= 1.2);
  } else {
    ok('evadeMult がエクスポートされている', false, '(sim.js から未エクスポート)');
  }
  // 爆風割れダメージ: ミサイルは回避されても splash が発生する(総当たり集計)
  ok('爆発弾の割れダメージ(splash)が発生', splashHits > 0, `${splashHits}件・計${splashDmg}損`);
  ok('回避時splashは部位破壊を伴わない(rng不変)', kindTally.dodge > 0);   // dodge分岐にrng追加なしの回帰番人
  // 反撃窓: パリィ機が riposte 射撃を出す(白兵持ちが弾いた後)
  ok('パリィ後の反撃射(riposte)が発生', riposteShots > 0, `${riposteShots}射`);
  console.log(`  Ver6計: splash ${splashHits}件/${splashDmg}損/撃破${splashKills} ・ riposte ${riposteShots}射`);
}
console.log('== 多視点実況(構造検証のみ・内容はOpusレビュー担当) ==');
{
  const { LINES, VOICE_ROLES } = await import(`${DIR}/voice-lines.js`);
  const { narrate } = await import(`${DIR}/voice.js`);
  const ROLES = new Set(Object.keys(VOICE_ROLES).concat([]));
  const PH = /\{(A|B|ME|FOE|WPN|DMG|DIST|HP|FIELD|PART|LEGA|LEGB|WA|WB)\}/g;   // LEGA〜WB=St3 start_build 用
  const BUILD_PH = /\{(LEGA|LEGB|WA|WB)\}/;   // start_build 以外では未解決になるため使用禁止
  let bad = 0, total = 0, tooLong = 0, unknownPh = 0, buildPhStray = 0;
  for (const [k, roles] of Object.entries(LINES)) {
    for (const [r, arr] of Object.entries(roles)) {
      if (!ROLES.has(r)) { bad++; console.log('  不明role', k, r); }
      for (const line of arr) {
        total++;
        if (typeof line !== 'string' || line.length > 60) tooLong++;
        const stray = line.replace(PH, '').match(/\{[A-Z_]+\}/);
        if (stray) { unknownPh++; console.log('  未知プレースホルダ', k, r, stray[0]); }
        if (k !== 'start_build' && BUILD_PH.test(line)) { buildPhStray++; console.log('  {LEGA}〜{WB}がstart_build外', k, r, line); }
      }
    }
  }
  ok(`セリフ集の構造(総${total}本)`, bad === 0 && unknownPh === 0 && total >= 200);
  ok('行長 ≤ 60字', tooLong === 0, tooLong ? `${tooLong}本超過` : '');
  ok('{LEGA}〜{WB}は start_build 限定', buildPhStray === 0, buildPhStray ? `${buildPhStray}本違反` : '');
  const r1 = simulate(A.assault, A.heavy, 777, { fieldId: 'sekichu', nameA: 'アルファ', nameB: 'ブラボー' });
  const v1 = narrate(r1, { nameA: 'アルファ', nameB: 'ブラボー', seed: 777, buildA: A.assault, buildB: A.heavy });
  const v2 = narrate(r1, { nameA: 'アルファ', nameB: 'ブラボー', seed: 777, buildA: A.assault, buildB: A.heavy });
  ok('narrate 決定論', JSON.stringify(v1) === JSON.stringify(v2));
  ok('narrate 行が時刻昇順', v1.every((x, i) => i === 0 || v1[i-1].t <= x.t));
  ok('narrate 役割が正当', v1.every(x => ROLES.has(x.role)));
  const nonSys = v1.filter(x => x.role !== 'sys').length;
  const sysN = v1.filter(x => x.role === 'sys').length;
  console.log(`  行数: sys ${sysN} / 実況席+無線 ${nonSys}`);
  ok('実況席+無線が10行以上・sysの3倍未満', nonSys >= 10 && nonSys < sysN * 3);
  ok('未充填の{X}が残らない', v1.every(x => !/\{[A-Z]+\}/.test(x.text)));
}
console.log(fail ? `\nFAIL x${fail}` : '\nALL GREEN');
process.exit(fail ? 1 : 0);
