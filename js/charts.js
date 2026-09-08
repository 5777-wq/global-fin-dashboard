/* charts.js —— lightweight-charts 封装（K线 + 成交量副图 + MA5/MA20 + 分时）
   兼容 v3/v4（addCandlestickSeries）与 v5（addSeries(CandlestickSeries)）两套 API。 */

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

    const ma5 = addSeries(chart, 'Line', { color: accent, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    const ma20 = addSeries(chart, 'Line', { color: '#5b8def', lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });

    let lastKlines = [];
    let maVisible = true;

    function applyTheme() {
      const c = themeColors();
      candle.applyOptions({ upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down });
      ma5.applyOptions({ color: c.accent });
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
      if (!maVisible || lastKlines.length < 5) {
        ma5.setData([]); ma20.setData([]);
        return;
      }
      ma5.setData(calcMA(lastKlines, 5).filter(p => Number.isFinite(p.value)));
      ma20.setData(calcMA(lastKlines, 20).filter(p => Number.isFinite(p.value)));
    }

    function setMAVisible(v) { maVisible = v; renderMA(); }

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

  // MA 均线（自算）
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

  return { createKline, createTrend, calcMA, themeColors };
})();

window.Charts = Charts;
