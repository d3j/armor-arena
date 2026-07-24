// 鋼機工廠 — パーツデータベース(pure ESM・DOM非依存)
// 数値はハーネス(promo/2026-07-05-kouki/_work/harness.mjs)で実測校正する。

export const PARTS = {
  frame: [
    // 並びは価格順(表示用)。id は追記専用(リプレイ互換の掟1)— 番号は歴史順で欠番も再利用しない。
    { id:'fr7', name:'ススキ薄殻', desc:'紙一枚の軽さ。当てさせない者の殻。', hp:530, capacity:720, weight:95, price:300,   tier:0 },
    { id:'fr1', name:'ハヤテ軽装殻', desc:'軽く、薄い。速さで生きる者の殻。', hp:550, capacity:800, weight:120, price:400,    tier:0 },
    { id:'fr2', name:'ツルギ中装殻', desc:'攻守の均衡。工廠の基準機。',       hp:640, capacity:1000, weight:180, price:600,   tier:0 },
    { id:'fr6', name:'クロガネ厚殻', desc:'安い鉄を厚く重ねた。値段の分は止める。', hp:750, capacity:1150, weight:250, price:750, tier:0 },
    { id:'fr4', name:'カゲロウ襲撃殻', desc:'骨を削って積載を残した奇襲仕様。', hp:560, capacity:900, weight:130, price:1100,  tier:1 },
    { id:'fr3', name:'ヨロイ重装殻', desc:'鈍いが沈まない。壁になる殻。',     hp:920, capacity:1280, weight:260, price:1400,  tier:1 },
    { id:'fr5', name:'タイシャク旗甲殻', desc:'旗機のための過剰な体躯。',      hp:980, capacity:1550, weight:340, price:3200, tier:2 },
  ],
  legs: [
    // speed は m/s(全高4.2m級のローラーダッシュ相当。最高約150km/h)
    { id:'lg1', name:'二脚・疾風', desc:'標準二脚の快速型。',           kind:'biped', speed:31, turn:2.6, evasion:0.32, drain:3.0, aimBonus:0,    weight:140, price:350,    tier:0 },
    { id:'lg2', name:'二脚・堅牢', desc:'重量に耐える戦列二脚。',       kind:'biped', speed:24, turn:2.2, evasion:0.22, drain:2.5, aimBonus:0.02, weight:190, price:380,    tier:0 },
    { id:'lg11', name:'車輪・風車', desc:'廉価輪でも平地は速い。泥は死地。', kind:'wheel', speed:35, turn:1.8, evasion:0.28, drain:3.4, aimBonus:0,   weight:135, price:420, tier:0 },
    { id:'lg8', name:'四脚・子鹿', desc:'安くても四つ足は揺れない。',   kind:'quad',  speed:23, turn:1.9, evasion:0.15, drain:3.2, aimBonus:0.05, weight:210, price:450, tier:0 },
    { id:'lg12', name:'逆関節・雛', desc:'跳ね方は親譲り。まだ高くは跳べない。', kind:'reverse', speed:27, turn:2.7, evasion:0.34, drain:3.8, aimBonus:0, weight:155, price:480, tier:0 },
    { id:'lg9', name:'履帯・亀甲', desc:'遅いが燃費よく、狙いは正直。', kind:'tank',  speed:15, turn:1.0, evasion:0.07, drain:1.4, aimBonus:0.05, weight:240, price:520, tier:0 },
    { id:'lg10', name:'ホバー・木の葉', desc:'泥も棘も知らぬ浮遊。炉をよく食う。', kind:'hover', speed:34, turn:1.4, evasion:0.29, drain:5.2, aimBonus:0, weight:150, price:560, tier:0 },
    { id:'lg3', name:'四脚・守宮', desc:'低い重心。狙いがぶれない。',   kind:'quad',  speed:26, turn:2.0, evasion:0.18, drain:3.5, aimBonus:0.07, weight:230, price:900,  tier:1 },
    { id:'lg4', name:'ホバー・浮舟', desc:'地を捨てた者だけが出せる速度。', kind:'hover', speed:38, turn:1.6, evasion:0.34, drain:6.0, aimBonus:0,    weight:160, price:1200,  tier:1 },
    { id:'lg6', name:'車輪・疾駆', desc:'舗装の上なら誰より速い。泥は苦手。', kind:'wheel', speed:41, turn:2.2, evasion:0.34, drain:3.5, aimBonus:0,    weight:150, price:1300,  tier:1 },
    { id:'lg7', name:'逆関節・跳兵', desc:'鳥の脚。よく跳ね、よく躱す。',   kind:'reverse', speed:34, turn:2.8, evasion:0.37, drain:4.0, aimBonus:0,  weight:170, price:1500, tier:1 },
    { id:'lg5', name:'履帯・城塞', desc:'動く砲座。退かず、揺れず。',   kind:'tank',  speed:18, turn:1.2, evasion:0.10, drain:1.5, aimBonus:0.06, weight:280, price:2200, tier:2 },
  ],
  gen: [
    { id:'gn1', name:'燐光炉', desc:'小さく確実な火。',       output:14, cap:120, weight:90,  price:250,    tier:0 },
    { id:'gn5', name:'蓄圧炉', desc:'細く溜めて、太く放つ。', output:13, cap:210, weight:105, price:320,   tier:0 },
    { id:'gn2', name:'標準炉', desc:'工廠の心臓、量産型。',   output:20, cap:160, weight:130, price:400,    tier:0 },
    { id:'gn6', name:'軽量炉', desc:'羽のように軽く、値は張る。', output:19, cap:140, weight:85, price:500, tier:0 },
    { id:'gn3', name:'大出力炉', desc:'撃ち続けるための火力炉。', output:28, cap:220, weight:200, price:1000, tier:1 },
    { id:'gn4', name:'臨界炉', desc:'常に沸点。扱いは自己責任。', output:38, cap:300, weight:290, price:2400, tier:2 },
  ],
  armor: [
    { id:'ar1', name:'軽合金装甲', desc:'無いよりはまし、が速い。', defense:0.10, evaPenalty:0.02, weight:60,  price:200,   tier:0 },
    { id:'ar6', name:'鋳鉄装甲', desc:'安く、重く、それなりに硬い。', defense:0.17, evaPenalty:0.10, weight:190, price:260, tier:0 },
    { id:'ar5', name:'繊維装甲', desc:'編んだ繊維が受け流す。軽さは守り。', defense:0.16, evaPenalty:0.03, weight:85, price:280, tier:0 },
    { id:'ar2', name:'標準複合装甲', desc:'均整のとれた守り。',     defense:0.22, evaPenalty:0.06, weight:130, price:350,   tier:0 },
    { id:'ar3', name:'重層装甲', desc:'受けて立つための鉄壁。',     defense:0.26, evaPenalty:0.12, weight:220, price:1100, tier:1 },
    { id:'ar4', name:'反応装甲', desc:'着弾の瞬間だけ硬くなる。',   defense:0.28, evaPenalty:0.07, weight:170, price:1400, tier:1 },
  ],
  wpn: [
    // band: 適正帯(melee=白兵0-15m / short=15-120m / mid=120-350m / long=300-900m)。
    // 帯域外でも range までは撃てるが命中・威力が落ちる(bandMult)。白兵武器は range=間合いの外は当たらない。
    // breakPower: 命中1発ごとの部位破壊率。arm: ミサイルのアーミング距離(未満で発射=自爆スプラッシュ)。
    { id:'wp1', name:'突撃ライフル', desc:'三点射の基本兵装。中距離の主役。', kind:'rifle',   band:'mid',   dmg:14, range:480, acc:0.58, cooldown:1.4, encost:5,  projSpeed:520,  burst:3, ammo:135, breakPower:0.04, weight:90,  price:300,    tier:0 },
    { id:'wp2', name:'中距離ビーム', desc:'まっすぐ届く光条。',        kind:'beam',    band:'mid',   dmg:36, range:520, acc:0.62, cooldown:2.2, encost:16, projSpeed:0,    burst:1, breakPower:0.05, weight:120, price:450,    tier:0 },
    { id:'wp5', name:'零距離散弾', desc:'懐に入れば嵐。短距離の王。',   kind:'shotgun', band:'short', dmg:8,  range:190, acc:0.75, cooldown:1.8, encost:6,  projSpeed:450,  burst:6, ammo:96, breakPower:0.022, weight:110, price:320,    tier:0 },
    { id:'wp14', name:'溶断バーナー', desc:'装甲を裂く近い光。弾は要らない。', kind:'beam', band:'short', pierce:0.35, dmg:40, range:160, acc:0.70, cooldown:1.6, encost:9, projSpeed:0, burst:1, breakPower:0.05, weight:95, price:420, tier:0 },
    { id:'wp11', name:'作業用重刃', desc:'工廠の解体刃。戦でも鉄は斬れる。', kind:'blade', band:'melee', dmg:96, range:10, acc:0.76, cooldown:1.9, encost:13, projSpeed:0, burst:1, breakPower:0.09, weight:75, price:480, tier:0 },
    { id:'wp12', name:'小型ミサイル', desc:'小さな弧を二つ。遠くへの挨拶。', kind:'missile', band:'long', arm:150, dmg:52, range:620, acc:0.56, cooldown:4.2, encost:7, projSpeed:175, burst:2, ammo:20, breakPower:0.07, weight:105, price:500, tier:0 },
    { id:'wp13', name:'長銃身ライフル', desc:'一発ずつ、遠くから。狙撃の入口。', kind:'rifle', band:'long', dmg:40, range:640, acc:0.55, cooldown:2.5, encost:6, projSpeed:850, burst:1, ammo:40, breakPower:0.05, weight:125, price:550, tier:0 },
    { id:'wp8', name:'速射機関砲', desc:'軽く、うるさく、途切れない。', kind:'rifle',   band:'mid',   dmg:8,  range:360, acc:0.62, cooldown:0.55, encost:2,  projSpeed:600,  burst:2, ammo:180, breakPower:0.02, weight:100, price:600,  tier:1 },
    { id:'wp3', name:'ミサイルポッド', desc:'弧を描く双発弾。近すぎる発射は己も焼く。', kind:'missile', band:'long', arm:170, dmg:60, range:700, acc:0.56, cooldown:4.2, encost:10, projSpeed:180,  burst:2, ammo:16, breakPower:0.12, weight:150, price:900,  tier:1 },
    { id:'wp6', name:'光刃', desc:'間合い十一。それより内は光の間合い。', kind:'blade',  band:'melee', dmg:112, range:11,  acc:0.80, cooldown:2.0, encost:18, projSpeed:0,    burst:1, breakPower:0.13, weight:80,  price:1000,  tier:1 },
    { id:'wp4', name:'レールガン', desc:'音より速い一撃。外せば隙。',   kind:'railgun', band:'long',  dmg:88, range:780, acc:0.50, cooldown:5.5, encost:30, projSpeed:1400, burst:1, ammo:16, breakPower:0.18, weight:260, price:2000, tier:2 },
    { id:'wp7', name:'狙撃ビーム', desc:'地平の向こうから終わらせる。', kind:'beam',    band:'long',  dmg:70, range:880, acc:0.52, cooldown:4.8, encost:26, projSpeed:0,    burst:1, breakPower:0.09, weight:210, price:2600, tier:2 },
    { id:'wp9', name:'ドリルアーム', desc:'回して穿つ。装甲は意味を失う。', kind:'drill',  band:'melee', pierce:0.4, dmg:128, range:9,  acc:0.74, cooldown:3.0, encost:20, projSpeed:0,   burst:1, breakPower:0.15, weight:140, price:1300,  tier:1 },
    { id:'wp10', name:'ロケットパンチ', desc:'拳は飛んで、帰ってくる。',   kind:'rocketpunch', band:'short', dmg:92, range:240, acc:0.62, cooldown:3.4, encost:14, projSpeed:220, burst:1, breakPower:0.11, weight:130, price:1800, tier:2 },
  ],
  ai: [
    { id:'ai1', name:'強襲OS「オオカミ」', desc:'間合いを潰して食らいつく。', engage:8,  aggression:1.0, kite:false, weight:0, price:150,    tier:0 },
    { id:'ai2', name:'射撃OS「ヤマドリ」', desc:'中距離の撃ち合いを制す。',   engage:235, aggression:0.60, kite:false, weight:0, price:200,    tier:0 },
    { id:'ai5', name:'遠戦OS「サギ」', desc:'間合いの外から、詰めさせない。', engage:560, aggression:0.50, kite:true, weight:0, price:380,  tier:0 },
    { id:'ai6', name:'遊撃OS「ノラ」', desc:'我流の一撃離脱。深追いが玉に瑕。', engage:70, aggression:0.70, kite:true, weight:0, price:400,  tier:0 },
    { id:'ai3', name:'遊撃OS「ツバメ」', desc:'離れ、回り、また刺す。',       engage:200, aggression:0.55, kite:true,  weight:0, price:700,  tier:1 },
    { id:'ai4', name:'狙撃OS「フクロウ」', desc:'遠くで待つ。獲物は来る。',   engage:520, aggression:0.40, kite:true,  weight:0, price:1600, tier:2 },
  ],
};

