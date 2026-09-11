/**
 * ECharts renderer script for Live Artifacts.
 *
 * Supports both modern standard ECharts Option JSON and backwards-compatible
 * conversion of legacy `data-amc-chart` specs. Injected into the sandboxed
 * iframe via `PREVIEW_BRIDGE_SCRIPT`.
 */

export interface EchartsThemeDefinition {
  color: string[];
  backgroundColor: string;
  textStyle: {
    fontFamily: string;
    color: string;
  };
  title: {
    textStyle: { color: string; fontWeight: number };
    subtextStyle: { color: string };
  };
  line: {
    smooth: boolean;
    symbolSize: number;
  };
  bar: {
    itemStyle: {
      borderRadius: [number, number, number, number];
    };
  };
  categoryAxis: {
    axisLine: { lineStyle: { color: string } };
    axisTick: { lineStyle: { color: string } };
    axisLabel: { color: string };
    splitLine: { show: boolean };
  };
  valueAxis: {
    axisLine: { show: boolean };
    axisTick: { show: boolean };
    axisLabel: { color: string };
    splitLine: { lineStyle: { color: string; type: string } };
  };
  legend: {
    textStyle: { color: string };
  };
  tooltip: {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    textStyle: { color: string; fontSize: number };
    extraCssText: string;
  };
}

export const buildEchartsThemeFromCssVars = (cssVars: Record<string, string> = {}): EchartsThemeDefinition => {
  const text = cssVars['--amc-live-artifact-text'] || '#1e293b';
  const muted = cssVars['--amc-live-artifact-muted'] || '#64748b';
  const subtle = cssVars['--amc-live-artifact-subtle'] || '#94a3b8';
  const border = cssVars['--amc-live-artifact-border'] || '#e2e8f0';
  const surface = cssVars['--amc-live-artifact-surface'] || '#ffffff';
  const accent = cssVars['--amc-live-artifact-accent'] || '#3b82f6';
  const success = cssVars['--amc-live-artifact-success'] || '#22c55e';
  const warning = cssVars['--amc-live-artifact-warning'] || '#f59e0b';
  const danger = cssVars['--amc-live-artifact-danger'] || '#ef4444';

  return {
    color: [accent, success, warning, danger, '#8b5cf6', '#06b6d4', muted, subtle],
    backgroundColor: 'transparent',
    textStyle: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: text,
    },
    title: {
      textStyle: { color: text, fontWeight: 600 },
      subtextStyle: { color: muted },
    },
    line: {
      smooth: true,
      symbolSize: 6,
    },
    bar: {
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
      },
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: border } },
      axisTick: { lineStyle: { color: border } },
      axisLabel: { color: muted },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: border, type: 'dashed' } },
    },
    legend: {
      textStyle: { color: muted },
    },
    tooltip: {
      backgroundColor: surface,
      borderColor: border,
      borderWidth: 1,
      textStyle: { color: text, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 6px;',
    },
  };
};

