/* =====================================================================
   鋼機工廠(kouki) — ui.js
   ---------------------------------------------------------------------
   pure ESM。import 時点では DOM に一切触れない。createUI(root, hooks) が
   呼ばれて初めて root 以下に画面一式を構築する。
   画面遷移は data-screen 属性を持つ要素の hidden 切替 + フェード。
   ===================================================================== */

/* ---- 小さな DOM ビルダ ---- */
function h(tag, props, kids) {
  var e = document.createElement(tag);
  if (props) {
    for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      var v = props[k];
      if (v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'dataset') { for (var dk in v) e.dataset[dk] = v[dk]; }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in e) { try { e[k] = v; } catch (err) { e.setAttribute(k, v); } }
      else e.setAttribute(k, v);
    }
  }
  (kids || []).forEach(function (c) {
    if (c == null || c === false) return;
    e.appendChild((typeof c === 'string' || typeof c === 'number') ? document.createTextNode(String(c)) : c);
  });
  return e;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
function mount(el, kids) { clear(el); (kids || []).forEach(function (c) { if (c) el.appendChild(c); }); return el; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function pct(v, max) { return clamp((max > 0 ? (v / max) : 0) * 100, 0, 100); }

/* ---- パーツカテゴリ定義(hangar タブ) ---- */
var CATS = [
  { key: 'frame', label: '躯体', partKey: 'frame' },
  { key: 'legs', label: '脚部', partKey: 'legs' },
  { key: 'gen', label: '動力炉', partKey: 'gen' },
  { key: 'armor', label: '装甲', partKey: 'armor' },
  { key: 'wpnR', label: '右腕', partKey: 'wpn' },
  { key: 'wpnL', label: '左腕', partKey: 'wpn' },
  { key: 'ai', label: '戦術OS', partKey: 'ai' }
];
var COLOR_PRESETS = ['#8fb3c7', '#c78f8f', '#8fc79a', '#c7b38f', '#a98fc7', '#c78fb3', '#6b7280', '#d7d7d7'];
var RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S'];
var DEX_CATS = [
  { partKey: 'frame', label: '躯体' },
  { partKey: 'legs', label: '脚部' },
  { partKey: 'gen', label: '動力炉' },
  { partKey: 'armor', label: '装甲' },
  { partKey: 'wpn', label: '武装' },
  { partKey: 'ai', label: '戦術OS' }
];
var DEFAULT_MAX = { hp: 1200, speed: 120, evasion: 60, defense: 0.45, enOut: 40 };

function calcGrade(stats, maxRef) {
  if (!stats || !stats.valid) return '—';
  var mx = maxRef || DEFAULT_MAX;
  var score = (stats.hp / mx.hp) + (stats.speed / mx.speed) + (stats.evasion * 100 / mx.evasion) +
    (stats.defense / mx.defense) + (stats.enOut / mx.enOut);
  score = score / 5;
  if (score >= 1.15) return 'S';
  if (score >= 0.95) return 'A';
  if (score >= 0.75) return 'B';
  if (score >= 0.55) return 'C';
  return 'D';
}
function fmtDuration(sec) {
  sec = Math.max(0, Number(sec) || 0);
  var m = Math.floor(sec / 60), s = sec - m * 60;
  if (m > 0) return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  return s.toFixed(1) + 's';
}
/* ---- 墓場: 没日 YYYYMMDD → YYYY.MM.DD 表示(それ以外の形式はそのまま) ---- */
function fmtKiaDate(kia) {
  if (!kia) return '';
  var s = String(kia);
  if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '.' + s.slice(4, 6) + '.' + s.slice(6, 8);
  return s;
}
/* ---- 武器の交戦帯域チップ(Ver4: part.band。無ければ非表示=後方互換) ---- */
var BAND_LABELS = { melee: '白兵', short: '短距離', mid: '中距離', long: '遠距離' };
function bandChip(band) {
  if (!band || !BAND_LABELS[band]) return null;
  return h('span', { class: 'band-chip band-' + band }, [BAND_LABELS[band]]);
}
function partStatPairs(catKey, part) {
  if (!part) return [];
  switch (catKey) {
    case 'frame': return [['HP', part.hp], ['積載', part.capacity]];
    case 'legs': return [['種別', part.kind], ['速度', part.speed], ['旋回', part.turn], ['回避', Math.round(part.evasion * 100) + '%'], ['EN消費', part.drain]];
    case 'gen': return [['出力', part.output + '/s'], ['ENタンク', part.cap]];
    case 'armor': return [['軽減', Math.round((part.defense || 0) * 100) + '%'], ['回避補正', '-' + (part.evaPenalty || 0)]];
    case 'wpnR': case 'wpnL': return [['種別', part.kind], ['威力', part.dmg], ['射程', part.range + 'm'], ['命中', part.acc + '%'], ['CT', part.cooldown + 's']];
    case 'ai': return [['交戦距離', part.engage + 'm'], ['攻撃性', Math.round((part.aggression || 0) * 100) + '%'], ['離脱', part.kite]];
    default: return [];
  }
}

/* ---- battle: 実況ログ行ビルダ(export) ---- */
export function makeLogLine(role, roleLabel, color, text) {
  var isSys = role === 'sys';
  var kids = [];
  if (roleLabel) {
    kids.push(h('span', {
      class: 'chip' + (isSys ? ' sys' : ''),
      style: color ? ('border-color:' + color + ';color:' + color) : null
    }, [roleLabel]));
  }
  kids.push(h('span', { class: 'txt' + (isSys ? ' sys' : '') }, [text]));
  return h('div', { class: 'line role-' + role }, kids);
}

/* ---- battle: 実況ログ フィルタ定義(Ver5: 実況席+無線を「音声」に統合) ---- */
var LOG_FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'voice', label: '音声' },
  { key: 'sys', label: '管制' }
];