// ---- Ver4: 戦闘距離の帯域(世界観: 全高4.2m級の鋼機) ----
export const BANDS = {
  melee: { min: 0,   max: 15,  label: '白兵' },
  short: { min: 15,  max: 120, label: '短距離' },
  mid:   { min: 120, max: 350, label: '中距離' },
  long:  { min: 300, max: 900, label: '遠距離' },
};

// 帯域内=素の性能(帯の奥55%からは緩やかに減衰)。帯域外は外れ具合 f(0..1) に応じて
// 命中×(1-0.65f)・威力×(1-0.5f)。白兵武器は間合い(range)の外では当たらない。
export function bandMult(w, dist) {
  const b = BANDS[w.band] || BANDS.mid;
  if (w.band === 'melee') return dist <= w.range ? { acc: 1, dmg: 1 } : { acc: 0, dmg: 0 };
  let acc = 1, dmg = 1;
  if (dist < b.min) {
    const f = Math.min(1, (b.min - dist) / b.min);
    acc = 1 - 0.65 * f; dmg = 1 - 0.5 * f;
  } else if (dist > b.max) {
    const f = Math.min(1, (dist - b.max) / Math.max(1, w.range - b.max));
    acc = 1 - 0.65 * f; dmg = 1 - 0.5 * f;
  } else {
    const soft = b.min + 0.55 * (b.max - b.min);
    if (dist > soft) acc = 1 - 0.25 * (dist - soft) / (b.max - soft);
  }
  return { acc, dmg };
}

