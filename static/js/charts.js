/* ==========================================================================
   AirAnalytics — Chart Engine
   One place that owns every chart's type, palette, style, motion and chrome.
   Pages describe WHAT to draw; this file decides HOW it looks.
   All numbers come from the backend — this layer never invents data.
   ========================================================================== */
(function (window) {
  'use strict';

  if (!window.Chart) {
    window.AACharts = { ready: false, reason: 'Chart.js not loaded' };
    return;
  }

  var STORE_KEY = 'aa:charts:v1';

  /* ------------------------------------------------------------------
     Colour presets
     ------------------------------------------------------------------ */
  var PALETTES = {
    ocean: {
      label: 'Ocean', swatch: ['#2563EB', '#06B6D4', '#3B82F6', '#22D3EE', '#60A5FA'],
      text: 'Blue + Cyan'
    },
    aurora: {
      label: 'Aurora', swatch: ['#7C3AED', '#2563EB', '#06B6D4', '#8B5CF6', '#A78BFA'],
      text: 'Purple + Blue + Cyan'
    },
    emerald: {
      label: 'Emerald', swatch: ['#10B981', '#06B6D4', '#34D399', '#22D3EE', '#059669'],
      text: 'Green + Cyan'
    },
    sunset: {
      label: 'Sunset', swatch: ['#F59E0B', '#EF4444', '#EC4899', '#FBBF24', '#7C3AED'],
      text: 'Orange + Pink + Purple'
    },
    neon: {
      label: 'Neon', swatch: ['#22D3EE', '#A78BFA', '#F0ABFC', '#67E8F9', '#C084FC'],
      text: 'Cyan + Purple'
    },
    professional: {
      label: 'Professional', swatch: ['#2563EB', '#475569', '#0EA5E9', '#94A3B8', '#1D4ED8'],
      text: 'Blue + Slate'
    }
  };

  /* ------------------------------------------------------------------
     Which chart types make sense for which data shape
     Keeps us from offering a pie chart for 144 monthly points.
     ------------------------------------------------------------------ */
  var TYPE_RULES = {
    cartesian: ['line', 'bar', 'area', 'scatter'],
    composition: ['doughnut', 'pie', 'polar', 'bar'],
    profile: ['radar', 'line', 'bar', 'area']
  };

  /* ------------------------------------------------------------------
     Defaults + persistence
     ------------------------------------------------------------------ */
  var DEFAULTS = {
    type: 'keep',        // 'keep' = leave each chart's authored type alone
    palette: 'ocean',
    style: 'standard',   // standard | gradient | glass | neon | minimal | professional
    animation: 'smooth', // none | smooth | fast | dynamic
    grid: true,
    legend: false,
    tooltip: true,
    dataLabels: false,
    smoothLine: true,
    background: 'transparent' // transparent | glass | dark | gradient
  };

  var state = load();
  var registry = [];   // { chart, spec, chartId }
  var listeners = [];

  function load() {
    var s = {};
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) s = JSON.parse(raw) || {};
    } catch (e) { /* private mode / disabled storage */ }
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = (s && s[k] !== undefined) ? s[k] : DEFAULTS[k];
    });
    return out;
  }

  function save() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------ */
  function isDark() {
    var AA = window.AirAnalytics || window.AA;
    if (AA && typeof AA.isDark === 'function') return AA.isDark();
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }
  function rgba(c, a) {
    var p = rgbOf(c);
    return 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + a + ')';
  }
  function hex(c) {
    if (!c) return '#2563EB';
    if (c.charAt(0) !== '#') return c;
    var h = c.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return h;
  }
  function rgbOf(hexStr) {
    var h = hex(hexStr);
    return {
      r: parseInt(h.slice(0, 2), 16) || 0,
      g: parseInt(h.slice(2, 4), 16) || 0,
      b: parseInt(h.slice(4, 6), 16) || 0
    };
  }

  function palette() {
    return (PALETTES[state.palette] || PALETTES.ocean).swatch;
  }

  function colorAt(i) {
    var p = palette();
    return p[i % p.length];
  }

  /* ------------------------------------------------------------------
     Value labels drawn by us, so no extra plugin dependency is needed.
     Renders one short string above each point / bar and skips nulls.
     ------------------------------------------------------------------ */
  var valueLabels = {
    id: 'aaValueLabels',
    afterDatasetsDraw: function (chart) {
      if (!state.dataLabels) return;
      var ctx = chart.ctx;
      var meta0 = chart.getDatasetMeta(0);
      if (!meta0 || meta0.hidden) return;
      var dark = isDark();
      ctx.save();
      ctx.font = '700 10px ' + (chart.options && chart.options.font
        ? 'inherit' : 'system-ui, sans-serif');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      chart.data.datasets.forEach(function (ds, di) {
        var meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        var fmt = (chart.$aa && chart.$aa.labelFormatter) || function (v) { return v; };
        meta.data.forEach(function (el, i) {
          if (!el) return;
          var v = ds.data[i];
          if (v === null || v === undefined || v === '') return;
          var text;
          try { text = fmt(v); } catch (e) { text = v; }
          if (text === null || text === undefined || text === '') return;
          text = String(text);
          if (text.length > 8) text = text.slice(0, 8);
          var y = el.y - 6;
          var maxRot = (meta.type === 'bar' ? el.height : 6);
          if (y - maxRot < 2) y = el.y + (meta.type === 'bar' ? el.height + 12 : 14);
          ctx.fillStyle = dark ? '#E2E8F0' : '#1E293B';
          ctx.fillText(text, el.x, y);
        });
      });
      ctx.restore();
    }
  };
  if (window.Chart && Chart.register) {
    try { Chart.register(valueLabels); } catch (e) { /* already registered */ }
  }

  /* vertical gradient used for filled areas */
  function areaGradient(ctx, c1, c2, height) {
    if (!ctx) return rgba(c1, 0.16);
    var g = ctx.createLinearGradient(0, 0, 0, height || 300);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2 || 'rgba(0,0,0,0)');
    return g;
  }

  function motion() {
    var AA = window.AirAnalytics || window.AA;
    var reduced = AA && typeof AA.reduceMotion === 'function' ? AA.reduceMotion() : false;
    if (reduced) return { duration: 0 };
    if (state.animation === 'none') return { duration: 0 };
    if (state.animation === 'fast') return { duration: 320, easing: 'easeOutQuart' };
    if (state.animation === 'dynamic') return { duration: 1100, easing: 'easeInOutCubic' };
    return { duration: 700, easing: 'easeOutQuart' };
  }

  /* ------------------------------------------------------------------
     Style presets
     ------------------------------------------------------------------ */
  function styleCfg() {
    var dark = isDark();
    switch (state.style) {
      case 'minimal':
        return {
          grid: false, border: 1, pointRadius: 0, borderWidth: 2,
          fill: false, ticks: 11, glow: false
        };
      case 'neon':
        return {
          grid: true, border: 3, pointRadius: 2, borderWidth: 3,
          fill: true, ticks: 12, glow: true, shadow: true
        };
      case 'glass':
        return {
          grid: true, border: 2, pointRadius: 2, borderWidth: 2.5,
          fill: true, ticks: 10, alphaScale: 0.55, glass: true
        };
      case 'gradient':
        return {
          grid: true, border: 1, pointRadius: 2, borderWidth: 2.5,
          fill: true, ticks: 10, gradientFill: true
        };
      case 'professional':
        return {
          grid: true, border: 1, pointRadius: 3, borderWidth: 2.5,
          fill: true, ticks: 10, gradientFill: true, pointBorder: true
        };
      default: /* standard */
        return {
          grid: true, border: 1, pointRadius: 2, borderWidth: 2.5,
          fill: true, ticks: 11
        };
    }
  }

  /* ------------------------------------------------------------------
     Chart background decoration (drawn on the canvas, so it scales freely)
     ------------------------------------------------------------------ */
  function decorateCanvas(canvas) {
    if (!canvas) return;
    var mode = state.background;
    if (mode === 'transparent') {
      canvas.style.background = '';
      canvas.style.borderRadius = '';
      canvas.style.border = '';
      return;
    }
    var cs = getComputedStyle(document.documentElement);
    if (mode === 'glass') {
      canvas.style.background = 'var(--card-glass)';
      canvas.style.border = '1px solid var(--glass-border)';
      canvas.style.borderRadius = 'var(--r-md)';
      canvas.style.backdropFilter = 'blur(14px)';
      canvas.style.webkitBackdropFilter = 'blur(14px)';
    } else if (mode === 'dark') {
      canvas.style.background = '#020617';
      canvas.style.border = '1px solid rgba(148,176,235,.14)';
      canvas.style.borderRadius = 'var(--r-md)';
    } else if (mode === 'gradient') {
      canvas.style.background = 'linear-gradient(160deg, rgba(37,99,235,.10), rgba(124,58,237,.10) 55%, rgba(6,182,212,.10))';
      canvas.style.border = '1px solid var(--border)';
      canvas.style.borderRadius = 'var(--r-md)';
    }
    if (mode !== 'transparent') {
      canvas.style.padding = '6px';
    }
  }

  /* ------------------------------------------------------------------
     Build a full Chart.js config from a compact spec
     ------------------------------------------------------------------ */
  function buildConfig(spec, ctx, height) {
    var st = styleCfg();
    var dark = isDark();
    var type = resolveType(spec);
    var colors = palette();
    var cfgType = (type === 'area') ? 'line' : type;

    var isDoughnutish = (type === 'doughnut' || type === 'pie' || type === 'polar');

    var gridColor = dark ? 'rgba(51,65,85,.55)' : 'rgba(226,232,240,.9)';
    var tickColor = cssVar('--muted', dark ? '#94A3B8' : '#64748B');
    var borderColor = dark ? 'rgba(148,176,235,.16)' : 'rgba(203,213,225,.9)';

    var datasets = (spec.datasets || []).map(function (d, i) {
      var base = colorAt(i);
      var out = {};
      for (var k in d) { if (Object.prototype.hasOwnProperty.call(d, k)) out[k] = d[k]; }
      out.label = d.label || ('Series ' + (i + 1));

      if (isDoughnutish) {
        out.backgroundColor = d.backgroundColor || colors;
        out.borderColor = dark ? '#0B1220' : '#FFFFFF';
        out.borderWidth = 2;
        out.hoverOffset = 10;
        return out;
      }

      var c1 = base;
      var c2 = colorAt(i + 1);
      if (st.glow) {
        c1 = c1;
        out.borderColor = c1;
        out.borderWidth = st.borderWidth;
        out.shadowColor = rgba(c1, 0.75);
        out.shadowBlur = 14;
        out.shadowOffsetY = 4;
      } else {
        out.borderColor = c1;
        out.borderWidth = st.borderWidth;
      }

      if (cfgType === 'line' || cfgType === 'scatter') {
        out.tension = (state.smoothLine && d.tension === undefined) ? 0.38 : (d.tension || 0);
        out.pointRadius = d.pointRadius !== undefined ? d.pointRadius : st.pointRadius;
        out.pointHoverRadius = (d.pointHoverRadius !== undefined ? d.pointHoverRadius : st.pointRadius + 3);
        out.pointBackgroundColor = d.pointBackgroundColor || c1;
        out.pointBorderColor = d.pointBorderColor || (st.pointBorder ? (dark ? '#0B1220' : '#fff') : c1);
        out.pointBorderWidth = d.pointBorderWidth !== undefined ? d.pointBorderWidth : (st.pointBorder ? 2 : 0);
        out.borderDash = d.borderDash || [];
        out.spanGaps = d.spanGaps !== undefined ? d.spanGaps : true;

        var shouldFill = d.fill !== undefined ? d.fill : (type === 'area' || st.fill);
        out.fill = shouldFill;
        if (shouldFill) {
          if (st.gradientFill) {
            out.backgroundColor = areaGradient(ctx, rgba(c1, 0.34), rgba(c1, 0.02), height);
          } else {
            var a = st.alphaScale || (dark ? 0.20 : 0.13);
            out.backgroundColor = d.backgroundColor || rgba(c1, a);
          }
        } else if (d.backgroundColor) {
          out.backgroundColor = d.backgroundColor;
        }
      } else {
        // bar
        var r = d.borderRadius !== undefined ? d.borderRadius : 7;
        out.borderRadius = r;
        out.borderSkipped = false;
        out.barPercentage = d.barPercentage || 0.68;
        out.categoryPercentage = d.categoryPercentage || 0.78;
        if (st.gradientFill && !d.backgroundColor) {
          out.backgroundColor = areaGradient(ctx, c1, rgba(c1, 0.55), height);
        } else if (d.backgroundColor) {
          out.backgroundColor = d.backgroundColor;
        } else if (typeof d.singleColor !== 'undefined') {
          out.backgroundColor = d.singleColor;
        } else {
          // colour each bar only when the dataset is a small categorical list
          var n = (d.data || []).length;
          out.backgroundColor = (n > 0 && n <= 14 && d.perPoint !== false)
            ? (d.data || []).map(function (_, bi) { return colorAt(bi); })
            : rgba(c1, dark ? 0.82 : 0.9);
          if (st.glow) {
            out.borderColor = rgba(c1, 0.9);
            out.borderWidth = 1;
          }
        }
      }
      return out;
    });

    var options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: motion(),
      interaction: { mode: (state.tooltip ? 'index' : 'nearest'), intersect: false },
      layout: { padding: st.glow ? 6 : 2 },
      plugins: {
        legend: {
          display: !!state.legend,
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true, boxWidth: 8, padding: 14,
            color: tickColor, font: { weight: 700, size: 11 }
          }
        },
        tooltip: {
          enabled: state.tooltip !== false,
          backgroundColor: dark ? 'rgba(11,18,32,.96)' : 'rgba(15,23,42,.95)',
          titleColor: '#F8FAFC',
          bodyColor: '#E2E8F0',
          borderColor: dark ? 'rgba(148,176,235,.22)' : 'rgba(255,255,255,.16)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 12,
          displayColors: true,
          boxPadding: 6,
          titleFont: { weight: 800, size: 12 },
          bodyFont: { size: 12 },
          callbacks: spec.tooltipCallbacks || {}
        }
      }
    };

    if (!isDoughnutish) {
      var yFmt = spec.yFormat;
      options.scales = {
        x: {
          grid: { display: !!state.grid && st.grid !== false, color: gridColor, drawBorder: false },
          border: { display: false },
          ticks: { color: tickColor, maxTicksLimit: spec.maxTicks || 12, font: { weight: 600, size: st.ticks } }
        },
        y: {
          grid: { display: !!state.grid && st.grid !== false, color: gridColor, drawBorder: false },
          border: { display: false },
          beginAtZero: spec.beginAtZero !== false,
          ticks: {
            color: tickColor, font: { weight: 600, size: st.ticks },
            callback: yFmt ? function (v) { return yFmt(v); } : undefined
          }
        }
      };
    } else {
      options.cutout = type === 'doughnut' ? '62%' : 0;
      options.radius = '78%';
    }

    if (type === 'radar') {
      delete options.scales;
      options.scales = {
        r: {
          grid: { color: gridColor },
          angleLines: { color: gridColor },
          pointLabels: { color: tickColor, font: { weight: 700, size: 11 } },
          ticks: { display: false, backdropColor: 'transparent' }
        }
      };
    }
    if (type === 'polar') {
      delete options.scales;
    }

    return { type: cfgType, data: { labels: spec.labels || [], datasets: datasets }, options: options };
  }

  function resolveType(spec) {
    if (state.type && state.type !== 'keep') {
      // respect per-dataset suitability
      var allowed = TYPE_RULES[spec.shape || 'cartesian'];
      if (!allowed || allowed.indexOf(state.type) !== -1) return state.type;
    }
    return spec.type || 'line';
  }

  /* ------------------------------------------------------------------
     Public: render / update
     ------------------------------------------------------------------ */
  function paint(entry) {
    var spec = entry.spec;
    var canvas = entry.canvas;
    if (!canvas) return;
    var box = canvas.parentElement;
    var height = box ? box.clientHeight : 300;
    var ctx = canvas.getContext('2d');
    decorateCanvas(canvas);
    try {
      entry.chart = new Chart(ctx, buildConfig(spec, ctx, height));
      if (entry.chart) entry.chart.$aa = { labelFormatter: spec.labelFormatter };
    } catch (e) {
      // never let a bad option break the page
      if (window.console) console.warn('[AACharts] fallback render for', entry.id, e);
      try {
        entry.chart = new Chart(ctx, {
          type: 'line',
          data: { labels: spec.labels || [], datasets: (spec.datasets || []).map(function (d) {
            return { label: d.label, data: d.data, borderColor: colorAt(0), borderWidth: 2, tension: 0.35 };
          }) },
          options: { responsive: true, maintainAspectRatio: false }
        });
      } catch (e2) {
        if (window.console) console.error('[AACharts] could not render', entry.id, e2);
      }
    }
  }

  function destroyAll() {
    registry.forEach(function (e) {
      if (e.chart) { try { e.chart.destroy(); } catch (err) {} }
      e.chart = null;
    });
  }

  var AACharts = {
    ready: true,
    PALETTES: PALETTES,
    TYPE_RULES: TYPE_RULES,
    DEFAULTS: DEFAULTS,

    get: function () { return Object.assign({}, state); },
    isCustomised: function () { return state.type !== DEFAULTS.type; },

    paletteNames: function () { return Object.keys(PALETTES); },
    typesFor: function (shape) { return (TYPE_RULES[shape || 'cartesian'] || []).slice(); },

    set: function (patch, silent) {
      var changed = false;
      Object.keys(patch || {}).forEach(function (k) {
        if (state[k] !== patch[k]) { state[k] = patch[k]; changed = true; }
      });
      if (Object.keys(patch || {}).length) save();
      if (changed && !silent) AACharts.renderAll();
      if (changed && !silent) listeners.forEach(function (fn) { try { fn(AACharts.get()); } catch (e) {} });
      return changed;
    },

    reset: function () {
      state = Object.assign({}, DEFAULTS);
      save();
      AACharts.renderAll();
      listeners.forEach(function (fn) { try { fn(AACharts.get()); } catch (e) {} });
    },

    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },

    /* spec: { id, type, shape, labels, datasets:[{label,data,...}], yFormat, maxTicks, tooltipCallbacks, labelFormatter } */
    create: function (spec) {
      var canvas = document.getElementById(spec.id);
      if (!canvas) return null;
      var entry = { id: spec.id, spec: spec, canvas: canvas, chart: null };
      registry.push(entry);
      paint(entry);
      return entry.chart;
    },

    renderAll: function () {
      destroyAll();
      registry.forEach(function (e) {
        if (document.body.contains(e.canvas)) paint(e);
      });
    },

    /* re-theme without touching user options */
    retheme: function () { AACharts.renderAll(); },

    destroy: function () { destroyAll(); registry = []; }
  };

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  AACharts.init = function () {
    var AA = window.AirAnalytics || window.AA;
    if (AA && typeof AA.initTheme === 'function') AA.initTheme();

    window.addEventListener('themeChanged', function () { AACharts.retheme(); });

    // appearance panel can drive chart colours too
    window.addEventListener('aa:appearance', function (e) {
      var d = e && e.detail;
      if (d && d.accent) {
        var map = { blue: 'ocean', cyan: 'aurora', purple: 'aurora', green: 'emerald', orange: 'sunset' };
        if (state.palette === DEFAULTS.palette) {
          AACharts.set({ palette: map[d.accent] || state.palette });
        }
      }
    });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        registry.forEach(function (e) {
          if (e.chart && document.body.contains(e.canvas)) e.chart.resize();
        });
      }, 160);
    });
  };

  window.AACharts = AACharts;
})(window);
