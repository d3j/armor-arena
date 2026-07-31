// tex.js — プロシージャル質感ライブラリ(St4: 外装/地形の作り込み)
// 契約:
//   ・外部アセットゼロ。すべて canvas 2D + 決定論ノイズで生成し、シード固定=毎回同じ見た目。
//   ・生成物は「白ベース(明度中心)」を守る。機体パーツは material.color(=機体色)との乗算で
//     色が残るのが St3 からの掟(機体色の見分け=ゲーム上の情報)。
//   ・1クラス=3枚組(albedo / normal / roughness+metalness パック)。normal は同じ構造を描いた
//     高さ canvas から Sobel で起こす=柄と凹凸が必ず一致する。
//   ・すべて遅延生成+クラス単位キャッシュ(使われないクラスのテクスチャは作らない)。
//
// パック規約: ORM テクスチャは G=roughness / B=metalness(Three の roughnessMap/metalnessMap が
// 参照するチャンネルに合わせる)。R は未使用(aoMap は uv1 が要るため使わない)。

import * as THREE from './vendor/three.module.min.js';

// ==================== 決定論 RNG / タイル可能ノイズ ====================

function texRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);

// cells×cells の格子を巻き込み補間する値ノイズ(タイル継ぎ目なし)
function valueNoise(S, cells, seed) {
  const out = new Float32Array(S * S);
  const inv = cells / S;
  for (let y = 0; y < S; y++) {
    const fy = y * inv, iy = Math.floor(fy), ty = smooth(fy - iy);
    const y0 = ((iy % cells) + cells) % cells, y1 = (y0 + 1) % cells;
    for (let x = 0; x < S; x++) {
      const fx = x * inv, ix = Math.floor(fx), tx = smooth(fx - ix);
      const x0 = ((ix % cells) + cells) % cells, x1 = (x0 + 1) % cells;
      const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
      const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
      out[y * S + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }
  }
  return out;
}

// 多重ノイズ(0..1 正規化)。cells0 を倍々にして octaves 枚重ねる。
function fbmField(S, seed, cells0, octaves) {
  const out = new Float32Array(S * S);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(S, cells0 << o, seed + o * 9173);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

// ==================== canvas / テクスチャ変換 ====================

function mkCv(S) {
  const el = document.createElement('canvas');
  el.width = S; el.height = S;
  const c = el.getContext('2d', { willReadFrequently: true });
  return { el, c };
}

function fill(c, S, col) { c.fillStyle = col; c.fillRect(0, 0, S, S); }
// ORM の下地: G=roughness / B=metalness
function fillRM(c, S, rough, metal) {
  c.fillStyle = `rgb(0,${Math.round(clamp01(rough) * 255)},${Math.round(clamp01(metal) * 255)})`;
  c.fillRect(0, 0, S, S);
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rmCol = (rough, metal, a) =>
  `rgba(0,${Math.round(clamp01(rough) * 255)},${Math.round(clamp01(metal) * 255)},${a == null ? 1 : a})`;

// 場(0..1)を canvas へ乗算(lo..hi の倍率)。albedo のムラ付けに使う。
function mulField(c, S, f, lo, hi) {
  const img = c.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0, p = 0; i < f.length; i++, p += 4) {
    const k = lo + (hi - lo) * f[i];
    d[p] = clampByte(d[p] * k); d[p + 1] = clampByte(d[p + 1] * k); d[p + 2] = clampByte(d[p + 2] * k);
  }
  c.putImageData(img, 0, 0);
}
// 場を高さ canvas へ加算(amp は 0..255 の振幅)
function addField(c, S, f, amp) {
  const img = c.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0, p = 0; i < f.length; i++, p += 4) {
    const v = clampByte(d[p] + (f[i] - 0.5) * 2 * amp);
    d[p] = v; d[p + 1] = v; d[p + 2] = v;
  }
  c.putImageData(img, 0, 0);
}
function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

function toTex(el, { srgb = true, repeat = 1 } = {}) {
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  if (repeat !== 1) t.repeat.set(repeat, repeat);
  return t;
}

// 高さ canvas(グレースケール)→ 法線マップ。巻き込み差分=タイル継ぎ目なし。
function normalFromHeight(hc, S, strength) {
  const src = hc.getImageData(0, 0, S, S).data;
  const buf = new Uint8Array(S * S * 4);
  const at = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Sobel(3x3)で勾配
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const p = (y * S + x) * 4;
      buf[p] = clampByte((nx * 0.5 + 0.5) * 255);
      buf[p + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      buf[p + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      buf[p + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(buf, S, S, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// ==================== 共通の描き込み部品 ====================

// パネル分割(ジッタ格子)。albedo は溝の暗線、height は溝を掘る。
function panelGrid(A, H, S, rnd, { cells = 4, line = 'rgba(62,70,78,0.95)', w = 2.0, depth = 26 } = {}) {
  const xs = [], ys = [];
  for (let i = 0; i <= cells; i++) {
    const base = (i / cells) * S, edge = i === 0 || i === cells;
    xs.push(base + (edge ? 0 : (rnd() - 0.5) * S * 0.07));
    ys.push(base + (edge ? 0 : (rnd() - 0.5) * S * 0.07));
  }
  A.strokeStyle = line; A.lineWidth = w;
  H.strokeStyle = `rgb(${clampByte(128 - depth)},${clampByte(128 - depth)},${clampByte(128 - depth)})`;
  H.lineWidth = w + 1.2;
  for (const x of xs) {
    A.beginPath(); A.moveTo(x, 0); A.lineTo(x, S); A.stroke();
    H.beginPath(); H.moveTo(x, 0); H.lineTo(x, S); H.stroke();
  }
  for (const y of ys) {
    A.beginPath(); A.moveTo(0, y); A.lineTo(S, y); A.stroke();
    H.beginPath(); H.moveTo(0, y); H.lineTo(S, y); H.stroke();
  }
  // 溝の下側にハイライト(面取りの立ち上がり)=1px の明線で「板が重なっている」感
  A.strokeStyle = 'rgba(255,255,255,0.22)'; A.lineWidth = 1;
  for (const y of ys) { A.beginPath(); A.moveTo(0, y + w); A.lineTo(S, y + w); A.stroke(); }
  return { xs, ys };
}

// リベット/ボルト(albedo=暗点+ハイライト、height=盛り上げ、ORM=金属寄り)
function rivets(A, H, M, S, rnd, { n = 40, r = 1.8, rough = 0.4, metal = 0.7 } = {}) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S;
    A.fillStyle = 'rgba(96,104,110,0.9)';
    A.beginPath(); A.arc(x, y, r, 0, Math.PI * 2); A.fill();
    A.fillStyle = 'rgba(246,248,250,0.55)';
    A.beginPath(); A.arc(x - r * 0.35, y - r * 0.35, r * 0.45, 0, Math.PI * 2); A.fill();
    H.fillStyle = 'rgb(190,190,190)';
    H.beginPath(); H.arc(x, y, r, 0, Math.PI * 2); H.fill();
    M.fillStyle = rmCol(rough, metal);
    M.beginPath(); M.arc(x, y, r + 0.5, 0, Math.PI * 2); M.fill();
  }
}

// 擦り傷(塗装が薄れて素地が出る=明るく・金属度が上がる)
function scratches(A, M, S, rnd, { n = 28, len = 30, metal = 0.85, rough = 0.28 } = {}) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = len * (0.3 + rnd());
    const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
    A.strokeStyle = `rgba(238,241,244,${0.14 + rnd() * 0.24})`;
    A.lineWidth = 0.7 + rnd() * 1.5;
    A.beginPath(); A.moveTo(x, y); A.lineTo(x2, y2); A.stroke();
    M.strokeStyle = rmCol(rough, metal, 0.5);
    M.lineWidth = 1 + rnd() * 1.6;
    M.beginPath(); M.moveTo(x, y); M.lineTo(x2, y2); M.stroke();
  }
}

// 塗装剥げ: 中は「露出した素地」=明るく金属寄り、縁だけ薄い暗線(塗膜の断面)。
// 中を暗く塗ると泥汚れの丸い染みに見えてしまう(実機確認 2026-07-31)。明るくすると剥げに見える。
function chips(A, M, S, rnd, { n = 16, r = 5 } = {}) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S, rr = r * (0.4 + rnd());
    A.beginPath();
    for (let k = 0; k <= 7; k++) {
      const a = (k / 7) * Math.PI * 2, q = rr * (0.6 + rnd() * 0.7);
      const px = x + Math.cos(a) * q, py = y + Math.sin(a) * q;
      if (k === 0) A.moveTo(px, py); else A.lineTo(px, py);
    }
    A.closePath();
    A.fillStyle = `rgba(232,236,239,${0.2 + rnd() * 0.18})`; A.fill();
    A.strokeStyle = 'rgba(96,102,106,0.45)'; A.lineWidth = 1; A.stroke();
    M.fillStyle = rmCol(0.34, 0.85, 0.8);
    M.beginPath(); M.arc(x, y, rr, 0, Math.PI * 2); M.fill();
  }
}