export const COSMETICS = {
  colors: [
    { id:'c-ash',   name:'工廠グレイ',   hex:'#8fa3b0', price:0 },
    { id:'c-navy',  name:'蒼鉄',         hex:'#4d7ea8', price:0 },
    { id:'c-oxide', name:'酸化鉄',       hex:'#b0563e', price:200 },
    { id:'c-moss',  name:'苔緑',         hex:'#6d8f5a', price:200 },
    { id:'c-sand',  name:'砂漠迷彩黄',   hex:'#c2a35c', price:300 },
    { id:'c-viole', name:'宵紫',         hex:'#7d6bb0', price:300 },
    { id:'c-snow',  name:'極地白',       hex:'#d8dee4', price:500 },
    { id:'c-noir',  name:'夜鉄',         hex:'#3a4047', price:500 },
  ],
  // 支援工廠パス限定(モック・非P2W: 性能に一切影響しない)
  passColors: [
    { id:'p-gold',  name:'鍍金',   hex:'#d4af37' },
    { id:'p-cherry',name:'緋桜',   hex:'#e8657f' },
  ],
};

export function getPart(cat, id) {
  const arr = PARTS[cat]; if (!arr) return null;
  for (const p of arr) if (p.id === id) return p;
  return null;
}

export function defaultBuild() {
  return { frame:'fr2', legs:'lg1', gen:'gn2', armor:'ar2', wpnR:'wp1', wpnL:'wp2', ai:'ai2',
           color:'#8fa3b0', decal:'none', name:'' };
}

