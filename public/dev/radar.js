// radar.js — CRT 戦術レーダー画面(pure ESM・DOM非依存/呼び出し時のみcanvas使用)
// 契約: export function createRadar(canvas) -> { render(view, tSec) }
//   view = { mechs:[{x,y,h,hp,en,color,alive}], shots:[{x,y,tx,ty,kind,age01}],
//            blasts:[{x,y,age01,kind?:'hit'|'boom'|'parry',big?}],
//            obstacles:[{kind:'wall'|'mud'|'spike',x,y,r,alive,hpFrac}], sweep:tSec }
// blasts.kind が無い場合は big(bool)から互換的に 'hit'/'boom' を推定する。
// Math.random は使用しない。ゆらぎは hash(n) による決定論ハッシュのみ。

const SIM = 1000; // シム空間 0..1000m 四方
const SWEEP_PERIOD = 2; // 秒/周
const SWEEP_TRAIL = Math.PI * 0.55; // 残光の弧の長さ(rad)
const TRAIL_MAX_AGE = 1.4; // 航跡を保持する秒数

// 配色テーマ: view.theme が 'arena' の場合のみ緑燐光→アンバー燐光に切替(未指定/'training'は
// 従来と完全一致=下記 training の値は既存の色リテラルをそのまま移設したもの)。dim/bright は
// rgba() に展開する rgb 文字列。phosphor は自機/敵機の既定色(m.color 未指定時のみ使うフォールバック
// で、シーン側が渡す個別の機体色はここでは変えない=識別を守る)。
const THEMES = {
  training: { bg: '#020a06', phosphor: '#39ff88', dim: '57,255,136', bright: '190,255,220' },
  arena: { bg: '#0a0503', phosphor: '#ffb000', dim: '255,176,0', bright: '255,224,140' },
};
function themeOf(view) { return view && view.theme === 'arena' ? THEMES.arena : THEMES.training; }

function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sweepAngle(tSec) {
  return ((tSec % SWEEP_PERIOD) / SWEEP_PERIOD) * Math.PI * 2;
}

