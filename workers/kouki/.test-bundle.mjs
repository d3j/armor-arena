// ../../public/kouki/parts.js
var PARTS = {
  frame: [
    { id: "fr1", name: "\u30CF\u30E4\u30C6\u8EFD\u88C5\u6BBB", desc: "\u8EFD\u304F\u3001\u8584\u3044\u3002\u901F\u3055\u3067\u751F\u304D\u308B\u8005\u306E\u6BBB\u3002", hp: 550, capacity: 800, weight: 120, price: 400, tier: 0 },
    { id: "fr2", name: "\u30C4\u30EB\u30AE\u4E2D\u88C5\u6BBB", desc: "\u653B\u5B88\u306E\u5747\u8861\u3002\u5DE5\u5EE0\u306E\u57FA\u6E96\u6A5F\u3002", hp: 640, capacity: 1e3, weight: 180, price: 600, tier: 0 },
    { id: "fr3", name: "\u30E8\u30ED\u30A4\u91CD\u88C5\u6BBB", desc: "\u920D\u3044\u304C\u6C88\u307E\u306A\u3044\u3002\u58C1\u306B\u306A\u308B\u6BBB\u3002", hp: 920, capacity: 1280, weight: 260, price: 1400, tier: 1 },
    { id: "fr4", name: "\u30AB\u30B2\u30ED\u30A6\u8972\u6483\u6BBB", desc: "\u9AA8\u3092\u524A\u3063\u3066\u7A4D\u8F09\u3092\u6B8B\u3057\u305F\u5947\u8972\u4ED5\u69D8\u3002", hp: 560, capacity: 900, weight: 130, price: 1100, tier: 1 },
    { id: "fr5", name: "\u30BF\u30A4\u30B7\u30E3\u30AF\u65D7\u7532\u6BBB", desc: "\u65D7\u6A5F\u306E\u305F\u3081\u306E\u904E\u5270\u306A\u4F53\u8EAF\u3002", hp: 980, capacity: 1550, weight: 340, price: 3200, tier: 2 }
  ],
  legs: [
    // speed は m/s(全高4.2m級のローラーダッシュ相当。最高約150km/h)
    { id: "lg1", name: "\u4E8C\u811A\u30FB\u75BE\u98A8", desc: "\u6A19\u6E96\u4E8C\u811A\u306E\u5FEB\u901F\u578B\u3002", kind: "biped", speed: 31, turn: 2.6, evasion: 0.32, drain: 3, aimBonus: 0, weight: 140, price: 350, tier: 0 },
    { id: "lg2", name: "\u4E8C\u811A\u30FB\u5805\u7262", desc: "\u91CD\u91CF\u306B\u8010\u3048\u308B\u6226\u5217\u4E8C\u811A\u3002", kind: "biped", speed: 24, turn: 2.2, evasion: 0.22, drain: 2.5, aimBonus: 0.02, weight: 190, price: 380, tier: 0 },
    { id: "lg3", name: "\u56DB\u811A\u30FB\u5B88\u5BAE", desc: "\u4F4E\u3044\u91CD\u5FC3\u3002\u72D9\u3044\u304C\u3076\u308C\u306A\u3044\u3002", kind: "quad", speed: 26, turn: 2, evasion: 0.18, drain: 3.5, aimBonus: 0.07, weight: 230, price: 900, tier: 1 },
    { id: "lg4", name: "\u30DB\u30D0\u30FC\u30FB\u6D6E\u821F", desc: "\u5730\u3092\u6368\u3066\u305F\u8005\u3060\u3051\u304C\u51FA\u305B\u308B\u901F\u5EA6\u3002", kind: "hover", speed: 38, turn: 1.6, evasion: 0.34, drain: 6, aimBonus: 0, weight: 160, price: 1200, tier: 1 },
    { id: "lg5", name: "\u5C65\u5E2F\u30FB\u57CE\u585E", desc: "\u52D5\u304F\u7832\u5EA7\u3002\u9000\u304B\u305A\u3001\u63FA\u308C\u305A\u3002", kind: "tank", speed: 18, turn: 1.2, evasion: 0.1, drain: 1.5, aimBonus: 0.06, weight: 280, price: 2200, tier: 2 },
    { id: "lg6", name: "\u8ECA\u8F2A\u30FB\u75BE\u99C6", desc: "\u8217\u88C5\u306E\u4E0A\u306A\u3089\u8AB0\u3088\u308A\u901F\u3044\u3002\u6CE5\u306F\u82E6\u624B\u3002", kind: "wheel", speed: 41, turn: 2.2, evasion: 0.34, drain: 3.5, aimBonus: 0, weight: 150, price: 1300, tier: 1 },
    { id: "lg7", name: "\u9006\u95A2\u7BC0\u30FB\u8DF3\u5175", desc: "\u9CE5\u306E\u811A\u3002\u3088\u304F\u8DF3\u306D\u3001\u3088\u304F\u8EB1\u3059\u3002", kind: "reverse", speed: 34, turn: 2.8, evasion: 0.37, drain: 4, aimBonus: 0, weight: 170, price: 1500, tier: 1 }
  ],
  gen: [
    { id: "gn1", name: "\u71D0\u5149\u7089", desc: "\u5C0F\u3055\u304F\u78BA\u5B9F\u306A\u706B\u3002", output: 14, cap: 120, weight: 90, price: 250, tier: 0 },
    { id: "gn2", name: "\u6A19\u6E96\u7089", desc: "\u5DE5\u5EE0\u306E\u5FC3\u81D3\u3001\u91CF\u7523\u578B\u3002", output: 20, cap: 160, weight: 130, price: 400, tier: 0 },
    { id: "gn3", name: "\u5927\u51FA\u529B\u7089", desc: "\u6483\u3061\u7D9A\u3051\u308B\u305F\u3081\u306E\u706B\u529B\u7089\u3002", output: 28, cap: 220, weight: 200, price: 1e3, tier: 1 },
    { id: "gn4", name: "\u81E8\u754C\u7089", desc: "\u5E38\u306B\u6CB8\u70B9\u3002\u6271\u3044\u306F\u81EA\u5DF1\u8CAC\u4EFB\u3002", output: 38, cap: 300, weight: 290, price: 2400, tier: 2 }
  ],
  armor: [
    { id: "ar1", name: "\u8EFD\u5408\u91D1\u88C5\u7532", desc: "\u7121\u3044\u3088\u308A\u306F\u307E\u3057\u3001\u304C\u901F\u3044\u3002", defense: 0.1, evaPenalty: 0.02, weight: 60, price: 200, tier: 0 },
    { id: "ar2", name: "\u6A19\u6E96\u8907\u5408\u88C5\u7532", desc: "\u5747\u6574\u306E\u3068\u308C\u305F\u5B88\u308A\u3002", defense: 0.22, evaPenalty: 0.06, weight: 130, price: 350, tier: 0 },
    { id: "ar3", name: "\u91CD\u5C64\u88C5\u7532", desc: "\u53D7\u3051\u3066\u7ACB\u3064\u305F\u3081\u306E\u9244\u58C1\u3002", defense: 0.26, evaPenalty: 0.12, weight: 220, price: 1100, tier: 1 },
    { id: "ar4", name: "\u53CD\u5FDC\u88C5\u7532", desc: "\u7740\u5F3E\u306E\u77AC\u9593\u3060\u3051\u786C\u304F\u306A\u308B\u3002", defense: 0.28, evaPenalty: 0.07, weight: 170, price: 1400, tier: 1 }
  ],
  wpn: [
    // band: 適正帯(melee=白兵0-15m / short=15-120m / mid=120-350m / long=350-900m)。
    // 帯域外でも range までは撃てるが命中・威力が落ちる(bandMult)。白兵武器は range=間合いの外は当たらない。
    // breakPower: 命中1発ごとの部位破壊率。arm: ミサイルのアーミング距離(未満で発射=自爆スプラッシュ)。
    { id: "wp1", name: "\u7A81\u6483\u30E9\u30A4\u30D5\u30EB", desc: "\u4E09\u70B9\u5C04\u306E\u57FA\u672C\u5175\u88C5\u3002\u4E2D\u8DDD\u96E2\u306E\u4E3B\u5F79\u3002", kind: "rifle", band: "mid", dmg: 14, range: 480, acc: 0.58, cooldown: 1.4, encost: 5, projSpeed: 520, burst: 3, ammo: 135, breakPower: 0.04, weight: 90, price: 300, tier: 0 },
    { id: "wp2", name: "\u4E2D\u8DDD\u96E2\u30D3\u30FC\u30E0", desc: "\u307E\u3063\u3059\u3050\u5C4A\u304F\u5149\u6761\u3002", kind: "beam", band: "mid", dmg: 38, range: 520, acc: 0.62, cooldown: 2.2, encost: 16, projSpeed: 0, burst: 1, breakPower: 0.05, weight: 120, price: 450, tier: 0 },
    { id: "wp5", name: "\u96F6\u8DDD\u96E2\u6563\u5F3E", desc: "\u61D0\u306B\u5165\u308C\u3070\u5D50\u3002\u77ED\u8DDD\u96E2\u306E\u738B\u3002", kind: "shotgun", band: "short", dmg: 8, range: 190, acc: 0.75, cooldown: 1.8, encost: 6, projSpeed: 450, burst: 6, ammo: 96, breakPower: 0.022, weight: 110, price: 320, tier: 0 },
    { id: "wp8", name: "\u901F\u5C04\u6A5F\u95A2\u7832", desc: "\u8EFD\u304F\u3001\u3046\u308B\u3055\u304F\u3001\u9014\u5207\u308C\u306A\u3044\u3002", kind: "rifle", band: "mid", dmg: 8, range: 360, acc: 0.62, cooldown: 0.55, encost: 2, projSpeed: 600, burst: 2, ammo: 180, breakPower: 0.02, weight: 100, price: 600, tier: 1 },
    { id: "wp3", name: "\u30DF\u30B5\u30A4\u30EB\u30DD\u30C3\u30C9", desc: "\u5F27\u3092\u63CF\u304F\u53CC\u767A\u5F3E\u3002\u8FD1\u3059\u304E\u308B\u767A\u5C04\u306F\u5DF1\u3082\u713C\u304F\u3002", kind: "missile", band: "long", arm: 170, dmg: 60, range: 700, acc: 0.56, cooldown: 4.2, encost: 10, projSpeed: 180, burst: 2, ammo: 16, breakPower: 0.12, weight: 150, price: 900, tier: 1 },
    { id: "wp6", name: "\u5149\u5203", desc: "\u9593\u5408\u3044\u5341\u4E00\u3002\u305D\u308C\u3088\u308A\u5185\u306F\u5149\u306E\u9593\u5408\u3044\u3002", kind: "blade", band: "melee", dmg: 112, range: 11, acc: 0.8, cooldown: 2, encost: 18, projSpeed: 0, burst: 1, breakPower: 0.13, weight: 80, price: 1e3, tier: 1 },
    { id: "wp4", name: "\u30EC\u30FC\u30EB\u30AC\u30F3", desc: "\u97F3\u3088\u308A\u901F\u3044\u4E00\u6483\u3002\u5916\u305B\u3070\u9699\u3002", kind: "railgun", band: "long", dmg: 88, range: 780, acc: 0.5, cooldown: 5.5, encost: 30, projSpeed: 1400, burst: 1, ammo: 16, breakPower: 0.18, weight: 260, price: 2e3, tier: 2 },
    { id: "wp7", name: "\u72D9\u6483\u30D3\u30FC\u30E0", desc: "\u5730\u5E73\u306E\u5411\u3053\u3046\u304B\u3089\u7D42\u308F\u3089\u305B\u308B\u3002", kind: "beam", band: "long", dmg: 70, range: 880, acc: 0.52, cooldown: 4.8, encost: 26, projSpeed: 0, burst: 1, breakPower: 0.09, weight: 210, price: 2600, tier: 2 },
    { id: "wp9", name: "\u30C9\u30EA\u30EB\u30A2\u30FC\u30E0", desc: "\u56DE\u3057\u3066\u7A7F\u3064\u3002\u88C5\u7532\u306F\u610F\u5473\u3092\u5931\u3046\u3002", kind: "drill", band: "melee", dmg: 128, range: 9, acc: 0.74, cooldown: 3, encost: 20, projSpeed: 0, burst: 1, breakPower: 0.15, weight: 140, price: 1300, tier: 1 },
    { id: "wp10", name: "\u30ED\u30B1\u30C3\u30C8\u30D1\u30F3\u30C1", desc: "\u62F3\u306F\u98DB\u3093\u3067\u3001\u5E30\u3063\u3066\u304F\u308B\u3002", kind: "rocketpunch", band: "short", dmg: 92, range: 240, acc: 0.62, cooldown: 3.4, encost: 14, projSpeed: 220, burst: 1, breakPower: 0.11, weight: 130, price: 1800, tier: 2 }
  ],
  ai: [
    { id: "ai1", name: "\u5F37\u8972OS\u300C\u30AA\u30AA\u30AB\u30DF\u300D", desc: "\u9593\u5408\u3044\u3092\u6F70\u3057\u3066\u98DF\u3089\u3044\u3064\u304F\u3002", engage: 8, aggression: 1, kite: false, weight: 0, price: 150, tier: 0 },
    { id: "ai2", name: "\u5C04\u6483OS\u300C\u30E4\u30DE\u30C9\u30EA\u300D", desc: "\u4E2D\u8DDD\u96E2\u306E\u6483\u3061\u5408\u3044\u3092\u5236\u3059\u3002", engage: 235, aggression: 0.6, kite: false, weight: 0, price: 200, tier: 0 },
    { id: "ai3", name: "\u904A\u6483OS\u300C\u30C4\u30D0\u30E1\u300D", desc: "\u96E2\u308C\u3001\u56DE\u308A\u3001\u307E\u305F\u523A\u3059\u3002", engage: 200, aggression: 0.55, kite: true, weight: 0, price: 700, tier: 1 },
    { id: "ai4", name: "\u72D9\u6483OS\u300C\u30D5\u30AF\u30ED\u30A6\u300D", desc: "\u9060\u304F\u3067\u5F85\u3064\u3002\u7372\u7269\u306F\u6765\u308B\u3002", engage: 520, aggression: 0.4, kite: true, weight: 0, price: 1600, tier: 2 }
  ]
};
var BANDS = {
  melee: { min: 0, max: 15, label: "\u767D\u5175" },
  short: { min: 15, max: 120, label: "\u77ED\u8DDD\u96E2" },
  mid: { min: 120, max: 350, label: "\u4E2D\u8DDD\u96E2" },
  long: { min: 350, max: 900, label: "\u9060\u8DDD\u96E2" }
};
function bandMult(w, dist) {
  const b = BANDS[w.band] || BANDS.mid;
  if (w.band === "melee")
    return dist <= w.range ? { acc: 1, dmg: 1 } : { acc: 0, dmg: 0 };
  let acc = 1, dmg = 1;
  if (dist < b.min) {
    const f = Math.min(1, (b.min - dist) / b.min);
    acc = 1 - 0.65 * f;
    dmg = 1 - 0.5 * f;
  } else if (dist > b.max) {
    const f = Math.min(1, (dist - b.max) / Math.max(1, w.range - b.max));
    acc = 1 - 0.65 * f;
    dmg = 1 - 0.5 * f;
  } else {
    const soft = b.min + 0.55 * (b.max - b.min);
    if (dist > soft)
      acc = 1 - 0.25 * (dist - soft) / (b.max - soft);
  }
  return { acc, dmg };
}
function getPart(cat, id) {
  const arr = PARTS[cat];
  if (!arr)
    return null;
  for (const p of arr)
    if (p.id === id)
      return p;
  return null;
}
function deriveStats(build) {
  const errors = [];
  const fr = getPart("frame", build.frame), lg = getPart("legs", build.legs), gn = getPart("gen", build.gen), ar = getPart("armor", build.armor), wr = getPart("wpn", build.wpnR), wl = getPart("wpn", build.wpnL), ai = getPart("ai", build.ai);
  if (!fr || !lg || !gn || !ar || !wr || !wl || !ai) {
    errors.push("\u5B58\u5728\u3057\u306A\u3044\u30D1\u30FC\u30C4\u304C\u6307\u5B9A\u3055\u308C\u3066\u3044\u307E\u3059");
    return { valid: false, errors };
  }
  const weight = fr.weight + lg.weight + gn.weight + ar.weight + wr.weight + wl.weight;
  const load = weight / fr.capacity;
  if (load > 1)
    errors.push(`\u91CD\u91CF\u8D85\u904E ${weight}/${fr.capacity}`);
  const wf = Math.max(0.7, 1.06 - 0.28 * load);
  const speed = lg.speed * wf;
  const evasion = Math.max(0, lg.evasion * wf - ar.evaPenalty);
  const enOut = gn.output - lg.drain;
  if (enOut <= 2)
    errors.push("EN\u51FA\u529B\u4E0D\u8DB3(\u52D5\u529B\u7089\u3092\u5F37\u5316\u3059\u308B\u304B\u811A\u90E8\u3092\u898B\u76F4\u3059)");
  const cost = fr.price + lg.price + gn.price + ar.price + wr.price + wl.price + ai.price;
  return {
    valid: errors.length === 0,
    errors,
    hp: fr.hp,
    speed,
    turn: lg.turn,
    evasion,
    defense: ar.defense,
    aimBonus: lg.aimBonus,
    enOut,
    enCap: gn.cap,
    weight,
    capacity: fr.capacity,
    load,
    cost,
    parts: { fr, lg, gn, ar, wr, wl, ai }
  };
}
function validateBuild(build) {
  if (!build || typeof build !== "object")
    return { ok: false, errors: ["build \u304C\u3042\u308A\u307E\u305B\u3093"] };
  const s = deriveStats(build);
  return { ok: s.valid, errors: s.errors };
}
var HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
function sanitizeBuild(build, opts = {}) {
  if (!build || typeof build !== "object")
    return null;
  const out = {
    frame: String(build.frame || ""),
    legs: String(build.legs || ""),
    gen: String(build.gen || ""),
    armor: String(build.armor || ""),
    wpnR: String(build.wpnR || ""),
    wpnL: String(build.wpnL || ""),
    ai: String(build.ai || ""),
    color: HEX_RE.test(String(build.color || "")) ? String(build.color) : "#8fa3b0",
    decal: "none"
  };
  if (opts.keepName)
    out.name = String(build.name || "").slice(0, 24);
  return out;
}
var CODE_PRE = ["VX", "TR", "KG", "RX", "MK", "SD", "GH", "LN", "ZP", "AQ"];
var CODE_NAME = [
  "\u30CF\u30E4\u30D6\u30B5",
  "\u30F4\u30A1\u30CA\u30EB\u30AC\u30F3\u30C9",
  "\u30B7\u30E9\u30CC\u30A4",
  "\u30E0\u30E9\u30AF\u30E2",
  "\u30CE\u30B3\u30AE\u30EA",
  "\u30E4\u30BF\u30AC\u30E9\u30B9",
  "\u30D5\u30D6\u30AD",
  "\u30AA\u30DC\u30ED",
  "\u30AB\u30D6\u30C8",
  "\u30A4\u30AB\u30C5\u30C1",
  "\u30C4\u30C1\u30B0\u30E2",
  "\u30DF\u30AB\u30C5\u30AD",
  "\u30B5\u30B6\u30F3\u30AB",
  "\u30AF\u30ED\u30AC\u30CD",
  "\u30A2\u30DE\u30C4\u30D0\u30E1",
  "\u30D2\u30C8\u30C0\u30DE",
  "\u30E4\u30DE\u30A2\u30E9\u30B7",
  "\u30B7\u30C7\u30F3",
  "\u30BF\u30C1\u30AB\u30BC",
  "\u30E2\u30BA",
  "\u30EF\u30C0\u30C4\u30DF",
  "\u30DB\u30E0\u30E9",
  "\u30AD\u30EA\u30B5\u30E1",
  "\u30A6\u30D6\u30B9\u30CA"
];
function codename(seedStr) {
  let h = 2166136261 >>> 0;
  const s = String(seedStr);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const pre = CODE_PRE[h % CODE_PRE.length];
  const num = String((h >>> 4) % 100).padStart(2, "0");
  const nm = CODE_NAME[(h >>> 11) % CODE_NAME.length];
  return `${pre}-${num} ${nm}`;
}