// 派生ステータス(UI表示とシムが共用する唯一の真実)
export function deriveStats(build) {
  const errors = [];
  const fr = getPart('frame', build.frame), lg = getPart('legs', build.legs),
        gn = getPart('gen', build.gen), ar = getPart('armor', build.armor),
        wr = getPart('wpn', build.wpnR), wl = getPart('wpn', build.wpnL),
        ai = getPart('ai', build.ai);
  if (!fr || !lg || !gn || !ar || !wr || !wl || !ai) {
    errors.push('存在しないパーツが指定されています');
    return { valid:false, errors };
  }
  const weight = fr.weight + lg.weight + gn.weight + ar.weight + wr.weight + wl.weight;
  const load = weight / fr.capacity;                    // 0..1(+超過)
  if (load > 1) errors.push(`重量超過 ${weight}/${fr.capacity}`);
  const wf = Math.max(0.7, 1.06 - 0.28 * load);         // 積載係数(速度に効く)
  const speed = lg.speed * wf;
  const evasion = Math.max(0, lg.evasion * wf - ar.evaPenalty);
  const enOut = gn.output - lg.drain;
  if (enOut <= 2) errors.push('EN出力不足(動力炉を強化するか脚部を見直す)');
  const cost = fr.price + lg.price + gn.price + ar.price + wr.price + wl.price + ai.price;
  return {
    valid: errors.length === 0, errors,
    hp: fr.hp, speed, turn: lg.turn, evasion, defense: ar.defense,
    aimBonus: lg.aimBonus, enOut, enCap: gn.cap, weight, capacity: fr.capacity, load, cost,
    parts: { fr, lg, gn, ar, wr, wl, ai },
  };
}