export const normalizeEchartsOption = (raw: unknown): Record<string, unknown> | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const rawType = typeof record.type === 'string' ? record.type : '';
  const legacyTypes = ['bar', 'grouped-bar', 'stacked-bar', 'line', 'area', 'pie', 'donut', 'scatter'];

  // Check if it's legacy DSL format first
  const isLegacy =
    legacyTypes.indexOf(rawType) !== -1 &&
    (Array.isArray(record.x) ||
      Array.isArray(record.slices) ||
      (Array.isArray(record.series) &&
        (record.series as unknown[]).some(
          (s) =>
            s &&
            typeof s === 'object' &&
            ('y' in (s as Record<string, unknown>) || 'points' in (s as Record<string, unknown>)),
        )));

  const titleObj = typeof record.title === 'string' && record.title ? { text: record.title } : undefined;

  if (isLegacy) {
    if (rawType === 'pie' || rawType === 'donut') {
      const rawSlices = Array.isArray(record.slices) ? record.slices : [];
      if (!rawSlices.length) return null;
      const slices = rawSlices.map((s: Record<string, unknown>) => ({
        name: String(s.name ?? ''),
        value: Number(s.y ?? s.value ?? 0),
      }));

      return {
        title: titleObj,
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        series: [
          {
            type: 'pie',
            radius: rawType === 'donut' ? ['45%', '70%'] : '70%',
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 4, borderColor: 'transparent', borderWidth: 2 },
            data: slices,
          },
        ],
      };
    }

    if (rawType === 'scatter') {
      const rawSeries = Array.isArray(record.series) ? record.series : [];
      if (!rawSeries.length) return null;

      return {
        title: titleObj,
        tooltip: { trigger: 'item' },
        xAxis: { type: 'value' },
        yAxis: { type: 'value' },
        series: rawSeries.map((s: Record<string, unknown>) => ({
          type: 'scatter',
          name: typeof s.name === 'string' ? s.name : undefined,
          data: Array.isArray(s.points) ? s.points : [],
        })),
      };
    }

    // Cartesian types: bar, grouped-bar, stacked-bar, line, area
    const xData = Array.isArray(record.x) ? record.x : null;
    const rawSeries = Array.isArray(record.series) ? record.series : null;
    if (!xData || !rawSeries || !rawSeries.length) {
      return null;
    }
    if (rawSeries.some((s) => !s || typeof s !== 'object' || !Array.isArray((s as Record<string, unknown>).y))) {
      return null;
    }

    const isStacked = rawType.includes('stacked');
    const isLineOrArea = rawType === 'line' || rawType === 'area';
    const seriesType = isLineOrArea ? 'line' : 'bar';

    return {
      title: titleObj,
      tooltip: { trigger: 'axis' },
      legend: record.legend !== false && rawSeries.length > 1 ? {} : undefined,
      xAxis: {
        type: 'category',
        data: xData,
      },
      yAxis: {
        type: 'value',
      },
      series: rawSeries.map((s: Record<string, unknown>) => ({
        type: seriesType,
        name: typeof s.name === 'string' ? s.name : undefined,
        data: Array.isArray(s.y) ? s.y : [],
        stack: isStacked ? 'total' : undefined,
        areaStyle: rawType === 'area' ? { opacity: 0.25 } : undefined,
      })),
    };
  }

  // Check if it's already a standard ECharts option
  if (record.series || record.xAxis || record.yAxis) {
    const option = { ...record };
    if (!option.tooltip) {
      option.tooltip = { trigger: 'axis' };
    }
    return option;
  }

  return null;
};

