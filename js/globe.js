/* globe.js —— 3D 金融地球（globe.gl 2.46 + 内置 three.js，全部本地 vendor，无运行时 CDN）
   视觉：深色低饱和——暗色海洋 + 灰蓝六边形陆地 + 细网格线 + 微弱大气光，黑色终端风格，
   不做旅游地图/Google Earth。交互：拖动旋转、滚轮/双指缩放、点击事件点、平滑相机
   focusLocation、慢速自转（尊重 prefers-reduced-motion）。
   性能：事件点走 WebGL Points（非 DOM），按缩放级别地理聚类（全球视角粗、拉近变细），
   数据更新只换 pointsData，绝不重建整个地球。 */

window.GlobeView = (() => {
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let globe = null;            // globe.gl 实例
  let container = null;        // 挂载 DOM
  let hooks = {};              // { onSelect(ev), onCluster(cluster), onStatus(txt) }
  let events = [];             // 全量事件（已 normalize）
  let bucket = null;           // 当前聚类粒度（度），0 = 不聚类
  let selected = null;         // 选中的事件（画 ring）
  let resizeBound = null;
  let pending = false;         // create 进行中标记，防重复建

  /* 缩放级别 → 聚类粒度：越远越粗，越近越细。远视图 10° 粒度下
     北京(4,12)/首尔(4,13)/东京(4,14) 各占一格——中日韩不再挤成一个点 */
  function bucketFor(altitude) {
    if (altitude >= 1.6) return 10;
    if (altitude >= 1.1) return 6;
    if (altitude >= 0.7) return 3;
    return 0;
  }

  function radiusFor(d) {
    return +(0.18 + 0.05 * Math.min(4, Math.log2(d.count || 1))).toFixed(3);
  }

  function labelFor(d) {
    const ev = d.evs && d.evs[0];
    if (!ev) return '';
    const head = escapeHTML(ev.title.slice(0, 64));
    return `<div class="gp-tip"><b class="gp-t">${head}</b>` +
      `<span class="gp-s num">${d.count > 1 ? d.count + ' EVENTS · ' : ''}${escapeHTML(ev.source)}</span></div>`;
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* 重画点层：只换 pointsData / ringsData，不重建地球 */
  function repaint() {
    if (!globe) return;
    const clustered = window.Events.cluster(events, bucket);
    const pts = clustered.map(d => ({
      lat: d.lat, lng: d.lng, count: d.count, evs: d.evs,
      color: d.color, radius: radiusFor(d), importance: d.importance,
    }));
    globe.pointsData(pts);
    // 选中环：脉冲动画在 globe.gl 内部时钟跑；reduce-motion 下退化为静态高亮环
    globe.ringsData(selected && selected.lat !== null ? [{
      lat: selected.lat, lng: selected.lng,
      color: () => window.Events.typeColor(selected.type),
      maxRadius: 5, propagationSpeed: reduceMotion() ? 0 : 2.2,
      repeatPeriod: reduceMotion() ? 0 : 1400,
    }] : []);
    if (hooks.onStatus) {
      hooks.onStatus(pts.length + ' 个事件点 · 覆盖 ' + events.filter(e => e.lat !== null).length + ' 条事件');
    }
  }

  async function create(box, opts) {
    container = box;
    hooks = opts || {};
    if (globe) return api;
    if (!window.Globe || !window.topojson || pending) return null;
    pending = true;

    const fallback = document.getElementById('globeFallback');
    try {
      const topo = await fetch('assets/globe/countries-110m.json').then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      const lands = topojson.feature(topo, topo.objects.countries).features;

      globe = window.Globe()(box)
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true)
        .atmosphereColor('#43566b')
        .atmosphereAltitude(0.12)
        .showGraticules(true)
        .hexPolygonsData(lands)
        .hexPolygonColor(() => 'rgba(126,146,170,0.22)')
        .hexPolygonAltitude(0.006)
        .pointsData([])
        .pointLat(d => d.lat)
        .pointLng(d => d.lng)
        .pointColor(d => d.color)
        .pointAltitude(d => 0.008 + Math.min(0.018, (d.importance - 1) * 0.006))
        .pointRadius(d => d.radius)
        .pointResolution(10)
        .pointsMerge(false)
        .pointsTransitionDuration(500)
        .pointLabel(labelFor)
        .onPointClick(d => {
          // 单事件走 hooks.onSelect（由 app 层决定做什么，再调回 select() 聚焦，避免互相递归）
          if (d.count > 1 && d.evs.length > 1) {
            if (hooks.onCluster) hooks.onCluster(d);
          } else if (d.evs && d.evs[0] && hooks.onSelect) {
            hooks.onSelect(d.evs[0]);
          }
        })
        .onZoom(({ altitude }) => {
          const b = bucketFor(altitude);
          if (b !== bucket) { bucket = b; repaint(); }
        })
        .width(box.clientWidth || 600)
        .height(box.clientHeight || 480);

      const ctrl = globe.controls();
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.08;          // 惯性：拖完缓缓滑行，不"拖一下跳一下"
      ctrl.rotateSpeed = 0.6;
      ctrl.minDistance = 130;
      ctrl.maxDistance = 520;
      if (!reduceMotion()) {
        ctrl.autoRotate = true;           // globe.gl 每帧 controls.update()，自转即生效
        ctrl.autoRotateSpeed = 0.32;
      }

      // 容器尺寸变化：只更新 width/height，不重建
      let rz = 0;
      resizeBound = () => {
        if (rz || !globe) return;
        rz = requestAnimationFrame(() => {
          rz = 0;
          if (globe && container) {
            globe.width(container.clientWidth || 600);
            globe.height(container.clientHeight || 480);
          }
        });
      };
      window.addEventListener('resize', resizeBound);

      if (fallback) fallback.hidden = true;
      pending = false;
      repaint();   // create 之前 setEvents 进来的事件在这里补画
      return api;
    } catch (e) {
      pending = false;
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = '地球模块未能加载（资源或 WebGL 不可用），事件列表仍可正常使用';
      }
      if (hooks.onStatus) hooks.onStatus('3D 模块不可用 · 已降级为列表模式');
      return null;
    }
  }

  function setEvents(list) {
    events = list || [];
    if (selected && !events.includes(selected)) selected = null;
    repaint();   // 未就绪时只存数据，create 完成后 repaint 补上
  }

  function select(ev) {
    selected = ev;
    repaint();
    if (ev && ev.lat !== null && globe) {
      globe.pointOfView({ lat: ev.lat, lng: ev.lng, altitude: 1.4 }, 900);   // 平滑转向，不瞬移
    }
    // 注意：这里不回调 hooks.onSelect——回调链单向：globe 点击 → app.selectGlobalEvent → select()
  }

  function focus(lat, lng) {
    if (globe) globe.pointOfView({ lat, lng, altitude: 1.4 }, 900);
  }

  function dispose() {
    if (resizeBound) window.removeEventListener('resize', resizeBound);
    resizeBound = null;
    if (globe) { try { globe._destructor(); } catch { /* 已释放 */ } }
    globe = null;
    bucket = null;
    selected = null;
    if (container) container.innerHTML = '';
  }

  const api = { create, setEvents, select, focus, dispose, isReady: () => !!globe };
  return api;
})();