// 垂れ汚れ(雨だれ/油の筋)。上から下へ細く伸びる暗い縦筋。
function streaks(A, S, rnd, { n = 14, col = 'rgba(52,50,46,' } = {}) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S, h = S * (0.1 + rnd() * 0.4);
    const g = A.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, col + (0.16 + rnd() * 0.18) + ')');
    g.addColorStop(1, col + '0)');
    A.fillStyle = g;
    A.fillRect(x, y, 0.8 + rnd() * 2.2, h);
  }
}

// ステンシル(工廠の識別記号。手続き生成の記号のみ=自由入力は一切出さない)
const STENCILS = ['07', 'AA3', '12', 'K-9', '04', 'MK2'];
function stencil(A, S, rnd, { alpha = 0.5 } = {}) {
  A.save();
  A.translate(rnd() * S, rnd() * S);
  A.rotate((rnd() - 0.5) * 0.5);
  A.fillStyle = `rgba(58,64,68,${alpha})`;
  A.font = `bold ${Math.round(S * 0.11)}px ui-monospace, Menlo, monospace`;
  A.textAlign = 'center'; A.textBaseline = 'middle';
  A.fillText(STENCILS[Math.floor(rnd() * STENCILS.length)], 0, 0);
  A.restore();
  // 三角の注意記号
  A.save();
  A.translate(rnd() * S, rnd() * S);
  A.strokeStyle = `rgba(60,66,70,${alpha * 0.8})`; A.lineWidth = S * 0.012;
  const q = S * 0.055;
  A.beginPath(); A.moveTo(0, -q); A.lineTo(q, q); A.lineTo(-q, q); A.closePath(); A.stroke();
  A.restore();
}

// 危険帯(黄黒の斜め縞)。弾薬系パーツの記号。
function hazardBand(A, H, S, y0, h, rnd) {
  A.save();
  A.beginPath(); A.rect(0, y0, S, h); A.clip();
  A.fillStyle = 'rgba(226,196,96,0.85)'; A.fillRect(0, y0, S, h);
  A.fillStyle = 'rgba(40,38,34,0.9)';
  const w = h * 0.62;
  for (let x = -h; x < S + h; x += w * 2) {
    A.beginPath(); A.moveTo(x, y0 + h); A.lineTo(x + w, y0 + h); A.lineTo(x + w + h, y0); A.lineTo(x + h, y0); A.closePath(); A.fill();
  }
  A.restore();
  H.fillStyle = 'rgb(142,142,142)'; H.fillRect(0, y0, S, 1.5);
  H.fillStyle = 'rgb(112,112,112)'; H.fillRect(0, y0 + h - 1.5, S, 1.5);
}

// ==================== パーツ質感クラス(painter 表) ====================
// spec: uv=1ワールド単位あたりのタイル数 / rough,metal=map が無い箇所の基準値 / nrm=法線の強さ
// paint(A,H,M,S,rnd): albedo / height / ORM の3枚を同じ構造で描く。