export const ECHARTS_RENDERER_SCRIPT = `
(() => {
  const SELECTOR = '[data-amc-chart], [data-amc-echarts]';
  const SIG_ATTR = 'data-amc-chart-sig';
  const PENDING_ATTR = 'data-amc-chart-pending';
  const ERROR_ATTR = 'data-amc-chart-error';
  const RENDERED_ATTR = 'data-amc-chart-rendered';

  const hash = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };

  const THEME_NAME = 'amc-live-artifact-theme';
  let isThemeRegistered = false;

  const ensureTheme = () => {
    if (isThemeRegistered || typeof window.echarts === 'undefined') return;
    try {
      const styles = window.getComputedStyle ? window.getComputedStyle(document.documentElement) : null;
      const getVar = (name, fallback) => (styles ? styles.getPropertyValue(name).trim() || fallback : fallback);

      const text = getVar('--amc-live-artifact-text', '#1e293b');
      const muted = getVar('--amc-live-artifact-muted', '#64748b');
      const subtle = getVar('--amc-live-artifact-subtle', '#94a3b8');
      const border = getVar('--amc-live-artifact-border', '#e2e8f0');
      const surface = getVar('--amc-live-artifact-surface', '#ffffff');
      const accent = getVar('--amc-live-artifact-accent', '#3b82f6');
      const success = getVar('--amc-live-artifact-success', '#22c55e');
      const warning = getVar('--amc-live-artifact-warning', '#f59e0b');
      const danger = getVar('--amc-live-artifact-danger', '#ef4444');

      window.echarts.registerTheme(THEME_NAME, {
        color: [accent, success, warning, danger, '#8b5cf6', '#06b6d4', muted, subtle],
        backgroundColor: 'transparent',
        textStyle: {
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: text,
        },
        title: {
          textStyle: { color: text, fontWeight: 600 },
          subtextStyle: { color: muted },
        },
        line: {
          smooth: true,
          symbolSize: 6,
        },
        bar: {
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
          },
        },
        categoryAxis: {
          axisLine: { lineStyle: { color: border } },
          axisTick: { lineStyle: { color: border } },
          axisLabel: { color: muted },
          splitLine: { show: false },
        },
        valueAxis: {
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: muted },
          splitLine: { lineStyle: { color: border, type: 'dashed' } },
        },
        legend: {
          textStyle: { color: muted },
        },
        tooltip: {
          backgroundColor: surface,
          borderColor: border,
          borderWidth: 1,
          textStyle: { color: text, fontSize: 12 },
          extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 6px;',
        },
      });
      isThemeRegistered = true;
    } catch {}
  };

  const normalizeOption = ${normalizeEchartsOption.toString()};

  const chartInstances = new Set();

  function renderChartElement(node) {
    if (typeof window.echarts === 'undefined') {
      node.setAttribute(PENDING_ATTR, '1');
      return;
    }

    ensureTheme();

    const attr = node.getAttribute('data-amc-chart') || node.getAttribute('data-amc-echarts') || '';
    const sig = hash(attr);
    if (node.getAttribute(SIG_ATTR) === sig) return;

    let raw;
    try {
      raw = JSON.parse(attr);
    } catch {
      // Incomplete JSON mid-stream: stay silent and retry on the next mutation.
      node.setAttribute(PENDING_ATTR, '1');
      return;
    }

    const option = normalizeOption(raw);
    node.setAttribute(SIG_ATTR, sig);
    node.removeAttribute(PENDING_ATTR);

    if (!option) {
      node.setAttribute(ERROR_ATTR, '1');
      node.removeAttribute(RENDERED_ATTR);
      if (typeof notifyDiagnostic === 'function') {
        notifyDiagnostic({ type: 'chart-error', message: 'Invalid chart option', snippet: attr.slice(0, 200) });
      }
      return;
    }

    node.removeAttribute(ERROR_ATTR);
    node.setAttribute(RENDERED_ATTR, '1');

    // Ensure responsive layout sizing
    if (!node.style.height && !node.style.minHeight) {
      node.style.minHeight = option.height ? option.height + 'px' : '280px';
    }
    if (!node.style.width) {
      node.style.width = '100%';
    }

    try {
      let chart = window.echarts.getInstanceByDom(node);
      if (!chart) {
        chart = window.echarts.init(node, THEME_NAME, { renderer: 'svg' });
        chartInstances.add(chart);
      }
      chart.setOption(option, true);
    } catch (renderError) {
      node.setAttribute(ERROR_ATTR, '1');
      if (typeof notifyDiagnostic === 'function') {
        const errorMsg = renderError instanceof Error ? renderError.message : 'ECharts render failed';
        notifyDiagnostic({ type: 'chart-error', message: errorMsg, snippet: attr.slice(0, 200) });
      }
    }
  }

  function renderAll() {
    document.querySelectorAll(SELECTOR).forEach(renderChartElement);
  }

  let frame = 0;
  const scheduleScan = () => {
    if (frame) return;
    frame = (window.requestAnimationFrame || ((fn) => fn()))(() => {
      frame = 0;
      renderAll();
    });
  };

  renderAll();

  // Retry if ECharts script loads asynchronously
  if (typeof window.echarts === 'undefined') {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (typeof window.echarts !== 'undefined') {
        clearInterval(interval);
        renderAll();
      } else if (attempts > 60) {
        clearInterval(interval);
      }
    }, 100);
  }

  if (window.MutationObserver) {
    new MutationObserver(scheduleScan).observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-amc-chart', 'data-amc-echarts'],
    });
  }

  window.addEventListener('resize', () => {
    chartInstances.forEach((chart) => {
      try { chart.resize(); } catch {}
    });
  });

  window.__amcChart = { renderAll, renderChartElement };
})();
`;
