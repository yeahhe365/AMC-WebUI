import { describe, expect, it } from 'vitest';
import { ECHARTS_RENDERER_SCRIPT, buildEchartsThemeFromCssVars, normalizeEchartsOption } from './echartsRendererScript';

describe('echartsRendererScript', () => {
  describe('normalizeEchartsOption', () => {
    it('passes through standard ECharts options with default axis tooltip', () => {
      const standardOption = {
        xAxis: { type: 'category', data: ['Mon', 'Tue'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: [120, 200] }],
      };

      const result = normalizeEchartsOption(standardOption);
      expect(result).not.toBeNull();
      expect(result?.xAxis).toEqual({ type: 'category', data: ['Mon', 'Tue'] });
      expect(result?.series).toEqual([{ type: 'bar', data: [120, 200] }]);
      expect(result?.tooltip).toEqual(expect.objectContaining({ trigger: 'axis' }));
    });

    it('preserves custom tooltip when specified in standard option', () => {
      const optionWithTooltip = {
        tooltip: { trigger: 'item', formatter: '{b}: {c}' },
        series: [{ type: 'pie', data: [{ name: 'A', value: 10 }] }],
      };

      const result = normalizeEchartsOption(optionWithTooltip);
      expect(result?.tooltip).toEqual({ trigger: 'item', formatter: '{b}: {c}' });
    });

    it('converts legacy bar DSL to standard ECharts option', () => {
      const legacyBar = {
        type: 'bar',
        title: 'Sales',
        x: ['Q1', 'Q2'],
        series: [{ name: 'Revenue', y: [100, 200] }],
      };

      const result = normalizeEchartsOption(legacyBar);
      expect(result).not.toBeNull();
      expect(result?.title).toEqual({ text: 'Sales' });
      expect(result?.xAxis).toEqual(expect.objectContaining({ type: 'category', data: ['Q1', 'Q2'] }));
      expect(result?.yAxis).toEqual(expect.objectContaining({ type: 'value' }));
      expect(result?.series).toEqual([expect.objectContaining({ type: 'bar', name: 'Revenue', data: [100, 200] })]);
    });

    it('converts legacy grouped-bar and stacked-bar DSL', () => {
      const legacyStacked = {
        type: 'stacked-bar',
        x: ['A', 'B'],
        series: [
          { name: 'S1', y: [1, 2] },
          { name: 'S2', y: [3, 4] },
        ],
      };

      const result = normalizeEchartsOption(legacyStacked);
      expect(result?.series).toEqual([
        expect.objectContaining({ type: 'bar', name: 'S1', data: [1, 2], stack: 'total' }),
        expect.objectContaining({ type: 'bar', name: 'S2', data: [3, 4], stack: 'total' }),
      ]);
    });

    it('converts legacy pie and donut DSL', () => {
      const legacyDonut = {
        type: 'donut',
        title: 'Sources',
        slices: [
          { name: 'Search', y: 60 },
          { name: 'Direct', y: 40 },
        ],
      };

      const result = normalizeEchartsOption(legacyDonut);
      expect(result?.series).toEqual([
        expect.objectContaining({
          type: 'pie',
          radius: ['45%', '70%'],
          data: [
            { name: 'Search', value: 60 },
            { name: 'Direct', value: 40 },
          ],
        }),
      ]);
    });

    it('returns null for invalid or empty input', () => {
      expect(normalizeEchartsOption(null)).toBeNull();
      expect(normalizeEchartsOption({})).toBeNull();
      expect(normalizeEchartsOption('invalid')).toBeNull();
      expect(normalizeEchartsOption({ foo: 'bar' })).toBeNull();
    });
  });

  describe('buildEchartsThemeFromCssVars', () => {
    it('maps CSS variables into ECharts theme specification', () => {
      const cssVars = {
        '--amc-live-artifact-text': '#1e293b',
        '--amc-live-artifact-muted': '#64748b',
        '--amc-live-artifact-border': '#e2e8f0',
        '--amc-live-artifact-surface': '#ffffff',
        '--amc-live-artifact-accent': '#3b82f6',
        '--amc-live-artifact-success': '#22c55e',
        '--amc-live-artifact-warning': '#f59e0b',
        '--amc-live-artifact-danger': '#ef4444',
      };

      const theme = buildEchartsThemeFromCssVars(cssVars);
      expect(theme.color).toContain('#3b82f6');
      expect(theme.color).toContain('#22c55e');
      expect(theme.textStyle.color).toBe('#1e293b');
      expect(theme.bar.itemStyle.borderRadius).toEqual([4, 4, 0, 0]);
      expect(theme.categoryAxis.axisLine.lineStyle.color).toBe('#e2e8f0');
    });
  });

  describe('ECHARTS_RENDERER_SCRIPT', () => {
    it('exports a valid non-empty script string containing lifecycle and selector hooks', () => {
      expect(ECHARTS_RENDERER_SCRIPT).toContain('[data-amc-chart]');
      expect(ECHARTS_RENDERER_SCRIPT).toContain('data-amc-chart-sig');
      expect(ECHARTS_RENDERER_SCRIPT).toContain('data-amc-chart-pending');
      expect(ECHARTS_RENDERER_SCRIPT).toContain('data-amc-chart-rendered');
      expect(ECHARTS_RENDERER_SCRIPT).toContain('echarts.init');
      expect(ECHARTS_RENDERER_SCRIPT).toContain('renderer');
      expect(ECHARTS_RENDERER_SCRIPT).toContain('svg');
    });
  });
});