const PART_CLASSES = {
  // 塗装された装甲パネル(胴/頭/四肢の既定)
  panel: {
    uv: 0.7, rough: 0.55, metal: 0.35, nrm: 0.9, size: 256,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#d9dcde'); fill(H, S, '#808080'); fillRM(M, S, 0.55, 0.35);
      mulField(A, S, fbmField(S, 0x51E9, 3, 4), 0.84, 1.08);
      addField(H, S, fbmField(S, 0x51E9, 6, 3), 12);
      const grid = panelGrid(A, H, S, rnd, { cells: 3, depth: 30 });
      // 溝の際のウォッシュ(区画ごとに明度差=「別の板」に見せる)
      for (let i = 0; i < grid.xs.length - 1; i++) {
        for (let k = 0; k < grid.ys.length - 1; k++) {
          const v = (hash2(i, k, 0x5151) - 0.5) * 0.16;
          A.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(40,46,52,${-v})`;
          A.fillRect(grid.xs[i], grid.ys[k], grid.xs[i + 1] - grid.xs[i], grid.ys[k + 1] - grid.ys[k]);
        }
      }
      // 副区画(小さな点検パネル)
      for (let i = 0; i < 5; i++) {
        const w = S * (0.1 + rnd() * 0.14), h = S * (0.08 + rnd() * 0.12);
        const x = rnd() * (S - w), y = rnd() * (S - h);
        A.strokeStyle = 'rgba(74,82,88,0.8)'; A.lineWidth = 1.6;
        A.strokeRect(x, y, w, h);
        A.strokeStyle = 'rgba(255,255,255,0.2)'; A.lineWidth = 1;
        A.strokeRect(x + 1.6, y + 1.6, w, h);
        H.strokeStyle = 'rgb(96,96,96)'; H.lineWidth = 2.4;
        H.strokeRect(x, y, w, h);
      }
      rivets(A, H, M, S, rnd, { n: 40, r: 2.2 });
      chips(A, M, S, rnd, { n: 14, r: 5 });
      scratches(A, M, S, rnd, { n: 26, len: 26 });
      streaks(A, S, rnd, { n: 12 });
      // ステンシルは panel には入れない: 機体の大半のパーツがこの1枚を共有するので、
      // 文字が胴・腕・脚に同じ位置で何度も現れて「繰り返しの汚れ」に見える(実機確認 2026-07-31)。
      // 記号は弾薬ポッド(pod)だけに残す=そこにあるのが自然で、1機に1〜2枚しか出ない。
    },
  },
  // 増加装甲の厚板(重層装甲など)。板が厚く、ボルトが太い。
  plate: {
    uv: 0.55, rough: 0.62, metal: 0.42, nrm: 1.2, size: 256,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#d2d5d7'); fill(H, S, '#808080'); fillRM(M, S, 0.62, 0.42);
      mulField(A, S, fbmField(S, 0x77AB, 3, 4), 0.86, 1.06);
      addField(H, S, fbmField(S, 0x77AB, 5, 3), 16);
      panelGrid(A, H, S, rnd, { cells: 2, w: 2.6, depth: 46, line: 'rgba(64,70,76,0.9)' });
      // 溶接ビード(玉の連なり)
      for (let i = 0; i < 3; i++) {
        const y = rnd() * S, x0 = rnd() * S;
        for (let x = 0; x < S * 0.6; x += 4) {
          const px = (x0 + x) % S, py = y + Math.sin(x * 0.3) * 1.4;
          A.fillStyle = 'rgba(150,150,146,0.7)';
          A.beginPath(); A.arc(px, py, 2.2, 0, Math.PI * 2); A.fill();
          H.fillStyle = 'rgb(172,172,172)';
          H.beginPath(); H.arc(px, py, 2.4, 0, Math.PI * 2); H.fill();
        }
      }
      rivets(A, H, M, S, rnd, { n: 26, r: 3.2, rough: 0.45, metal: 0.75 });
      chips(A, M, S, rnd, { n: 20, r: 7 });
      scratches(A, M, S, rnd, { n: 34, len: 38 });
      streaks(A, S, rnd, { n: 16 });
    },
  },
  // 鋳鉄(安く重い。巣穴とバリ、鋳造の分割線)
  cast: {
    uv: 0.8, rough: 0.86, metal: 0.5, nrm: 1.5, size: 256,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#c9c7c4'); fill(H, S, '#808080'); fillRM(M, S, 0.86, 0.5);
      const f = fbmField(S, 0x1C0A, 8, 4);
      mulField(A, S, f, 0.78, 1.1); addField(H, S, f, 34);
      // 鋳巣(ピット)
      for (let i = 0; i < 300; i++) {
        const x = rnd() * S, y = rnd() * S, r = 0.8 + rnd() * 2.6;
        A.fillStyle = `rgba(88,84,80,${0.3 + rnd() * 0.4})`;
        A.beginPath(); A.arc(x, y, r, 0, Math.PI * 2); A.fill();
        H.fillStyle = 'rgb(84,84,84)';
        H.beginPath(); H.arc(x, y, r, 0, Math.PI * 2); H.fill();
      }
      // 鋳造の分割線(型合わせのバリ)
      const y0 = S * 0.5 + (rnd() - 0.5) * S * 0.2;
      A.strokeStyle = 'rgba(160,156,150,0.8)'; A.lineWidth = 2.4;
      A.beginPath(); A.moveTo(0, y0); A.lineTo(S, y0); A.stroke();
      H.strokeStyle = 'rgb(168,168,168)'; H.lineWidth = 3;
      H.beginPath(); H.moveTo(0, y0); H.lineTo(S, y0); H.stroke();
      streaks(A, S, rnd, { n: 20, col: 'rgba(96,58,34,' });   // 錆の垂れ
    },
  },
  // 繊維(織り。艶のあるクリア層)
  weave: {
    uv: 1.6, rough: 0.3, metal: 0.16, nrm: 0.8, size: 256,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#cfd3d6'); fill(H, S, '#808080'); fillRM(M, S, 0.3, 0.16);
      const n = 32, w = S / n;                       // 2/2 綾織(細かく=布に見える)
      for (let gy = 0; gy < n; gy++) {
        for (let gx = 0; gx < n; gx++) {
          const up = ((gx + gy) % 4) < 2;
          A.fillStyle = up ? 'rgba(255,255,255,0.34)' : 'rgba(88,96,104,0.34)';
          A.fillRect(gx * w, gy * w, w, w);
          const hv = up ? 176 : 92;
          H.fillStyle = `rgb(${hv},${hv},${hv})`;
          H.fillRect(gx * w, gy * w, w, w);
          // 糸のハイライト
          A.strokeStyle = up ? 'rgba(255,255,255,0.35)' : 'rgba(60,66,72,0.35)';
          A.lineWidth = 1;
          A.beginPath();
          if (up) { A.moveTo(gx * w, gy * w + w * 0.5); A.lineTo(gx * w + w, gy * w + w * 0.5); }
          else { A.moveTo(gx * w + w * 0.5, gy * w); A.lineTo(gx * w + w * 0.5, gy * w + w); }
          A.stroke();
        }
      }
      mulField(A, S, fbmField(S, 0x5EED, 3, 3), 0.94, 1.04);
      // クリア層のハイライト帯
      const g = A.createLinearGradient(0, 0, S, S);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.16)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      A.fillStyle = g; A.fillRect(0, 0, S, S);
      scratches(A, M, S, rnd, { n: 10, len: 20, metal: 0.3, rough: 0.2 });
    },
  },
  // 流体装甲(滑らかで艶がある。流路の筋)
  fluid: {
    uv: 0.5, rough: 0.16, metal: 0.28, nrm: 0.6, size: 256,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#dfe6ea'); fill(H, S, '#808080'); fillRM(M, S, 0.16, 0.28);
      mulField(A, S, fbmField(S, 0x0F1D, 2, 3), 0.94, 1.06);
      // 流路(横に流れる帯)
      for (let i = 0; i < 7; i++) {
        const y = (i / 7) * S + rnd() * 6;
        A.strokeStyle = 'rgba(150,196,216,0.5)'; A.lineWidth = 1.6 + rnd() * 2;
        H.strokeStyle = 'rgb(100,100,100)'; H.lineWidth = 3;
        A.beginPath(); H.beginPath();
        for (let x = 0; x <= S; x += S / 16) {
          const py = y + Math.sin((x / S) * Math.PI * 2 + i) * S * 0.035;
          if (x === 0) { A.moveTo(x, py); H.moveTo(x, py); } else { A.lineTo(x, py); H.lineTo(x, py); }
        }
        A.stroke(); H.stroke();
      }
      const g = A.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(180,210,230,0.18)');
      A.fillStyle = g; A.fillRect(0, 0, S, S);
    },
  },
  // 反応装甲ブロック(レンガ状+注意帯)
  era: {
    uv: 0.9, rough: 0.7, metal: 0.32, nrm: 1.3, size: 256,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#d0d3d5'); fill(H, S, '#808080'); fillRM(M, S, 0.7, 0.32);
      mulField(A, S, fbmField(S, 0x3E4A, 4, 3), 0.88, 1.06);
      const rows = 4, cols = 3, bh = S / rows, bw = S / cols;
      for (let r = 0; r < rows; r++) {
        for (let cc = 0; cc < cols; cc++) {
          const x = cc * bw + (r % 2 ? bw * 0.5 : 0), y = r * bh;
          A.strokeStyle = 'rgba(66,72,78,0.9)'; A.lineWidth = 2.4;
          A.strokeRect(x + 2, y + 2, bw - 4, bh - 4);
          A.strokeStyle = 'rgba(255,255,255,0.24)'; A.lineWidth = 1;
          A.strokeRect(x + 4, y + 4, bw - 8, bh - 8);
          H.fillStyle = 'rgb(168,168,168)'; H.fillRect(x + 3, y + 3, bw - 6, bh - 6);
          H.strokeStyle = 'rgb(72,72,72)'; H.lineWidth = 3;
          H.strokeRect(x + 2, y + 2, bw - 4, bh - 4);
        }
      }
      hazardBand(A, H, S, S * 0.46, S * 0.08, rnd);
      scratches(A, M, S, rnd, { n: 18, len: 22 });
    },
  },
  // 機関部の鋼(旋盤目・ナーリング・焼け)
  gunmetal: {
    uv: 1.5, rough: 0.34, metal: 0.78, nrm: 1.0, size: 256,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#c4c8cc'); fill(H, S, '#808080'); fillRM(M, S, 0.34, 0.78);
      mulField(A, S, fbmField(S, 0x9AB1, 4, 3), 0.9, 1.05);
      // 旋盤目(細い横線の連なり)
      for (let y = 0; y < S; y += 2) {
        const v = 0.06 + (y % 6 === 0 ? 0.12 : 0) + rnd() * 0.06;
        A.strokeStyle = `rgba(72,78,84,${v})`; A.lineWidth = 1;
        A.beginPath(); A.moveTo(0, y + 0.5); A.lineTo(S, y + 0.5); A.stroke();
        if (y % 6 === 0) {
          H.strokeStyle = 'rgb(112,112,112)'; H.lineWidth = 1;
          H.beginPath(); H.moveTo(0, y + 0.5); H.lineTo(S, y + 0.5); H.stroke();
        }
      }
      // ナーリング(滑り止めの網目)
      const kx = rnd() * S * 0.6, kw = S * (0.16 + rnd() * 0.14);
      A.save(); A.beginPath(); A.rect(kx, 0, kw, S); A.clip();
      for (let i = -S; i < S * 2; i += 5) {
        A.strokeStyle = 'rgba(66,72,78,0.45)'; A.lineWidth = 1.4;
        A.beginPath(); A.moveTo(i, 0); A.lineTo(i + S, S); A.stroke();
        A.beginPath(); A.moveTo(i, S); A.lineTo(i + S, 0); A.stroke();
      }
      A.restore();
      H.save(); H.beginPath(); H.rect(kx, 0, kw, S); H.clip();
      for (let i = -S; i < S * 2; i += 5) {
        H.strokeStyle = 'rgb(160,160,160)'; H.lineWidth = 1.4;
        H.beginPath(); H.moveTo(i, 0); H.lineTo(i + S, S); H.stroke();
        H.beginPath(); H.moveTo(i, S); H.lineTo(i + S, 0); H.stroke();
      }
      H.restore();
      // 発砲の焼け(青紫〜藁色の酸化)
      for (let i = 0; i < 3; i++) {
        const y = rnd() * S, h = S * (0.06 + rnd() * 0.1);
        const g = A.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, 'rgba(150,140,190,0.0)');
        g.addColorStop(0.5, `rgba(${140 + rnd() * 40 | 0},130,170,0.28)`);
        g.addColorStop(1, 'rgba(190,170,120,0.0)');
        A.fillStyle = g; A.fillRect(0, y, S, h);
      }
      scratches(A, M, S, rnd, { n: 16, len: 24, metal: 0.9, rough: 0.2 });
    },
  },
  // 刃(研磨目。鏡面寄り)
  blade: {
    uv: 1.1, rough: 0.14, metal: 0.92, nrm: 0.7, size: 256,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#e2e6e9'); fill(H, S, '#808080'); fillRM(M, S, 0.14, 0.92);
      // 研磨の縦目
      for (let x = 0; x < S; x++) {
        const v = 0.05 + rnd() * 0.22;
        A.strokeStyle = `rgba(104,118,130,${v})`; A.lineWidth = 1;
        A.beginPath(); A.moveTo(x + 0.5, 0); A.lineTo(x + 0.5, S); A.stroke();
      }
      // 刃文(焼き入れの境界)。1本の揺れた明線=刃物であることの記号
      A.strokeStyle = 'rgba(255,255,255,0.55)'; A.lineWidth = 2.4;
      A.beginPath();
      for (let y = 0; y <= S; y += S / 12) {
        const x = S * 0.36 + Math.sin(y / S * 7) * S * 0.04;
        if (y === 0) A.moveTo(x, y); else A.lineTo(x, y);
      }
      A.stroke();
      addField(H, S, fbmField(S, 0xB1AD, 16, 2), 6);
      // 刃先の焼き入れ帯(刃文)
      const g = A.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.34, 'rgba(255,255,255,0.05)');
      g.addColorStop(0.36, 'rgba(206,216,224,0.3)');
      g.addColorStop(1, 'rgba(140,152,162,0.16)');
      A.fillStyle = g; A.fillRect(0, 0, S, S);
      // 打ち傷(戦った刃)
      for (let i = 0; i < 8; i++) {
        const x = rnd() * S, y = rnd() * S;
        A.strokeStyle = 'rgba(92,100,108,0.5)'; A.lineWidth = 1 + rnd();
        A.beginPath(); A.moveTo(x, y); A.lineTo(x + (rnd() - 0.5) * 12, y + (rnd() - 0.5) * 26); A.stroke();
        H.fillStyle = 'rgb(108,108,108)';
        H.fillRect(x, y, 2, 4 + rnd() * 8);
      }
    },
  },
  // ドリル(螺旋の刃と焼き入れ)
  drill: {
    uv: 1.3, rough: 0.3, metal: 0.88, nrm: 1.4, size: 256,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#cdd2d6'); fill(H, S, '#808080'); fillRM(M, S, 0.3, 0.88);
      // 斜めの刃(螺旋)
      for (let i = -S; i < S * 2; i += S / 5) {
        A.strokeStyle = 'rgba(74,80,86,0.85)'; A.lineWidth = S * 0.035;
        A.beginPath(); A.moveTo(i, 0); A.lineTo(i + S * 0.55, S); A.stroke();
        A.strokeStyle = 'rgba(255,255,255,0.3)'; A.lineWidth = S * 0.012;
        A.beginPath(); A.moveTo(i + S * 0.03, 0); A.lineTo(i + S * 0.58, S); A.stroke();
        H.strokeStyle = 'rgb(58,58,58)'; H.lineWidth = S * 0.04;
        H.beginPath(); H.moveTo(i, 0); H.lineTo(i + S * 0.55, S); H.stroke();
        H.strokeStyle = 'rgb(196,196,196)'; H.lineWidth = S * 0.02;
        H.beginPath(); H.moveTo(i + S * 0.05, 0); H.lineTo(i + S * 0.6, S); H.stroke();
      }
      mulField(A, S, fbmField(S, 0xD811, 5, 3), 0.9, 1.08);
      scratches(A, M, S, rnd, { n: 22, len: 30, metal: 0.95, rough: 0.22 });
    },
  },
  // ゴム(履帯/車輪のラグ)
  rubber: {
    uv: 1.4, rough: 0.95, metal: 0.02, nrm: 1.8, size: 256,
    paint(A, H, M, S, rnd) {
      // 履板(トラックシュー)の柄: 横溝で段を切り、各段に山形(シェブロン)の溝を入れる。
      // 格子状のブロックだけだと「レンガ塀」に見えてしまう(実機確認 2026-07-31)。
      // 山形が入ると進行方向が読めて、走行部品だと一目で分かる。
      fill(A, S, '#b6b9bc'); fill(H, S, '#c8c8c8'); fillRM(M, S, 0.95, 0.02);
      const rows = 5, bh = S / rows;
      const groove = (c, col, lw) => {
        c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round';
        for (let r = 0; r < rows; r++) {
          const y = r * bh;
          c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke();                  // 段の境
          // 山形(左右から中央へ寄る2本)。上下段で向きを互い違いにして噛み合いを出す
          const dir = r % 2 ? 1 : -1;
          c.beginPath();
          c.moveTo(0, y + bh * (dir > 0 ? 0.78 : 0.26));
          c.lineTo(S * 0.5, y + bh * 0.52);
          c.lineTo(S, y + bh * (dir > 0 ? 0.78 : 0.26));
          c.stroke();
        }
        c.beginPath(); c.moveTo(S * 0.5, 0); c.lineTo(S * 0.5, S); c.stroke();        // 中央の縦溝
      };
      groove(A, 'rgba(24,26,28,0.92)', S * 0.05);
      groove(H, 'rgb(44,44,44)', S * 0.055);
      // 踏面の面取りハイライト(溝のすぐ下)
      A.strokeStyle = 'rgba(255,255,255,0.18)'; A.lineWidth = 1.6;
      for (let r = 0; r < rows; r++) {
        const y = r * bh + S * 0.028;
        A.beginPath(); A.moveTo(0, y); A.lineTo(S, y); A.stroke();
      }
      mulField(A, S, fbmField(S, 0x2B0B, 7, 3), 0.84, 1.08);
      // 泥の付着
      for (let i = 0; i < 40; i++) {
        A.fillStyle = `rgba(104,88,64,${0.1 + rnd() * 0.2})`;
        const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 12;
        A.beginPath(); A.ellipse(x, y, r, r * 0.6, rnd() * Math.PI, 0, Math.PI * 2); A.fill();
      }
    },
  },
  // 吸排気の格子(ルーバー+金網)
  grille: {
    uv: 1.8, rough: 0.55, metal: 0.62, nrm: 1.6, size: 128,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#9fa5ab'); fill(H, S, '#808080'); fillRM(M, S, 0.55, 0.62);
      const n = 7, sh = S / n;
      for (let i = 0; i < n; i++) {
        const y = i * sh;
        A.fillStyle = 'rgba(28,32,36,0.9)'; A.fillRect(0, y, S, sh * 0.48);       // 隙(奥の暗がり)
        A.fillStyle = 'rgba(226,230,234,0.75)'; A.fillRect(0, y + sh * 0.48, S, sh * 0.2);  // 羽根の縁
        H.fillStyle = 'rgb(44,44,44)'; H.fillRect(0, y, S, sh * 0.48);
        H.fillStyle = 'rgb(210,210,210)'; H.fillRect(0, y + sh * 0.48, S, sh * 0.34);
      }
      // 金網
      A.strokeStyle = 'rgba(60,66,72,0.35)'; A.lineWidth = 1;
      for (let x = 0; x < S; x += 5) { A.beginPath(); A.moveTo(x, 0); A.lineTo(x, S); A.stroke(); }
      mulField(A, S, fbmField(S, 0x6C1E, 4, 2), 0.86, 1.06);
    },
  },
  // 放熱面(すすと熱酸化。フィンの筋)
  thermal: {
    uv: 0.6, rough: 0.5, metal: 0.66, nrm: 1.1, size: 256,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#c6cacd'); fill(H, S, '#808080'); fillRM(M, S, 0.5, 0.66);
      // フィン(縦の畝)。ピッチが細かすぎると遠目に「布」に見えるので広く取る。
      for (let x = 0; x < S; x += 13) {
        A.fillStyle = 'rgba(66,72,78,0.55)'; A.fillRect(x, 0, 4, S);
        A.fillStyle = 'rgba(240,244,248,0.3)'; A.fillRect(x + 4, 0, 2, S);
        H.fillStyle = 'rgb(60,60,60)'; H.fillRect(x, 0, 4, S);
        H.fillStyle = 'rgb(198,198,198)'; H.fillRect(x + 4, 0, 6, S);
      }
      // 熱酸化の変色(藁→青紫)
      for (let i = 0; i < 5; i++) {
        const y = rnd() * S, h = S * (0.1 + rnd() * 0.25);
        const g = A.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, 'rgba(214,178,110,0.0)');
        g.addColorStop(0.35, 'rgba(214,178,110,0.3)');
        g.addColorStop(0.7, 'rgba(132,124,178,0.26)');
        g.addColorStop(1, 'rgba(132,124,178,0.0)');
        A.fillStyle = g; A.fillRect(0, y, S, h);
      }
      // すす(排気口まわりの黒)
      for (let i = 0; i < 34; i++) {
        A.fillStyle = `rgba(24,22,20,${0.05 + rnd() * 0.13})`;
        const x = rnd() * S, y = rnd() * S, r = 4 + rnd() * 13;
        A.beginPath(); A.ellipse(x, y, r, r * 0.7, rnd() * Math.PI, 0, Math.PI * 2); A.fill();
      }
      mulField(A, S, fbmField(S, 0x77E1, 5, 3), 0.88, 1.06);
    },
  },
  // 弾薬ポッド(危険帯+発射管の記号)
  pod: {
    uv: 0.8, rough: 0.58, metal: 0.36, nrm: 1.1, size: 256,
    paint(A, H, M, S, rnd) {
      fill(A, S, '#d1d4d7'); fill(H, S, '#808080'); fillRM(M, S, 0.58, 0.36);
      mulField(A, S, fbmField(S, 0x40D5, 3, 4), 0.88, 1.06);
      panelGrid(A, H, S, rnd, { cells: 3, depth: 24 });
      hazardBand(A, H, S, S * 0.68, S * 0.12, rnd);
      rivets(A, H, M, S, rnd, { n: 22, r: 2.1 });
      stencil(A, S, rnd, { alpha: 0.55 });
      scratches(A, M, S, rnd, { n: 18, len: 24 });
      streaks(A, S, rnd, { n: 10 });
    },
  },
};

// ---- パーツ名 → 質感クラス(接尾の side/index を落として前方一致) ----
// St3 の makePart 名を唯一の手掛かりにする(呼び出し300箇所に触らずクラス分けを効かせる)。
// 明示指定したいパーツだけ makePart の opts.mat で上書きできる(例: 肩=装甲id依存)。
const NAME_CLASS = [
  // 得物・機関部
  ['gun', 'gunmetal'], ['barrel', 'gunmetal'], ['muzzle', 'gunmetal'], ['rotor', 'gunmetal'],
  ['mag', 'gunmetal'], ['scope', 'gunmetal'], ['shroud', 'gunmetal'], ['brake', 'gunmetal'],
  ['ring', 'gunmetal'], ['gfin', 'gunmetal'], ['drum', 'gunmetal'], ['abox', 'gunmetal'],
  ['cap', 'gunmetal'], ['grip', 'gunmetal'], ['fuel', 'gunmetal'], ['rail', 'gunmetal'],
  ['blade', 'blade'], ['hilt', 'gunmetal'],
  ['drill', 'drill'],
  ['pod', 'pod'], ['tube', 'gunmetal'], ['rpRing', 'gunmetal'],
  // 走行系
  ['tread', 'rubber'], ['wheel', 'rubber'], ['roadw', 'rubber'],
  ['hub', 'gunmetal'], ['spoke', 'gunmetal'], ['axle', 'gunmetal'], ['piston', 'gunmetal'],
  ['antenna', 'gunmetal'],
  // 接地部(足裏は厚板+ボルト。地面を踏む部品が薄板に見えない)
  ['foot', 'plate'], ['toe', 'plate'], ['spur', 'plate'],
  // 動力・放熱
  ['fin', 'thermal'], ['backpack', 'thermal'], ['genTank', 'thermal'], ['genTurb', 'thermal'],
  ['genIntake', 'grille'], ['chestVent', 'grille'], ['chestSlit', 'grille'],
  // 増加装甲(装甲id別にパーツ名が分かれている=名前で質感が決まる)
  ['aSlab', 'cast'], ['aPad', 'weave'], ['aL', 'plate'], ['aEra', 'era'], ['aFluid', 'fluid'],
  // 厚板の意匠
  ['chestSlab', 'plate'], ['chestL', 'plate'], ['rivet', 'plate'],
];

export function partMatClass(part) {
  if (part.mat && PART_CLASSES[part.mat]) return part.mat;
  const n = part.name || '';
  for (const [pre, cls] of NAME_CLASS) if (n.startsWith(pre)) return cls;
  return 'panel';
}

const _partSets = new Map();
// クラスの3枚組+材質パラメータ。初回だけ生成しキャッシュ。
export function partMatSet(cls) {
  let s = _partSets.get(cls);
  if (s) return s;
  const spec = PART_CLASSES[cls] || PART_CLASSES.panel;
  const S = spec.size || 256;
  const A = mkCv(S), H = mkCv(S), M = mkCv(S);
  spec.paint(A.c, H.c, M.c, S, texRng(0x9E3779B9 ^ strSeed(cls)));
  s = {
    map: toTex(A.el, { srgb: true }),
    normalMap: normalFromHeight(H.c, S, spec.nrm * 3),
    ormMap: toTex(M.el, { srgb: false }),
    uv: spec.uv, rough: spec.rough, metal: spec.metal, nrm: spec.nrm,
  };
  _partSets.set(cls, s);
  return s;
}

function strSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

// ==================== 地形 ====================

// 地面。kind: 'dirt'(土)/'asphalt'(舗装)。テーマ配色を焼き込む(material.color は白のまま)。
export function groundMaps(theme, kind) {
  const S = 512;
  const A = mkCv(S), H = mkCv(S), M = mkCv(S);
  const rnd = texRng(kind === 'asphalt' ? 0xA5F4 : 0xB0A7E5);
  const g0 = theme.ground[0], g1 = theme.ground[1], g2 = theme.ground[2];
  if (kind === 'asphalt') {
    fill(A.c, S, g1); fill(H.c, S, '#808080'); fillRM(M.c, S, 0.82, 0.05);
    // 骨材(細かい石)
    for (let i = 0; i < 6000; i++) {
      const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * 1.8;
      const light = rnd() < 0.5;
      A.c.fillStyle = light ? `rgba(190,190,186,${0.1 + rnd() * 0.2})` : `rgba(20,20,22,${0.1 + rnd() * 0.25})`;
      A.c.beginPath(); A.c.arc(x, y, r, 0, Math.PI * 2); A.c.fill();
      const hv = light ? 168 : 96;
      H.c.fillStyle = `rgba(${hv},${hv},${hv},0.5)`;
      H.c.beginPath(); H.c.arc(x, y, r, 0, Math.PI * 2); H.c.fill();
    }
    // 補修パッチ(色の違う舗装)。輪郭を出すとタイルの繰り返しが矩形として見えるので、
    // 縁をぼかした薄い染みに留める(実機確認 2026-07-31)。
    for (let i = 0; i < 3; i++) {
      const w = S * (0.12 + rnd() * 0.2), h = S * (0.1 + rnd() * 0.16);
      const x = rnd() * S, y = rnd() * S;
      const g = A.c.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0.13)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      A.c.fillStyle = g; A.c.fillRect(x - w, y - h, w * 3, h * 3);
    }
    // ひび(枝分かれ)。albedo と height の両方に同じ折れ線を引く=陰影の出るひび。
    A.c.strokeStyle = 'rgba(0,0,0,0.4)';
    H.c.strokeStyle = 'rgb(96,96,96)';
    for (let i = 0; i < 40; i++) {
      A.c.lineWidth = 0.6 + rnd() * 1.4; H.c.lineWidth = A.c.lineWidth + 1;
      let x = rnd() * S, y = rnd() * S;
      A.c.beginPath(); A.c.moveTo(x, y);
      H.c.beginPath(); H.c.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 70;
        A.c.lineTo(x, y); H.c.lineTo(x, y);
      }
      A.c.stroke(); H.c.stroke();
    }
    mulField(A.c, S, fbmField(S, 0x77A1, 3, 4), 0.82, 1.14);
    addField(H.c, S, fbmField(S, 0x77A1, 8, 3), 16);
  } else {
    fill(A.c, S, g1); fill(H.c, S, '#808080'); fillRM(M.c, S, 0.95, 0.02);
    // ムラは「中周波・低コントラスト」に留める。低周波を強く入れるとタイルの繰り返しが
    // 水玉模様として一目で見えてしまう(タイル1枚=60ワールド単位で画面に何枚も並ぶため)。
    mulField(A.c, S, fbmField(S, 0x1122, 7, 4), 0.88, 1.1);
    // 土のまだら(小さめ・薄め=繰り返しが目立たない粒度)
    for (const [col2, n, a] of [[g0, 420, 0.34], [g2, 300, 0.3]]) {
      A.c.fillStyle = col2; A.c.globalAlpha = a;
      for (let i = 0; i < n; i++) {
        const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 11;
        A.c.beginPath(); A.c.ellipse(x, y, r, r * (0.4 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2); A.c.fill();
      }
    }
    A.c.globalAlpha = 1;
    // 礫(小石)。albedo は明点、height は盛り上げ。
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 2.4;
      A.c.fillStyle = `rgba(206,200,188,${0.08 + rnd() * 0.16})`;
      A.c.beginPath(); A.c.arc(x, y, r, 0, Math.PI * 2); A.c.fill();
      H.c.fillStyle = 'rgba(190,190,190,0.6)';
      H.c.beginPath(); H.c.arc(x, y, r, 0, Math.PI * 2); H.c.fill();
    }
    // 轍(車輪の跡)。色だけの汚れに留める(高さに入れると法線が横畝で埋まる)。
    for (let i = 0; i < 8; i++) {
      const y0 = rnd() * S;
      A.c.strokeStyle = 'rgba(0,0,0,0.13)'; A.c.lineWidth = 3 + rnd() * 5;
      A.c.beginPath();
      for (let x = 0; x <= S; x += S / 8) A.c.lineTo(x, y0 + Math.sin(x * 0.02 + i) * 12);
      A.c.stroke();
    }
    // 乾いたひび
    A.c.strokeStyle = 'rgba(0,0,0,0.3)';
    H.c.strokeStyle = 'rgb(118,118,118)';
    for (let i = 0; i < 30; i++) {
      A.c.lineWidth = 0.7 + rnd() * 1.5; H.c.lineWidth = A.c.lineWidth;
      let x = rnd() * S, y = rnd() * S;
      A.c.beginPath(); A.c.moveTo(x, y);
      H.c.beginPath(); H.c.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.5) * 66; y += (rnd() - 0.5) * 66;
        A.c.lineTo(x, y); H.c.lineTo(x, y);
      }
      A.c.stroke(); H.c.stroke();
    }
    addField(H.c, S, fbmField(S, 0x1122, 14, 3), 12);
  }
  return {
    map: toTex(A.el, { srgb: true }),
    normalMap: normalFromHeight(H.c, S, kind === 'asphalt' ? 1.4 : 1.5),
    ormMap: toTex(M.el, { srgb: false }),
  };
}

// 岩肌(節理+苔)。白ベース×頂点色の乗算で使う。
let _rockSet = null;
export function rockMaps() {
  if (_rockSet) return _rockSet;
  const S = 256;
  const A = mkCv(S), H = mkCv(S), M = mkCv(S);
  const rnd = texRng(0xA7C0DE);
  fill(A.c, S, '#d3cec6'); fill(H.c, S, '#808080'); fillRM(M.c, S, 0.94, 0.02);
  const f = fbmField(S, 0xC0DE, 5, 5);
  mulField(A.c, S, f, 0.7, 1.16); addField(H.c, S, f, 46);
  for (let i = 0; i < 420; i++) {
    const v = 170 + Math.floor(rnd() * 62);
    A.c.fillStyle = `rgba(${v},${v - 5},${v - 12},0.45)`;
    const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 13;
    A.c.beginPath(); A.c.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2); A.c.fill();
  }
  // 節理(割れ目)。height も深く掘る=陰影が出る。
  for (let i = 0; i < 52; i++) {
    const lw = 0.5 + rnd() * 1.3;
    let x = rnd() * S, y = rnd() * S;
    A.c.strokeStyle = 'rgba(58,54,48,0.42)'; A.c.lineWidth = lw;
    H.c.strokeStyle = 'rgb(58,58,58)'; H.c.lineWidth = lw + 1;
    A.c.beginPath(); H.c.beginPath();
    A.c.moveTo(x, y); H.c.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (rnd() - 0.5) * 74; y += (rnd() - 0.5) * 74;
      A.c.lineTo(x, y); H.c.lineTo(x, y);
    }
    A.c.stroke(); H.c.stroke();
  }
  // 苔(北面の緑)
  for (let i = 0; i < 60; i++) {
    A.c.fillStyle = `rgba(96,116,72,${0.06 + rnd() * 0.16})`;
    const x = rnd() * S, y = rnd() * S, r = 5 + rnd() * 20;
    A.c.beginPath(); A.c.ellipse(x, y, r, r * 0.7, rnd() * Math.PI, 0, Math.PI * 2); A.c.fill();
  }
  _rockSet = {
    map: toTex(A.el, { srgb: true }),
    normalMap: normalFromHeight(H.c, S, 3.6),
    ormMap: toTex(M.el, { srgb: false }),
  };
  return _rockSet;
}

// コンクリ(細目)。縁石・支柱・屋上設備・瓦礫塊など「小さな部品」用。
// 岩肌(rockMaps)は 1タイル=10ワールド単位の粗い節理なので、高さ1単位の縁石に貼ると
// 節理が9倍に拡大されて巨大なジグザグ模様になる(実機確認 2026-07-31)。小物は必ずこちらを使う。
let _concreteSet = null;
export function concreteMaps() {
  if (_concreteSet) return _concreteSet;
  const S = 256;
  const A = mkCv(S), H = mkCv(S), M = mkCv(S);
  const rnd = texRng(0xC0C7E7);
  fill(A.c, S, '#cbc8c2'); fill(H.c, S, '#808080'); fillRM(M.c, S, 0.92, 0.03);
  mulField(A.c, S, fbmField(S, 0xC001, 6, 4), 0.86, 1.1);
  addField(H.c, S, fbmField(S, 0xC001, 12, 3), 12);
  // 骨材(細かい砂利が表面に浮く)
  for (let i = 0; i < 1200; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.7 + rnd() * 1.8;
    const light = rnd() < 0.55;
    A.c.fillStyle = light ? `rgba(238,235,228,${0.1 + rnd() * 0.2})` : `rgba(112,108,102,${0.1 + rnd() * 0.22})`;
    A.c.beginPath(); A.c.arc(x, y, r, 0, Math.PI * 2); A.c.fill();
    H.c.fillStyle = light ? 'rgba(178,178,178,0.5)' : 'rgba(96,96,96,0.5)';
    H.c.beginPath(); H.c.arc(x, y, r, 0, Math.PI * 2); H.c.fill();
  }
  // 型枠の継ぎ目(打ち継ぎ線)と欠け
  for (let i = 0; i < 4; i++) {
    const y = rnd() * S;
    A.c.strokeStyle = 'rgba(96,92,86,0.5)'; A.c.lineWidth = 1.4;
    A.c.beginPath(); A.c.moveTo(0, y); A.c.lineTo(S, y); A.c.stroke();
    H.c.strokeStyle = 'rgb(104,104,104)'; H.c.lineWidth = 2;
    H.c.beginPath(); H.c.moveTo(0, y); H.c.lineTo(S, y); H.c.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 5;
    A.c.fillStyle = 'rgba(90,86,80,0.4)';
    A.c.beginPath(); A.c.arc(x, y, r, 0, Math.PI * 2); A.c.fill();
    H.c.fillStyle = 'rgb(92,92,92)';
    H.c.beginPath(); H.c.arc(x, y, r, 0, Math.PI * 2); H.c.fill();
  }
  streaks(A.c, S, rnd, { n: 18, col: 'rgba(58,56,52,' });
  _concreteSet = {
    map: toTex(A.el, { srgb: true }),
    normalMap: normalFromHeight(H.c, S, 2.0),
    ormMap: toTex(M.el, { srgb: false }),
  };
  return _concreteSet;
}

// ビル外壁(プレキャストのコンクリ+窓の格子)。窓は emissiveMap 側で光らせる。
const _bldSets = new Map();
export function buildingMaps(variant) {
  let s = _bldSets.get(variant);
  if (s) return s;
  const S = 256;
  const A = mkCv(S), H = mkCv(S), M = mkCv(S), E = mkCv(S);
  const rnd = texRng(0x8172 + variant * 7919);
  fill(A.c, S, '#cfccc6'); fill(H.c, S, '#808080'); fillRM(M.c, S, 0.9, 0.05);
  fill(E.c, S, '#000000');
  mulField(A.c, S, fbmField(S, 0x5150 + variant, 3, 4), 0.8, 1.12);
  // 階層(床スラブの水平線)と窓の格子
  const floors = 4, cols = 4;
  const fh = S / floors, cw = S / cols;
  for (let fy = 0; fy < floors; fy++) {
    // 床スラブの帯
    A.c.fillStyle = 'rgba(150,146,140,0.5)';
    A.c.fillRect(0, fy * fh, S, fh * 0.16);
    H.c.fillStyle = 'rgb(176,176,176)';
    H.c.fillRect(0, fy * fh, S, fh * 0.16);
    for (let cx = 0; cx < cols; cx++) {
      const wx = cx * cw + cw * 0.16, wy = fy * fh + fh * 0.28;
      const ww = cw * 0.68, wh = fh * 0.5;
      // 窓(奥まった暗いガラス)
      A.c.fillStyle = 'rgba(28,34,40,0.92)';
      A.c.fillRect(wx, wy, ww, wh);
      H.c.fillStyle = 'rgb(62,62,62)';
      H.c.fillRect(wx, wy, ww, wh);
      M.c.fillStyle = rmCol(0.14, 0.2);
      M.c.fillRect(wx, wy, ww, wh);
      // 桟
      A.c.strokeStyle = 'rgba(196,192,186,0.6)'; A.c.lineWidth = 1.4;
      A.c.strokeRect(wx, wy, ww, wh);
      A.c.beginPath(); A.c.moveTo(wx + ww / 2, wy); A.c.lineTo(wx + ww / 2, wy + wh); A.c.stroke();
      // 点灯(決定論。variant で灯る部屋が変わる)
      const lit = hash2(cx, fy, 0x1000 + variant) ;
      if (lit > 0.55) {
        const warm = lit > 0.85 ? '#ffd9a0' : lit > 0.7 ? '#cfe4ff' : '#ffb86a';
        E.c.fillStyle = warm; E.c.globalAlpha = 0.5 + (lit - 0.55) * 1.1;
        E.c.fillRect(wx, wy, ww, wh);
        E.c.globalAlpha = 1;
        // 割れた窓は一部だけ光る
        if (lit > 0.93) { E.c.fillStyle = '#000'; E.c.fillRect(wx, wy + wh * 0.45, ww, wh * 0.55); }
      }
    }
  }
  // コンクリの汚れ(雨だれ)+被弾痕
  streaks(A.c, S, rnd, { n: 26, col: 'rgba(48,46,42,' });
  for (let i = 0; i < 10; i++) {
    const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 9;
    A.c.fillStyle = 'rgba(30,28,26,0.55)';
    A.c.beginPath(); A.c.arc(x, y, r, 0, Math.PI * 2); A.c.fill();
    H.c.fillStyle = 'rgb(70,70,70)';
    H.c.beginPath(); H.c.arc(x, y, r, 0, Math.PI * 2); H.c.fill();
  }
  s = {
    map: toTex(A.el, { srgb: true }),
    normalMap: normalFromHeight(H.c, S, 2.6),
    ormMap: toTex(M.el, { srgb: false }),
    emissiveMap: toTex(E.el, { srgb: true }),
  };
  _bldSets.set(variant, s);
  return s;
}

// ==================== 環境マップ(金属の映り込み) ====================
// テーマの空配色+太陽+地面を equirect の canvas に描き、PMREM でぼかして environment にする。
// これが無いと metalness を上げた面が黒く潰れる(St3 が metalness を 0.12 に抑えていた理由)。
export function envEquirect(theme) {
  const W = 512, Hh = 256;
  const el = document.createElement('canvas');
  el.width = W; el.height = Hh;
  const c = el.getContext('2d');
  // 上=空頂 → 下=地面。sky[0..3] は「空頂→地平」の順。
  const g = c.createLinearGradient(0, 0, 0, Hh);
  g.addColorStop(0, theme.sky[0]);
  g.addColorStop(0.3, theme.sky[1]);
  g.addColorStop(0.44, theme.sky[2]);
  g.addColorStop(0.5, theme.sky[3]);
  g.addColorStop(0.52, theme.ground[0]);
  g.addColorStop(1, theme.ground[2]);
  c.fillStyle = g; c.fillRect(0, 0, W, Hh);
  // 太陽(斜め上。r3d-three の sun 方向とおおよそ合わせる)
  const sx = W * 0.62, sy = Hh * 0.22;
  const sg = c.createRadialGradient(sx, sy, 0, sx, sy, Hh * 0.5);
  sg.addColorStop(0, 'rgba(255,246,225,0.95)');
  sg.addColorStop(0.12, 'rgba(255,232,190,0.55)');
  sg.addColorStop(1, 'rgba(255,220,170,0)');
  c.fillStyle = sg; c.fillRect(0, 0, W, Hh);
  // 地平の霞
  const hg = c.createLinearGradient(0, Hh * 0.44, 0, Hh * 0.58);
  hg.addColorStop(0, 'rgba(255,255,255,0)');
  hg.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = hg; c.fillRect(0, Hh * 0.44, W, Hh * 0.14);
  const t = new THREE.CanvasTexture(el);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
