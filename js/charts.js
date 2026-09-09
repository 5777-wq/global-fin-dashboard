/* charts.js —— lightweight-charts 封装（K线 + 成交量副图 + 可配置均线组 + 分时）
   兼容 v3/v4（addCandlestickSeries）与 v5（addSeries(CandlestickSeries)）两套 API。
   均线：MA5/10/20/60 + EMA12/26 六条槽位，setMAVisible(配置对象) 按 key 开关（详情页存 localStorage）。 */

const Charts = (() => {
  const LWC = () => window.LightweightCharts;

  function baseOptions() {
    // 图表底色跟主题卡片色一致（#0a0a0a 嵌在 #111 卡片里像凹了一块）
    const bg = (getComputedStyle(document.body).getPropertyValue('--bg-card') || '').trim() || '#111111';
    return {
      layout: { background: { type: 'solid', color: bg }, textColor: '#86868b' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      autoSize: true,
      localization: { locale: 'zh-CN' },
    };
  }

  // v5 / v4 兼容的 series 添加
  function addSeries(chart, kind, opts) {
    const L = LWC();
    if (typeof chart.addSeries === 'function' && L[kind + 'Series']) {
      return chart.addSeries(L[kind + 'Series'], opts);
    }
    const legacy = { Candlestick: 'addCandlestickSeries', Histogram: 'addHistogramSeries', Line: 'addLineSeries', Area: 'addAreaSeries' };
    return chart[legacy[kind]](opts);
  }

  function themeColors() {
    const s = getComputedStyle(document.body);
    return {
      up: (s.getPropertyValue('--up') || '#ff5c5c').trim(),
      down: (s.getPropertyValue('--down') || '#2ebd85').trim(),
      accent: (s.getPropertyValue('--accent-signature') || '#D97757').trim(),
    };
  }

  // 蜡烛图 + 成交量 + MA
  function createKline(el) {
    const L = LWC();
    if (!L) return null;
    const { up, down, accent } = themeColors();
    const chart = L.createChart(el, Object.assign(baseOptions(), { height: el.clientHeight || 420 }));

    const candle = addSeries(chart, 'Candlestick', {
      upColor: up, downColor: down, borderVisible: false,
      wickUpColor: up, wickDownColor: down,
    });
    const vol = addSeries(chart, 'Histogram', {
      priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false });

    // 6 条均线槽位，颜色固定按槽位；类型与周期由外部配置驱动（详情页菜单可改任意周期）
    const LINE_COLORS = [accent, '#5b8def', '#3fae72', '#b06ad4', '#e0a83c', '#4db6ac'];
    const lineSeries = LINE_COLORS.map(color => addSeries(chart, 'Line', {
      color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
    }));

    let lastKlines = [];
    // 默认：MA5 + MA20 + EMA26（配置存 localStorage，详情页菜单可改任意周期 2~500）
    let maLines = [
      { type: 'ma', n: 5, on: true },
      { type: 'ma', n: 10, on: false },
      { type: 'ma', n: 20, on: true },
      { type: 'ma', n: 60, on: false },
      { type: 'ema', n: 12, on: false },
      { type: 'ema', n: 26, on: true },
    ];

    function applyTheme() {
      const c = themeColors();
      candle.applyOptions({ upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down });
      lineSeries.forEach((s, i) => s.applyOptions({ color: LINE_COLORS[i] }));
      if (lastKlines.length) setVolume(lastKlines, c);
    }

    function setVolume(klines, c) {
      vol.setData(klines.map(k => ({
        time: k.time,
        value: k.volume || 0,
        color: (k.close >= k.open ? c.up : c.down) + '66',
      })));
    }

    function setData(klines) {
      lastKlines = klines || [];
      const c = themeColors();
      candle.setData(lastKlines.map(k => ({
        time: k.time, open: k.open, high: k.high, low: k.low, close: k.close,
      })));
      setVolume(lastKlines, c);
      renderMA();
      chart.timeScale().fitContent();
    }

    function renderMA() {
      const closes = lastKlines.map(k => k.close);
      maLines.forEach((l, i) => {
        if (!l.on || lastKlines.length < l.n) { lineSeries[i].setData([]); return; }
        const seq = l.type === 'ema' ? emaSeries(closes, l.n) : calcMA(lastKlines, l.n);
        lineSeries[i].setData(seq.filter(p => p.value !== null && Number.isFinite(p.value)));
      });
    }

    function setMAVisible(v) {
      if (Array.isArray(v)) {
        // 新配置：[{type:'ma'|'ema', n, on}, ...]（槽位数量可少于 6，缺省槽关闭）
        maLines = LINE_COLORS.map((_, i) => {
          const l = v[i] || {};
          const n = Math.max(2, Math.min(500, Math.round(+l.n || 5)));
          return { type: l.type === 'ema' ? 'ema' : 'ma', n, on: !!l.on };
        });
      } else if (v && typeof v === 'object') {
        maLines = maLines.map(l => Object.assign({}, l));   // 未知对象：保持现状
      } else {
        maLines = maLines.map(l => Object.assign({}, l, { on: !!v }));   // 旧布尔：全开/全关
      }
      renderMA();
    }

    return {
      chart, candle, vol, setData, applyTheme, setMAVisible,
      remove() { try { chart.remove(); } catch { /* ignore */ } },
    };
  }

  // 分时图（面积线 + 成交量）
  function createTrend(el) {
    const L = LWC();
    if (!L) return null;
    const chart = L.createChart(el, Object.assign(baseOptions(), { height: el.clientHeight || 420 }));
    const { up, down } = themeColors();

    const area = addSeries(chart, 'Area', {
      lineWidth: 2, lineColor: up,
      topColor: up + '40', bottomColor: up + '02',
      priceLineVisible: true, lastValueVisible: true,
    });
    const vol = addSeries(chart, 'Histogram', {
      priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });

    let points = [];
    let prevClose = null;

    function paint() {
      const c = themeColors();
      const last = points.length ? points[points.length - 1].value : null;
      const rising = prevClose === null || last === null ? true : last >= prevClose;
      const col = rising ? c.up : c.down;
      area.applyOptions({ lineColor: col, topColor: col + '40', bottomColor: col + '02' });
      area.setData(points.map(p => ({ time: p.time, value: p.value })));
      vol.setData(points.map(p => ({ time: p.time, value: p.volume || 0, color: col + '55' })));
      chart.timeScale().fitContent();
    }

    function setData(pts, prev) {
      points = pts || [];
      prevClose = prev === undefined ? prevClose : prev;
      paint();
    }

    return {
      chart, setData, applyTheme: paint,
      setMAVisible() { /* 分时无 MA */ },
      remove() { try { chart.remove(); } catch { /* ignore */ } },
    };
  }

  // MA 均线序列（自算）；emaSeries 复用 Technical（加载序在其后，惰性取用）
  function calcMA(klines, n) {
    const out = [];
    let sum = 0;
    for (let i = 0; i < klines.length; i++) {
      sum += klines[i].close;
      if (i >= n) sum -= klines[i - n].close;
      out.push({
        time: klines[i].time,
        value: i < n - 1 ? null : +(sum / n).toFixed(3),
      });
    }
    return out;
  }

  function emaSeries(closes, n) {
    const T = window.Technical;
    if (T) return T.emaSeries(closes, n).map(v => v === null ? null : +v.toFixed(3));
    return closes.map(() => null);
  }

  return { createKline, createTrend, calcMA, emaSeries, themeColors };
})();

window.Charts = Charts;
