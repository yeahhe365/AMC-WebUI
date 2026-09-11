import { describe, expect, it } from 'vitest';
import { linkifyPdfLocates } from './pdfLinks';

describe('linkifyPdfLocates', () => {
  it('converts inline <pdf-locate> tags into interactive #pdf-seek links', () => {
    const input =
      '财务报表说明：<pdf-locate doc="report.pdf" page="3" box="120,80,340,560">营收数据</pdf-locate> 显示净利润提升。';
    const output = linkifyPdfLocates(input);

    expect(output).not.toContain('<pdf-locate');
    expect(output).toContain(
      '[第 3 页 · 营收数据](#pdf-seek?page=3&doc=report.pdf&box=120%2C80%2C340%2C560&snippet=%E8%90%A5%E6%94%B6%E6%95%B0%E6%8D%AE)',
    );
  });

  it('converts <pdf-locate> tags with bracketed box coordinate string without throwing', () => {
    const input = '<pdf-locate page="5" box="[100, 200, 300, 400]">结构图</pdf-locate>';
    const output = linkifyPdfLocates(input);

    expect(output).toContain(
      '[第 5 页 · 结构图](#pdf-seek?page=5&box=100%2C200%2C300%2C400&snippet=%E7%BB%93%E6%9E%84%E5%9B%BE)',
    );
  });

  it('handles empty snippet by showing page number', () => {
    const input = '详见附录 <pdf-locate page="12"></pdf-locate>。';
    const output = linkifyPdfLocates(input);

    expect(output).toContain('[第 12 页](#pdf-seek?page=12)');
  });

  it('handles snippet that already starts with page label', () => {
    const input = '参考 <pdf-locate page="7">第 7 页</pdf-locate>。';
    const output = linkifyPdfLocates(input);

    expect(output).toContain('[第 7 页](#pdf-seek?page=7&snippet=%E7%AC%AC+7+%E9%A1%B5)');
  });

  it('converts trailing <pdf-locate> block into trailing inline buttons', () => {
    const input = [
      '以上是全篇总结。',
      '',
      '<pdf-locate page="2">第一节</pdf-locate>',
      '<pdf-locate page="4">第二节</pdf-locate>',
    ].join('\n');
    const output = linkifyPdfLocates(input);

    expect(output).toContain('以上是全篇总结。');
    expect(output).toContain('[第 2 页 · 第一节](#pdf-seek?page=2&snippet=%E7%AC%AC%E4%B8%80%E8%8A%82)');
    expect(output).toContain('[第 4 页 · 第二节](#pdf-seek?page=4&snippet=%E7%AC%AC%E4%BA%8C%E8%8A%82)');
  });

  it('strips partial unterminated pdf-locate tag during streaming', () => {
    const input = '正在生成答案 <pdf-locate page="3" box="100,200';
    const output = linkifyPdfLocates(input);

    expect(output).toBe('正在生成答案 ');
  });

  it('preserves code blocks without converting pdf-locate inside them', () => {
    const input = '```xml\n<pdf-locate page="1">code</pdf-locate>\n```';
    const output = linkifyPdfLocates(input);

    expect(output).toContain('<pdf-locate page="1">code</pdf-locate>');
  });

  it('handles self-closing <pdf-locate /> tags', () => {
    const input = '参考文档 <pdf-locate page="8" doc="manual.pdf" />。';
    const output = linkifyPdfLocates(input);

    expect(output).not.toContain('<pdf-locate');
    expect(output).toContain('[第 8 页](#pdf-seek?page=8&doc=manual.pdf)');
  });

  it('escapes square brackets inside snippet to avoid breaking markdown link syntax', () => {
    const input = '<pdf-locate page="2">见 [图 1.2 架构图]</pdf-locate>';
    const output = linkifyPdfLocates(input);

    expect(output).toContain('[第 2 页 · 见 \\[图 1.2 架构图\\]](#pdf-seek?page=2');
  });

  it('does not duplicate page prefix when snippet mentions page number in mid-phrase', () => {
    const input =
      '详见分析 <pdf-locate page="5">报告第 5 页结论</pdf-locate> 以及 <pdf-locate page="8">P.8 架构图</pdf-locate>。';
    const output = linkifyPdfLocates(input);

    expect(output).toContain('[报告第 5 页结论](#pdf-seek?page=5');
    expect(output).not.toContain('第 5 页 · 报告第 5 页结论');
    expect(output).toContain('[P.8 架构图](#pdf-seek?page=8');
    expect(output).not.toContain('第 8 页 · P.8 架构图');
  });
});
