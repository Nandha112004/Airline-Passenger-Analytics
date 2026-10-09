/* ==========================================================================
   AirAnalytics — landing.js
   Interactive rotating globe (canvas, 2D) + hero mini-chart bars.
   Deliberately dependency-free and cheap: no WebGL, no 3D library.
   Pauses when off-screen or when the tab is hidden. Honors reduced motion.
   ========================================================================== */

(function () {
  'use strict';
  const AA = window.AirAnalytics || (window.AirAnalytics = {});

  /* ------------------------------------------------------------------
     Interactive globe
     ------------------------------------------------------------------ */
  AA.initGlobe = function (canvasId) {
    const cvs = document.getElementById(canvasId);
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const host = cvs.parentElement;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0, R = 0, cx = 0, cy = 0;
    let rot = 0;            // longitude rotation
    let tiltX = -0.28;      // latitude tilt
    let spin = 0.0032;      // auto rotation speed
    let dragX = 0, targetTilt = tiltX, dragging = false, lastX = 0, lastY = 0;
    let visible = true, raf = null, hoverIdx = -1;

    // Airports used as glowing connection points
    const CITIES = [
      { name: 'New York', lat: 40.6, lon: -74.0 },
      { name: 'London', lat: 51.5, lon: -0.1 },
      { name: 'Paris', lat: 48.9, lon: 2.3 },
      { name: 'Dubai', lat: 25.2, lon: 55.3 },
      { name: 'Mumbai', lat: 19.1, lon: 72.9 },
      { name: 'Singapore', lat: 1.35, lon: 103.8 },
      { name: 'Tokyo', lat: 35.7, lon: 139.7 },
      { name: 'Sydney', lat: -33.9, lon: 151.2 },
      { name: 'Los Angeles', lat: 34.0, lon: -118.2 },
      { name: 'Sao Paulo', lat: -23.5, lon: -46.6 },
      { name: 'Johannesburg', lat: -26.2, lon: 28.0 },
      { name: 'Toronto', lat: 43.7, lon: -79.4 }
    ];

    // A few great-circle style flight routes
    const ROUTES = [[0, 1], [1, 4], [4, 5], [5, 6], [6, 7], [8, 0], [1, 2],
                    [4, 10], [9, 0], [11, 1], [3, 4], [5, 7]];

    function resize() {
      const w = (host && host.clientWidth) || 460;
      const h = w < 520 ? w : Math.min(w, 520);
      W = w; H = h;
      cvs.width = Math.round(w * DPR);
      cvs.height = Math.round(h * DPR);
      cvs.style.width = w + 'px';
      cvs.style.height = h + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      R = Math.min(w, h) * 0.40;
      cx = w / 2; cy = h / 2;
    }

    const rad = (d) => (d * Math.PI) / 180;

    // project lat/lon -> screen; returns null when on the far side
    function project(lat, lon) {
      const phi = rad(lat);
      const lambda = rad(lon) + rot;
      const cosPhi = Math.cos(phi);
      const x = cosPhi * Math.sin(lambda);
      const y = Math.sin(phi);
      const z = cosPhi * Math.cos(lambda);           // 1 = facing viewer
      const cosT = Math.cos(tiltX), sinT = Math.sin(tiltX);
      const y2 = y * cosT - z * sinT;
      const z2 = y * sinT + z * cosT;
      return { x: cx + x * R, y: cy - y2 * R, z: z2, front: z2 > 0 };
    }

    function palette() {
      const dark = AA.isDark();
      return {
        ocean: dark ? 'rgba(10, 22, 48, 0.55)' : 'rgba(219, 234, 254, 0.45)',
        rim: dark ? 'rgba(96, 165, 250, 0.55)' : 'rgba(37, 99, 235, 0.35)',
        grid: dark ? 'rgba(96, 165, 250, 0.16)' : 'rgba(37, 99, 235, 0.14)',
        gridStrong: dark ? 'rgba(34, 211, 238, 0.28)' : 'rgba(6, 182, 212, 0.30)',
        node: '#22D3EE',
        nodeHot: '#A78BFA',
        arc: dark ? 'rgba(125, 211, 252, 0.85)' : 'rgba(37, 99, 235, 0.75)',
        glow: dark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(37, 99, 235, 0.18)'
      };
    }

    function drawSphere(p) {
      // atmospheric glow
      const g = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.42);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.72, p.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.42, 0, Math.PI * 2); ctx.fill();

      // body
      const b = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      b.addColorStop(0, AA.isDark() ? 'rgba(23, 44, 90, 0.75)' : 'rgba(255,255,255,0.75)');
      b.addColorStop(1, p.ocean);
      ctx.fillStyle = b;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = p.rim;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    function drawGrid(p) {
      ctx.lineWidth = 0.7;
      // latitude rings
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.strokeStyle = lat === 0 ? p.gridStrong : p.grid;
        ctx.beginPath();
        for (let lon = -180; lon <= 180; lon += 4) {
          const pt = project(lat, lon);
          if (!pt.front && Math.abs(lon + 180) > 1) continue;
          if (lon === -180) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }
      // longitude meridians
      for (let lon = -180; lon < 180; lon += 20) {
        ctx.strokeStyle = lon === 0 ? p.gridStrong : p.grid;
        ctx.beginPath();
        let started = false;
        for (let lat = -90; lat <= 90; lat += 4) {
          const pt = project(lat, lon);
          if (!pt.front) { started = false; continue; }
          if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }
    }

    function drawRoutes(p, t) {
      ROUTES.forEach((pair, i) => {
        const a = project(CITIES[pair[0]].lat, CITIES[pair[0]].lon);
        const b = project(CITIES[pair[1]].lat, CITIES[pair[1]].lon);
        if (!a.front || !b.front) return;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = mx - cx, dy = my - cy;
        const lift = 0.28 * R;
        const qx = mx - dx * 0.45, qy = my - dy * 0.45 - lift;
        const phase = (t / 2600 + i * 0.13) % 1;

        ctx.strokeStyle = p.arc;
        ctx.lineWidth = 1.1;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(qx, qy, b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // moving flight dot
        const u = phase;
        const iv = 1 - u;
        const px = iv * iv * a.x + 2 * iv * u * qx + u * u * b.x;
        const py = iv * iv * a.y + 2 * iv * u * qy + u * u * b.y;
        ctx.fillStyle = p.node;
        ctx.shadowColor = p.node; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      });
    }

    function drawNodes(p) {
      hoverIdx = -1;
      CITIES.forEach((c, i) => {
        const pt = project(c.lat, c.lon);
        if (!pt.front) return;
        const d = Math.hypot(pt.x - cvs.__mx, pt.y - cvs.__my);
        if (d < 26) hoverIdx = i;
        const r = i === hoverIdx ? 5 : 3.4;
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 4);
        g.addColorStop(0, i === hoverIdx ? p.nodeHot : p.node);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = i === hoverIdx ? p.nodeHot : p.node;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.fill();
      });
    }

    function drawLabel(p) {
      if (hoverIdx < 0) return;
      const c = CITIES[hoverIdx];
      const pt = project(c.lat, c.lon);
      if (!pt.front) return;
      const text = c.name;
      ctx.font = '700 12px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
      const w = ctx.measureText(text).width + 16;
      const x = pt.x + 12, y = pt.y - 10;
      ctx.fillStyle = AA.isDark() ? 'rgba(8, 16, 34, 0.9)' : 'rgba(255,255,255,0.94)';
      ctx.strokeStyle = p.rim;
      ctx.lineWidth = 1;
      const rr = 8;
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + 22, rr);
      ctx.arcTo(x + w, y + 22, x, y + 22, rr);
      ctx.arcTo(x, y + 22, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = AA.isDark() ? '#F8FAFC' : '#071224';
      ctx.fillText(text, x + 8, y + 15);
    }

    let t0 = performance.now();
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      if (!dragging && !AA.reduceMotion()) rot += spin;
      targetTilt = tiltTarget;
      tiltX += (targetTilt - tiltX) * 0.08;
      const p = palette();
      ctx.clearRect(0, 0, W, H);
      drawSphere(p);
      drawGrid(p);
      if (!AA.reduceMotion()) drawRoutes(p, now);
      drawNodes(p);
      drawLabel(p);
      if (hoverIdx >= 0) cvs.style.cursor = 'pointer';
    }

    let tiltTarget = tiltX;

    // ---------- interaction ----------
    cvs.addEventListener('pointerdown', (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      cvs.setPointerCapture(e.pointerId);
    });
    cvs.addEventListener('pointermove', (e) => {
      const r = cvs.getBoundingClientRect();
      cvs.__mx = e.clientX - r.left;
      cvs.__my = e.clientY - r.top;
      if (!dragging) return;
      rot += (e.clientX - lastX) * 0.006;
      tiltTarget = Math.max(-0.9, Math.min(0.9, tiltTarget + (e.clientY - lastY) * 0.004));
      lastX = e.clientX; lastY = e.clientY;
    });
    const endDrag = (e) => {
      dragging = false;
      if (e && e.pointerId != null && cvs.hasPointerCapture && cvs.hasPointerCapture(e.pointerId)) {
        cvs.releasePointerCapture(e.pointerId);
      }
    };
    cvs.addEventListener('pointerup', endDrag);
    cvs.addEventListener('pointercancel', endDrag);
    cvs.addEventListener('pointerleave', () => { cvs.__mx = -999; cvs.__my = -999; });

    // pause when off-screen / hidden tab
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.05 })
        .observe(cvs);
    }
    document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

    // re-theme
    window.addEventListener('themeChanged', () => { /* palette() reads theme each frame */ });

    window.addEventListener('resize', () => { resize(); });

    resize();
    if (AA.reduceMotion()) { rot = 0.6; }
    raf = requestAnimationFrame(frame);
    return () => { if (raf) cancelAnimationFrame(raf); };
  };

  /* ------------------------------------------------------------------
     Hero mini-chart
     Only fills bars that the server did not size, so real data wins.
     ------------------------------------------------------------------ */
  AA.initHeroBars = function (hostId, seed) {
    const host = document.getElementById(hostId);
    if (!host) return;
    const bars = Array.prototype.slice.call(host.children);
    if (!bars.length) return;
    const unstyled = bars.filter((b) => !b.style.height);
    if (!unstyled.length) return;   // heights already provided by the view
    const n = unstyled.length;
    let s = seed || 7;
    unstyled.forEach((bar, i) => {
      s = (s * 9301 + 49297) % 233280;
      const rnd = s / 233280;
      const trend = i / n;
      const h = 22 + rnd * 34 + trend * 42;
      bar.style.height = Math.min(h, 100) + '%';
      bar.style.animationDelay = (i * 0.05).toFixed(2) + 's';
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    AA.initHeroBars('heroBars', 11);
    AA.initGlobe('globe');
  });
})();
