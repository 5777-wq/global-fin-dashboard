/* worldmap.js —— 平面世界地图（事件页 [3D 地球 | 平面地图] 二选一）
   纯 Canvas 等距圆柱投影（x=lng+180, y=90−lat），与 3D 地球共用同一份
   assets/globe/countries-110m.json，不引任何新库、无运行时 CDN。
   视觉与 3D 一致：暗色海洋 + 灰蓝陆地 + 类型色事件点；聚类复用 Events.cluster。
   交互：拖拽平移、滚轮缩放（围绕指针）、点击事件点/聚合簇、悬停提示。
   动画：rAF 单循环只服务选中脉冲与相机平移，静止即停；
   全程只操作 canvas 内部绘制，不碰 CSS width/height/top/left。 */

window.WorldMapView = (() => {
  const W = 360, H = 180;                       // 世界坐标域
  const escapeHTML = window.U.escapeHTML;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let container = null, canvas = null, ctx = null, tip = null;
  let hooks = {};
  let land = null;                              // { path: Path2D, rings: n }
  let events = [], clusters = [];
  let bucket = 10;                              // 聚类粒度（度），随缩放变细
  let selected = null, hover = null;
  let fit = 1, view = { s: 1, tx: 0, ty: 0 };
  let dpr = 1, raf = 0, pulseT0 = 0, camAnim = null;
  let drag = null, ready = false, failed = false;
  let resizeBound = null;

  /* ---------- 几何：topo → 世界坐标 Path2D（经线 unwrap 防跨 180° 拉丝） ---------- */

  function unwrapRing(pts) {
    const out = [];
    let shift = 0, prev = null;
    for (const p of pts) {
      if (prev !== null) {
        if (p[0] + shift - prev > 180) shift -= 360;
        else if (p[0] + shift - prev < -180) shift += 360;
      }
      prev = p[0] + shift;
      out.push([prev, p[1]]);
    }
    return out;
  }

  function buildLandPath(features) {
    const path = new Path2D();
    let rings = 0;
    for (const f of features || []) {
      const g = f.geometry;
      if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] :
        g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const poly of polys) for (const ring of poly) {   // 外环与洞一并填，evenodd 自动成孔
        if (!ring || ring.length < 3) continue;
        const u = unwrapRing(ring);
        path.moveTo(u[0][0] + W, H - (u[0][1] + 90));
        for (let i = 1; i < u.length; i++) path.lineTo(u[i][0] + W, H - (u[i][1] + 90));
        path.closePath();
        rings++;
      }
    }
    return rings ? { path, rings } : null;
  }

  /* ---------- 投影与聚类 ---------- */

  const wx = lng => lng + 180;
  const wy = lat => 90 - lat;

  function bucketForZoomAt(z) {
    if (z < 1.5) return 10;
    if (z < 2.6) return 6;
    if (z < 5) return 3;
    return 0;
  }

  function bucketForZoom() { return bucketForZoomAt(view.s / fit); }

  function regroup() {
    const prev = bucket;
    bucket = bucketForZoom();
    clusters = window.Events.cluster(events, bucket);
    clusters.forEach(c => {
      c.r = 3.6 + 1.7 * Math.min(4, Math.log2(c.count || 1));
    });
    return prev !== bucket;   // 聚类粒度变化时调用方应刷新状态行
  }

  /* 屏幕坐标每帧按当前视图重算——首次 regroup 可能发生在容器隐藏（fit=0）时，
     缓存会得到 NaN 坐标，之后 resize/平移/缩放也无需各自记得重算 */
  function project() {
    clusters.forEach(c => {
      c.sx = wx(c.lng) * view.s + view.tx;
      c.sy = wy(c.lat) * view.s + view.ty;
    });
  }

  /* ---------- 视图 ---------- */

  function resize() {
    if (!canvas || !container) return;
    const cw = container.clientWidth, ch = container.clientHeight;
    if (!cw || !ch) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    fit = Math.min(cw / W, ch / H);
    if (ready) regroup();
    schedule();
  }

  function fitView() {
    if (!container) return;
    const cw = container.clientWidth, ch = container.clientHeight;
    fit = Math.min(cw / W, ch / H);
    view.s = fit;
    view.tx = (cw - W * fit) / 2;
    view.ty = (ch - H * fit) / 2;
  }

  function setCenter(wxp, wyp, targetS, animate) {
    const cw = container.clientWidth, ch = container.clientHeight;
    const s = clamp(targetS || view.s, fit * 0.9, fit * 18);
    const to = { s, tx: cw / 2 - wxp * s, ty: ch / 2 - wyp * s };
    if (!animate || reduceMotion()) {
      view = to; camAnim = null; regroup(); schedule(); return;
    }
    camAnim = { from: Object.assign({}, view), to, t0: performance.now(), dur: 500 };
    schedule();
  }

  /* ---------- 绘制 ---------- */

  function drawGrid(x0, x1, y0, y1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1 / view.s;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / 30) * 30; x <= x1; x += 30) {
      ctx.moveTo(x, y0); ctx.lineTo(x, y1);
    }
    for (let y = Math.ceil(y0 / 30) * 30; y <= y1; y += 30) {
      ctx.moveTo(x0, y); ctx.lineTo(x1, y);
    }
    ctx.stroke();
  }

  function drawPoint(c, t) {
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, c.r, 0, Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.fill();
    if (c.importance >= 3) {                    // high：外描环提示重要度
      ctx.beginPath();
      ctx.arc(c.sx, c.sy, c.r + 2.4, 0, Math.PI * 2);
      ctx.strokeStyle = c.color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (c.count > 1) {                          // 聚合数标
      ctx.font = `${10}px ${getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace'}`;
      ctx.fillStyle = 'rgba(242,242,240,0.78)';
      ctx.textAlign = 'center';
      ctx.fillText('×' + c.count, c.sx, c.sy - c.r - 4);
    }
    if (selected && c.evs.includes(selected)) drawSelection(c, t);
  }

  function drawSelection(c, t) {
    const base = c.r + 3;
    if (reduceMotion()) {
      ring(c.sx, c.sy, base, 0.9);
      ring(c.sx, c.sy, base + 5, 0.35);
      return;
    }
    const phase = ((t - pulseT0) / 1400) % 1;
    ring(c.sx, c.sy, base, 0.95);
    ring(c.sx, c.sy, base + phase * 14, 0.55 * (1 - phase));
  }

  function ring(x, y, r, alpha) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(217,119,87,' + alpha + ')';   // 主题橙
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  function render(t) {
    if (!ctx || !container) return;
    const cw = canvas.width / dpr, ch = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#0a0c0f';                  // 海洋，与 3D 底色一致
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(view.s * dpr, 0, 0, view.s * dpr, view.tx * dpr, view.ty * dpr);
    const x0 = -view.tx / view.s, x1 = x0 + cw / view.s;
    const y0 = -view.ty / view.s, y1 = y0 + ch / view.s;

    if (land) {
      for (const dx of [-W, 0, W]) {            // unwrap 后的东西两翼各补一份
        if (dx > x1 || dx + W < x0) continue;
        ctx.save();
        ctx.translate(dx, 0);
        ctx.fillStyle = 'rgba(126,146,170,0.24)';        // 与 3D hex 陆地同色系
        ctx.fill(land.path, 'evenodd');
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1 / view.s;
        ctx.stroke(land.path);
        ctx.restore();
      }
    }
    drawGrid(x0, x1, y0, y1);
    project();
    clusters.forEach(c => drawPoint(c, t));
  }

  /* ---------- rAF：仅在有动画（相机平移 / 选中脉冲）时持续，静止即停 ---------- */

  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

  function frame(t) {
    raf = 0;
    if (!ready || failed) return;
    if (camAnim) {
      const p = clamp((t - camAnim.t0) / camAnim.dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);          // easeOutCubic
      view.s = camAnim.from.s + (camAnim.to.s - camAnim.from.s) * e;
      view.tx = camAnim.from.tx + (camAnim.to.tx - camAnim.from.tx) * e;
      view.ty = camAnim.from.ty + (camAnim.to.ty - camAnim.from.ty) * e;
      if (p >= 1) {
        camAnim = null;
        if (regroup() && hooks.onStatus) hooks.onStatus(statusText());
      } else regroup();
    }
    render(t);
    if (camAnim || (selected && !reduceMotion())) schedule();
  }

  /* ---------- 命中检测与交互 ---------- */

  function pick(mx, my) {
    let best = null, bestD = Infinity;
    for (const c of clusters) {
      const d = Math.hypot(c.sx - mx, c.sy - my);
      if (d < Math.max(11, c.r + 5) && d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      drag = { mx: e.offsetX, my: e.offsetY, tx: view.tx, ty: view.ty, moved: false };
      camAnim = null;
      container.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.offsetX - drag.mx, dy = e.offsetY - drag.my;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        view.tx = drag.tx + dx;
        view.ty = drag.ty + dy;
        if (drag.moved) { regroup(); schedule(); hideTip(); }
        return;
      }
      const hit = pick(e.offsetX, e.offsetY);
      hover = hit;
      canvas.style.cursor = hit ? 'pointer' : '';
      if (hit) showTip(hit, e.offsetX, e.offsetY); else hideTip();
    });
    canvas.addEventListener('pointerup', e => {
      const wasClick = drag && !drag.moved;
      drag = null;
      container.classList.remove('dragging');
      if (!wasClick) return;
      const hit = pick(e.offsetX, e.offsetY);
      if (!hit) return;
      if (hit.count > 1 && hit.evs.length > 1) { if (hooks.onCluster) hooks.onCluster(hit); }
      else if (hooks.onSelect) hooks.onSelect(hit.evs[0]);
    });
    canvas.addEventListener('pointerleave', () => { hideTip(); hover = null; });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0016);
      const s2 = clamp(view.s * factor, fit * 0.9, fit * 18);
      const wxp = (e.offsetX - view.tx) / view.s, wyp = (e.offsetY - view.ty) / view.s;
      view.tx = e.offsetX - wxp * s2;
      view.ty = e.offsetY - wyp * s2;
      view.s = s2;
      if (regroup() && hooks.onStatus) hooks.onStatus(statusText());
      schedule();
    }, { passive: false });
    resizeBound = () => resize();
    window.addEventListener('resize', resizeBound);
  }

  function showTip(c, mx, my) {
    const ev = c.evs[0];
    if (!ev || !tip) return;
    const head = c.count > 1 ? `${c.count} EVENTS · ${ev.country || ''}` : (ev.country || '');
    tip.innerHTML =
      `<div style="color:var(--text-tertiary);font-size:10px;letter-spacing:.06em">${escapeHTML(head)}</div>` +
      escapeHTML((ev.title || '').slice(0, 64));
    tip.hidden = false;
    const rect = container.getBoundingClientRect();
    const x = clamp(mx + 14, 4, rect.width - 220), y = clamp(my + 14, 4, rect.height - 60);
    tip.style.transform = `translate(${x}px,${y}px)`;
  }

  function hideTip() { if (tip) tip.hidden = true; }

  function statusText() {
    const n = events.filter(e => e.lat !== null && e.lng !== null).length;
    return clusters.length + ' 个事件点 · 覆盖 ' + n + ' 条事件';
  }

  /* ---------- 对外 API（与 GlobeView 同形） ---------- */

  function create(mount, userHooks) {
    container = mount;
    hooks = userHooks || {};
    canvas = document.createElement('canvas');
    canvas.className = 'wmap-canvas';
    canvas.setAttribute('aria-label', '平面世界地图：全球事件分布');
    tip = document.createElement('div');
    tip.className = 'wmap-tip';
    tip.hidden = true;
    container.appendChild(canvas);
    container.appendChild(tip);
    ctx = canvas.getContext('2d');
    bindEvents();

    const topoReady = window.topojson ? Promise.resolve() :
      new Promise(res => document.addEventListener('DOMContentLoaded', () => res(), { once: true }));

    return Promise.all([
      fetch('assets/globe/countries-110m.json').then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }),
      topoReady,
    ]).then(([topo]) => {
      land = topo && topo.objects && topo.objects.countries && window.topojson
        ? buildLandPath(window.topojson.feature(topo, topo.objects.countries).features)
        : null;
      failed = !land;
      ready = !failed;
      fitView();
      resize();
      if (hooks.onStatus) hooks.onStatus(statusText());
      return !failed;
    }).catch(() => { failed = true; return false; });
  }

  function setEvents(list) {
    events = list || [];
    if (selected && !events.includes(selected)) selected = null;
    if (ready) { regroup(); schedule(); if (hooks.onStatus) hooks.onStatus(statusText()); }
  }

  function select(ev) {
    selected = ev;
    pulseT0 = performance.now();
    if (ev && ev.lat !== null && ev.lng !== null && ready) {
      setCenter(wx(ev.lng), wy(ev.lat), Math.max(view.s, fit * 2.2), true);
    } else schedule();
  }

  function focus(lat, lng) {
    if (ready) setCenter(wx(lng), wy(lat), Math.max(view.s, fit * 2.2), true);
  }

  function dispose() {
    if (resizeBound) window.removeEventListener('resize', resizeBound);
    resizeBound = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    events = []; clusters = []; selected = null; ready = false;
    if (container) container.innerHTML = '';
    canvas = null; ctx = null; tip = null;
  }

  return {
    create, setEvents, select, focus, resize, dispose, isReady: () => ready,
    geo: { unwrapRing, bucketForZoomAt },   // 纯几何，供离线单测
  };
})();