// 機体総額(予算制ビルド: 所持金が調達上限。敵機・闘技場相手は対象外のメタ制約)
export function buildCost(build) {
  const s = deriveStats(build);
  return s.valid || s.cost != null ? (s.cost || 0) : 0;
}

export function validateBuild(build) {
  if (!build || typeof build !== 'object') return { ok:false, errors:['build がありません'] };
  const s = deriveStats(build);
  return { ok: s.valid, errors: s.errors };
}

// 受け取った build をホワイトリストで再構築する(余剰プロパティ=自由入力の持込みを遮断)。
// サーバ(worker)は保存前に必ずこれを通す。keepName は本人専用領域(garage)のみ true。
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
export function sanitizeBuild(build, opts = {}) {
  if (!build || typeof build !== 'object') return null;
  const out = {
    frame: String(build.frame || ''), legs: String(build.legs || ''), gen: String(build.gen || ''),
    armor: String(build.armor || ''), wpnR: String(build.wpnR || ''), wpnL: String(build.wpnL || ''),
    ai: String(build.ai || ''),
    color: HEX_RE.test(String(build.color || '')) ? String(build.color) : '#8fa3b0',
    decal: 'none',
  };
  if (opts.keepName) out.name = String(build.name || '').slice(0, 24);
  return out;
}

// 公開用の識別コードを手続き生成(自由入力は公開面に出さない=CGM回避)。決定論。
const CODE_PRE = ['VX','TR','KG','RX','MK','SD','GH','LN','ZP','AQ'];
const CODE_NAME = ['ハヤブサ','ヴァナルガンド','シラヌイ','ムラクモ','ノコギリ','ヤタガラス','フブキ','オボロ',
  'カブト','イカヅチ','ツチグモ','ミカヅキ','サザンカ','クロガネ','アマツバメ','ヒトダマ',
  'ヤマアラシ','シデン','タチカゼ','モズ','ワダツミ','ホムラ','キリサメ','ウブスナ'];
export function codename(seedStr) {
  let h = 2166136261 >>> 0;
  const s = String(seedStr);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const pre = CODE_PRE[h % CODE_PRE.length];
  const num = String((h >>> 4) % 100).padStart(2, '0');
  const nm = CODE_NAME[(h >>> 11) % CODE_NAME.length];
  return `${pre}-${num} ${nm}`;
}