/* ---- 結果シェアボタン(export不要・showResult/showAftermath 共通実装。../lib/share.js の window.FableShare を利用) ---- */
function shareBtnEl(shareData, label) {
  var btn = h('button', { class: 'primary' }, [label || '📤 結果をシェア']);
  btn.addEventListener('click', function () {
    if (window.FableShare && shareData) window.FableShare.share(shareData);
  });
  return btn;
}
/* ---- リプレイURLコピー(showResult/showAftermath 共通。URLが無い試合=降参などは出さない) ---- */
function replayBtnEl(url) {
  if (!url) return null;
  var LABEL = '📼 リプレイURLをコピー';
  var btn = h('button', {}, [LABEL]);
  btn.addEventListener('click', function () {
    var done = function () {
      btn.textContent = '✓ コピーしました(貼るだけで同じ試合が再生されます)';
      setTimeout(function () { btn.textContent = LABEL; }, 2400);
    };
    var fallback = function () { window.prompt('このURLをコピーしてください', url); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else fallback();
  });
  return btn;
}
/* ---- 戦果見出しの色分類(WIN=緑/LOSE=赤/DRAW=グレー/SURRENDER=琥珀。winTxt文字列で判定) ---- */
function aftermathCls(winTxt) {
  var t = String(winTxt || '').toUpperCase();
  if (t === 'WIN') return 'win';
  if (t === 'LOSE') return 'lose';
  if (t === 'SURRENDER') return 'surrender';
  return 'draw';
}

export function createUI(root, hooks) {
  hooks = hooks || {};
  clear(root);

  var state = { user: null, hangarTab: 'frame', lastHangar: null, lastCampaign: null, sortieField: null };
  var els = { screens: {} };

  /* ===================== title ===================== */
  var loginArea = h('div', { class: 'user-area' });
  var creditsAmountText = h('span', { class: 'credits-amount' }, ['所持クレジット: 0 C']);
  var medalsText = h('span', { class: 'medals-amount' }, ['🎖 0']);
  var creditsLine = h('div', { class: 'credits-line' }, [creditsAmountText, medalsText]);

  /* ---- パイロットロースター(タイトル。Ver5: 3人ロスター+墓場リンク。名前変更UIは廃止) ---- */
  var pilotRosterEl = h('div', { class: 'pilot-roster' });
  var graveLink = h('button', { class: 'small ghost grave-link' }, ['⚰ 墓場(0)']);
  graveLink.addEventListener('click', function () { hooks.onShowGrave && hooks.onShowGrave(); });

  function renderPilotSlot(p, idx) {
    if (!p) {
      var regInput = h('input', { type: 'text', maxlength: 12, class: 'pilot-name-input', placeholder: 'パイロット名' });
      var regBtn = h('button', { class: 'small primary' }, ['+ 登録']);
      function doRegister() {
        var v = (regInput.value || '').trim().slice(0, 12);
        if (!v) { regInput.focus(); return; }
        hooks.onRegisterPilot && hooks.onRegisterPilot(v, idx);
      }
      regBtn.addEventListener('click', doRegister);
      regInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegister(); });
      return h('div', { class: 'pilot-slot empty' }, [
        h('div', { class: 'pilot-slot-empty-label' }, ['— 空き枠 —']),
        h('div', { class: 'pilot-slot-register' }, [regInput, regBtn])
      ]);
    }
    var injured = (p.injury || 0) > 0;
    var fireBtn = h('button', { class: 'small ghost pilot-fire-btn' }, ['解雇']);
    fireBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      hooks.onFirePilot && hooks.onFirePilot(idx);
    });
    var slotEl = h('div', { class: 'pilot-slot' + (p.active ? ' active' : '') }, [
      h('div', { class: 'pilot-slot-row1' }, [
        p.active ? h('span', { class: 'pilot-active-mark' }, ['▶']) : null,
        h('span', { class: 'pilot-name' }, [p.name || 'PILOT']),
        h('span', { class: 'pilot-level' }, ['Lv' + (p.level || 1)])
      ]),
      h('div', { class: 'pilot-slot-row2' }, [
        h('span', { class: 'pilot-honor' }, ['名誉 ' + (p.honor || 0)]),
        h('span', { class: 'pilot-status' + (injured ? ' injury' : ' ok') }, [injured ? ('負傷(残' + p.injury + '戦)') : '健在'])
      ]),
      h('div', { class: 'pilot-slot-row3' }, [fireBtn])
    ]);
    slotEl.addEventListener('click', function () { hooks.onSelectPilot && hooks.onSelectPilot(idx); });
    return slotEl;
  }
  function renderPilotRoster(pilots) {
    pilots = pilots || [];
    var slots = [];
    for (var i = 0; i < 3; i++) slots.push(renderPilotSlot(pilots[i], i));
    mount(pilotRosterEl, slots);
  }
  renderPilotRoster([null, null, null]);
  var pilotCard = h('div', { class: 'pilot-panel' }, [pilotRosterEl, graveLink]);

  var titleScreen = h('section', { class: 'screen', dataset: { screen: 'title' } }, [
    h('div', { class: 'title-wrap' }, [
      h('div', { class: 'logo' }, [
        h('div', { class: 'main' }, ['鋼機工廠']),
        h('div', { class: 'sub' }, ['K O K I   K O S H O'])
      ]),
      h('p', { class: 'title-desc' }, [
        '組み上げた鋼機(こうき)が自律で戦う。試合は実況/レーダー/3Dの三面で観戦できる。',
        h('br'), '— いにしえの自律対戦シミュレータへのオマージュ —'
      ]),
      h('div', { class: 'menu' }, [
        h('button', { class: 'primary', onclick: function () { ui.showScreen('sortie'); } }, ['▶ 出撃(演習)']),
        h('button', { onclick: function () { ui.showScreen('hangar'); } }, ['⚙ 工廠(機体を組む)']),
        h('button', { onclick: function () { ui.showScreen('arena'); } }, ['◈ 闘技場(ネット対戦)']),
        h('button', { onclick: function () { ui.showScreen('collection'); } }, ['▦ カタログ'])
      ]),
      pilotCard,
      creditsLine,
      loginArea
    ]),
    h('div', { class: 'title-footer' }, [
      h('a', { class: 'link', href: '../' }, ['← 一覧へ'])
    ])
  ]);
  els.screens.title = titleScreen;

  function renderLoginArea() {
    if (state.user) {
      mount(loginArea, [
        h('span', {}, ['識別済: ' + (state.user.name || state.user.email || 'PILOT')]),
        h('button', { class: 'small ghost', onclick: function () { hooks.onLogout && hooks.onLogout(); } }, ['ログアウト'])
      ]);
    } else {
      mount(loginArea, [
        h('button', { class: 'small ghost', onclick: function () { hooks.onLogin && hooks.onLogin(); } }, ['ログイン'])
      ]);
    }
  }
  renderLoginArea();

  /* ===================== hangar ===================== */
  var statsPanel = h('div', { class: 'panel' });
  var tabsRow = h('div', { class: 'tabs' });
  var cardList = h('div', { class: 'card-list' });
  var colorRow = h('div', { class: 'color-row' });
  var nameInput = h('input', { type: 'text', maxlength: 16, placeholder: '機体名(自分だけに表示)' });
  var slotGrid = h('div', { class: 'slot-grid' });
  var equipBtn = h('button', { class: 'primary', style: 'width:100%' }, ['この機体で出撃']);
  /* プレビュー用 canvas は「一度だけ」作って使い回す。renderStatsPanel はパーツを選ぶたびに走るため、
     ここで新しい canvas を作ると game.js 側が毎回 WebGL コンテキストを作り直す(=コンテキスト上限で
     古い描画が失われる)。mount() は同じ要素を渡せば付け替えになるので、要素の同一性を保つ。 */
  var previewCanvas = h('canvas', { class: 'mech-preview' });
  var viewerOpenBtn = h('button', { class: 'small ghost viewer-open' }, ['⛶ 機体鑑賞 — 手で動かして眺める']);
  viewerOpenBtn.addEventListener('click', function () {
    // 前回「撃破」のまま倒れている/歩き出したままにしない(開いたら必ず直立・停止から)
    viewerIn.move = 'stop'; viewerIn.turn = 0; viewerIn.queue.push('rise');
    // 鑑賞用ビルドは開くたびに工廠の現在構成からコピーし直す(前回の構成送りを持ち越さない)
    var hb = state.lastHangar && state.lastHangar.build;
    viewerBuild = hb ? JSON.parse(JSON.stringify(hb)) : null;
    viewerStats = (state.lastHangar && state.lastHangar.stats) || null;
    renderViewer(); ui.showScreen('viewer');
  });

  nameInput.addEventListener('input', function () {
    if (state.lastHangar && state.lastHangar.build) {
      state.lastHangar.build.name = nameInput.value;
    }
  });
  equipBtn.addEventListener('click', function () {
    if (state.lastHangar && state.lastHangar.build) hooks.onEquip && hooks.onEquip(state.lastHangar.build);
  });

  var hangarScreen = h('section', { class: 'screen', dataset: { screen: 'hangar' } }, [
    h('h2', { class: 'screen-title' }, ['工廠 — HANGAR BAY', h('a', { class: 'link', href: '#', onclick: function (e) { e.preventDefault(); ui.showScreen('title'); } }, ['← タイトルへ'])]),
    statsPanel,
    h('div', { class: 'panel' }, [
      h('h3', {}, ['パーツ選択']),
      tabsRow,
      cardList
    ]),
    h('div', { class: 'panel' }, [
      h('h3', {}, ['カラー / 機体名']),
      colorRow,
      h('div', { style: 'margin-top:10px' }, [nameInput]),
      h('p', { class: 'field-note' }, ['この名前はあなたにだけ見えます(対戦相手には識別コードのみ表示)'])
    ]),
    h('div', { class: 'panel' }, [
      h('h3', {}, ['保存スロット']),
      slotGrid
    ]),
    equipBtn
  ]);
  els.screens.hangar = hangarScreen;

  function renderStatsPanel() {
    var st = state.lastHangar || {};
    var stats = st.stats || {};
    var maxRef = st.statMax || DEFAULT_MAX;
    var weightRatio = stats.capacity > 0 ? stats.weight / stats.capacity : 0;
    var over = weightRatio > 1 || stats.valid === false;
    function gauge(label, val, max, opts) {
      opts = opts || {};
      var display = opts.fmt ? opts.fmt(val) : Math.round(val);
      var cls = 'gauge' + (opts.danger ? ' danger' : (pct(val, max) > 85 ? ' warn' : ''));
      return h('div', { class: 'gauge-row' }, [
        h('div', { class: 'lbl' }, [label, h('b', {}, [String(display)])]),
        h('div', { class: cls }, [h('i', { style: 'width:' + pct(val, max) + '%' })])
      ]);
    }
    mount(statsPanel, [
      h('h3', {}, ['機体ステータス']),
      previewCanvas,
      viewerOpenBtn,
      gauge('HP', stats.hp || 0, maxRef.hp),
      gauge('速度', stats.speed || 0, maxRef.speed),
      gauge('回避', (stats.evasion || 0) * 100, maxRef.evasion, { fmt: function (v) { return Math.round(v) + '%'; } }),
      gauge('防御', (stats.defense || 0) * 100, maxRef.defense * 100, { fmt: function (v) { return Math.round(v) + '%'; } }),
      gauge('EN出力', stats.enOut || 0, maxRef.enOut, { fmt: function (v) { return v.toFixed ? v.toFixed(1) : v; } }),
      gauge('重量', stats.weight || 0, Math.max(stats.capacity || 1, 1), { danger: over, fmt: function () { return (stats.weight || 0) + ' / ' + (stats.capacity || 0); } }),
      costGauge(st, stats),
      stats.errors && stats.errors.length ? h('p', { class: 'muted', style: 'color:var(--red)' }, [stats.errors.join(' / ')]) : null,
      h('div', {}, [
        h('span', { class: 'muted' }, ['総合評価 ']),
        h('span', { class: 'grade-badge' }, [calcGrade(stats, maxRef)])
      ]),
      st.build ? h('p', { class: 'muted', style: 'margin-top:8px;line-height:1.8' }, [buildSummary(st)]) : null
    ]);
  }
  function costGauge(st, stats) {
    var budget = st.budget || 0;
    var cost = stats.cost || 0;
    var overBudget = cost > budget;
    return h('div', { class: 'gauge-row cost-row' + (overBudget ? ' over' : '') }, [
      h('div', { class: 'lbl' }, ['機体総額', h('b', {}, [cost.toLocaleString() + ' / ' + budget.toLocaleString() + ' C' + (overBudget ? '(予算超過)' : '')])]),
      h('div', { class: 'gauge' + (overBudget ? ' danger' : '') }, [h('i', { style: 'width:' + pct(cost, Math.max(budget, 1)) + '%' })])
    ]);
  }
  function buildSummary(st) {
    var parts = st.parts || {};
    var b = st.build || {};
    function nm(catKey, id) {
      var cat = CATS.filter(function (c) { return c.key === catKey; })[0];
      var list = parts[cat.partKey] || [];
      var p = list.filter(function (x) { return x.id === id; })[0];
      return p ? p.name : '未選択';
    }
    return CATS.map(function (c) { return c.label + ':' + nm(c.key, b[c.key]); }).join(' / ');
  }

  function renderTabs() {
    mount(tabsRow, CATS.map(function (c) {
      return h('button', {
        class: c.key === state.hangarTab ? 'active' : '',
        onclick: function () { state.hangarTab = c.key; renderTabs(); renderCardList(); }
      }, [c.label]);
    }));
  }
  function renderCardList() {
    var st = state.lastHangar;
    if (!st) { mount(cardList, []); return; }
    var cat = CATS.filter(function (c) { return c.key === state.hangarTab; })[0];
    var list = (st.parts && st.parts[cat.partKey]) || [];
    var budget = st.budget || 0;
    var baseCost = (st.stats && st.stats.cost) || 0;
    var currentId = st.build ? st.build[cat.key] : null;
    var currentPart = list.filter(function (p) { return p.id === currentId; })[0];
    var currentPrice = currentPart ? (currentPart.price || 0) : 0;
    mount(cardList, list.map(function (part) {
      var selected = part.id === currentId;
      var stats = partStatPairs(cat.key, part);
      var price = part.price || 0;
      var hypCost = baseCost - currentPrice + price;
      var overBudget = hypCost > budget;
      var body = [
        h('div', { class: 'row1' }, [
          h('span', { class: 'name-wrap' }, [h('span', { class: 'name' }, [part.name]), bandChip(part.band)]),
          h('span', { class: 'weight' }, ['重量 ' + part.weight])
        ]),
        part.desc ? h('div', { class: 'desc' }, [part.desc]) : null,
        stats.length ? h('div', { class: 'stats' }, [stats.map(function (p) { return p[0] + ' ' + p[1]; }).join(' ・ ')]) : null,
        h('div', { class: 'price-line' + (overBudget ? ' over' : '') }, [price.toLocaleString() + ' C' + (overBudget ? '(予算超過)' : '')])
      ];
      return h('button', {
        class: 'part-card' + (selected ? ' selected' : ''),
        onclick: function () {
          if (!st.build) return;
          st.build[cat.key] = part.id;
          var newStats = hooks.onPartChange ? hooks.onPartChange(st.build) : null;
          if (newStats) st.stats = newStats;
          renderStatsPanel();
          renderCardList();
        }
      }, body);
    }));
  }
  function renderColorRow() {
    var st = state.lastHangar;
    var current = st && st.build ? st.build.color : null;
    mount(colorRow, COLOR_PRESETS.map(function (hex) {
      return h('button', {
        class: 'swatch' + (hex === current ? ' selected' : ''),
        style: 'background:' + hex,
        onclick: function () {
          if (!st || !st.build) return;
          st.build.color = hex;
          var newStats = hooks.onPartChange ? hooks.onPartChange(st.build) : null;
          if (newStats) st.stats = newStats;
          renderColorRow();
        }
      }, []);
    }));
  }
  function renderSlots() {
    var st = state.lastHangar;
    var slots = (st && st.slots) || [];
    var cells = [];
    for (var i = 0; i < 8; i++) {
      var s = slots[i] || { slot: i, build: null };
      (function (s, idx) {
        var hasBuild = !!s.build;
        cells.push(h('div', { class: 'slot-card' }, [
          h('div', { class: 'row1' }, [
            h('span', {}, ['SLOT ' + (idx + 1)]),
            h('span', {}, [hasBuild ? (s.cloud ? '☁' : '💾') : '—'])
          ]),
          h('div', { class: 'name' }, [hasBuild ? (s.build.name || '(無題)') : '空きスロット']),
          h('div', { class: 'btns' }, [
            h('button', {
              class: 'small', disabled: !hasBuild,
              onclick: function () {
                if (!st || !s.build) return;
                Object.assign(st.build, s.build);
                nameInput.value = st.build.name || '';
                var newStats = hooks.onPartChange ? hooks.onPartChange(st.build) : null;
                if (newStats) st.stats = newStats;
                renderStatsPanel(); renderCardList(); renderColorRow();
                ui.toast('スロット' + (idx + 1) + 'を読み込みました');
              }
            }, ['読込']),
            h('button', {
              class: 'small',
              onclick: function () {
                if (!st || !st.build) return;
                hooks.onSaveBuild && hooks.onSaveBuild(st.build, idx);
              }
            }, ['保存'])
          ])
        ]));
      })(s, i);
    }
    mount(slotGrid, cells);
  }

  /* ===================== viewer(機体鑑賞) =====================
     工廠の機体を手で動かして眺める画面。キーボードは使わず「全ての動作をボタンで選ぶ」。
     ここが持つのは DOM と入力状態(viewerIn)だけで、時計・姿勢・カメラ計算は game.js の
     viewerTick が毎フレーム ui.viewerInput() を読んで進める(描画契約は r3d.js の scene と同じ)。 */
  var VIEWER_MOVES = [
    { key: 'stop',  label: '■ 停止' },
    { key: 'fwd',   label: '▲ 前進' },
    { key: 'back',  label: '▼ 後退' },
    { key: 'left',  label: '◀ 左移動' },
    { key: 'right', label: '右移動 ▶' }
  ];
  var VIEWER_SPEEDS = [
    { key: 'slow',   label: '低速', mul: 0.30 },   // 大股のゆっくりした重い足取り(歩幅が伸びる)
    { key: 'cruise', label: '巡航', mul: 0.65 },
    { key: 'full',   label: '全速', mul: 1.00 }
  ];
  var VIEWER_TURNS = [
    { key: -1, label: '↺ 左旋回' },
    { key: 0,  label: '旋回停止' },
    { key: 1,  label: '右旋回 ↻' }
  ];
  /* カメラ位置は機体の向きを基準にした方位角 az[deg](0=正面から顔を見る / 180=背面)と仰角 el[deg]。 */
  var VIEWER_CAMS = [
    { key: 'orbit',   label: '自動周回',     az: 38,  el: 16 },
    { key: 'front',   label: '正面',         az: 0,   el: 11 },
    { key: 'quarter', label: '斜め前',       az: 38,  el: 16 },
    { key: 'side',    label: '側面',         az: 90,  el: 11 },
    { key: 'rear',    label: '背面',         az: 180, el: 12 },
    { key: 'top',     label: '俯瞰',         az: 45,  el: 52 },
    { key: 'low',     label: 'ローアングル', az: 25,  el: -9 }
  ];
  var VIEWER_DIST = { min: 3.4, max: 24 };

  var viewerIn = {
    move: 'stop', speedKey: 'cruise', speedMul: 0.65, turn: 0,
    cam: 'quarter', az: 38, el: 16, dist: 7.6,
    repeat: false,
    queue: []      // 単発アクション(game.js が毎フレーム空にする)
  };
  /* 鑑賞用ビルドは出撃機体(S.current)の「コピー」。構成送り/カラーはこのコピーだけを書き換え、
     保存も工廠への反映もしない(高額構成に送ると演習が予算超過で出撃不能になる事故の再発防止)。
     開くたびに viewerOpenBtn で工廠の現在構成から作り直す。 */
  var viewerBuild = null, viewerStats = null;
  function viewerDerive() {
    if (hooks.onDeriveStats && viewerBuild) viewerStats = hooks.onDeriveStats(viewerBuild);
  }

  var viewerCanvas = h('canvas', { class: 'mech-viewer' });   // 使い回す(WebGLコンテキストを作り直さない)
  var viewerMoveRow = h('div', { class: 'vw-btn-row' });
  var viewerSpeedRow = h('div', { class: 'vw-btn-row' });
  var viewerTurnRow = h('div', { class: 'vw-btn-row' });
  var viewerActRow = h('div', { class: 'vw-btn-row' });
  var viewerCamRow = h('div', { class: 'vw-btn-row' });
  var viewerPartRows = h('div', { class: 'vw-part-list' });
  var viewerColorRow = h('div', { class: 'color-row' });
  var viewerInfo = h('div', { class: 'vw-info' });

  function viewerQueue(a) { viewerIn.queue.push(a); }
  function viewerCamPreset(key) {
    var c = VIEWER_CAMS.filter(function (x) { return x.key === key; })[0] || VIEWER_CAMS[2];
    viewerIn.cam = c.key; viewerIn.az = c.az; viewerIn.el = c.el;
    renderViewerCams();
  }
  function viewerZoom(mul) {
    viewerIn.dist = clamp(viewerIn.dist * mul, VIEWER_DIST.min, VIEWER_DIST.max);
  }

  function renderViewerMoves() {
    mount(viewerMoveRow, VIEWER_MOVES.map(function (m) {
      return h('button', {
        class: 'small' + (viewerIn.move === m.key ? ' active' : ''),
        onclick: function () { viewerIn.move = m.key; renderViewerMoves(); }
      }, [m.label]);
    }));
    mount(viewerSpeedRow, VIEWER_SPEEDS.map(function (s) {
      return h('button', {
        class: 'small' + (viewerIn.speedKey === s.key ? ' active' : ''),
        onclick: function () { viewerIn.speedKey = s.key; viewerIn.speedMul = s.mul; renderViewerMoves(); }
      }, [s.label]);
    }));
    mount(viewerTurnRow, VIEWER_TURNS.map(function (t) {
      return h('button', {
        class: 'small' + (viewerIn.turn === t.key ? ' active' : ''),
        onclick: function () { viewerIn.turn = t.key; renderViewerMoves(); }
      }, [t.label]);
    }));
  }
  function renderViewerCams() {
    mount(viewerCamRow, VIEWER_CAMS.map(function (c) {
      return h('button', {
        class: 'small' + (viewerIn.cam === c.key ? ' active' : ''),
        onclick: function () { viewerCamPreset(c.key); }
      }, [c.label]);
    }).concat([
      h('button', { class: 'small', onclick: function () { viewerZoom(0.82); } }, ['🔍 寄る']),
      h('button', { class: 'small', onclick: function () { viewerZoom(1.22); } }, ['🔍 引く']),
      h('button', {
        class: 'small' + (viewerIn.cam === 'free' ? ' active' : ''),
        onclick: function () { viewerIn.cam = 'free'; renderViewerCams(); }
      }, ['手動(画面をドラッグ)'])
    ]));
  }
  function renderViewerActs() {
    var st = state.lastHangar || {};
    var b = viewerBuild || st.build || {};
    var wpns = (st.parts || {}).wpn || [];
    function wname(id) {
      var p = wpns.filter(function (x) { return x.id === id; })[0];
      return p ? p.name : '—';
    }
    var acts = [
      { a: 'atkR',   label: '右腕攻撃 / ' + wname(b.wpnR), cls: ' primary' },
      { a: 'atkL',   label: '左腕攻撃 / ' + wname(b.wpnL), cls: ' primary' },
      { a: 'hit',    label: '被弾(のけぞる)', cls: '' },
      { a: 'dodgeR', label: '回避 右', cls: '' },
      { a: 'dodgeL', label: '回避 左', cls: '' },
      { a: 'down',   label: '撃破(崩れ落ちる)', cls: ' danger' },
      { a: 'rise',   label: '再起動(立ち上がる)', cls: '' }
    ];
    mount(viewerActRow, acts.map(function (x) {
      return h('button', { class: 'small' + x.cls, onclick: function () { viewerQueue(x.a); } }, [x.label]);
    }).concat([
      h('button', {
        class: 'small' + (viewerIn.repeat ? ' active' : ''),
        onclick: function () { viewerIn.repeat = !viewerIn.repeat; renderViewerActs(); }
      }, ['🔁 くり返し'])
    ]));
  }
  /* パーツ送り: 増えていくバリエーションを、画面を出たり入ったりせず見比べるための ◀ ▶。
     書き換えるのは鑑賞用コピー(viewerBuild)だけ。出撃機体(S.current)には触れない。 */
  function viewerCycle(catKey, partKey, dir) {
    var st = state.lastHangar;
    if (!st || !viewerBuild) return;
    var list = (st.parts || {})[partKey] || [];
    if (!list.length) return;
    var i = list.map(function (p) { return p.id; }).indexOf(viewerBuild[catKey]);
    var n = ((i < 0 ? 0 : i) + dir + list.length) % list.length;
    viewerBuild[catKey] = list[n].id;
    viewerDerive();
    renderViewerParts(); renderViewerActs(); renderViewerInfo();
  }
  function renderViewerParts() {
    var st = state.lastHangar || {};
    var b = viewerBuild || st.build || {};
    mount(viewerPartRows, CATS.map(function (c) {
      var list = (st.parts || {})[c.partKey] || [];
      var cur = list.filter(function (p) { return p.id === b[c.key]; })[0];
      return h('div', { class: 'vw-part-row' }, [
        h('button', { class: 'small', onclick: function () { viewerCycle(c.key, c.partKey, -1); } }, ['◀']),
        h('div', { class: 'vw-part-name' }, [
          h('span', { class: 'lbl' }, [c.label]),
          h('span', { class: 'nm' }, [cur ? cur.name : '未選択'])
        ]),
        h('button', { class: 'small', onclick: function () { viewerCycle(c.key, c.partKey, 1); } }, ['▶'])
      ]);
    }));
    mount(viewerColorRow, COLOR_PRESETS.map(function (hex) {
      return h('button', {
        class: 'swatch' + (hex === b.color ? ' selected' : ''),
        style: 'background:' + hex,
        onclick: function () {
          if (!viewerBuild) return;
          viewerBuild.color = hex;
          viewerDerive();
          renderViewerParts();
        }
      }, []);
    }));
  }
  function renderViewerInfo() {
    var st = state.lastHangar || {};
    var b = viewerBuild || st.build || null;
    var stats = viewerStats || st.stats || {};
    var budget = st.budget || 0;
    var cost = stats.cost || 0;
    var over = cost > budget;
    mount(viewerInfo, [
      h('div', { class: 'vw-info-name' }, [(b && b.name) || '(無題の鋼機)']),
      h('div', { class: 'muted' }, [
        'HP ' + Math.round(stats.hp || 0) + ' ・ 速度 ' + Math.round(stats.speed || 0) +
        ' ・ 回避 ' + Math.round((stats.evasion || 0) * 100) + '%' +
        ' ・ 重量 ' + (stats.weight || 0) + '/' + (stats.capacity || 0)
      ]),
      h('div', { class: 'muted' + (over ? ' vw-over' : '') }, [
        '機体総額 ' + cost.toLocaleString() + ' / ' + budget.toLocaleString() + ' C' + (over ? '(予算超過)' : '')
      ])
    ]);
  }
  function renderViewer() {
    renderViewerMoves(); renderViewerCams(); renderViewerActs(); renderViewerParts(); renderViewerInfo();
  }

  /* 画面ドラッグで自由に回す/寄る(ボタンだけでも完結するが、眺める用の直接操作も残す) */
  (function bindViewerDrag(cv) {
    var drag = null;
    cv.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      if (viewerIn.cam !== 'free') { viewerIn.cam = 'free'; renderViewerCams(); }
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      viewerIn.az = (viewerIn.az - (e.clientX - drag.x) * 0.42) % 360;
      viewerIn.el = clamp(viewerIn.el + (e.clientY - drag.y) * 0.3, -22, 78);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    function end() { drag = null; }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', end);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      viewerZoom(e.deltaY > 0 ? 1.08 : 0.93);
    }, { passive: false });
  })(viewerCanvas);

  var viewerScreen = h('section', { class: 'screen wide', dataset: { screen: 'viewer' } }, [
    h('h2', { class: 'screen-title' }, ['機体鑑賞 — MECH VIEWER',
      h('a', { class: 'link', href: '#', onclick: function (e) {
        e.preventDefault();
        ui.showScreen('hangar');   // 鑑賞用コピーは持ち帰らない(工廠と出撃機体はそのまま)
      } }, ['← 工廠へ'])]),
    h('div', { class: 'viewer-layout row' }, [
      h('div', { class: 'viewer-stage' }, [viewerCanvas]),
      h('div', { class: 'viewer-ctl col' }, [
        h('div', { class: 'panel' }, [h('h3', {}, ['機体']), viewerInfo]),
        h('div', { class: 'panel' }, [
          h('h3', {}, ['移動']),
          viewerMoveRow,
          h('div', { class: 'vw-sub' }, ['歩調']), viewerSpeedRow,
          h('div', { class: 'vw-sub' }, ['旋回']), viewerTurnRow
        ]),
        h('div', { class: 'panel' }, [h('h3', {}, ['動作']), viewerActRow]),
        h('div', { class: 'panel' }, [h('h3', {}, ['カメラ']), viewerCamRow]),
        h('div', { class: 'panel' }, [
          h('h3', {}, ['構成を替えて見比べる']),
          viewerPartRows,
          h('div', { class: 'vw-sub' }, ['カラー']), viewerColorRow
        ])
      ])
    ])
  ]);
  els.screens.viewer = viewerScreen;

  /* ===================== sortie(演習) ===================== */
  var sortieBody = h('div', { class: 'col' });
  var sortieWorldNote = h('p', { class: 'muted sortie-world-note' }, ['※敵機は並行世界から転写されたクローン機。降参はしない。']);
  var sortieScreen = h('section', { class: 'screen', dataset: { screen: 'sortie' } }, [
    h('h2', { class: 'screen-title' }, ['演習 — SORTIE', h('a', { class: 'link', href: '#', onclick: function (e) { e.preventDefault(); ui.showScreen('title'); } }, ['← タイトルへ'])]),
    sortieWorldNote,
    sortieBody
  ]);
  els.screens.sortie = sortieScreen;

  var fieldChipsRow = h('div', { class: 'field-chip-row' });
  var fieldChipsFade = h('div', { class: 'field-chip-fade', 'aria-hidden': 'true' }, ['»']);
  var fieldChipsWrap = h('div', { class: 'field-chip-wrap' }, [fieldChipsRow, fieldChipsFade]);
  var fieldDescLine = h('p', { class: 'field-desc muted' }, []);
  var fieldPanel = h('div', { class: 'panel field-panel' }, [
    h('h3', {}, ['戦場選択']),
    fieldChipsWrap,
    fieldDescLine
  ]);
  function updateFieldChipsScroll() {
    var el = fieldChipsRow;
    var atEnd = (el.scrollWidth - el.clientWidth) <= (el.scrollLeft + 2);
    fieldChipsWrap.classList.toggle('at-end', atEnd);
  }
  fieldChipsRow.addEventListener('scroll', updateFieldChipsScroll);
  if (typeof window !== 'undefined') window.addEventListener('resize', updateFieldChipsScroll);
  function fieldOptions() {
    var st = state.lastCampaign || {};
    var fields = st.fields || [];
    return [{ id: 'random', name: 'ランダム', desc: '出撃のたびに戦場をランダムに選びます。' }].concat(fields);
  }
  function renderFieldChips() {
    var options = fieldOptions();
    var current = options.filter(function (f) { return f.id === state.sortieField; })[0] || options[0];
    fieldDescLine.textContent = current ? (current.desc || '') : '';
    mount(fieldChipsRow, options.map(function (f) {
      var active = f.id === state.sortieField;
      return h('button', {
        class: 'chip-btn' + (active ? ' active' : ''),
        onclick: function () {
          state.sortieField = f.id;
          renderFieldChips();
        },
        onmouseenter: function () { fieldDescLine.textContent = f.desc || ''; },
        onmouseleave: function () { renderFieldChips(); }
      }, [f.name]);
    }));
    updateFieldChipsScroll();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(updateFieldChipsScroll);
  }

  /* ===================== arena(闘技場) ===================== */
  var arenaBody = h('div', { class: 'col' });
  var arenaScreen = h('section', { class: 'screen', dataset: { screen: 'arena' } }, [
    h('h2', { class: 'screen-title' }, ['闘技場 — ARENA', h('a', { class: 'link', href: '#', onclick: function (e) { e.preventDefault(); ui.showScreen('title'); } }, ['← タイトルへ'])]),
    arenaBody
  ]);
  els.screens.arena = arenaScreen;

  /* ===================== collection ===================== */
  var collectionBody = h('div', { class: 'col' });
  var collectionScreen = h('section', { class: 'screen', dataset: { screen: 'collection' } }, [
    h('h2', { class: 'screen-title' }, ['カタログ', h('a', { class: 'link', href: '#', onclick: function (e) { e.preventDefault(); ui.showScreen('title'); } }, ['← タイトルへ'])]),
    collectionBody
  ]);
  els.screens.collection = collectionScreen;

  /* ===================== graveyard(墓場) ===================== */
  var graveyardBody = h('div', { class: 'col' });
  var graveyardScreen = h('section', { class: 'screen', dataset: { screen: 'grave' } }, [
    h('h2', { class: 'screen-title' }, ['墓場 — MEMORIAL', h('a', { class: 'link', href: '#', onclick: function (e) { e.preventDefault(); ui.showScreen('title'); } }, ['← タイトルへ'])]),
    graveyardBody
  ]);
  els.screens.grave = graveyardScreen;

  /* ===================== battle ===================== */
  var c3d = h('canvas', { class: 'c3d' });
  var cradar = h('canvas', { class: 'cradar', hidden: true });
  var logview = h('div', { class: 'logview', dataset: { filter: 'all' } });
  var logFilterBtns = LOG_FILTERS.map(function (f) {
    return h('button', {
      class: 'chip-btn' + (f.key === 'all' ? ' active' : ''),
      dataset: { filter: f.key },
      onclick: function () {
        logview.dataset.filter = f.key;
        logFilterBtns.forEach(function (b) {
          b.classList.toggle('active', b.dataset.filter === f.key);
        });
      }
    }, [f.label]);
  });
  var ttsBtn = h('button', { class: 'small ghost tts-btn' }, ['🔊読み上げ']);
  var logFilterRow = h('div', { class: 'log-filter' }, logFilterBtns.concat([
    h('span', { class: 'log-filter-spacer' }), ttsBtn
  ]));
  var logWrap = h('div', { class: 'log-wrap', hidden: true }, [logFilterRow, logview]);
  var btn3d = h('button', { class: 'active' }, ['3D']);
  var btnRadar = h('button', {}, ['レーダー']);
  var btnLog = h('button', {}, ['実況']);
  var battleTabsObj = { btn3d: btn3d, btnRadar: btnRadar, btnLog: btnLog, mode: '3d' };
  function setBattleTab(mode) {
    battleTabsObj.mode = mode;
    var cockpit = !!battleTabsObj.cockpit;   // コックピットHUD中は全ビュー常時表示(タブは選択状態だけ覚える)
    c3d.hidden = !cockpit && mode !== '3d';
    cradar.hidden = !cockpit && mode !== 'radar';
    logWrap.hidden = !cockpit && mode !== 'log';
    [btn3d, btnRadar, btnLog].forEach(function (b) { b.classList.remove('active'); });
    ({ '3d': btn3d, radar: btnRadar, log: btnLog })[mode].classList.add('active');
    if (mode === 'log') { logview.scrollTop = logview.scrollHeight; }
  }
  btn3d.addEventListener('click', function () { setBattleTab('3d'); });
  btnRadar.addEventListener('click', function () { setBattleTab('radar'); });
  btnLog.addEventListener('click', function () { setBattleTab('log'); });

  var hpAFill = h('i', { style: 'width:100%' });
  var hpBFill = h('i', { style: 'width:100%' });
  var enAFill = h('i', { style: 'width:100%' });
  var enBFill = h('i', { style: 'width:100%' });
  var hpAText = h('span', {}, ['1000']);
  var hpBText = h('span', {}, ['1000']);
  /* ammoA/ammoB は Ver3 で武装行に統合・廃止。既存コードが落ちないよう非表示ダミーとして残す(DOM未装着) */
  var ammoAText = h('span', { class: 'ammo', hidden: true });
  var ammoBText = h('span', { class: 'ammo', hidden: true });
  var wpnA1Text = h('span', { class: 'wpn-name' }, ['—']);
  var wpnA2Text = h('span', { class: 'wpn-name' }, ['—']);
  var wpnB1Text = h('span', { class: 'wpn-name' }, ['—']);
  var wpnB2Text = h('span', { class: 'wpn-name' }, ['—']);
  var stanceAText = h('span', { class: 'stance-badge' }, ['—']);
  var stanceBText = h('span', { class: 'stance-badge' }, ['—']);
  var timeText = h('span', { class: 'time' }, ['0.0s']);
  var speedBtn = h('button', { class: 'small', dataset: { speed: '1' } }, ['1倍速']);
  speedBtn.addEventListener('click', function () {
    var cur = Number(speedBtn.dataset.speed) || 1;
    var next = cur >= 4 ? 1 : cur * 2;
    speedBtn.dataset.speed = String(next);
    speedBtn.textContent = next + '倍速';
  });
  /* ---- TGT サブ表記(戦闘開始時に game.js が「(機体名)」へ書き換える) ---- */
  var tgtSubA = h('span', { class: 'tgt-sub' }, ['自機']);
  var tgtSubB = h('span', { class: 'tgt-sub' }, ['敵機']);

  /* ---- 部位ダメージチップ(腕R/腕L/脚/炉。data-lv は game.js が 0〜3 で更新) ---- */
  function makePdChips() {
    return ['腕R', '腕L', '脚', '炉'].map(function (label) {
      return h('span', { class: 'pd-chip', dataset: { lv: '0' } }, [label]);
    });
  }
  var pdChipsA = makePdChips();
  var pdChipsB = makePdChips();
  var pdRowA = h('div', { class: 'pd-row' }, pdChipsA);
  var pdRowB = h('div', { class: 'pd-row' }, pdChipsB);

  var pauseBtn = h('button', { class: 'small' }, ['停止']);
  var surrenderBtn = h('button', { class: 'small danger', hidden: true }, ['🏳 降参']);
  /* ---- Ver5後半(人間レビュー5巡目): 「結果を見る」ボタンは廃止。戦闘は止めず、戦果は CONTROL 直下の aftermathBox に表示する ---- */

  var hudObj = {
    hpAFill: hpAFill, hpBFill: hpBFill, enAFill: enAFill, enBFill: enBFill,
    hpAText: hpAText, hpBText: hpBText, ammoA: ammoAText, ammoB: ammoBText, timeText: timeText,
    speedBtn: speedBtn, skipBtn: null, pauseBtn: pauseBtn, surrenderBtn: surrenderBtn, resultBtn: null,
    wpnA1: wpnA1Text, wpnA2: wpnA2Text, wpnB1: wpnB1Text, wpnB2: wpnB2Text,
    stanceA: stanceAText, stanceB: stanceBText,
    tgtSubA: tgtSubA, tgtSubB: tgtSubB,
    pdA: pdChipsA, pdB: pdChipsB
  };

  var tgtBoxA = h('div', { class: 'panel tgt-box' }, [
    h('div', { class: 'tgt-head' }, [h('span', { class: 'tgt-tag' }, ['TGT-A']), tgtSubA]),
    h('div', { class: 'mech-hp' }, [
      h('div', { class: 'lbl' }, ['HP', hpAText]),
      h('div', { class: 'gauge' }, [hpAFill]),
      h('div', { class: 'lbl' }, ['EN']),
      h('div', { class: 'gauge warn' }, [enAFill])
    ]),
    h('div', { class: 'wpn-row' }, [h('span', { class: 'wpn-ico' }, ['①']), wpnA1Text]),
    h('div', { class: 'wpn-row' }, [h('span', { class: 'wpn-ico' }, ['②']), wpnA2Text]),
    pdRowA,
    h('div', { class: 'stance-row' }, [h('span', { class: 'stance-lbl' }, ['戦術']), stanceAText])
  ]);
  var tgtBoxB = h('div', { class: 'panel tgt-box' }, [
    h('div', { class: 'tgt-head' }, [h('span', { class: 'tgt-tag' }, ['TGT-B']), tgtSubB]),
    h('div', { class: 'mech-hp' }, [
      h('div', { class: 'lbl' }, ['HP', hpBText]),
      h('div', { class: 'gauge danger' }, [hpBFill]),
      h('div', { class: 'lbl' }, ['EN']),
      h('div', { class: 'gauge warn' }, [enBFill])
    ]),
    h('div', { class: 'wpn-row' }, [h('span', { class: 'wpn-ico' }, ['①']), wpnB1Text]),
    h('div', { class: 'wpn-row' }, [h('span', { class: 'wpn-ico' }, ['②']), wpnB2Text]),
    pdRowB,
    h('div', { class: 'stance-row' }, [h('span', { class: 'stance-lbl' }, ['戦術']), stanceBText])
  ]);
  var controlBox = h('div', { class: 'panel tgt-box control-box' }, [
    h('div', { class: 'tgt-head' }, [h('span', { class: 'tgt-tag' }, ['CONTROL'])]),
    h('div', { class: 'hud-bottom' }, [
      timeText,
      h('div', { class: 'ctl' }, [pauseBtn, speedBtn, surrenderBtn])   /* 並び: 停止・倍速・降参(スキップは廃止=倍速で足りる) */
    ])
  ]);

  /* ---- 戦果ボックス(Ver5後半: CONTROL 直下・右ペイン内。試合終了後もステージは停止させず ui.showAftermath() で描画) ---- */
  var aftermathBox = h('div', { class: 'panel tgt-box aftermath-box', hidden: true }, []);

  var battleScreen = h('section', { class: 'screen wide', dataset: { screen: 'battle' } }, [
    h('div', { class: 'battle-tabs' }, [btn3d, btnRadar, btnLog]),
    h('div', { class: 'battle-layout row' }, [
      h('div', { class: 'battle-stage' }, [c3d, cradar, logWrap]),
      h('div', { class: 'hud' }, [
        h('div', { class: 'tgt-row' }, [tgtBoxA, tgtBoxB]),
        controlBox,
        aftermathBox
      ])
    ])
  ]);
  els.screens.battle = battleScreen;

  /* ---- コックピットHUD(ワイド画面 ≥1100px): タブを廃し 3D全面+レーダーPiP+実況フィードを同時表示。
         .cockpit の付け外しはここが単一の責任者(game.js は tabs.cockpit を読むだけ)。 ---- */
  var cockpitMQ = window.matchMedia('(min-width: 1100px)');
  function applyCockpit() {
    var on = cockpitMQ.matches;
    battleTabsObj.cockpit = on;
    battleScreen.classList.toggle('cockpit', on);
    setBattleTab(battleTabsObj.mode);   // 表示/非表示は setBattleTab が cockpit を見て一元処理
    if (on) logview.scrollTop = logview.scrollHeight;
  }
  if (cockpitMQ.addEventListener) cockpitMQ.addEventListener('change', applyCockpit);
  else cockpitMQ.addListener(applyCockpit);   // 旧Safari
  applyCockpit();

  var battleElsCache = {
    c3d: c3d, cradar: cradar, logview: logview,
    logFilter: function () { return logview.dataset.filter; },
    tabs: battleTabsObj, hud: hudObj, ttsBtn: ttsBtn
  };

  /* ===================== result ===================== */
  var resultInner = h('div', { id: 'result-inner' });
  var resultScreen = h('section', { class: 'screen', dataset: { screen: 'result' }, id: 'result' }, [resultInner]);
  els.screens.result = resultScreen;

  /* ===================== toast host ===================== */
  var toastHost = h('div', { class: 'toast-host' });

  mount(root, [
    h('div', { class: 'scanlines', 'aria-hidden': 'true' }),
    titleScreen, hangarScreen, viewerScreen, sortieScreen, arenaScreen, collectionScreen, graveyardScreen, battleScreen, resultScreen,
    toastHost
  ]);

  /* ===================== ui オブジェクト ===================== */
  var ui = {
    showScreen: function (name) {
      Object.keys(els.screens).forEach(function (k) {
        var s = els.screens[k];
        if (k === name) {
          s.hidden = false;
          s.classList.remove('active');
          void s.offsetWidth;
          s.classList.add('active');
        } else {
          s.hidden = true;
          s.classList.remove('active');
        }
      });
    },

    renderTitle: function (st) {
      st = st || {};
      creditsAmountText.textContent = '所持クレジット: ' + (st.credits || 0) + ' C';
      medalsText.textContent = '🎖 ' + (st.medals || 0);
      renderPilotRoster(st.pilots || []);
      graveLink.textContent = '⚰ 墓場(' + (st.graveyardCount || 0) + ')';
    },

    renderHangar: function (st) {
      state.lastHangar = st || {};
      if (state.lastHangar.build) nameInput.value = state.lastHangar.build.name || '';
      renderStatsPanel();
      renderTabs();
      renderCardList();
      renderColorRow();
      renderSlots();
      renderViewer();
    },

    /* 機体鑑賞の入力状態(移動/歩調/旋回/カメラ/単発アクション待ち行列)。
       game.js の viewerTick が毎フレーム読み、queue は読んだ側が空にする。 */
    viewerInput: function () { return viewerIn; },

    /* 鑑賞中の表示対象ビルド(S.current から分離したコピー)。未オープン時は null。 */
    viewerBuild: function () { return viewerBuild; },

    renderCampaign: function (st) {
      st = st || {};
      state.lastCampaign = st;
      if (state.sortieField == null) state.sortieField = st.selectedField || 'random';
      renderFieldChips();
      var daily = st.daily || { cleared: false, reward: 0, label: '本日のデイリー' };
      var dailyBlock = h('div', { class: 'panel daily-card' }, [
        h('div', {}, [
          h('div', {}, [daily.label || 'デイリー演習']),
          h('div', { class: 'muted' }, [daily.cleared ? '本日クリア済み' : ('報酬 +' + daily.reward + ' C')])
        ]),
        h('button', { class: 'primary', onclick: function () { hooks.onFight && hooks.onFight('daily', { fieldId: state.sortieField }); } }, ['挑戦'])
      ]);
      var ranks = st.ranks || RANK_ORDER.map(function (r) { return { rank: r, fights: [0, 1, 2].map(function (i) { return { idx: i, cleared: false, reward: 0 }; }) }; });
      var blocks = ranks.map(function (r) {
        return h('div', { class: 'panel rank-block' }, [
          h('div', { class: 'rank-head' }, [h('div', { class: 'badge' }, [r.rank]), h('span', { class: 'muted' }, ['ランク ' + r.rank])]),
          h('div', { class: 'fight-row' }, r.fights.map(function (f) {
            return h('button', {
              class: (f.cleared ? 'cleared' : '') + (f.locked ? ' locked' : ''),
              onclick: function () {
                if (f.locked) { return; }
                hooks.onFight && hooks.onFight('campaign', { rank: r.rank, idx: f.idx, fieldId: state.sortieField });
              }
            }, [
              h('span', {}, [f.locked ? '🔒' : (f.name || '第' + (f.idx + 1) + '戦')]),
              h('span', { class: 'rw' }, [f.cleared ? '済 ' : '', '+' + f.reward + 'C'])
            ]);
          }))
        ]);
      });
      mount(sortieBody, [dailyBlock, fieldPanel].concat(blocks));
    },

    renderArena: function (st) {
      st = st || {};
      if (!st.loggedIn) {
        var pre = [
          h('div', { class: 'panel arena-login' }, [
            h('p', {}, ['あなたが工廠で組んだ機体を闘技場に登録すると、ほかの工廠長の機体と自動でマッチングして対戦します(その場で観戦できます)。勝敗でレートが上下し、ランキングを競います。']),
            h('p', { class: 'muted' }, ['対戦相手に見えるのはサーバが発行する識別コードだけ。あなたの名前や機体名は公開されません。']),
            h('button', { class: 'primary', onclick: function () { hooks.onLogin && hooks.onLogin(); } }, ['ログインして参加'])
          ])
        ];
        var ptop = st.top || [];
        if (ptop.length) {
          pre.push(h('div', { class: 'panel' }, [
            h('h3', {}, ['ランキング TOP20(閲覧)']),
            h('table', { class: 'rank-table' }, [
              h('thead', {}, [h('tr', {}, [h('th', {}, ['#']), h('th', {}, ['識別コード']), h('th', {}, ['R']), h('th', {}, ['W-L'])])]),
              h('tbody', {}, ptop.map(function (t, i) {
                return h('tr', {}, [h('td', {}, [String(i + 1)]), h('td', {}, [t.codename]), h('td', {}, [String(Math.round(t.rating))]), h('td', {}, [t.wins + '-' + t.losses])]);
              }))
            ])
          ]));
        }
        mount(arenaBody, pre);
        return;
      }
      var parts = [];
      if (!st.myEntry) {
        parts.push(h('div', { class: 'panel arena-login' }, [
          h('p', {}, ['現在の機体を闘技場に登録します(識別コードはサーバが自動生成)。']),
          h('button', { class: 'primary', onclick: function () { hooks.onArenaSubmit && hooks.onArenaSubmit(); } }, ['自機を登録する'])
        ]));
      } else {
        parts.push(h('div', { class: 'panel' }, [
          h('h3', {}, ['自機情報']),
          h('div', { class: 'stat-line' }, ['識別コード', h('b', {}, [st.myEntry.codename])]),
          h('div', { class: 'stat-line' }, ['レート', h('b', {}, [String(st.myEntry.rating)])]),
          h('div', { class: 'stat-line' }, ['戦績', h('b', {}, [st.myEntry.wins + '勝 ' + st.myEntry.losses + '敗'])]),
          h('button', { class: 'primary', style: 'width:100%;margin-top:10px', onclick: function () { hooks.onArenaFight && hooks.onArenaFight(); } }, ['対戦する'])
        ]));
      }
      var top = st.top || [];
      parts.push(h('div', { class: 'panel' }, [
        h('h3', {}, ['ランキング TOP20']),
        h('table', { class: 'rank-table' }, [
          h('thead', {}, [h('tr', {}, [h('th', {}, ['#']), h('th', {}, ['識別コード']), h('th', {}, ['R']), h('th', {}, ['W-L'])])]),
          h('tbody', {}, top.map(function (t, i) {
            return h('tr', { class: (st.myEntry && t.codename === st.myEntry.codename) ? 'me' : '' }, [
              h('td', {}, [String(i + 1)]), h('td', {}, [t.codename]), h('td', {}, [String(t.rating)]), h('td', {}, [t.wins + '-' + t.losses])
            ]);
          }))
        ])
      ]));
      var hist = st.history || [];
      if (hist.length) {
        parts.push(h('div', { class: 'panel' }, [
          h('h3', {}, ['対戦履歴']),
          h('div', {}, hist.map(function (r) {
            return h('div', { class: 'history-row' }, [
              h('span', {}, ['vs ' + r.opponent]),
              h('span', { class: r.result === 'win' ? 'win' : 'lose' }, [r.result === 'win' ? '勝利' : '敗北'])
            ]);
          }))
        ]));
      }
      mount(arenaBody, parts);
    },

    renderCollection: function (st) {
      st = st || {};
      var parts = st.parts || {};
      var credits = st.credits || 0;
      var medals = st.medals || 0;
      var dexBlocks = DEX_CATS
        .map(function (c) {
          var list = parts[c.partKey] || [];
          return h('div', { class: 'panel' }, [
            h('div', { class: 'dex-head' }, [
              h('h3', { style: 'margin:0' }, [c.label]),
              h('span', { class: 'pct' }, [list.length + '種'])
            ]),
            h('div', { class: 'dex-grid' }, list.map(function (p) {
              var price = p.price || 0;
              var afford = price <= credits;
              return h('div', { class: 'dex-chip' + (afford ? '' : ' over-budget') }, [
                h('div', { class: 'dex-name' }, [p.name, bandChip(p.band)]),
                h('div', { class: 'dex-price' }, [price.toLocaleString() + ' C'])
              ]);
            }))
          ]);
        });
      var cosmetics = st.cosmetics || [];
      var cosmeticCards = cosmetics.map(function (c) {
        return h('div', { class: 'cosmetic-card' }, [
          h('div', { class: 'chip', style: 'background:' + (c.color || '#888') }),
          h('div', { class: 'muted' }, [c.name]),
          c.owned
            ? h('span', { class: 'muted' }, ['所持'])
            : h('button', { class: 'small', disabled: medals < (c.priceMedals || 0), onclick: function () { hooks.onBuyCosmetic && hooks.onBuyCosmetic(c.id); } }, ['🎖' + (c.priceMedals || 0) + ' で購入'])
        ]);
      });
      mount(collectionBody, dexBlocks.concat([
        h('div', { class: 'panel' }, [
          h('h3', {}, ['コスメショップ']),
          h('div', { class: 'cosmetic-grid' }, cosmeticCards.length ? cosmeticCards : [h('p', { class: 'muted' }, ['準備中'])])
        ]),
        h('div', { class: 'panel pass-card' }, [
          h('span', { class: 'badge-soon' }, ['準備中']),
          h('h3', {}, ['支援工廠パス']),
          h('p', { class: 'p2w-note' }, ['塗装・エンブレム・勝利演出などのコスメを解放する予定です。性能に影響する販売は行いません。'])
        ])
      ]));
    },

    renderGraveyard: function (st) {
      st = st || {};
      var list = st.list || [];
      if (!list.length) {
        mount(graveyardBody, [h('p', { class: 'muted', style: 'text-align:center;padding:30px 4px' }, ['まだ誰も眠っていない'])]);
        return;
      }
      mount(graveyardBody, list.map(function (p) {
        return h('div', { class: 'panel grave-stone' }, [
          h('div', { class: 'grave-name' }, [p.name || 'PILOT']),
          h('div', { class: 'grave-line' }, ['Lv' + (p.level || 1) + ' ・ 名誉 ' + (p.honor || 0)]),
          h('div', { class: 'grave-line' }, ['出撃 ' + (p.sorties || 0) + ' ・ 勝利 ' + (p.wins || 0)]),
          h('div', { class: 'grave-kia' }, [fmtKiaDate(p.kia)])
        ]);
      }));
    },

    setUser: function (userOrNull) {
      state.user = userOrNull || null;
      renderLoginArea();
    },

    toast: function (msg) {
      var t = h('div', { class: 'toast' }, [String(msg)]);
      toastHost.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('show'); });
      setTimeout(function () {
        t.classList.remove('show');
        setTimeout(function () { t.remove(); }, 300);
      }, 2600);
    },

    battleEls: function () { return battleElsCache; },

    showResult: function (r) {
      r = r || {};
      var cls = r.myWin === true ? 'win' : (r.myWin === false ? 'lose' : 'draw');
      var unlocks = (r.unlocked || []).map(function (name) { return h('span', { class: 'unlock-chip' }, ['NEW: ' + name]); });
      var lines = (r.statLines || []).map(function (s) { return h('div', {}, [s]); });
      var shareBtn = shareBtnEl(r.shareData, '📤 結果をシェア');
      var retryBtn = h('button', { class: 'primary' }, [r.retryLabel || 'もう一度']);
      retryBtn.addEventListener('click', function () { r.onRetry && r.onRetry(); });
      var titleBtn = h('button', {}, ['タイトルへ']);
      titleBtn.addEventListener('click', function () { r.onTitle && r.onTitle(); });

      mount(resultInner, [
        h('div', { class: 'result-headline ' + cls }, [r.winTxt || '']),
        h('div', { id: 'result-time' }, [fmtDuration(r.duration)]),
        h('div', { class: 'result-credits' }, ['獲得クレジット +' + (r.credits || 0) + ' C']),
        unlocks.length ? h('div', { class: 'unlock-list' }, unlocks) : null,
        lines.length ? h('div', { class: 'stat-lines' }, lines) : null,
        shareBtn,
        replayBtnEl(r.replayUrl),
        h('div', { class: 'result-actions' }, [retryBtn, titleBtn])
      ]);
      ui.showScreen('result');
    },

    /* ---- 戦果ボックス(Ver5後半): 通常プレイでは #result 画面へ遷移せず、CONTROL の下にその場で戦果を出す。
       ステージ(3D/レーダー/実況)は止めない。呼ばれるたびに中身を作り直す。opts は showResult と同形。 ---- */
    showAftermath: function (opts) {
      opts = opts || {};
      var cls = aftermathCls(opts.winTxt);
      var lines = (opts.statLines || []).map(function (s) { return h('div', {}, [s]); });
      var shareBtn = shareBtnEl(opts.shareData, '📤 シェア');
      var retryBtn = h('button', { class: 'primary' }, [opts.retryLabel || '出撃選択へ']);
      retryBtn.addEventListener('click', function () { opts.onRetry && opts.onRetry(); });
      var titleBtn = h('button', {}, ['タイトルへ']);
      titleBtn.addEventListener('click', function () { opts.onTitle && opts.onTitle(); });

      mount(aftermathBox, [
        h('div', { class: 'aftermath-headline ' + cls }, [opts.winTxt || '']),
        h('div', { class: 'aftermath-meta' }, [fmtDuration(opts.duration), ' ・ +' + (opts.credits || 0) + ' C']),
        lines.length ? h('div', { class: 'stat-lines' }, lines) : null,
        h('div', { class: 'aftermath-actions' }, [shareBtn, replayBtnEl(opts.replayUrl), retryBtn, titleBtn])
      ]);
      aftermathBox.hidden = false;
    },

    hideAftermath: function () {
      aftermathBox.hidden = true;
      clear(aftermathBox);
    }
  };

  ui.showScreen('title');
  return ui;
}
