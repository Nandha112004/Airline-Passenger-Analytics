/* ==========================================================================
   AirAnalytics — Settings Panel
   A single drawer that hosts the Chart Customisation panel and the
   Appearance panel. Markup is generated here so every page gets it for
   free without touching templates.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var AA = window.AirAnalytics || (window.AirAnalytics = {});

  var CHART_LABELS = {
    keep: 'Auto (per chart)', line: 'Line', bar: 'Bar', area: 'Area',
    pie: 'Pie', doughnut: 'Doughnut', radar: 'Radar', scatter: 'Scatter',
    polar: 'Polar'
  };

  var STYLE_LABELS = {
    standard: 'Standard', gradient: 'Gradient', glass: 'Glass',
    neon: 'Neon', minimal: 'Minimal', professional: 'Professional'
  };

  var ANIM_LABELS = { none: 'None', smooth: 'Smooth', fast: 'Fast', dynamic: 'Dynamic' };
  var BG_LABELS = { transparent: 'Transparent', glass: 'Glass', dark: 'Dark', gradient: 'Gradient' };

  var APP_LABELS = {
    cardStyle: { glass: 'Glass', solid: 'Solid', minimal: 'Minimal' },
    radius: { sharp: 'Sharp', default: 'Default', round: 'Round' },
    motion: { full: 'Full', reduced: 'Reduced', none: 'None' },
    sidebar: { glass: 'Glass', solid: 'Solid', minimal: 'Minimal' },
    background: { aurora: 'Aurora', mesh: 'Mesh', grid: 'Grid', minimal: 'Minimal' },
    density: { comfortable: 'Comfortable', compact: 'Compact' }
  };

  var APP_ICONS = {
    cardStyle: 'bi-layers', radius: 'bi-bounding-box-circles', motion: 'bi-speedometer2',
    sidebar: 'bi-layout-sidebar-inset', background: 'bi-stars', density: 'bi-arrows-collapse'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- fragment builders ---------------- */

  function segGroup(name, options, current, icon) {
    var h = ['<div class="aa-seg" role="radiogroup">'];
    Object.keys(options).forEach(function (key) {
      var on = key === current ? ' is-active' : '';
      h.push(
        '<label class="aa-seg__opt' + on + '">' +
          '<input type="radio" name="' + name + '" value="' + esc(key) + '"' +
            (key === current ? ' checked' : '') + '>' +
          (icon ? '<i class="bi ' + icon + '"></i>' : '') +
          esc(options[key]) +
        '</label>'
      );
    });
    h.push('</div>');
    return h.join('');
  }

  function toggleRow(name, label, hint, checked) {
    return (
      '<div class="aa-toggle-row">' +
        '<div class="aa-toggle-row__text">' + esc(label) +
          (hint ? '<small>' + esc(hint) + '</small>' : '') +
        '</div>' +
        '<span class="aa-switch">' +
          '<input type="checkbox" id="aa-' + name + '" data-aa-toggle="' + name + '"' + (checked ? ' checked' : '') + '>' +
          '<span class="aa-switch__track"></span>' +
        '</span>' +
      '</div>'
    );
  }

  function field(label, icon, inner, hint) {
    return (
      '<div class="aa-field">' +
        '<div class="aa-field__label"><i class="bi ' + icon + '"></i>' + esc(label) + '</div>' +
        inner +
        (hint ? '<div class="aa-field__hint">' + esc(hint) + '</div>' : '') +
      '</div>'
    );
  }

  function swatchRow(names, palettes, current) {
    var h = ['<div class="aa-swatches">'];
    names.forEach(function (n) {
      var p = palettes[n];
      if (!p) return;
      var stops = p.swatch.slice(0, 3).map(function (c, i) {
        return c + ' ' + (i * 50) + '%, ' + c + ' 100%';
      });
      // simple 3-stop diagonal
      var bg = 'linear-gradient(135deg,' + p.swatch[0] + ' 0%,' + p.swatch[1] + ' 55%,' + p.swatch[2] + ' 100%)';
      h.push(
        '<div style="text-align:center">' +
          '<button type="button" class="aa-swatch' + (n === current ? ' is-active' : '') +
            '" data-aa-swatch="' + esc(n) + '" title="' + esc(p.label + ' — ' + p.text) + '"' +
            ' aria-label="' + esc(p.label + ' palette') + '"' +
            (n === current ? ' aria-pressed="true"' : '') +
            ' style="background:' + bg + '">' +
            '<span style="background:' + esc(p.swatch[0]) + '"></span>' +
          '</button>' +
          '<div class="aa-swatch__name">' + esc(p.label) + '</div>' +
        '</div>'
      );
    });
    h.push('</div>');
    return h.join('');
  }

  /* ---------------- chart tab ---------------- */

  function chartTab() {
    if (!window.AACharts || !window.AACharts.ready) return '';
    var s = window.AACharts.get();
    var shape = 'cartesian';
    var supported = window.AACharts.typesFor(shape);
    var typeOptions = { keep: CHART_LABELS.keep };
    supported.forEach(function (t) { typeOptions[t] = CHART_LABELS[t] || t; });

    return [
      field('Chart Type', 'bi-bar-chart', segGroup('aaType', typeOptions, s.type, null),
        'Auto keeps each chart\'s most readable type for its data shape.'),
      field('Colour Preset', 'bi-palette', swatchRow(window.AACharts.paletteNames(), window.AACharts.PALETTES, s.palette)),
      field('Chart Style', 'bi-brush', segGroup('aaStyle', STYLE_LABELS, s.style, null)),
      field('Animation', 'bi-play-circle', segGroup('aaAnim', ANIM_LABELS, s.animation, null)),
      field('Canvas Background', 'bi-window', segGroup('aaBg', BG_LABELS, s.background, null)),
      field('Display', 'bi-eye', [
        toggleRow('grid', 'Grid lines', 'Axis guide lines', s.grid),
        toggleRow('legend', 'Legend', 'Dataset labels above the plot', s.legend),
        toggleRow('tooltip', 'Tooltips', 'Hover value callouts', s.tooltip),
        toggleRow('dataLabels', 'Data labels', 'Values printed on points', s.dataLabels),
        toggleRow('smoothLine', 'Smooth curves', 'Rounded line interpolation', s.smoothLine)
      ].join('')),
      '<div class="alert alert-info small mb-0 d-flex gap-2 align-items-start">' +
        '<i class="bi bi-info-circle-fill mt-1"></i>' +
        '<div>Charts always plot values computed by the Django backend. Styling here never changes the numbers.</div>' +
      '</div>'
    ].join('');
  }

  /* ---------------- appearance tab ---------------- */

  function appearanceTab() {
    if (!AA.APPEARANCE) return '';
    var s = AA.APPEARANCE.get();

    var accentNames = Object.keys(AA.APPEARANCE.ACCENTS);
    var accentPal = {};
    accentNames.forEach(function (n) {
      accentPal[n] = { label: AA.APPEARANCE.ACCENTS[n].label, swatch: [AA.APPEARANCE.ACCENTS[n].primary, '#22D3EE', '#8B5CF6'], text: '' };
    });

    var h = [];

    h.push(field('Theme', 'bi-circle-half',
      segGroup('aaTheme', { light: 'Light', dark: 'Dark' }, AA.getTheme(), null)
    ));

    h.push(field('Accent Colour', 'bi-droplet-half',
      swatchRow(accentNames, accentPal, s.accent),
      'Applies to buttons, active states, charts and highlights.'
    ));

    Object.keys(APP_LABELS).forEach(function (key) {
      h.push(field(key.charAt(0).toUpperCase() + key.slice(1), APP_ICONS[key], segGroup('aaApp_' + key, APP_LABELS[key], s[key], null)));
    });

    return h.join('');
  }

  /* ---------------- shell ---------------- */

  function build() {
    if (document.getElementById('aaSettingsPanel')) return;

    var hasCharts = !!(window.AACharts && window.AACharts.ready);
    var hasAppearance = !!AA.APPEARANCE;

    var backdrop = document.createElement('div');
    backdrop.className = 'aa-panel-backdrop';
    backdrop.id = 'aaPanelBackdrop';

    var panel = document.createElement('aside');
    panel.className = 'aa-panel';
    panel.id = 'aaSettingsPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Appearance and chart settings');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = [
      '<div class="aa-panel__head">',
        '<span class="pill-icon pill-icon--sm" style="background:var(--grad-primary)"><i class="bi bi-sliders"></i></span>',
        '<div class="flex-grow-1">',
          '<h2 class="aa-panel__title">Customise</h2>',
          '<p class="aa-panel__sub">Appearance &amp; charts — saved on this device</p>',
        '</div>',
        '<button class="icon-btn" id="aaPanelClose" aria-label="Close settings"><i class="bi bi-x-lg"></i></button>',
      '</div>',
      (hasAppearance && hasCharts
        ? '<div class="aa-panel__tabs" role="tablist">' +
            '<button class="aa-panel__tab is-active" data-aa-tab="app" role="tab" aria-selected="true"><i class="bi bi-brush me-1"></i>Appearance</button>' +
            '<button class="aa-panel__tab" data-aa-tab="chart" role="tab" aria-selected="false"><i class="bi bi-bar-chart me-1"></i>Charts</button>' +
          '</div>'
        : ''),
      '<div class="aa-panel__body">',
        '<div data-aa-pane="app">' + appearanceTab() + '</div>',
        (hasCharts ? '<div data-aa-pane="chart" hidden>' + chartTab() + '</div>' : ''),
      '</div>',
      '<div class="aa-panel__foot">',
        '<button class="btn btn-ghost btn-sm flex-grow-1" id="aaPanelReset"><i class="bi bi-arrow-counterclockwise me-1"></i>Reset</button>',
        '<button class="btn btn-primary btn-sm flex-grow-1" id="aaPanelDone"><i class="bi bi-check-lg me-1"></i>Done</button>',
      '</div>'
    ].join('');

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    var fab = document.createElement('button');
    fab.className = 'aa-fab';
    fab.id = 'aaPanelFab';
    fab.type = 'button';
    fab.title = 'Customise appearance and charts';
    fab.setAttribute('aria-label', 'Open appearance and chart settings');
    fab.innerHTML = '<i class="bi bi-sliders2"></i>';
    document.body.appendChild(fab);

    wire(fab, backdrop, panel);
  }

  function open() {
    var panel = document.getElementById('aaSettingsPanel');
    var backdrop = document.getElementById('aaPanelBackdrop');
    if (!panel) return;
    refresh();
    panel.classList.add('is-open');
    backdrop.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    var first = panel.querySelector('input, button');
    if (first) setTimeout(function () { first.focus(); }, 260);
  }

  function close() {
    var panel = document.getElementById('aaSettingsPanel');
    var backdrop = document.getElementById('aaPanelBackdrop');
    if (!panel) return;
    panel.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  }

  function refresh() {
    if (!window.AACharts || !window.AACharts.ready) return;
    var s = window.AACharts.get();
    setSeg('aaType', s.type);
    setSeg('aaStyle', s.style);
    setSeg('aaAnim', s.animation);
    setSeg('aaBg', s.background);
    markSwatch(s.palette);
    ['grid', 'legend', 'tooltip', 'dataLabels', 'smoothLine'].forEach(function (k) {
      var el = document.querySelector('[data-aa-toggle="' + k + '"]');
      if (el) el.checked = !!s[k];
    });
  }

  function setSeg(name, value) {
    var inputs = document.querySelectorAll('input[name="' + name + '"]');
    inputs.forEach(function (i) {
      var on = i.value === value;
      i.checked = on;
      if (i.parentElement) i.parentElement.classList.toggle('is-active', on);
    });
  }

  function markSwatch(name) {
    document.querySelectorAll('[data-aa-swatch]').forEach(function (b) {
      var on = b.getAttribute('data-aa-swatch') === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function wire(fab, backdrop, panel) {
    fab.addEventListener('click', open);
    backdrop.addEventListener('click', close);
    document.getElementById('aaPanelClose').addEventListener('click', close);
    document.getElementById('aaPanelDone').addEventListener('click', close);

    document.getElementById('aaPanelReset').addEventListener('click', function () {
      if (AA.APPEARANCE) AA.APPEARANCE.reset();
      if (window.AACharts) window.AACharts.reset();
      refresh();
      AA.toast && AA.toast('Settings reset to defaults', 'info');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) close();
    });

    // tabs
    panel.querySelectorAll('[data-aa-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var which = tab.getAttribute('data-aa-tab');
        panel.querySelectorAll('[data-aa-tab]').forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        panel.querySelectorAll('[data-aa-pane]').forEach(function (p) {
          p.hidden = p.getAttribute('data-aa-pane') !== which;
        });
      });
    });

    // chart settings
    panel.addEventListener('change', function (e) {
      var t = e.target;
      if (!window.AACharts || !window.AACharts.ready) return;

      if (t.name === 'aaType')   { setSeg('aaType', t.value);   window.AACharts.set({ type: t.value }); }
      if (t.name === 'aaStyle')  { setSeg('aaStyle', t.value);  window.AACharts.set({ style: t.value }); }
      if (t.name === 'aaAnim')   { setSeg('aaAnim', t.value);   window.AACharts.set({ animation: t.value }); }
      if (t.name === 'aaBg')     { setSeg('aaBg', t.value);     window.AACharts.set({ background: t.value }); }
      if (t.name === 'aaTheme')  {
        setSeg('aaTheme', t.value);
        if (AA.setTheme) AA.setTheme(t.value);
      }
      if (t.hasAttribute && t.hasAttribute('data-aa-toggle')) {
        var key = t.getAttribute('data-aa-toggle');
        var patch = {};
        patch[key] = !!t.checked;
        window.AACharts.set(patch);
      }
      if (t.name && t.name.indexOf('aaApp_') === 0) {
        var key = t.name.slice(7);
        if (AA.APPEARANCE) {
          var patch = {}; patch[key] = t.value;
          AA.APPEARANCE.set(patch);
        }
        setSeg(t.name, t.value);
      }
    });

    // swatches
    panel.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-aa-swatch]');
      if (!b) return;
      var name = b.getAttribute('data-aa-swatch');
      if (window.AACharts && window.AACharts.PALETTES[name]) {
        markSwatch(name);
        window.AACharts.set({ palette: name });
      } else if (AA.APPEARANCE && AA.APPEARANCE.ACCENTS[name]) {
        markSwatch(name);
        AA.APPEARANCE.set({ accent: name });
      }
    });
  }

  AA.SettingsPanel = { open: open, close: close, build: build };

  document.addEventListener('DOMContentLoaded', function () {
    build();
  });
})(window, document);
