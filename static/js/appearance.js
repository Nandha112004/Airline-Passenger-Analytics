/* ==========================================================================
   AirAnalytics — Appearance Engine
   User-controlled look & feel, persisted locally and applied as data-*
   attributes on <html> so CSS can respond without any re-render.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var KEY = 'aa:appearance:v1';

  var ACCENTS = {
    blue:   { label: 'Blue',   primary: '#2563EB', grad: 'linear-gradient(135deg,#2563EB 0%,#06B6D4 100%)' },
    cyan:   { label: 'Cyan',   primary: '#0891B2', grad: 'linear-gradient(135deg,#0891B2 0%,#22D3EE 100%)' },
    purple: { label: 'Purple', primary: '#7C3AED', grad: 'linear-gradient(135deg,#7C3AED 0%,#EC4899 100%)' },
    green:  { label: 'Green',  primary: '#059669', grad: 'linear-gradient(135deg,#059669 0%,#22D3EE 100%)' },
    orange: { label: 'Orange', primary: '#EA580C', grad: 'linear-gradient(135deg,#F59E0B 0%,#EF4444 100%)' }
  };

  var DEFAULTS = {
    accent: 'blue',
    cardStyle: 'glass',   // glass | solid | minimal
    radius: 'default',    // sharp | default | round
    motion: 'full',        // full | reduced | none
    sidebar: 'glass',      // glass | solid | minimal
    background: 'aurora',  // aurora | mesh | grid | minimal
    density: 'comfortable' // comfortable | compact
  };

  var state = load();
  var listeners = [];

  function load() {
    var s = {};
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) s = JSON.parse(raw) || {};
    } catch (e) {}
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = (s && s[k] !== undefined) ? s[k] : DEFAULTS[k];
    });
    return out;
  }

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function root() { return document.documentElement; }

  /* ------------------------------------------------------------------
     Apply — everything is expressed as data attributes
     ------------------------------------------------------------------ */
  function apply(silent) {
    var el = root();
    var accent = ACCENTS[state.accent] || ACCENTS.blue;

    el.setAttribute('data-accent', state.accent);
    el.setAttribute('data-card', state.cardStyle);
    el.setAttribute('data-radius', state.radius);
    el.setAttribute('data-motion', state.motion);
    el.setAttribute('data-sidebar', state.sidebar);
    el.setAttribute('data-bg', state.background);
    el.setAttribute('data-density', state.density);

    el.style.setProperty('--accent-primary', accent.primary);
    el.style.setProperty('--grad-accent-live', accent.grad);

    if (!silent) {
      listeners.forEach(function (fn) { try { fn(get()); } catch (e) {} });
      window.dispatchEvent(new CustomEvent('aa:appearance', { detail: get() }));
    }
  }

  function get() { return Object.assign({}, state); }

  function set(patch, silent) {
    var changed = false;
    Object.keys(patch || {}).forEach(function (k) {
      if (DEFAULTS[k] !== undefined && state[k] !== patch[k]) { state[k] = patch[k]; changed = true; }
    });
    if (Object.keys(patch || {}).length) { save(); apply(silent); }
    return changed;
  }

  function reset() {
    state = Object.assign({}, DEFAULTS);
    save();
    apply();
  }

  /* ------------------------------------------------------------------
     Theme (dark / light) — kept here so the panel owns all appearance
     ------------------------------------------------------------------ */
  function isDark() { return root().getAttribute('data-theme') === 'dark'; }

  function setTheme(theme) {
    var t = theme === 'dark' ? 'dark' : 'light';
    root().setAttribute('data-theme', t);
    try { window.localStorage.setItem('aa:theme', t); } catch (e) {}
    var btns = document.querySelectorAll('#themeBtn i, #themeBtn2 i, [data-theme-icon] i');
    btns.forEach(function (i) {
      i.className = t === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
    });
    var labels = document.querySelectorAll('[data-theme-label]');
    labels.forEach(function (l) { l.textContent = t === 'dark' ? 'Dark' : 'Light'; });
    window.dispatchEvent(new Event('themeChanged'));
    if (window.AACharts) window.AACharts.retheme();
  }

  function toggleTheme() { setTheme(isDark() ? 'light' : 'dark'); }

  function initTheme() {
    var t = 'light';
    try {
      t = window.localStorage.getItem('aa:theme')
        || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch (e) {}
    setTheme(t);
  }

  /* ------------------------------------------------------------------
     Respect the OS preference for animation, but let the user override
     ------------------------------------------------------------------ */
  function reduceMotion() {
    var m = state.motion;
    if (m === 'none') return true;
    if (m === 'reduced') return true;
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  var AA = window.AirAnalytics || (window.AirAnalytics = {});
  // landing.js and several templates use the short `AA` alias
  window.AA = AA;

  AA.APPEARANCE = {
    DEFAULTS: DEFAULTS,
    ACCENTS: ACCENTS,
    get: get,
    set: set,
    reset: reset,
    apply: apply,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  };

  /* keep the older helpers working (app.js + templates depend on them) */
  AA.getTheme = function () { return root().getAttribute('data-theme') || 'light'; };
  AA.isDark = isDark;
  AA.setTheme = setTheme;
  AA.toggleTheme = toggleTheme;
  AA.initTheme = initTheme;
  AA.reduceMotion = reduceMotion;

  AA.initAppearance = function () {
    apply(true);
    initTheme();
  };

  document.addEventListener('DOMContentLoaded', function () {
    // theme must be resolved before first paint of charts
    initTheme();
    apply(true);
  });
})(window, document);
