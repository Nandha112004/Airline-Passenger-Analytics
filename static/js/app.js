/* ==========================================================================
   AirAnalytics — app.js
   Core shell behaviour: theme, sidebar, nav, toasts, scroll reveal,
   counters, tilt, ripple, magnetic buttons, page transitions, loader.
   No external dependencies. Respects prefers-reduced-motion.
   ========================================================================== */

(function () {
  'use strict';

  const AA = window.AirAnalytics || (window.AirAnalytics = {});

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  AA.reduceMotion = () => reduceMotion.matches;

  /* ------------------------------------------------------------------
     Theme
     ------------------------------------------------------------------ */
  const THEME_KEY = 'theme';

  AA.getTheme = function () {
    return document.documentElement.getAttribute('data-theme') || 'light';
  };

  AA.isDark = function () {
    return AA.getTheme() === 'dark';
  };

  AA.setTheme = function (theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode */ }
    const btn = document.getElementById('themeBtn');
    if (btn) btn.innerHTML = theme === 'dark' ? ICON.sun : ICON.moonStars;
    const btn2 = document.getElementById('themeBtn2');
    if (btn2) btn2.innerHTML = theme === 'dark' ? ICON.sun : ICON.moonStars;
    AA.updateChartThemes(theme);
  };

  AA.toggleTheme = function () {
    AA.setTheme(AA.isDark() ? 'light' : 'dark');
  };

  // chart pages listen for this event
  AA.updateChartThemes = function (theme) {
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: theme }));
  };

  AA.initTheme = function () {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
    if (!saved) {
      saved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeBtn');
    if (btn) btn.innerHTML = saved === 'dark' ? ICON.sun : ICON.moonStars;
    const btn2 = document.getElementById('themeBtn2');
    if (btn2) btn2.innerHTML = saved === 'dark' ? ICON.sun : ICON.moonStars;
  };

  // global (kept for inline onclick handlers used across templates)
  const ICON = {
    sun: '<i class="bi bi-sun-fill"></i>',
    moonStars: '<i class="bi bi-moon-stars-fill"></i>'
  };
  window.toggleTheme = AA.toggleTheme;

  /* ------------------------------------------------------------------
     Sidebar (app shell)
     ------------------------------------------------------------------ */
  const DESKTOP = '(min-width: 992px)';
  const mqDesktop = window.matchMedia(DESKTOP);

  function setCollapseUI(collapsed) {
    const icon = document.getElementById('sidebarToggleIcon');
    if (icon) icon.className = collapsed ? 'bi bi-layout-sidebar' : 'bi bi-layout-sidebar-inset';
    const btn = document.getElementById('sidebarToggleBtn');
    if (btn) {
      btn.setAttribute('aria-expanded', String(!collapsed));
      const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    }
  }

  function applyCollapsed(collapsed, persist) {
    const sb = document.getElementById('sidebar');
    const main = document.getElementById('mainContent');
    if (!sb || !main) return;
    sb.classList.toggle('collapsed', collapsed);
    main.classList.toggle('expanded', collapsed);
    setCollapseUI(collapsed);
    if (persist) {
      try { localStorage.setItem('sidebarCollapsed', String(collapsed)); } catch (e) { /* ignore */ }
    }
  }

  AA.toggleCollapse = function () {
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    applyCollapsed(!sb.classList.contains('collapsed'), true);
  };
  window.toggleCollapse = AA.toggleCollapse;

  AA.toggleSidebar = function (force) {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    if (!sb) return;
    const open = typeof force === 'boolean' ? force : !sb.classList.contains('show');
    sb.classList.toggle('show', open);
    if (ov) ov.classList.toggle('show', open);
    document.body.classList.toggle('nav-open', open);
    // by id: an [onclick] selector also matches the overlay, which comes
    // first in the document and would swallow the state update
    const burger = document.getElementById('sidebarDrawerBtn');
    if (burger) {
      burger.setAttribute('aria-expanded', String(open));
      const label = open ? 'Close navigation' : 'Open navigation';
      burger.setAttribute('aria-label', label);
      burger.setAttribute('title', label);
    }
    if (open) {
      const first = sb.querySelector('.nav-link');
      if (first) first.focus({ preventScroll: true });
    } else if (burger) {
      burger.focus({ preventScroll: true });
    }
  };
  window.toggleSidebar = AA.toggleSidebar;

  AA.restoreSidebar = function () {
    let saved = null;
    try { saved = localStorage.getItem('sidebarCollapsed'); } catch (e) { /* ignore */ }
    if (saved !== 'true') { setCollapseUI(false); return; }
    // a saved desktop preference must not leak into the mobile drawer
    applyCollapsed(mqDesktop.matches, false);
  };

  /* Keep the shell consistent when the viewport crosses the breakpoint. */
  (function watchBreakpoint() {
    const onChange = function (e) {
      const sb = document.getElementById('sidebar');
      if (!sb) return;
      if (!e.matches) {
        // entering desktop: drop the drawer state, honour the saved preference
        sb.classList.remove('show');
        document.body.classList.remove('nav-open');
        const ov = document.getElementById('overlay');
        if (ov) ov.classList.remove('show');
        let saved = null;
        try { saved = localStorage.getItem('sidebarCollapsed'); } catch (err) { /* ignore */ }
        applyCollapsed(saved === 'true', false);
      } else {
        // entering mobile: clear collapse so labels are always readable
        sb.classList.remove('collapsed');
        const main = document.getElementById('mainContent');
        if (main) main.classList.remove('expanded');
      }
    };
    if (mqDesktop.addEventListener) mqDesktop.addEventListener('change', onChange);
    else if (mqDesktop.addListener) mqDesktop.addListener(onChange);
  })();

  /* Escape closes the mobile drawer; focus never gets stranded. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const sb = document.getElementById('sidebar');
    if (sb && sb.classList.contains('show')) AA.toggleSidebar(false);
  });

  /* ------------------------------------------------------------------
     Toasts — replaces Django messages with animated glass toasts
     ------------------------------------------------------------------ */
  const TOAST_ICON = {
    success: '<i class="bi bi-check-lg"></i>',
    error: '<i class="bi bi-exclamation-lg"></i>',
    warning: '<i class="bi bi-exclamation-triangle"></i>',
    info: '<i class="bi bi-info-lg"></i>',
    debug: '<i class="bi bi-info-lg"></i>'
  };

  AA.toast = function (message, type) {
    type = type || 'info';
    let host = document.getElementById('aaToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'aaToastHost';
      host.className = 'toast-container';
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-atomic', 'true');
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'aa-toast aa-toast--' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML =
      '<span class="aa-toast__ico" aria-hidden="true">' + (TOAST_ICON[type] || TOAST_ICON.info) + '</span>' +
      '<div><div class="aa-toast__title">' + titleFor(type) + '</div>' +
      '<div class="aa-toast__msg">' + message + '</div></div>';
    host.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 400);
    }, 4500);
  };

  function titleFor(type) {
    return { success: 'Success', error: 'Error', warning: 'Heads up', info: 'Info' }[type] || 'Info';
  }

  AA.toastFromMessages = function (container) {
    if (!container) return;
    const items = container.querySelectorAll('.toast');
    if (!items.length) return;
    items.forEach((el) => {
      const kind = el.dataset.toastType || 'info';
      const msg = el.dataset.toastMessage || el.textContent.trim();
      el.remove();
      AA.toast(msg, kind);
    });
  };

  /* ------------------------------------------------------------------
     Scroll reveal
     ------------------------------------------------------------------ */
  AA.observeReveal = function (root) {
    const nodes = (root || document).querySelectorAll('.reveal:not(.is-in)');
    if (!nodes.length) return;
    if (AA.reduceMotion() || !('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    nodes.forEach((n) => io.observe(n));
  };

  /* ------------------------------------------------------------------
     Animated number counters
     data-count="123456" data-count-decimals="0"
     ------------------------------------------------------------------ */
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    if (isNaN(target)) return;
    const decimals = parseInt(el.dataset.countDecimals || '0', 10);
    const suffix = el.dataset.countSuffix || '';
    const prefix = el.dataset.countPrefix || '';
    if (el._aaFrame) { cancelAnimationFrame(el._aaFrame); el._aaFrame = 0; }
    if (AA.reduceMotion()) { el.textContent = prefix + fmt(target, decimals) + suffix; return; }
    const dur = 1400;
    const start = performance.now();
    function step(now) {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + fmt(target * eased, decimals) + suffix;
      el._aaFrame = p < 1 ? requestAnimationFrame(step) : 0;
    }
    el._aaFrame = requestAnimationFrame(step);
  }
  function fmt(n, d) {
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  AA.animateCounters = function (root) {
    const nodes = (root || document).querySelectorAll('[data-count]:not([data-counted])');
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window)) { nodes.forEach((n) => { n.dataset.counted = '1'; animateCount(n); }); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.dataset.counted = '1';
          animateCount(e.target);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    nodes.forEach((n) => io.observe(n));
  };

  /* ------------------------------------------------------------------
     Replay counters on demand
     ------------------------------------------------------------------ */
  function closestCounter(node) {
    let el = node;
    while (el && el !== document) {
      if (el.nodeType === 1 && el.hasAttribute('data-count')) return el;
      el = el.parentElement;
    }
    return null;
  }

  AA.replayCount = function (el) {
    if (!el || el.nodeType !== 1) return;
    animateCount(el);
    el.classList.add('is-rolling');
    clearTimeout(el._aaRollTimer);
    el._aaRollTimer = setTimeout(function () {
      el.classList.remove('is-rolling');
    }, 1500);
  };

  AA.initCountReplay = function (root) {
    const scope = root || document;
    if (scope._aaReplayBound) return;
    scope._aaReplayBound = true;

    const CONTROL = 'a, button, input, select, textarea';
    scope.querySelectorAll('.stat-card').forEach(function (card) {
      if (!card.querySelector('[data-count]')) return;
      card.classList.add('is-replayable');
      if (card.querySelector(CONTROL)) return;
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('title', 'Click to replay the count');
    });

    scope.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      if (e.target.closest(CONTROL)) return;
      const card = e.target.closest('.stat-card');
      if (card) {
        const counters = card.querySelectorAll('[data-count]');
        if (counters.length) {
          counters.forEach(function (c) { AA.replayCount(c); });
          return;
        }
      }
      const counter = closestCounter(e.target);
      if (counter) AA.replayCount(counter);
    });

    scope.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      const card = e.target.closest && e.target.closest('.stat-card[role="button"]');
      if (!card) return;
      e.preventDefault();
      const counters = card.querySelectorAll('[data-count]');
      counters.forEach(function (c) { AA.replayCount(c); });
    });
  };

  /* ------------------------------------------------------------------
     Progress bars
     ------------------------------------------------------------------ */
  AA.animateBars = function (root) {
    const bars = (root || document).querySelectorAll('.aa-progress > span[data-width]');
    if (!bars.length) return;
    if (!('IntersectionObserver' in window)) {
      bars.forEach((b) => { b.style.width = b.dataset.width + '%'; });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.style.width = e.target.dataset.width + '%'; io.unobserve(e.target); }
      });
    }, { threshold: 0.3 });
    bars.forEach((b) => io.observe(b));
  };

  /* ------------------------------------------------------------------
     3D card tilt
     ------------------------------------------------------------------ */
  AA.initTilt = function (root) {
    if (AA.reduceMotion()) return;
    if (!window.matchMedia('(hover: hover)').matches) return;
    const cards = (root || document).querySelectorAll('.tilt');
    cards.forEach((card) => {
      if (card.dataset.tiltBound) return;
      card.dataset.tiltBound = '1';
      const MAX = 6;
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.classList.add('is-tilting');
        card.style.setProperty('--ry', (px * MAX).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-py * MAX).toFixed(2) + 'deg');
      });
      card.addEventListener('mouseleave', () => {
        card.classList.remove('is-tilting');
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--rx', '0deg');
      });
    });
  };

  /* ------------------------------------------------------------------
     Magnetic buttons
     ------------------------------------------------------------------ */
  AA.initMagnetic = function (root) {
    if (AA.reduceMotion()) return;
    if (!window.matchMedia('(hover: hover)').matches) return;
    const btns = (root || document).querySelectorAll('.magnetic');
    btns.forEach((b) => {
      if (b.dataset.magneticBound) return;
      b.dataset.magneticBound = '1';
      b.addEventListener('mousemove', (e) => {
        const r = b.getBoundingClientRect();
        const dx = (e.clientX - r.left) - r.width / 2;
        const dy = (e.clientY - r.top) - r.height / 2;
        b.style.transform = 'translate(' + (dx * 0.16).toFixed(1) + 'px,' + (dy * 0.22).toFixed(1) + 'px)';
      });
      b.addEventListener('mouseleave', () => { b.style.transform = ''; });
    });
  };

  /* ------------------------------------------------------------------
     Ripple on .btn / .btn-like
     ------------------------------------------------------------------ */
  AA.initRipple = function (root) {
    (root || document).addEventListener('pointerdown', function (e) {
      const btn = e.target.closest('.btn, .icon-btn, .chip, .social-btn');
      if (!btn || AA.reduceMotion()) return;
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height);
      const ink = document.createElement('span');
      ink.className = 'ripple-ink';
      ink.style.width = ink.style.height = size + 'px';
      ink.style.left = (e.clientX - r.left - size / 2) + 'px';
      ink.style.top = (e.clientY - r.top - size / 2) + 'px';
      if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
      btn.appendChild(ink);
      setTimeout(() => ink.remove(), 620);
    });
  };

  /* ------------------------------------------------------------------
     3D plane reacts to mouse (hero)
     ------------------------------------------------------------------ */
  AA.initHeroParallax = function (root) {
    const scene = (root || document).querySelector('.plane-scene');
    if (!scene || AA.reduceMotion()) return;
    if (!window.matchMedia('(hover: hover)').matches) return;
    const plane = scene.querySelector('.plane-3d');
    if (!plane) return;
    const base = 'rotateX(18deg) rotateY(-12deg) rotateZ(-8deg)';
    scene.addEventListener('mousemove', (e) => {
      const r = scene.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const py = ((e.clientY - r.top) / r.height - 0.5) * 2;
      plane.style.animation = 'none';
      plane.style.transform = base + ' rotateY(' + (px * 22).toFixed(1) + 'deg) rotateX(' + (18 - py * 16).toFixed(1) + 'deg)';
    });
    scene.addEventListener('mouseleave', () => {
      plane.style.animation = '';
      plane.style.transform = '';
    });
  };

  /* ------------------------------------------------------------------
     Animated background particles
     ------------------------------------------------------------------ */
  AA.initParticles = function (host, count) {
    if (!host) return;
    if (AA.reduceMotion()) return;
    const n = window.innerWidth < 768 ? Math.min(count || 14, 8) : (count || 22);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span');
      p.className = 'aa-bg__particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = (100 + Math.random() * 20) + '%';
      p.style.animationDuration = (16 + Math.random() * 22) + 's';
      p.style.animationDelay = (-Math.random() * 30) + 's';
      const s = 2 + Math.random() * 4;
      p.style.width = s + 'px';
      p.style.height = s + 'px';
      p.style.opacity = String(0.2 + Math.random() * 0.5);
      frag.appendChild(p);
    }
    host.appendChild(frag);
  };

  /* ------------------------------------------------------------------
     Public navbar scroll state
     ------------------------------------------------------------------ */
  AA.initPublicNav = function (nav) {
    if (!nav) return;
    const onScroll = () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 24);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  };

  /* ------------------------------------------------------------------
     Page transitions + loader
     ------------------------------------------------------------------ */
  AA.initPageTransition = function (content) {
    if (content) content.classList.add('page-enter');
    document.addEventListener('click', function (e) {
      const a = e.target.closest('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || a.target === '_blank' || href.startsWith('#') ||
          href.startsWith('mailto:') || href.startsWith('tel:') ||
          a.hasAttribute('data-bs-toggle')) return;
      if (href.startsWith('/admin')) return;
      document.body.classList.add('is-leaving');
    });
    window.addEventListener('pageshow', function (ev) {
      if (ev.persisted) document.body.classList.remove('is-leaving');
    });
  };

  AA.initLoader = function () {
    const el = document.getElementById('aaLoader');
    if (!el) return;
    const finish = () => {
      el.classList.add('is-done');
      setTimeout(() => el.remove(), 500);
    };
    if (AA.reduceMotion()) { finish(); return; }
    // never hold the page hostage
    const t = setTimeout(finish, 1400);
    window.addEventListener('load', () => { clearTimeout(t); setTimeout(finish, 420); }, { once: true });
  };

  /* ------------------------------------------------------------------
     Floating-label fields
     ------------------------------------------------------------------ */
  AA.initFloatingFields = function (root) {
    const wraps = (root || document).querySelectorAll('.field-float');
    wraps.forEach((wrap) => {
      const control = wrap.querySelector('input, select, textarea');
      if (!control) return;
      // an empty placeholder is required for the :not(:placeholder-shown) selector
      if (!control.hasAttribute('placeholder') && control.tagName !== 'SELECT') {
        control.setAttribute('placeholder', ' ');
      }
      const sync = () => {
        wrap.classList.toggle('has-value', String(control.value || '').length > 0);
      };
      control.addEventListener('input', sync);
      control.addEventListener('change', sync);
      sync();
    });
  };

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  function initAll(root) {
    AA.observeReveal(root);
    AA.animateCounters(root);
    AA.initCountReplay(root);
    AA.animateBars(root);
    AA.initTilt(root);
    AA.initMagnetic(root);
    AA.initHeroParallax(root);
  }
  AA.initAll = initAll;

  document.addEventListener('DOMContentLoaded', function () {
    AA.initTheme();
    AA.restoreSidebar();
    AA.initPublicNav(document.getElementById('publicNav'));
    AA.initParticles(document.getElementById('aaBgParticles'), 22);
    AA.initRipple(document);
    AA.initPageTransition(document.querySelector('.main-content > .p-3, .public-body'));
    AA.initLoader();
    AA.toastFromMessages(document.getElementById('djangoMessages'));
    AA.initFloatingFields(document);
    initAll(document);
  });

  /* expose helpers used by templates */
  window.AA_ready = function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };
})();