// ../../public/kouki/fields.js
var FIELDS = [
  {
    id: "plain",
    name: "\u6F14\u7FD2\u5E73\u539F",
    desc: "\u906E\u853D\u306A\u3057\u306E\u6B63\u9762\u6C7A\u6226\u3002\u6A5F\u4F53\u6027\u80FD\u304C\u7D20\u76F4\u306B\u51FA\u308B\u3002",
    shape: { kind: "rect", w: 1e3, h: 1e3 },
    obstacles: []
  },
  {
    id: "sekichu",
    name: "\u77F3\u67F1\u56DE\u5ECA",
    desc: "\u7815\u3051\u308B\u77F3\u67F1\u304C\u5C04\u7DDA\u3092\u5207\u308B\u3002\u56DE\u308A\u8FBC\u307F\u3068\u7834\u58CA\u306E\u99C6\u3051\u5F15\u304D\u3002",
    shape: { kind: "rect", w: 1e3, h: 1e3 },
    obstacles: [
      { kind: "wall", x: 500, y: 500, r: 58, hp: 300 },
      { kind: "wall", x: 350, y: 330, r: 44, hp: 240 },
      { kind: "wall", x: 650, y: 670, r: 44, hp: 240 },
      { kind: "wall", x: 330, y: 700, r: 38, hp: 200 },
      { kind: "wall", x: 670, y: 300, r: 38, hp: 200 },
      { kind: "wall", x: 500, y: 160, r: 34, hp: 190 },
      { kind: "wall", x: 500, y: 840, r: 34, hp: 190 }
    ]
  },
  {
    id: "deitan",
    name: "\u6CE5\u70AD\u6E7F\u5730",
    desc: "\u8DB3\u3092\u53D6\u308B\u6CE5\u5730\u3002\u30DB\u30D0\u30FC\u306F\u6ED1\u308A\u3001\u8ECA\u8F2A\u306F\u6C88\u3080\u3002",
    shape: { kind: "rect", w: 1e3, h: 1e3 },
    obstacles: [
      { kind: "mud", x: 500, y: 480, r: 190, hp: null },
      { kind: "mud", x: 260, y: 700, r: 130, hp: null },
      { kind: "mud", x: 760, y: 280, r: 130, hp: null },
      { kind: "mud", x: 800, y: 760, r: 95, hp: null },
      { kind: "wall", x: 210, y: 260, r: 36, hp: 220 },
      { kind: "wall", x: 790, y: 540, r: 36, hp: 220 }
    ]
  },
  {
    id: "crater",
    name: "\u74B0\u72B6\u30AF\u30EC\u30FC\u30BF\u30FC",
    desc: "\u5186\u5F62\u306E\u7E01\u306F\u8328\u3002\u4E2D\u592E\u306E\u5CA9\u3060\u3051\u304C\u76FE\u306B\u306A\u308B\u3002",
    shape: { kind: "circle", cx: 500, cy: 500, r: 470 },
    obstacles: [
      { kind: "wall", x: 500, y: 500, r: 66, hp: null },
      { kind: "spike", x: 500, y: 105, r: 80, hp: null },
      { kind: "spike", x: 500, y: 895, r: 80, hp: null },
      { kind: "spike", x: 105, y: 500, r: 80, hp: null },
      { kind: "spike", x: 895, y: 500, r: 80, hp: null },
      { kind: "spike", x: 222, y: 222, r: 62, hp: null },
      { kind: "spike", x: 778, y: 778, r: 62, hp: null },
      { kind: "spike", x: 222, y: 778, r: 62, hp: null },
      { kind: "spike", x: 778, y: 222, r: 62, hp: null }
    ]
  },
  {
    id: "haikyo",
    name: "\u5EC3\u68C4\u5DE5\u5EE0",
    desc: "\u30B3\u30F3\u30C6\u30CA\u3068\u74E6\u792B\u3068\u6CB9\u6CE5\u3002\u3059\u3079\u3066\u304C\u4F7F\u3048\u308B\u3001\u3059\u3079\u3066\u304C\u58CA\u308C\u308B\u3002",
    shape: { kind: "rect", w: 1e3, h: 1e3 },
    obstacles: [
      { kind: "wall", x: 400, y: 420, r: 46, hp: 190 },
      { kind: "wall", x: 610, y: 560, r: 46, hp: 190 },
      { kind: "wall", x: 300, y: 650, r: 40, hp: 170 },
      { kind: "wall", x: 700, y: 330, r: 40, hp: 170 },
      { kind: "spike", x: 500, y: 810, r: 70, hp: null },
      { kind: "spike", x: 180, y: 380, r: 55, hp: null },
      { kind: "mud", x: 820, y: 700, r: 110, hp: null }
    ]
  }
];
function getField(id) {
  for (const f of FIELDS)
    if (f.id === id)
      return f;
  return FIELDS[0];
}
var MUD_FACTOR = { biped: 0.6, quad: 0.7, hover: 1, tank: 0.65, wheel: 0.35, reverse: 0.6 };
var SPIKE_DPS = 8;
function losBlockedBy(x1, y1, x2, y2, walls) {
  let best = null, bestT = Infinity;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  for (const o of walls) {
    if (o.alive === false)
      continue;
    let t = ((o.x - x1) * dx + (o.y - y1) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x1 + dx * t, cy = y1 + dy * t;
    const d = Math.hypot(o.x - cx, o.y - cy);
    if (d < o.r && t < bestT) {
      best = o;
      bestT = t;
    }
  }
  return best;
}

// ../../public/kouki/sim.js
var ARENA = 1e3;
var DT = 0.05;
var SAMPLE = 0.1;
var TMAX = 180;
var MECH_R = 2.2;
var PART_KEYS = ["armR", "armL", "legs", "gen", "body"];
var PART_JA = { armR: "\u53F3\u8155", armL: "\u5DE6\u8155", legs: "\u811A\u90E8", gen: "\u52D5\u529B\u7089", body: "\u80F4\u4F53" };
var LVL_JA = ["", "\u5C0F\u7834", "\u4E2D\u7834", "\u5927\u7834"];
var LEG_SPD = [1, 0.88, 0.72, 0.5];
var LEG_EVA = [1, 0.85, 0.65, 0.4];
var GEN_OUT = [1, 0.85, 0.65, 0.42];
var ARM_ACC = [0, -0.06, -0.14, -1];
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var angNorm = (a) => {
  while (a > Math.PI)
    a -= 2 * Math.PI;
  while (a < -Math.PI)
    a += 2 * Math.PI;
  return a;
};
var isMelee = (w) => w.kind === "blade" || w.kind === "drill";
var isParryableRanged = (w) => w.kind === "rifle" || w.kind === "shotgun" || w.kind === "rocketpunch";
function mkMech(build, x, y, h, pilot) {
  const st = deriveStats(build);
  if (!st.valid)
    throw new Error("invalid build: " + st.errors.join(","));
  const wpns = [st.parts.wr, st.parts.wl].map((w) => ({
    def: w,
    t: 0.5 + w.cooldown * 0.3,
    a: w.ammo == null ? Infinity : w.ammo,
    // 残弾(∞=EN/近接兵装)
    dry: false
  }));
  return {
    build,
    st,
    ai: st.parts.ai,
    x,
    y,
    h,
    hp: st.hp,
    en: st.enCap,
    wpns,
    pilotAcc: pilot && pilot.acc || 0,
    pilotEva: pilot && pilot.eva || 0,
    alive: true,
    walk: 0,
    strafePhase: 0,
    spdNow: 0,
    hzAcc: 0,
    hzT: 0,
    stance: "hd",
    pd: [0, 0, 0, 0, 0],
    // 部位状態(armR,armL,legs,gen,body)
    curEngage: st.parts.ai.engage,
    cand: null,
    candIdx: 0,
    // 適応交戦距離
    dIn: 0,
    dOut: 0,
    epochT: 0,
    dmgCum: 0
  };
}
function pAcc(w, dist, shooter, slot) {
  const bm = bandMult(w, dist);
  if (bm.acc <= 0)
    return 0;
  return clamp(
    w.acc * bm.acc + shooter.st.aimBonus + (shooter.pilotAcc || 0) + ARM_ACC[shooter.pd[slot]],
    0.05,
    0.97
  );
}
function pDodge(target) {
  const ms = 0.6 + 0.8 * clamp((target.spdNow || 0) / 36, 0, 1);
  return clamp(target.st.evasion * LEG_EVA[target.pd[2]] * ms + (target.pilotEva || 0), 0, 0.62);
}
function pParry(w, target) {
  const hasMelee = target.wpns.some((wp) => isMelee(wp.def));
  if (!hasMelee || target.en < 6)
    return 0;
  if (isMelee(w))
    return 0.3;
  if (isParryableRanged(w))
    return 0.1;
  return 0;
}
function rayWall(x, y, ux, uy, from, to, walls) {
  let best = null, bestT = Infinity;
  for (const o of walls) {
    if (!o.alive)
      continue;
    const relx = o.x - x, rely = o.y - y;
    const t = relx * ux + rely * uy;
    if (t < from || t > to)
      continue;
    const d = Math.hypot(relx - ux * t, rely - uy * t);
    if (d < o.r && t < bestT) {
      best = o;
      bestT = t;
    }
  }
  return best ? { wall: best, t: bestT } : null;
}
function shapeClamp(me, shape) {
  if (shape.kind === "circle") {
    const dx = me.x - shape.cx, dy = me.y - shape.cy;
    const d = Math.hypot(dx, dy) || 1;
    const maxR = shape.r - 20;
    if (d > maxR) {
      me.x = shape.cx + dx / d * maxR;
      me.y = shape.cy + dy / d * maxR;
    }
  } else {
    me.x = clamp(me.x, 20, (shape.w || ARENA) - 20);
    me.y = clamp(me.y, 20, (shape.h || ARENA) - 20);
  }
}
function simulate(buildA, buildB, seed, opts = {}) {
  const rng = mulberry32(seed >>> 0);
  const names = [opts.nameA || "\u03B1\u6A5F", opts.nameB || "\u03B2\u6A5F"];
  const field = getField(opts.fieldId);
  const obs = field.obstacles.map((o, i) => ({
    kind: o.kind,
    x: o.x,
    y: o.y,
    r: o.r,
    hp: o.hp,
    hp0: o.hp,
    alive: true,
    idx: i
  }));
  const walls = obs.filter((o) => o.kind === "wall");
  const muds = obs.filter((o) => o.kind === "mud");
  const spikes = obs.filter((o) => o.kind === "spike");
  const pilots = opts.pilots || [];
  const cx0 = field.shape.kind === "circle" ? field.shape.cx : (field.shape.w || ARENA) / 2;
  const cy0 = field.shape.kind === "circle" ? field.shape.cy : (field.shape.h || ARENA) / 2;
  let sx = 220, sy = 0;
  for (let tries = 0; tries < 8; tries++) {
    const th = rng() * Math.PI * 2;
    const ox = Math.cos(th) * 220, oy = Math.sin(th) * 220;
    const pts = [[cx0 - ox, cy0 - oy], [cx0 + ox, cy0 + oy]];
    const okPos = pts.every(([px, py]) => {
      if (field.shape.kind === "circle") {
        if (Math.hypot(px - field.shape.cx, py - field.shape.cy) > field.shape.r - 40)
          return false;
      } else if (px < 40 || py < 40 || px > (field.shape.w || ARENA) - 40 || py > (field.shape.h || ARENA) - 40)
        return false;
      return obs.every((o) => Math.hypot(px - o.x, py - o.y) > o.r + 25);
    });
    if (okPos) {
      sx = ox;
      sy = oy;
      break;
    }
  }
  const m = [
    mkMech(buildA, cx0 - sx, cy0 - sy, Math.atan2(sy, sx), pilots[0]),
    mkMech(buildB, cx0 + sx, cy0 + sy, Math.atan2(-sy, -sx), pilots[1])
  ];
  m[0].strafePhase = rng() * 6.28;
  m[1].strafePhase = rng() * 6.28;
  shapeClamp(m[0], field.shape);
  shapeClamp(m[1], field.shape);
  for (const k of m) {
    const cands = [];
    for (const wp of k.wpns) {
      const w = wp.def;
      if (w.band === "melee")
        cands.push(Math.max(6, w.range * 0.7));
      else {
        const b = BANDS[w.band] || BANDS.mid;
        cands.push(Math.min((b.min + b.max) / 2, w.range * 0.9));
      }
    }
    cands.push(k.ai.engage);
    for (let a2 = cands.length - 1; a2 > 0; a2--) {
      const j2 = Math.floor(rng() * (a2 + 1));
      const tmp = cands[a2];
      cands[a2] = cands[j2];
      cands[j2] = tmp;
    }
    k.cand = cands;
  }
  const events = [];
  const states = [];
  const pending = [];
  const groups = [];
  const ev = (t2, kind, extra) => {
    const e = Object.assign({ t: Math.round(t2 * 10) / 10, kind }, extra);
    events.push(e);
    return e;
  };
  ev(0, "spawn", { who: 0, x: m[0].x, y: m[0].y });
  ev(0, "spawn", { who: 1, x: m[1].x, y: m[1].y });
  let t = 0, winner = -1, endReason = "time";
  let nextSample = 0, nextPhaseLog = 60, nextDmgSample = 0;
  const dmgHist = [];
  while (t < TMAX && m[0].alive && m[1].alive) {
    if (t >= nextSample - 1e-9) {
      states.push({
        t: Math.round(t * 10) / 10,
        m: m.map((k) => ({
          x: Math.round(k.x * 10) / 10,
          y: Math.round(k.y * 10) / 10,
          h: Math.round(k.h * 100) / 100,
          hp: Math.round(k.hp),
          en: Math.round(k.en),
          s: k.stance,
          a: k.wpns.map((w) => w.a === Infinity ? -1 : w.a),
          pd: k.pd.slice()
        }))
      });
      nextSample += SAMPLE;
    }
    const snap = m.map((k) => ({ x: k.x, y: k.y }));
    for (let i = 0; i < 2; i++) {
      const me = m[i], foe = snap[1 - i], foeM = m[1 - i];
      const dx = foe.x - me.x, dy = foe.y - me.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const lgKind = me.st.parts.lg.kind;
      const usableRanged = me.wpns.some((wp, s2) => wp.def.range > 120 && wp.a > 0 && me.pd[s2] < 3);
      const hasMelee = me.wpns.some((wp, s2) => isMelee(wp.def) && me.pd[s2] < 3);
      let engage = me.curEngage, aggr = me.ai.aggression, kite = me.ai.kite;
      if (foeM.hp / foeM.st.hp < me.hp / me.st.hp * 0.75) {
        kite = false;
        aggr = clamp(aggr + 0.35, 0, 1);
      }
      if (!usableRanged) {
        if (hasMelee) {
          engage = 7;
          aggr = 1;
          kite = false;
        } else {
          engage = 720;
          kite = true;
        }
      }
      const err = dist - engage;
      const db = clamp(engage * 0.3, 6, 40);
      let fwd = 0;
      if (err > db)
        fwd = 0.55 + 0.45 * aggr;
      else if (err < -db)
        fwd = -0.8;
      else if (err > 0 && engage < 20)
        fwd = 0.35;
      const minCost = Math.min(me.wpns[0].def.encost, me.wpns[1].def.encost);
      const reloading = me.wpns[0].t > 0.3 && me.wpns[1].t > 0.3;
      if (kite && (reloading || me.en < minCost) && dist < engage * 1.25)
        fwd = -0.8;
      const flee = kite && dist < engage * 0.55 && me.en > me.st.enCap * 0.25;
      me.stance = flee ? "fl" : !usableRanged ? hasMelee ? "ru" : "ev" : fwd > 0 ? "ap" : fwd < 0 ? "bk" : "hd";
      const blocker = walls.length ? losBlockedBy(me.x, me.y, foe.x, foe.y, walls) : null;
      let sw = Math.sin(t * 0.55 + me.strafePhase) > 0 ? 1 : -1;
      if (blocker) {
        const cross = (blocker.x - me.x) * dy - (blocker.y - me.y) * dx;
        sw = cross > 0 ? 1 : -1;
      }
      const strafe = (err > 120 && !blocker ? 0.22 : 0.5) * sw;
      const effSpeed = me.st.speed * LEG_SPD[me.pd[2]];
      let vx, vy, spd;
      if (flee) {
        const cx02 = field.shape.kind === "circle" ? field.shape.cx : (field.shape.w || ARENA) / 2;
        const cy02 = field.shape.kind === "circle" ? field.shape.cy : (field.shape.h || ARENA) / 2;
        let ax = -ux + (cx02 - me.x) / 700, ay = -uy + (cy02 - me.y) / 700;
        const al = Math.hypot(ax, ay) || 1;
        spd = effSpeed;
        vx = ax / al * spd;
        vy = ay / al * spd;
      } else {
        vx = ux * fwd - uy * strafe;
        vy = uy * fwd + ux * strafe;
        const vlen = Math.hypot(vx, vy) || 1;
        spd = effSpeed * clamp(Math.abs(fwd) + 0.35, 0.75, 1);
        if (fwd > 0 && err > 150)
          spd *= 1.12;
        if (fwd < 0)
          spd *= 0.45;
        vx = vx / vlen * spd;
        vy = vy / vlen * spd;
        if (fwd > 0 && err > 150 && walls.length) {
          let best = null, bestD = 320;
          for (const o of walls) {
            if (!o.alive)
              continue;
            const d0 = Math.hypot(o.x - me.x, o.y - me.y);
            const tproj = ((o.x - me.x) * dx + (o.y - me.y) * dy) / (dist * dist);
            if (d0 < bestD && tproj > 0.05 && tproj < 0.9) {
              best = o;
              bestD = d0;
            }
          }
          if (best) {
            const fdx = best.x - foe.x, fdy = best.y - foe.y;
            const fl = Math.hypot(fdx, fdy) || 1;
            const px2 = best.x + fdx / fl * (best.r + 50), py2 = best.y + fdy / fl * (best.r + 50);
            const sdx = px2 - me.x, sdy = py2 - me.y;
            const sl = Math.hypot(sdx, sdy) || 1;
            if (sl > 12) {
              vx = vx * 0.65 + sdx / sl * spd * 0.35;
              vy = vy * 0.65 + sdy / sl * spd * 0.35;
              const vl2 = Math.hypot(vx, vy) || 1;
              vx = vx / vl2 * spd;
              vy = vy / vl2 * spd;
            }
          }
        }
      }
      let mudded = false;
      for (const o of muds) {
        if (Math.hypot(me.x - o.x, me.y - o.y) < o.r) {
          mudded = true;
          break;
        }
      }
      if (mudded) {
        const f = lgKind === "hover" ? 1 : MUD_FACTOR[lgKind] != null ? MUD_FACTOR[lgKind] : 0.6;
        vx *= f;
        vy *= f;
        spd *= f;
      }
      for (const o of walls) {
        if (!o.alive)
          continue;
        const d0 = Math.hypot(me.x - o.x, me.y - o.y);
        const rr = o.r + 46;
        if (d0 < rr && d0 > 1) {
          const push = (rr - d0) / 46 * effSpeed * 0.9;
          vx += (me.x - o.x) / d0 * push;
          vy += (me.y - o.y) / d0 * push;
        }
      }
      me.x += vx * DT;
      me.y += vy * DT;
      for (const o of walls) {
        if (!o.alive)
          continue;
        const d0 = Math.hypot(me.x - o.x, me.y - o.y);
        if (d0 < o.r + MECH_R && d0 > 0.01) {
          me.x = o.x + (me.x - o.x) / d0 * (o.r + MECH_R);
          me.y = o.y + (me.y - o.y) / d0 * (o.r + MECH_R);
        }
      }
      shapeClamp(me, field.shape);
      me.spdNow = spd;
      me.walk += spd * DT;
      if (lgKind !== "hover") {
        for (const o of spikes) {
          if (Math.hypot(me.x - o.x, me.y - o.y) < o.r) {
            me.hzAcc += SPIKE_DPS * DT;
            break;
          }
        }
      }
      me.hzT += DT;
      if (me.hzT >= 1) {
        me.hzT = 0;
        if (me.hzAcc >= 1) {
          const dmg = Math.round(me.hzAcc);
          me.hzAcc = 0;
          me.hp -= dmg;
          ev(t, "hazard", { who: i, dmg, remain: Math.max(0, Math.round(me.hp)), x: me.x, y: me.y });
          if (me.hp <= 0 && me.alive) {
            me.alive = false;
            winner = 1 - i;
            endReason = "hazard";
            ev(t, "destroyed", { who: i, by: -1, x: me.x, y: me.y });
          }
        }
      }
      if (!me.alive)
        break;
      const dAng = angNorm((flee ? Math.atan2(vy, vx) : Math.atan2(dy, dx)) - me.h);
      me.h = angNorm(me.h + clamp(dAng, -me.st.turn * DT, me.st.turn * DT));
      const effOut = me.st.parts.gn.output * GEN_OUT[me.pd[3]] - me.st.parts.lg.drain;
      me.en = clamp(me.en + (effOut - (flee ? 18 : 0)) * DT, 0, me.st.enCap);
      me.epochT += DT;
      if (me.epochT >= 5 - 1e-9) {
        me.epochT = 0;
        if (me.dIn > me.dOut * 1.35 + 15) {
          me.candIdx++;
          const next = me.cand[me.candIdx % me.cand.length];
          if (Math.abs(next - me.curEngage) > 15)
            ev(t, "shift", { who: i, dist: Math.round(next) });
          me.curEngage = next;
        } else {
          me.curEngage = clamp(me.curEngage * (0.92 + 0.16 * rng()), 6, 700);
        }
        me.dIn = 0;
        me.dOut = 0;
      }
      const facing = Math.abs(dAng) < 1.1;
      for (let s2 = 0; s2 < me.wpns.length; s2++) {
        const wp = me.wpns[s2];
        wp.t -= DT;
        if (wp.t > 0)
          continue;
        const w = wp.def;
        if (me.pd[s2] >= 3)
          continue;
        if (!facing || dist > w.range || me.en < w.encost)
          continue;
        if (wp.a <= 0)
          continue;
        const underArm = w.kind === "missile" && dist < (w.arm || 0);
        if (underArm) {
          const o2 = me.wpns[1 - s2];
          const o2ok = o2 && o2.a > 0 && me.pd[1 - s2] < 3 && dist <= o2.def.range && !(o2.def.kind === "missile" && dist < (o2.def.arm || 0));
          if (o2ok)
            continue;
        }
        if (w.kind !== "missile" && w.range > 120 && blocker)
          continue;
        me.en -= w.encost;
        wp.t = w.cooldown;
        const rounds = wp.a === Infinity ? w.burst : Math.min(w.burst, wp.a);
        if (wp.a !== Infinity) {
          wp.a -= rounds;
          if (wp.a <= 0 && !wp.dry) {
            wp.dry = true;
            ev(t, "ammo_out", { who: i, wpn: w.kind, wname: w.name });
          }
        }
        const group = {
          t,
          si: i,
          wname: w.name,
          kind: w.kind,
          dist,
          nHit: 0,
          dmgSum: 0,
          nDodge: 0,
          nParry: 0,
          nMiss: 0,
          remain: 0,
          n: rounds
        };
        groups.push(group);
        ev(t, "fire", {
          who: i,
          targ: 1 - i,
          wpn: w.kind,
          wname: w.name,
          burst: rounds,
          slot: s2,
          // 0=右腕 1=左腕(3Dの攻撃モーション用)
          x: me.x,
          y: me.y,
          tx: foeM.x,
          ty: foeM.y,
          dist: Math.round(dist)
        });
        const bm = bandMult(w, dist);
        for (let j = 0; j < rounds; j++) {
          const tFire = t + j * 0.12;
          const fly = w.projSpeed > 0 ? dist / w.projSpeed : 0;
          let outcome = "hit";
          if (rng() > pAcc(w, dist, me, s2))
            outcome = "miss";
          else if (rng() < pDodge(foeM))
            outcome = "dodge";
          else if (rng() < pParry(w, foeM)) {
            outcome = "parry";
            foeM.en = Math.max(0, foeM.en - 6);
          }
          const defEff = w.kind === "drill" ? foeM.st.defense * 0.6 : foeM.st.defense;
          const dmg = Math.round(w.dmg * bm.dmg * (1 - defEff));
          pending.push({
            type: "shot",
            tImpact: tFire + fly,
            si: i,
            ti: 1 - i,
            w,
            outcome,
            dmg,
            group,
            kx: ux,
            ky: uy
          });
          if ((outcome === "miss" || outcome === "dodge") && w.projSpeed > 0 && walls.length) {
            const hitW = rayWall(me.x, me.y, ux, uy, dist + 12, dist + 260, walls);
            if (hitW)
              pending.push({
                type: "obshit",
                tImpact: tFire + hitW.t / w.projSpeed,
                wall: hitW.wall,
                dmg: Math.round(w.dmg),
                si: i
              });
          }
        }
        if (underArm) {
          pending.push({
            type: "selfhit",
            tImpact: t + 0.3,
            si: i,
            dmg: Math.round(w.dmg * 0.5 * (1 - me.st.defense))
          });
        }
      }
    }
    pending.sort((a, b) => a.tImpact - b.tImpact);
    while (pending.length && pending[0].tImpact <= t + DT) {
      const p = pending.shift();
      if (p.type === "obshit") {
        const o = p.wall;
        if (!o.alive || o.hp == null)
          continue;
        o.hp -= p.dmg;
        ev(p.tImpact, "obs_hit", { idx: o.idx, dmg: p.dmg, hp: Math.max(0, o.hp), x: o.x, y: o.y });
        if (o.hp <= 0) {
          o.alive = false;
          ev(p.tImpact, "obs_down", { idx: o.idx, x: o.x, y: o.y });
        }
        continue;
      }
      if (p.type === "selfhit") {
        const sm = m[p.si];
        if (!sm.alive || p.dmg <= 0)
          continue;
        sm.hp -= p.dmg;
        ev(p.tImpact, "self_hit", { who: p.si, dmg: p.dmg, remain: Math.max(0, Math.round(sm.hp)), x: sm.x, y: sm.y });
        if (sm.hp <= 0) {
          sm.alive = false;
          winner = 1 - p.si;
          endReason = "self";
          ev(p.tImpact, "destroyed", { who: p.si, by: -1, x: sm.x, y: sm.y });
        }
        continue;
      }
      const tgt = m[p.ti];
      const g = p.group;
      if (!tgt.alive)
        continue;
      if (p.outcome === "hit") {
        tgt.hp -= p.dmg;
        m[p.si].dOut += p.dmg;
        tgt.dIn += p.dmg;
        m[p.si].dmgCum += p.dmg;
        g.nHit++;
        g.dmgSum += p.dmg;
        g.remain = Math.max(0, Math.round(tgt.hp));
        const kb = Math.min(24, Math.max(0, p.dmg - 16) * 300 / tgt.st.weight);
        if (kb > 0.5) {
          tgt.x += p.kx * kb;
          tgt.y += p.ky * kb;
          for (const o of walls) {
            if (!o.alive)
              continue;
            const d0 = Math.hypot(tgt.x - o.x, tgt.y - o.y);
            if (d0 < o.r + MECH_R && d0 > 0.01) {
              tgt.x = o.x + (tgt.x - o.x) / d0 * (o.r + MECH_R);
              tgt.y = o.y + (tgt.y - o.y) / d0 * (o.r + MECH_R);
            }
          }
          shapeClamp(tgt, field.shape);
        }
        ev(p.tImpact, "hit", {
          who: p.si,
          targ: p.ti,
          wpn: p.w.kind,
          wname: p.w.name,
          dmg: p.dmg,
          x: tgt.x,
          y: tgt.y,
          remain: g.remain,
          kb: Math.round(kb * 10) / 10
        });
        if (tgt.hp <= 0) {
          tgt.alive = false;
          winner = p.si;
          endReason = "destroy";
          ev(p.tImpact, "destroyed", { who: p.ti, by: p.si, x: tgt.x, y: tgt.y });
        } else if (rng() < (p.w.breakPower || 0)) {
          const r2 = rng();
          const idx = r2 < 0.21 ? 0 : r2 < 0.42 ? 1 : r2 < 0.68 ? 2 : r2 < 0.82 ? 3 : 4;
          const cap = idx === 4 && tgt.hp > 0.35 * tgt.st.hp ? 2 : 3;
          if (tgt.pd[idx] < cap) {
            tgt.pd[idx]++;
            ev(p.tImpact, "pbreak", {
              who: p.ti,
              part: PART_KEYS[idx],
              lvl: tgt.pd[idx],
              wname: p.w.name,
              x: tgt.x,
              y: tgt.y
            });
            if (idx === 4 && tgt.pd[4] >= 3) {
              tgt.alive = false;
              winner = p.si;
              endReason = "core";
              ev(p.tImpact, "destroyed", { who: p.ti, by: p.si, reason: "core", x: tgt.x, y: tgt.y });
            }
          }
        }
      } else {
        g.remain = Math.max(0, Math.round(tgt.hp));
        if (p.outcome === "dodge") {
          g.nDodge++;
          ev(p.tImpact, "dodge", { who: p.si, targ: p.ti, wpn: p.w.kind, wname: p.w.name, x: tgt.x, y: tgt.y });
        } else if (p.outcome === "parry") {
          g.nParry++;
          ev(p.tImpact, "parry", { who: p.si, targ: p.ti, wpn: p.w.kind, wname: p.w.name, x: tgt.x, y: tgt.y });
        } else {
          g.nMiss++;
          ev(p.tImpact, "miss", { who: p.si, targ: p.ti, wpn: p.w.kind, wname: p.w.name, x: tgt.x, y: tgt.y });
        }
      }
    }
    if (t >= nextDmgSample - 1e-9) {
      dmgHist.push([t, m[0].dmgCum, m[1].dmgCum]);
      nextDmgSample += 1;
      const anyW = (k) => k.wpns.some((wp, s2) => wp.a > 0 && k.pd[s2] < 3);
      if (m[0].alive && m[1].alive && !anyW(m[0]) && !anyW(m[1])) {
        endReason = "stalemate";
        break;
      }
    }
    t += DT;
    if (t >= nextPhaseLog && m[0].alive && m[1].alive) {
      ev(t, "phase", { hpA: Math.round(100 * m[0].hp / m[0].st.hp), hpB: Math.round(100 * m[1].hp / m[1].st.hp) });
      nextPhaseLog += 60;
    }
  }
  if (endReason === "stalemate") {
    winner = -1;
  } else if (winner === -1) {
    let base = [0, 0];
    const cutoff = t - 60;
    for (const h2 of dmgHist)
      if (h2[0] <= cutoff)
        base = [h2[1], h2[2]];
    const dA = m[0].dmgCum - base[0], dB = m[1].dmgCum - base[1];
    if (dA < 0.03 * m[1].st.hp && dB < 0.03 * m[0].st.hp) {
      winner = -1;
    } else {
      const ra = m[0].hp / m[0].st.hp, rb = m[1].hp / m[1].st.hp;
      if (Math.abs(ra - rb) < 0.03)
        winner = -1;
      else
        winner = ra > rb ? 0 : 1;
    }
    endReason = "time";
  }
  const duration = Math.round(Math.min(t, TMAX) * 10) / 10;
  ev(duration, "end", {
    winner,
    reason: endReason,
    hpA: Math.max(0, Math.round(m[0].hp)),
    hpB: Math.max(0, Math.round(m[1].hp))
  });
  return {
    winner,
    duration,
    states,
    events,
    fieldId: field.id,
    field,
    log: buildLog(events, groups, names, field)
  };
}
function buildLog(events, groups, names, field) {
  const L = [];
  const T = (t) => "T+" + t.toFixed(1).padStart(5, "0");
  const tag = (i) => i === 0 ? "TGT-A" : "TGT-B";
  L.push(`${T(0)} [\u4EA4\u6226\u958B\u59CB] ${tag(0)} \xD7 ${tag(1)} \u2014 \u6226\u5834: ${field.name}`);
  const doneGroups = /* @__PURE__ */ new Set();
  for (const e of events) {
    if (e.kind === "fire") {
      const g = groups.find((g2) => !doneGroups.has(g2) && g2.si === e.who && Math.abs(g2.t - e.t) < 0.06 && g2.wname === e.wname);
      if (!g)
        continue;
      doneGroups.add(g);
      const parts = [];
      if (g.nHit)
        parts.push(`${g.nHit}\u767A\u547D\u4E2D \u8A08${g.dmgSum}`);
      if (g.nDodge)
        parts.push(`${g.nDodge}\u767A\u56DE\u907F\u3055\u308C\u308B`);
      if (g.nParry)
        parts.push(`${g.nParry}\u767A\u5F3E\u304B\u308C\u308B`);
      if (g.nMiss)
        parts.push(`${g.nMiss}\u767A\u305D\u308C\u308B`);
      const res = parts.length ? parts.join("\u30FB") : "\u4E0D\u767A";
      const rem = g.nHit ? `(${tag(e.targ)}\u6B8B${g.remain})` : "";
      L.push(`${T(e.t)} ${tag(e.who)} ${g.wname}\u767A\u5C04(\u8DDD\u96E2${e.dist}) \u2192 ${res}${rem}`);
    } else if (e.kind === "ammo_out") {
      L.push(`${T(e.t)} [\u5F3E\u5207\u308C] ${tag(e.who)} ${e.wname} \u6B8B\u5F3E\u30BC\u30ED`);
    } else if (e.kind === "obs_down") {
      L.push(`${T(e.t)} [\u969C\u5BB3\u7269\u5D29\u58CA] \u906E\u853D\u7269\u304C\u7834\u58CA\u3055\u308C\u305F`);
    } else if (e.kind === "hazard") {
      L.push(`${T(e.t)} [\u5730\u5F62\u640D\u50B7] ${tag(e.who)} \u8328\u3067${e.dmg}\u640D\u8017(\u6B8B${e.remain})`);
    } else if (e.kind === "pbreak") {
      L.push(`${T(e.t)} [\u90E8\u4F4D\u640D\u50B7] ${tag(e.who)} ${PART_JA[e.part]}${LVL_JA[e.lvl]}`);
    } else if (e.kind === "self_hit") {
      L.push(`${T(e.t)} [\u81EA\u7206] ${tag(e.who)} \u8FD1\u63A5\u8D77\u7206\u3067${e.dmg}\u640D\u8017(\u6B8B${e.remain})`);
    } else if (e.kind === "shift") {
      L.push(`${T(e.t)} [\u6226\u8853\u5909\u66F4] ${tag(e.who)} \u4EA4\u6226\u8DDD\u96E2\u3092${e.dist}m\u5E2F\u3078\u79FB\u884C`);
    } else if (e.kind === "destroyed") {
      L.push(`${T(e.t)} [\u6483\u7834] ${tag(e.who)} ` + (e.reason === "core" ? "\u80F4\u4F53\u5927\u7834 \u2014 \u6A5F\u4F53\u69CB\u9020\u5D29\u58CA" : "\u4E3B\u6A5F\u95A2\u505C\u6B62 \u2014 \u6A5F\u80FD\u3092\u55AA\u5931"));
    } else if (e.kind === "phase") {
      L.push(`${T(e.t)} [\u7D4C\u904E] \u6B8B\u5B58 TGT-A:${e.hpA}% / TGT-B:${e.hpB}%`);
    } else if (e.kind === "end") {
      if (e.reason === "stalemate")
        L.push(`${T(e.t)} [\u81A0\u7740] \u4E21\u6A5F\u3068\u3082\u7D99\u6226\u80FD\u529B\u3092\u55AA\u5931 \u2014 \u4EA4\u6226\u6253\u5207\u308A`);
      if (e.reason === "time")
        L.push(`${T(e.t)} [\u6642\u9593\u5207\u308C] \u6B8B\u5B58\u5224\u5B9A TGT-A:${e.hpA} / TGT-B:${e.hpB}`);
      L.push(`${T(e.t)} [\u8A66\u5408\u7D42\u4E86] ` + (e.winner === -1 ? "\u5F15\u304D\u5206\u3051" : `\u52DD\u8005 ${tag(e.winner)}`));
    }
  }
  return L;
}

// src/index.js
var SESSION_TTL = 60 * 60 * 24 * 30;
var STATE_TTL = 60 * 10;
var ELO_K = 32;
var RATE_LIMITS = {
  fight: { windowSec: 60, max: 10 },
  // 対戦は重い(サーバ側simulate実行)ので厳しめ
  write: { windowSec: 60, max: 20 }
  // garage保存 / arena登録
};
var PROVIDERS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    clientId: (env) => env.GOOGLE_CLIENT_ID,
    clientSecret: (env) => env.GOOGLE_CLIENT_SECRET,
    normalize: (u) => ({ id: "google:" + u.sub, name: u.name || u.email || "user", email: u.email, avatar: u.picture })
  }
};
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get("Origin") || "", env);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    try {
      return await route(request, env, url, cors) || json({ error: "not found" }, 404, cors);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500, cors);
    }
  }
};
async function route(request, env, url, cors) {
  const path = url.pathname;
  const method = request.method;
  if (method !== "GET" && method !== "OPTIONS" && !originAllowed(request, env)) {
    return json({ error: "forbidden origin" }, 403, cors);
  }
  const login = path.match(/^\/auth\/([a-z]+)\/login$/);
  if (login)
    return oauthLogin(env, url, login[1]);
  const cb = path.match(/^\/auth\/([a-z]+)\/callback$/);
  if (cb)
    return oauthCallback(env, url, cb[1]);
  if (path === "/auth/me") {
    const user = await currentUser(request, env);
    return json({ user: publicUser(user) }, 200, cors);
  }
  if (path === "/auth/logout" && method === "POST")
    return logout(request, env, cors);
  if (path === "/garage" && method === "GET") {
    const user = await currentUser(request, env);
    if (!user)
      return json({ error: "login required" }, 401, cors);
    const { results } = await env.DB.prepare(
      "SELECT slot, build_json, updated_at FROM garage WHERE user_id = ? ORDER BY slot"
    ).bind(user.id).all();
    const slots = results.map((r) => ({ slot: r.slot, build: JSON.parse(r.build_json), updated_at: r.updated_at }));
    return json({ slots }, 200, cors);
  }
  const slotMatch = path.match(/^\/garage\/(\d+)$/);
  if (slotMatch && (method === "PUT" || method === "POST")) {
    const user = await currentUser(request, env);
    if (!user)
      return json({ error: "login required" }, 401, cors);
    if (await rateLimit(request, env, "write"))
      return json({ error: "rate limited" }, 429, cors);
    const slot = parseInt(slotMatch[1], 10);
    if (!(slot >= 0 && slot <= 7))
      return json({ error: "slot \u306F0\u301C7" }, 400, cors);
    const body = await readJson(request);
    const build = sanitizeBuild(body && body.build, { keepName: true });
    if (!build)
      return json({ error: "build required" }, 400, cors);
    const v = validateBuild(build);
    if (!v.ok)
      return json({ error: "invalid build", errors: v.errors }, 400, cors);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await env.DB.prepare(
      "INSERT INTO garage (user_id, slot, build_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, slot) DO UPDATE SET build_json = excluded.build_json, updated_at = excluded.updated_at"
    ).bind(user.id, slot, JSON.stringify(build), now).run();
    return json({ ok: true, slot, updated_at: now }, 200, cors);
  }
  if (path === "/arena/submit" && method === "POST") {
    const user = await currentUser(request, env);
    if (!user)
      return json({ error: "login required" }, 401, cors);
    if (await rateLimit(request, env, "write"))
      return json({ error: "rate limited" }, 429, cors);
    const body = await readJson(request);
    const arenaBuild = sanitizeBuild(body && body.build);
    if (!arenaBuild)
      return json({ error: "build required" }, 400, cors);
    const v = validateBuild(arenaBuild);
    if (!v.ok)
      return json({ error: "invalid build", errors: v.errors }, 400, cors);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existing = await env.DB.prepare(
      "SELECT codename, rating, wins, losses FROM arena WHERE user_id = ?"
    ).bind(user.id).first();
    if (existing) {
      await env.DB.prepare("UPDATE arena SET build_json = ?, updated_at = ? WHERE user_id = ?").bind(JSON.stringify(arenaBuild), now, user.id).run();
      return json({
        ok: true,
        codename: existing.codename,
        rating: existing.rating,
        wins: existing.wins,
        losses: existing.losses
      }, 200, cors);
    }
    const cname = codename(user.id);
    await env.DB.prepare(
      "INSERT INTO arena (user_id, codename, build_json, rating, wins, losses, updated_at) VALUES (?, ?, ?, 1200, 0, 0, ?)"
    ).bind(user.id, cname, JSON.stringify(arenaBuild), now).run();
    return json({ ok: true, codename: cname, rating: 1200, wins: 0, losses: 0 }, 201, cors);
  }
  if (path === "/arena/fight" && method === "POST") {
    const user = await currentUser(request, env);
    if (!user)
      return json({ error: "login required" }, 401, cors);
    if (await rateLimit(request, env, "fight"))
      return json({ error: "rate limited" }, 429, cors);
    const mine = await env.DB.prepare(
      "SELECT codename, build_json, rating, wins, losses FROM arena WHERE user_id = ?"
    ).bind(user.id).first();
    if (!mine)
      return json({ error: "not_submitted" }, 400, cors);
    let candList = (await env.DB.prepare(
      "SELECT user_id, codename, build_json, rating, wins, losses FROM arena WHERE user_id != ? ORDER BY ABS(rating - ?) ASC LIMIT 5"
    ).bind(user.id, mine.rating).all()).results;
    if (!candList || candList.length === 0) {
      const bot = await env.DB.prepare(
        "SELECT user_id, codename, build_json, rating, wins, losses FROM arena WHERE user_id LIKE 'bot:%' ORDER BY RANDOM() LIMIT 1"
      ).first();
      if (!bot)
        return json({ error: "no_opponent" }, 400, cors);
      candList = [bot];
    }
    const opp = candList[pickInt(candList.length)];
    const seedArr = new Uint32Array(1);
    crypto.getRandomValues(seedArr);
    const seed = seedArr[0];
    const myBuild = JSON.parse(mine.build_json);
    const oppBuild = JSON.parse(opp.build_json);
    const fieldId = FIELDS[seed % FIELDS.length].id;
    const result = simulate(myBuild, oppBuild, seed, { fieldId });
    const winner = result.winner;
    const { a: myNew, b: oppNew } = eloUpdate(mine.rating, opp.rating, winner);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const myWinsDelta = winner === 0 ? 1 : 0;
    const myLossDelta = winner === 1 ? 1 : 0;
    const oppWinsDelta = winner === 1 ? 1 : 0;
    const oppLossDelta = winner === 0 ? 1 : 0;
    await env.DB.batch([
      env.DB.prepare("UPDATE arena SET rating = rating + ?, wins = wins + ?, losses = losses + ?, updated_at = ? WHERE user_id = ?").bind(myNew - mine.rating, myWinsDelta, myLossDelta, now, user.id),
      env.DB.prepare("UPDATE arena SET rating = rating + ?, wins = wins + ?, losses = losses + ?, updated_at = ? WHERE user_id = ?").bind(oppNew - opp.rating, oppWinsDelta, oppLossDelta, now, opp.user_id),
      env.DB.prepare("INSERT INTO battles (a_user, b_user, seed, winner, created_at) VALUES (?, ?, ?, ?, ?)").bind(user.id, opp.user_id, seed, winner, now)
    ]);
    return json({
      seed,
      fieldId,
      mine: { build: myBuild, codename: mine.codename, rating: myNew },
      opp: { codename: opp.codename, build: oppBuild, rating: oppNew },
      winner,
      myRating: myNew,
      delta: myNew - mine.rating
    }, 200, cors);
  }
  if (path === "/arena/top" && method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT codename, rating, wins, losses FROM arena ORDER BY rating DESC LIMIT 20"
    ).all();
    return json({ top: results }, 200, cors);
  }
  if (path === "/arena/history" && method === "GET") {
    const user = await currentUser(request, env);
    if (!user)
      return json({ error: "login required" }, 401, cors);
    const { results } = await env.DB.prepare(
      "SELECT bt.seed, bt.winner, bt.created_at, bt.a_user, bt.b_user,        aa.codename AS a_codename, ab.codename AS b_codename FROM battles bt LEFT JOIN arena aa ON aa.user_id = bt.a_user LEFT JOIN arena ab ON ab.user_id = bt.b_user WHERE bt.a_user = ? OR bt.b_user = ? ORDER BY bt.id DESC LIMIT 10"
    ).bind(user.id, user.id).all();
    const history = results.map((r) => {
      const iAmA = r.a_user === user.id;
      const oppCodename = iAmA ? r.b_codename : r.a_codename;
      const winnerMine = r.winner === -1 ? null : iAmA ? r.winner === 0 : r.winner === 1;
      return { opp_codename: oppCodename, winner_mine: winnerMine, seed: r.seed, created_at: r.created_at };
    });
    return json({ history }, 200, cors);
  }
  return null;
}
function eloUpdate(ratingA, ratingB, winner) {
  const expA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expB = 1 - expA;
  const scoreA = winner === 0 ? 1 : winner === 1 ? 0 : 0.5;
  const scoreB = 1 - scoreA;
  return { a: ratingA + ELO_K * (scoreA - expA), b: ratingB + ELO_K * (scoreB - expB) };
}
function pickInt(n) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % n;
}
async function oauthLogin(env, url, provider) {
  const p = PROVIDERS[provider];
  if (!p)
    return new Response("unknown provider", { status: 404 });
  const state = crypto.randomUUID();
  await env.KV.put("state:" + state, url.searchParams.get("redirect") || "", { expirationTtl: STATE_TTL });
  const a = new URL(p.authUrl);
  a.searchParams.set("client_id", p.clientId(env) || "");
  a.searchParams.set("redirect_uri", url.origin + "/auth/" + provider + "/callback");
  a.searchParams.set("scope", p.scope);
  a.searchParams.set("response_type", "code");
  a.searchParams.set("state", state);
  return Response.redirect(a.toString(), 302);
}
async function oauthCallback(env, url, provider) {
  const p = PROVIDERS[provider];
  if (!p)
    return new Response("unknown provider", { status: 404 });
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (!code || !state)
    return new Response("bad request", { status: 400 });
  const redirect = await env.KV.get("state:" + state);
  if (redirect === null)
    return new Response("state expired", { status: 400 });
  await env.KV.delete("state:" + state);
  const form = new URLSearchParams({
    client_id: p.clientId(env) || "",
    client_secret: p.clientSecret(env) || "",
    code,
    redirect_uri: url.origin + "/auth/" + provider + "/callback",
    grant_type: "authorization_code"
  });
  const tokRes = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const tok = await tokRes.json();
  if (!tok.access_token)
    return new Response("token failed", { status: 400 });
  const meRes = await fetch(p.userUrl, {
    headers: { "Authorization": "Bearer " + tok.access_token, "User-Agent": "fable-playground", "Accept": "application/json" }
  });
  const user = p.normalize(await meRes.json());
  if (!user.id || /:(undefined)?$/.test(user.id))
    return new Response("user failed", { status: 400 });
  const sid = crypto.randomUUID();
  await env.KV.put("sess:" + sid, JSON.stringify(user), { expirationTtl: SESSION_TTL });
  return new Response(null, {
    status: 302,
    headers: { "Location": safeRedirect(redirect, env), "Set-Cookie": sessionCookie(sid, SESSION_TTL) }
  });
}
async function logout(request, env, cors) {
  const sid = getCookie(request, "__session");
  if (sid)
    await env.KV.delete("sess:" + sid);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: Object.assign({ "Content-Type": "application/json", "Set-Cookie": sessionCookie("", 0) }, cors)
  });
}
async function currentUser(request, env) {
  const sid = getCookie(request, "__session");
  if (!sid)
    return null;
  const raw = await env.KV.get("sess:" + sid);
  return raw ? JSON.parse(raw) : null;
}
function publicUser(u) {
  return u ? { id: u.id, name: u.name, avatar: u.avatar } : null;
}
async function rateLimit(request, env, bucket) {
  const cfg = RATE_LIMITS[bucket] || RATE_LIMITS.write;
  const ipKey = await ipHash(request, env);
  const win = Math.floor(Date.now() / 1e3 / cfg.windowSec);
  const key = "rl:" + bucket + ":" + ipKey + ":" + win;
  const cur = parseInt(await env.KV.get(key) || "0", 10);
  if (cur >= cfg.max)
    return true;
  await env.KV.put(key, String(cur + 1), { expirationTtl: cfg.windowSec + 5 });
  return false;
}
async function ipHash(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  const salt = env && env.IP_SALT || "fable-dev";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + ip));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
}
function originAllowed(request, env) {
  return allowedOrigins(env).includes(request.headers.get("Origin") || "");
}
function safeRedirect(redirect, env) {
  const origins = allowedOrigins(env);
  try {
    const u = new URL(redirect);
    if (origins.some((o) => {
      try {
        return new URL(o).origin === u.origin;
      } catch (e) {
        return false;
      }
    }))
      return redirect;
  } catch (e) {
  }
  return origins[0] || "/";
}
function corsHeaders(origin, env) {
  const allowed = allowedOrigins(env);
  const h = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Credentials"] = "true";
  }
  return h;
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json" }, cors || {}) });
}
async function readJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}
function sessionCookie(sid, ttl) {
  const base = "__session=" + sid + "; Path=/; HttpOnly; Secure; SameSite=None";
  return ttl > 0 ? base + "; Max-Age=" + ttl : base + "; Max-Age=0";
}
function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? m[1] : null;
}
export {
  src_default as default
};
