import { describe, expect, it } from 'vitest';
import { linkifyImageLocates } from './imageLinks';

describe('linkifyImageLocates', () => {
  it('converts inline <image-locate> tags into interactive #image-seek links', () => {
    const input =
      '界面说明：<image-locate file="dashboard.png" box="120,80,340,560" label="统计图表">收入走势</image-locate> 展现了本季度提升。';
    const output = linkifyImageLocates(input);

    expect(output).not.toContain('<image-locate');
    expect(output).toContain(
      '[统计图表 · 收入走势](#image-seek?file=dashboard.png&box=120%2C80%2C340%2C560&label=%E7%BB%9F%E8%AE%A1%E5%9B%BE%E8%A1%A8&snippet=%E6%94%B6%E5%85%A5%E8%B5%B0%E5%8A%BF)',
    );
  });

  it('converts point and arrow attributes', () => {
    const input =
      '<image-locate file="ui.png" point="250,400" arrow="top" label="登录按钮">点击此处登录</image-locate>';
    const output = linkifyImageLocates(input);

    expect(output).toContain('point=250%2C400');
    expect(output).toContain('arrow=top');
    expect(output).toContain('[登录按钮 · 点击此处登录]');
  });

  it('handles bracketed coordinates without throwing', () => {
    const input = '<image-locate box="[100, 200, 300, 400]" label="目标区域"></image-locate>';
    const output = linkifyImageLocates(input);

    expect(output).toContain('box=100%2C200%2C300%2C400');
    expect(output).toContain('[目标区域](#image-seek?');
  });

  it('falls back to default label when label and snippet are empty', () => {
    const input = '查找 <image-locate box="10,20,30,40"></image-locate>。';
    const output = linkifyImageLocates(input);

    expect(output).toContain('[目标框选](#image-seek?box=10%2C20%2C30%2C40)');
  });

  it('strips partial unterminated image-locate tag during streaming', () => {
    const input = '正在检测 <image-locate box="100,200';
    const output = linkifyImageLocates(input);

    expect(output).toBe('正在检测 ');
  });

  it('preserves code blocks without converting image-locate inside them', () => {
    const input = '```xml\n<image-locate box="1,2,3,4">demo</image-locate>\n```';
    const output = linkifyImageLocates(input);

    expect(output).toContain('<image-locate box="1,2,3,4">demo</image-locate>');
  });

  it('handles self-closing <image-locate /> tags', () => {
    const input = '查看 <image-locate point="500,500" label="中心点" />。';
    const output = linkifyImageLocates(input);

    expect(output).not.toContain('<image-locate');
    expect(output).toContain('[中心点](#image-seek?point=500%2C500&label=%E4%B8%AD%E5%BF%83%E7%82%B9)');
  });

  it('escapes square brackets inside label to preserve markdown syntax', () => {
    const input = '<image-locate box="10,20,30,40" label="[主界面]"></image-locate>';
    const output = linkifyImageLocates(input);

    expect(output).toContain('[\\[主界面\\]](#image-seek?');
  });

  it('avoids duplicating text when snippet already contains the label', () => {
    const input = '<image-locate box="10,20,30,40" label="搜索栏">顶部搜索栏</image-locate>';
    const output = linkifyImageLocates(input);

    expect(output).toContain('[顶部搜索栏](#image-seek?');
    expect(output).not.toContain('搜索栏 · 顶部搜索栏');
  });

  it('avoids duplicating text when label already contains the snippet', () => {
    const input = '<image-locate box="10,20,30,40" label="用户头像按钮">用户头像</image-locate>';
    const output = linkifyImageLocates(input);

    expect(output).toContain('[用户头像按钮](#image-seek?');
    expect(output).not.toContain('用户头像按钮 · 用户头像');
  });
});