// 指定点がスイープに「直後に掃過された」度合い(0..1)を返す
function sweepGlow(px, py, cx, cy, tSec) {
  let pointAng = Math.atan2(py - cy, px - cx);
  if (pointAng < 0) pointAng += Math.PI * 2;
  const cur = sweepAngle(tSec);
  let diff = cur - pointAng;
  diff = ((diff % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (diff < SWEEP_TRAIL) return 1 - diff / SWEEP_TRAIL;
  return 0;
}

export function createRadar(canvas) {
  const ctx = canvas.getContext('2d');
  const trails = new Map(); // idx -> [{x,y,t}]
  let lastT = null;

  function fitBox(W, H) {
    const size = Math.min(W, H);
    const ox = (W - size) / 2;
    const oy = (H - size) / 2;
    const scale = size / SIM;
    const cx = ox + size / 2;
    const cy = oy + size / 2;
    return {
      ox, oy, size, scale, cx, cy,
      toX: (x) => ox + x * scale,
      toY: (y) => oy + y * scale,
    };
  }

  function updateTrails(view, tSec) {
    if (lastT !== null && tSec < lastT - 0.001) {
      trails.clear(); // 時刻が巻き戻った(シーク等)ら航跡をリセット
    }
    if (lastT === null || Math.abs(tSec - lastT) > 1e-6) {
      (view.mechs || []).forEach((m, i) => {
        let arr = trails.get(i);
        if (!arr) { arr = []; trails.set(i, arr); }
        arr.push({ x: m.x, y: m.y, t: tSec });
        while (arr.length && tSec - arr[0].t > TRAIL_MAX_AGE) arr.shift();
      });
      lastT = tSec;
    }
  }

  function drawGrid(box, theme) {
    ctx.save();
    ctx.strokeStyle = `rgba(${theme.dim},0.05)`;
    ctx.lineWidth = 1;
    for (let g = 0; g <= SIM; g += 100) {
      ctx.beginPath();
      ctx.moveTo(box.toX(g), box.oy);
      ctx.lineTo(box.toX(g), box.oy + box.size);
      ctx.moveTo(box.ox, box.toY(g));
      ctx.lineTo(box.ox + box.size, box.toY(g));
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${theme.dim},0.16)`;
    [250, 500].forEach((r) => {
      ctx.beginPath();
      ctx.arc(box.cx, box.cy, r * box.scale, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(box.ox, box.cy); ctx.lineTo(box.ox + box.size, box.cy);
    ctx.moveTo(box.cx, box.oy); ctx.lineTo(box.cx, box.oy + box.size);
    ctx.stroke();
    const R = box.size / 2;
    for (let deg = 0; deg < 360; deg += 30) {
      const a = (deg * Math.PI) / 180;
      const x1 = box.cx + Math.cos(a) * (R - 10), y1 = box.cy + Math.sin(a) * (R - 10);
      const x2 = box.cx + Math.cos(a) * R, y2 = box.cy + Math.sin(a) * R;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawSweep(box, tSec, theme) {
    const ang = sweepAngle(tSec);
    const steps = 40;
    ctx.save();
    for (let i = 0; i < steps; i++) {
      const f0 = i / steps, f1 = (i + 1) / steps;
      const a0 = ang - SWEEP_TRAIL * f0;
      const a1 = ang - SWEEP_TRAIL * f1;
      const alpha = 0.2 * (1 - f0);
      ctx.beginPath();
      ctx.moveTo(box.cx, box.cy);
      ctx.arc(box.cx, box.cy, box.size / 2, a0, a1, true);
      ctx.closePath();
      ctx.fillStyle = `rgba(${theme.dim},${alpha.toFixed(3)})`;
      ctx.fill();
    }
    ctx.strokeStyle = `rgba(${theme.bright},0.95)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(box.cx, box.cy);
    ctx.lineTo(box.cx + Math.cos(ang) * box.size / 2, box.cy + Math.sin(ang) * box.size / 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrail(box, idx, tSec, theme) {
    const arr = trails.get(idx);
    if (!arr || arr.length < 2) return;
    ctx.save();
    for (let i = 1; i < arr.length; i++) {
      const p0 = arr[i - 1], p1 = arr[i];
      const age = (tSec - p1.t) / TRAIL_MAX_AGE;
      const a = Math.max(0, 0.32 * (1 - age));
      if (a <= 0) continue;
      ctx.strokeStyle = `rgba(${theme.dim},${a.toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(box.toX(p0.x), box.toY(p0.y));
      ctx.lineTo(box.toX(p1.x), box.toY(p1.y));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMech(box, m, idx, tSec, theme) {
    const px = box.toX(m.x), py = box.toY(m.y);
    drawTrail(box, idx, tSec, theme);
    const color = m.color || theme.phosphor;

    if (m.alive === false) {
      const blink = Math.sin(tSec * 6 + hash(idx) * 6) > 0;
      ctx.save();
      ctx.globalAlpha = blink ? 0.85 : 0.25;
      ctx.strokeStyle = '#ff3b4a';
      ctx.lineWidth = 2;
      const s = 6;
      ctx.beginPath();
      ctx.moveTo(px - s, py - s); ctx.lineTo(px + s, py + s);
      ctx.moveTo(px + s, py - s); ctx.lineTo(px - s, py + s);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const glow = sweepGlow(px, py, box.cx, box.cy, tSec);
    const baseAlpha = 0.55 + glow * 0.45;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(m.h || 0);
    ctx.shadowColor = color;
    ctx.shadowBlur = 6 + glow * 6;
    ctx.globalAlpha = baseAlpha;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, 4);
    ctx.lineTo(-5, -4);
    ctx.closePath();
    if (idx === 0) {           // 自機=▲(塗りつぶし)
      ctx.fillStyle = color;
      ctx.fill();
    } else {                   // 敵機=△(中抜き)— 判別しやすく
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    ctx.restore();

    const hp = clamp01(m.hp == null ? 1 : m.hp);
    const bw = 14, bh = 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(px - bw / 2, py - 11, bw, bh);
    ctx.fillStyle = hp > 0.5 ? 'rgba(90,255,150,0.9)' : hp > 0.25 ? 'rgba(255,210,60,0.9)' : 'rgba(255,70,70,0.9)';
    ctx.fillRect(px - bw / 2, py - 11, bw * hp, bh);
    ctx.restore();
  }

  function drawObstacles(box, view) {
    (view.obstacles || []).forEach((o) => {
      const px = box.toX(o.x), py = box.toY(o.y);
      const pr = Math.max(1.5, o.r * box.scale);
      if (o.kind === 'wall') {
        const alive = o.alive !== false;
        ctx.save();
        if (alive) {
          ctx.strokeStyle = 'rgba(140,255,190,0.55)';
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.stroke();
          const hpFrac = o.hpFrac == null ? 1 : o.hpFrac;
          if (hpFrac < 1) {
            ctx.strokeStyle = 'rgba(255,120,90,0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(px, py, pr * 0.6, 0, Math.PI * 2); ctx.stroke();
          }
        } else {
          ctx.strokeStyle = 'rgba(120,160,140,0.3)';
          ctx.lineWidth = 1;
          const s = pr * 0.5;
          ctx.beginPath();
          ctx.moveTo(px - s, py - s); ctx.lineTo(px + s, py + s);
          ctx.moveTo(px + s, py - s); ctx.lineTo(px - s, py + s);
          ctx.stroke();
        }
        ctx.restore();
      } else if (o.kind === 'mud') {
        if (o.alive === false) return;
        ctx.save();
        ctx.fillStyle = 'rgba(90,70,40,0.35)';
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (o.kind === 'rubble') {
        // 踏破可能=止まらない地形。壁の実線リングと紛れないよう破線の等高線ひとつで表す。
        // 高い足場(h≥2=露出ペナルティが効く)だけ内側にもう一重=「乗ると晒される場所」。
        if (o.alive === false) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(190,205,150,0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.stroke();
        if ((o.h || 0) >= 2) { ctx.beginPath(); ctx.arc(px, py, pr * 0.55, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      } else if (o.kind === 'spike') {
        if (o.alive === false) return;
        ctx.save();
        ctx.fillStyle = 'rgba(200,255,220,0.55)';
        const n = 7;
        for (let i = 0; i < n; i++) {
          const hn = hash(i * 11.3 + o.x * 0.11 + o.y * 0.17);
          const ang = hn * Math.PI * 2;
          const rad = hash(hn * 3.3) * pr * 0.85;
          ctx.beginPath();
          ctx.arc(px + Math.cos(ang) * rad, py + Math.sin(ang) * rad, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    });
  }

  function shotPos(s, age) {
    return { x: lerp(s.x, s.tx, age), y: lerp(s.y, s.ty, age) };
  }

  function drawShot(box, s) {
    const age = clamp01(s.age01 == null ? 0 : s.age01);
    ctx.save();
    if (s.kind === 'beam') {
      const a = 1 - age;
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#eaffef';
        ctx.lineWidth = 2.4;
        ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(box.toX(s.x), box.toY(s.y)); ctx.lineTo(box.toX(s.tx), box.toY(s.ty)); ctx.stroke();
        ctx.globalAlpha = a * 0.45;
        ctx.lineWidth = 6;
        ctx.stroke();
      }
    } else if (s.kind === 'missile') {
      const p = shotPos(s, age);
      ctx.fillStyle = '#eaffef';
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.arc(box.toX(p.x), box.toY(p.y), 2.2, 0, Math.PI * 2); ctx.fill();
      for (let i = 1; i <= 5; i++) {
        const t = clamp01(age - i * 0.035);
        const tp = shotPos(s, t);
        ctx.globalAlpha = 0.3 * (1 - i / 5);
        ctx.beginPath(); ctx.arc(box.toX(tp.x), box.toY(tp.y), 1.6, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      const p1 = shotPos(s, age);
      const p0 = shotPos(s, clamp01(age - 0.08));
      ctx.globalAlpha = 0.9 * (1 - age * 0.3);
      ctx.strokeStyle = '#dfffef';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 5;
      ctx.beginPath(); ctx.moveTo(box.toX(p0.x), box.toY(p0.y)); ctx.lineTo(box.toX(p1.x), box.toY(p1.y)); ctx.stroke();
    }
    ctx.restore();
  }

  function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

  function drawBlast(box, b) {
    const age = clamp01(b.age01 == null ? 0 : b.age01);
    const px = box.toX(b.x), py = box.toY(b.y);
    const kind = b.kind || (b.big ? 'boom' : 'hit');
    if (kind === 'smoke') return; // 残骸の煙はレーダー画面では描かない
    if (kind === 'parry') {
      const ang0 = hash(b.x * 0.13 + b.y * 0.07) * Math.PI * 2;
      const arc = 0.9;
      const r = 10 + 22 * easeOutQuad(age);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age * 1.3);
      ctx.strokeStyle = '#eaffff';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(px, py, r, ang0 - arc / 2, ang0 + arc / 2); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = ang0 - arc / 2 + (i / 4) * arc;
        const sx = px + Math.cos(a) * r, sy = py + Math.sin(a) * r;
        ctx.globalAlpha = Math.max(0, 1 - age * 1.6);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      return;
    }
    const big = kind === 'boom';
    const maxR = (big ? 90 : 40) * box.scale;
    const r = maxR * easeOutQuad(age);
    ctx.save();
    ctx.globalAlpha = 0.5 * (1 - age);
    ctx.strokeStyle = '#baffd8';
    ctx.lineWidth = big ? 3 : 2;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
    const flashA = Math.max(0, 1 - age * 4);
    if (flashA > 0) {
      ctx.globalAlpha = flashA;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(px, py, (big ? 15 : 7) * (1 - age * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawScanlines(W, H) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.restore();
  }

  function drawVignette(W, H, theme) {
    ctx.save();
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createLinearGradient(0, 0, 0, H);
    g2.addColorStop(0, `rgba(${theme.dim},0.06)`);
    g2.addColorStop(0.5, `rgba(${theme.dim},0)`);
    g2.addColorStop(1, `rgba(${theme.dim},0.06)`);
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawTelemetry(W, H, tSec, view, theme) {
    const mechs = view.mechs || [];
    const aliveN = mechs.filter((m) => m.alive !== false).length;
    const critical = mechs.some((m) => m.alive !== false && (m.hp == null ? 0 : m.hp) < 0.3);
    const sig = critical ? 'DEGRADED' : 'NOMINAL';
    const scn = (tSec < 0 ? 0 : tSec).toFixed(1).padStart(5, '0');
    const text = `SCN ${scn}s / TRK ${aliveN} / SIG ${sig}`;
    ctx.save();
    ctx.font = `${Math.max(10, Math.round(H * 0.022))}px "Courier New", monospace`;
    ctx.fillStyle = `rgba(${theme.dim},0.85)`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(text, W * 0.02, H * 0.98);
    // 凡例(右下): ▲自機 / ▲敵機 を実機体色で
    if (mechs.length >= 2) {
      const fs = Math.max(10, Math.round(H * 0.022));
      ctx.textAlign = 'right';
      const labels = [[mechs[0].color || '#8fa3b0', '自機', true], [mechs[1].color || '#ff7860', '敵機', false]];
      let x = W * 0.98;
      for (let i = labels.length - 1; i >= 0; i--) {
        ctx.fillStyle = `rgba(${theme.dim},0.85)`;
        ctx.fillText(labels[i][1], x, H * 0.98);
        x -= ctx.measureText(labels[i][1]).width + fs * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, H * 0.98 - fs * 0.85); ctx.lineTo(x - fs * 0.45, H * 0.98 - fs * 0.05); ctx.lineTo(x + fs * 0.45, H * 0.98 - fs * 0.05);
        ctx.closePath();
        if (labels[i][2]) { ctx.fillStyle = labels[i][0]; ctx.fill(); }
        else { ctx.strokeStyle = labels[i][0]; ctx.lineWidth = 1.4; ctx.stroke(); }
        x -= fs * 1.2;
      }
    }
    ctx.restore();
  }

  function render(view, tSec) {
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    const box = fitBox(W, H);
    const t = tSec || 0;
    const theme = themeOf(view);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    drawGrid(box, theme);
    drawObstacles(box, view);
    drawSweep(box, t, theme);

    updateTrails(view, t);
    (view.mechs || []).forEach((m, i) => drawMech(box, m, i, t, theme));
    (view.shots || []).forEach((s) => drawShot(box, s));
    (view.blasts || []).forEach((b) => drawBlast(box, b));

    drawScanlines(W, H);
    drawVignette(W, H, theme);
    drawTelemetry(W, H, t, view, theme);
  }

  return { render };
}
