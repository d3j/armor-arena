/* =====================================================================
   FableShare — 作品共通の「画像付き X シェア」ヘルパー
   ---------------------------------------------------------------------
   どの作品からも `<script src="../lib/share.js"></script>` で読み込み、
   結果画面の共有ボタンから FableShare.share({...}) を呼ぶ。

   何をするか:
   - 結果のスナップショット画像(和紙風カード or 作品が描いた絵)を生成し、
   - スマホ等 (navigator.canShare files 対応) では「画像を直接添付した」
     ネイティブ共有シートを開く(X を選べば画像が貼られた投稿画面になる)、
   - PC では X の投稿画面(intent)を文言付きで開き、同時に画像を保存して
     「ドラッグ&ドロップで添付できます」とトーストで案内する。

   X の web intent は画像を直接添付できない(URL の OGP カードか手動添付のみ)。
   そのため「実画像を必ず手元に出す → 投稿画面を開く」の二段で
   "画像付きで投稿したくなる" 状態を作る。
   ===================================================================== */
(function () {
  'use strict';

  var X_INTENT = 'https://twitter.com/intent/tweet';

  /* ---- X 投稿画面 URL を組み立てる(文言 + URL) ---- */
  function buildIntent(text, url) {
    var u = X_INTENT + '?text=' + encodeURIComponent(text || '');
    if (url) u += '&url=' + encodeURIComponent(url);
    return u;
  }

  /* ---- スマホ等か(PC では X 投稿画面を直接開きたいので分ける) ---- */
  function isMobile() {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      return navigator.userAgentData.mobile;
    }
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
    // iPadOS は Mac を名乗るのでタッチ点数で判定
    return navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || '');
  }

  /* ---- files 付きネイティブ共有が使えるか(同期判定) ----
     PC でも canShare は true になりうるが、PC では OS 共有シートより
     「X の投稿画面を文言付きで開く」方が望ましいのでモバイルに限定する。 */
  function supportsFileShare() {
    if (!navigator.canShare || !navigator.share || !isMobile()) return false;
    try {
      var probe = new File([new Blob([''], { type: 'image/png' })], 'p.png', { type: 'image/png' });
      return navigator.canShare({ files: [probe] });
    } catch (e) {
      return false;
    }
  }

  /* ---- Blob をダウンロードさせる ---- */
  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'share.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
  }

  /* ---- 自前トースト(作品の CSS に依存しない) ---- */
  function toast(html, ms) {
    var t = document.createElement('div');
    t.innerHTML = html;
    t.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:28px', 'transform:translateX(-50%) translateY(12px)',
      'max-width:88vw', 'padding:12px 18px', 'border-radius:12px',
      'background:rgba(28,26,24,.92)', 'color:#f3ece0', 'font-size:14px',
      'line-height:1.5', 'letter-spacing:.02em', 'z-index:99999', 'opacity:0',
      'box-shadow:0 8px 30px rgba(0,0,0,.35)', 'text-align:center',
      'transition:opacity .3s ease, transform .3s ease',
      'font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif',
      'pointer-events:auto'
    ].join(';');
    document.body.appendChild(t);
    requestAnimationFrame(function () {
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(12px)';
      setTimeout(function () { t.remove(); }, 350);
    }, ms || 6000);
  }

  /* ---- canvas → Blob(Promise) ---- */
  function canvasToBlob(canvas) {
    return new Promise(function (resolve) {
      try {
        canvas.toBlob(function (b) { resolve(b); }, 'image/png');
      } catch (e) { resolve(null); }
    });
  }

  /* =====================================================================
     結果カードのレンダリング
     opts.card = {
       title,            // 作品名(例: '線香花火')
       stat,             // 大きく見せる記録(例: '8.4秒' / '12匹' / '3 − 1')
       statLabel,        // stat の上の小見出し(例: '看取った時間')
       sub,              // 称号・判定など(例: '名人' / '勝利')
       hashtag,          // 例: '#線香花火チャレンジ'
       url,              // フッターに薄く出す
       accent,           // アクセント色(seal / sub)。既定 朱
       bg,               // [上,下] グラデ色。既定 和紙
       ink,              // 文字色。既定 墨
       canvas,           // 任意。上部カバーに使う作品キャンバス
       grid,             // 任意(数独). {cells:[81], colors:{...}}
       seal              // 落款の文字。既定 title 先頭1〜2字
     }
     ===================================================================== */
  function renderCard(card) {
    var W = 1080, H = 1080;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');

    var bg = card.bg || ['#f3ece0', '#e4d8c3'];
    var ink = card.ink || '#23201c';
    var accent = card.accent || '#b3412b';
    var serif = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';

    /* 背景(和紙風グラデ + 軽い斑点) */
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save();
    for (var i = 0; i < 1400; i++) {
      var x = (i * 73 % W), y = ((i * 131 + i * i) % H);
      c.globalAlpha = 0.025 + (i % 5) * 0.006;
      c.fillStyle = i % 3 ? '#6b5e48' : '#cdbfa3';
      c.fillRect(x, y, 1.5, 1.5);
    }
    c.restore();

    var coverH = 0;

    /* 上部カバー: 作品キャンバスのスナップショット */
    if (card.canvas) {
      try {
        coverH = 560;
        var sc = card.canvas;
        var sw = sc.width, sh = sc.height;
        var scale = Math.max(W / sw, coverH / sh);
        var dw = sw * scale, dh = sh * scale;
        c.save();
        c.beginPath(); c.rect(0, 0, W, coverH); c.clip();
        c.drawImage(sc, (W - dw) / 2, (coverH - dh) / 2, dw, dh);
        /* 下端を和紙へフェード */
        var fg = c.createLinearGradient(0, coverH - 200, 0, coverH);
        fg.addColorStop(0, 'rgba(0,0,0,0)');
        fg.addColorStop(1, bg[1]);
        c.fillStyle = fg; c.fillRect(0, coverH - 200, W, 200);
        c.restore();
      } catch (e) { coverH = 0; }
    }

    /* 数独のミニ盤(coverH の帯に収まる正方形) */
    if (card.grid) {
      coverH = 560;
      var n = 9;
      var gsize = Math.min(coverH - 90, W - 360);
      var cell = gsize / n;
      var gx = (W - gsize) / 2;
      var gy = (coverH - gsize) / 2 + 20;
      var col = card.grid.colors || {};
      for (var k = 0; k < 81; k++) {
        var r = Math.floor(k / 9), q = k % 9;
        var v = card.grid.cells[k];
        c.fillStyle = (v === 'p') ? (col.p || '#b3412b')
          : (v === 'a') ? (col.a || '#2b2b2b')
          : (v === 'given') ? (col.given || '#9a8e76')
          : 'rgba(255,255,255,.4)';
        c.fillRect(gx + q * cell + 1, gy + r * cell + 1, cell - 2, cell - 2);
      }
      c.strokeStyle = 'rgba(40,36,30,.4)'; c.lineWidth = 2;
      for (var b = 0; b <= 9; b += 3) {
        c.beginPath(); c.moveTo(gx + b * cell, gy); c.lineTo(gx + b * cell, gy + gsize); c.stroke();
        c.beginPath(); c.moveTo(gx, gy + b * cell); c.lineTo(gx + gsize, gy + b * cell); c.stroke();
      }
    }

    /* 外枠 */
    c.strokeStyle = hexA(ink, 0.28); c.lineWidth = 1.5;
    c.strokeRect(40, 40, W - 80, H - 80);

    var textTop = coverH ? coverH + 20 : 250;

    /* 作品名 */
    c.fillStyle = ink;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.font = '500 52px ' + serif;
    c.fillText(card.title || '', 80, textTop + 60);

    /* statLabel(小見出し) */
    var midY = coverH ? 760 : 560;
    if (card.statLabel) {
      c.fillStyle = hexA(ink, 0.5);
      c.font = '400 26px ' + serif;
      c.textAlign = 'center';
      c.fillText(spaced(card.statLabel), W / 2, midY);
    }

    /* stat(主役) */
    if (card.stat) {
      c.fillStyle = ink;
      c.textAlign = 'center';
      var fs = card.stat.length > 8 ? 110 : card.stat.length > 5 ? 140 : 168;
      c.font = '600 ' + fs + 'px ' + serif;
      c.fillText(card.stat, W / 2, midY + (card.statLabel ? 130 : 110));
    }

    /* sub(称号・判定) */
    if (card.sub) {
      c.fillStyle = accent;
      c.textAlign = 'center';
      c.font = '500 44px ' + serif;
      c.fillText(card.sub, W / 2, midY + (card.statLabel ? 210 : 190));
    }

    /* 落款(朱の角印) */
    var sealTxt = card.seal || (card.title || '印').slice(0, 2);
    var sx = W - 96, sy = H - 200, ss = 86;
    c.save();
    c.globalAlpha = 0.9; c.fillStyle = accent;
    roundRect(c, sx - ss, sy, ss, ss, 8); c.fill();
    c.globalAlpha = 1; c.fillStyle = '#f3ece0';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '600 ' + (sealTxt.length > 1 ? 30 : 44) + 'px ' + serif;
    c.fillText(sealTxt, sx - ss / 2, sy + ss / 2 + 2);
    c.restore();

    /* フッター: ハッシュタグ(左) + URL(右) */
    c.textBaseline = 'alphabetic';
    c.fillStyle = hexA(ink, 0.6);
    c.font = '500 28px ' + serif;
    c.textAlign = 'left';
    if (card.hashtag) c.fillText(card.hashtag, 80, H - 80);
    c.fillStyle = hexA(ink, 0.45);
    c.font = '400 22px ' + serif;
    c.textAlign = 'left';
    c.fillText('d3j.github.io/armor-arena', 80, H - 48);

    return canvasToBlob(cv);
  }

  /* ---- 画像 Blob を作る(card / getBlob / canvas のいずれか) ---- */
  function makeBlob(opts) {
    if (opts.card) return renderCard(Object.assign({ url: opts.url }, opts.card));
    if (opts.getBlob) return Promise.resolve().then(opts.getBlob);
    if (opts.canvas) return canvasToBlob(opts.canvas);
    return Promise.resolve(null);
  }

  /* =====================================================================
     メイン: share(opts)
     opts = { text, url, title, fileName, card?|getBlob?|canvas? }
     ===================================================================== */
  function share(opts) {
    opts = opts || {};
    var text = opts.text || '';
    var url = opts.url || '';
    var title = opts.title || '';
    var fileName = opts.fileName || 'armor-arena.png';

    if (supportsFileShare()) {
      /* スマホ等: 画像を直接添付したネイティブ共有 */
      return makeBlob(opts).then(function (blob) {
        if (blob) {
          var file = new File([blob], fileName, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            return navigator.share({
              files: [file],
              text: text + (url ? '\n' + url : ''),
              title: title
            }).catch(function (e) {
              if (e && e.name === 'AbortError') return;
              return navigator.share({ text: text, url: url, title: title }).catch(function () {});
            });
          }
        }
        return navigator.share({ text: text, url: url, title: title }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          window.open(buildIntent(text, url), '_blank', 'noopener');
        });
      });
    }

    /* PC 等: 投稿画面を開くだけ(自動ダウンロードはしない=うざいので)。
       画像を付けたい人向けに「保存」リンクをトーストで提示(クリックしたときだけ保存)。
       本文に URL を含むので X 側の OGP カード画像は自動で表示される。 */
    var win = window.open(buildIntent(text, url), '_blank', 'noopener');
    return makeBlob(opts).then(function (blob) {
      if (blob) {
        var objUrl = URL.createObjectURL(blob);
        toast('X の投稿画面を開きました &middot; <a href="' + objUrl + '" download="' + fileName +
          '" style="color:#9cc7ff;text-decoration:underline">結果画像を保存</a>して添付もできます', 8000);
        setTimeout(function () { URL.revokeObjectURL(objUrl); }, 10000);
      } else if (!win) {
        toast('<a href="' + buildIntent(text, url) + '" target="_blank" rel="noopener" style="color:#9cc7ff;text-decoration:underline">X の投稿画面を開く</a>', 6000);
      }
    });
  }

  /* ---- 小物 ---- */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function spaced(s) { return s.split('').join(' '); }

  window.FableShare = { share: share, buildIntent: buildIntent, renderCard: renderCard };
})();
