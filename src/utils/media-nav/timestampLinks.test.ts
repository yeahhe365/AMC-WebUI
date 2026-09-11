import { describe, expect, it } from 'vitest';
import { linkifyTimestamps } from './timestampLinks';

describe('linkifyTimestamps', () => {
  it('converts single timestamp to #video-seek link', () => {
    const input = '在 01:05 处可以看到宫颈口。';
    const output = linkifyTimestamps(input);
    expect(output).toBe('在 [01:05](#video-seek?start=65) 处可以看到宫颈口。');
  });

  it('strips surrounding square brackets and parentheses without producing double brackets', () => {
    const input = '在 [00:15] 处可以看到，在 (01:20-01:30) 之间结束。';
    const output = linkifyTimestamps(input);
    expect(output).toBe(
      '在 [00:15](#video-seek?start=15) 处可以看到，在 [01:20-01:30](#video-seek?start=80&end=90) 之间结束。',
    );
  });

  it('converts timestamp range with hyphen to #video-seek link', () => {
    const input = '例如 00:02-00:04 及 00:46-01:07，宫颈口位于中央。';
    const output = linkifyTimestamps(input);
    expect(output).toBe(
      '例如 [00:02-00:04](#video-seek?start=2&end=4) 及 [00:46-01:07](#video-seek?start=46&end=67)，宫颈口位于中央。',
    );
  });

  it('handles en-dash, em-dash, and tilde separators', () => {
    const input = '片段 00:10~00:20 和 01:00–01:30。';
    const output = linkifyTimestamps(input);
    expect(output).toBe(
      '片段 [00:10~00:20](#video-seek?start=10&end=20) 和 [01:00–01:30](#video-seek?start=60&end=90)。',
    );
  });

  it('does not touch timestamps inside existing markdown links', () => {
    const input = '请查看 [00:10 关键片段](https://example.com) 以及 00:20 处。';
    const output = linkifyTimestamps(input);
    expect(output).toBe('请查看 [00:10 关键片段](https://example.com) 以及 [00:20](#video-seek?start=20) 处。');
  });

  it('does not touch timestamps inside code blocks or inline code', () => {
    const input = '代码 `const time = "00:30";` 中有时间，但文本中的 00:45 应该被转换。';
    const output = linkifyTimestamps(input);
    expect(output).toBe('代码 `const time = "00:30";` 中有时间，但文本中的 [00:45](#video-seek?start=45) 应该被转换。');
  });

  it('ignores dates like 2026-09-04', () => {
    const input = '今天是 2026-09-04 日期。';
    const output = linkifyTimestamps(input);
    expect(output).toBe('今天是 2026-09-04 日期。');
  });

  it('handles hour timestamps hh:mm:ss', () => {
    const input = '在 1:02:03-1:03:00 之间。';
    const output = linkifyTimestamps(input);
    expect(output).toBe('在 [1:02:03-1:03:00](#video-seek?start=3723&end=3780) 之间。');
  });

  it('converts inline <video-locate> tags into interactive seek links', () => {
    const input = '- 阴蒂与包皮 <video-locate start="00:05" point="200,500">00:05</video-locate>：位于最上方。';
    const output = linkifyTimestamps(input);
    expect(output).toContain('[00:05](#video-seek?start=5&point=200%2C500&snippet=00%3A05)');
    expect(output).not.toContain('<video-locate');
  });

  it('converts inline <video-locate> tags with text descriptions', () => {
    const input = '- 结构展示：<video-locate start="00:15" point="350,520">阴蒂与阴蒂包皮</video-locate>';
    const output = linkifyTimestamps(input);
    expect(output).toContain(
      '[00:15 · 阴蒂与阴蒂包皮](#video-seek?start=15&point=350%2C520&snippet=%E9%98%B4%E8%92%82%E4%B8%8E%E9%98%B4%E8%92%82%E5%8C%85%E7%9A%AE)',
    );
  });

  it('omits trailing <video-locate> tags when matching timestamps already exist in body', () => {
    const input = [
      '- 阴蒂包皮（00:05）：位于上方。',
      '- 尿道外口（00:15）：位于下方。',
      '',
      '<video-locate start="00:05" point="200,500">阴蒂包皮</video-locate>',
      '<video-locate start="00:15" point="300,500">尿道外口</video-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);
    // Body timestamps should be linkified with coordinate metadata preserved
    expect(output).toContain(
      '[00:05](#video-seek?start=5&point=200%2C500&snippet=%E9%98%B4%E8%92%82%E5%8C%85%E7%9A%AE)',
    );
    expect(output).toContain(
      '[00:15](#video-seek?start=15&point=300%2C500&snippet=%E5%B0%BF%E9%81%93%E5%A4%96%E5%8F%A3)',
    );
    // Trailing duplicate tags should NOT produce duplicate bottom buttons
    expect(output).not.toContain('阴蒂包皮](#video-seek');
  });

  it('renders trailing <video-locate> tags when no timestamps exist in body', () => {
    const input = [
      '- 阴蒂包皮：位于上方。',
      '- 尿道外口：位于下方。',
      '',
      '<video-locate start="00:05" point="200,500">阴蒂包皮</video-locate>',
      '<video-locate start="00:15" point="300,500">尿道外口</video-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);
    expect(output).toContain(
      '[00:05 · 阴蒂包皮](#video-seek?start=5&point=200%2C500&snippet=%E9%98%B4%E8%92%82%E5%8C%85%E7%9A%AE)',
    );
    expect(output).toContain(
      '[00:15 · 尿道外口](#video-seek?start=15&point=300%2C500&snippet=%E5%B0%BF%E9%81%93%E5%A4%96%E5%8F%A3)',
    );
  });

  it('strips partial video-locate tags at the end of streaming content', () => {
    const input = '正在输出中 <video-locate start="00:10" point="100,200';
    const output = linkifyTimestamps(input);
    expect(output).toBe('正在输出中 ');
  });

  it('omits redundant video-locate tag on the next line when preceding bullet contains matching timestamp', () => {
    const input = [
      '• 在 00:02，手指触碰宫颈外口时，外口左边缘附着有一小圈乳白色、黏稠的宫颈黏液：',
      '  <video-locate start="00:02" point="450,550">宫颈外口边缘的乳白色黏液</video-locate>',
      '• 在 00:54 - 00:56，手指离开宫颈口时，宫颈管口可见拉丝状、微白半透明的黏液分泌物：',
      '  <video-locate start="00:55" point="500,520">宫颈管口微白半透明黏液</video-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);

    // In-sentence timestamps should be converted to inline buttons with coordinate metadata
    expect(output).toContain(
      '• 在 [00:02](#video-seek?start=2&point=450%2C550&snippet=%E5%AE%AB%E9%A2%88%E5%A4%96%E5%8F%A3%E8%BE%B9%E7%BC%98%E7%9A%84%E4%B9%B3%E7%99%BD%E8%89%B2%E9%BB%8F%E6%B6%B2)，手指触碰宫颈外口时',
    );
    expect(output).toContain(
      '• 在 [00:54 - 00:56](#video-seek?start=54&end=56&point=500%2C520&snippet=%E5%AE%AB%E9%A2%88%E7%AE%A1%E5%8F%A3%E5%BE%AE%E7%99%BD%E5%8D%8A%E9%80%8F%E6%98%8E%E9%BB%8F%E6%B6%B2)，手指离开宫颈口时',
    );

    // Redundant second-line locate buttons should NOT appear
    expect(output).not.toContain('宫颈外口边缘的乳白色黏液');
    expect(output).not.toContain('宫颈管口微白半透明黏液');
  });

  it('retains video-locate tag when preceding bullet contains NO timestamp', () => {
    const input = [
      '• 阴蒂与阴蒂包皮：位于外阴最上方联合处。',
      '  <video-locate start="00:05" point="200,500">阴蒂与阴蒂包皮</video-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);

    expect(output).toContain('• 阴蒂与阴蒂包皮：位于外阴最上方联合处。');
    expect(output).toContain(
      '[00:05 · 阴蒂与阴蒂包皮](#video-seek?start=5&point=200%2C500&snippet=%E9%98%B4%E8%92%82%E4%B8%8E%E9%98%B4%E8%92%82%E5%8C%85%E7%9A%AE)',
    );
  });

  it('omits video-locate tag on the next line when preceding text already contains the same timestamp', () => {
    const input = [
      '3. 互动与反应 [00:46] : 佩戴过程中 Coser 因不适和敏感多次呼痛、求轻点并伴随笑闹，现场人员亦提醒注意隐私并关闭房门 [00:37]。',
      '   <video-locate start="00:46">佩戴过程中的互动与反应</video-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);

    expect(output).toContain('[00:46](#video-seek?start=46)');
    expect(output).toContain('[00:37](#video-seek?start=37)');
    expect(output).not.toContain('佩戴过程中的互动与反应');
  });

  it('converts inline <audio-locate> tags with snippet and audio attribute', () => {
    const input =
      '访谈中提到了 <audio-locate audio="interview.mp3" start="01:23" end="02:00">商业模式转变</audio-locate>，随后进入提问环节。';
    const output = linkifyTimestamps(input);
    expect(output).toContain(
      '[01:23-02:00 · 商业模式转变](#video-seek?start=83&end=120&kind=audio&audio=interview.mp3&video=interview.mp3&snippet=%E5%95%86%E4%B8%9A%E6%A8%A1%E5%BC%8F%E8%BD%AC%E5%8F%98)',
    );
    expect(output).not.toContain('<audio-locate');
  });

  it('converts inline <audio-locate> tags without audio attribute and attaches kind=audio', () => {
    const input = '录音提到 <audio-locate start="00:30">重点发言</audio-locate>。';
    const output = linkifyTimestamps(input);
    expect(output).toContain(
      '[00:30 · 重点发言](#video-seek?start=30&kind=audio&snippet=%E9%87%8D%E7%82%B9%E5%8F%91%E8%A8%80)',
    );
  });

  it('converts trailing <audio-locate> tags into interactive links', () => {
    const input = [
      '录音重点记录如下：',
      '',
      '<audio-locate audio="interview.mp3" start="05:10">结尾总结</audio-locate>',
    ].join('\n');
    const output = linkifyTimestamps(input);
    expect(output).toContain(
      '[05:10 · 结尾总结](#video-seek?start=310&kind=audio&audio=interview.mp3&video=interview.mp3&snippet=%E7%BB%93%E5%B0%BE%E6%80%BB%E7%BB%93)',
    );
  });

  it('handles self-closing <video-locate /> tags', () => {
    const input = '关键动作在 <video-locate start="00:45" point="100,200" /> 处。';
    const output = linkifyTimestamps(input);
    expect(output).not.toContain('<video-locate');
    expect(output).toContain('[00:45](#video-seek?start=45&point=100%2C200)');
  });

  it('escapes square brackets inside video-locate snippet', () => {
    const input = '<video-locate start="01:00">片段 [核心看点]</video-locate>';
    const output = linkifyTimestamps(input);
    expect(output).toContain('[01:00 · 片段 \\[核心看点\\]](#video-seek?start=60');
  });

  it('unwraps lone timestamps in backticks outside code fences and converts to seek links', () => {
    const input = '关键节点 `[00:15]` 以及区间 `00:20-00:35`，但代码 `const t = "00:40";` 保持原样。';
    const output = linkifyTimestamps(input);
    expect(output).toContain('[00:15](#video-seek?start=15)');
    expect(output).toContain('[00:20-00:35](#video-seek?start=20&end=35)');
    expect(output).toContain('`const t = "00:40";`');
  });

  it('deduplicates same-line inline locate tag when bullet starts with backtick timestamp and transfers coordinates', () => {
    const input =
      '* **害羞端坐** `[00:00-00:09]`：Cosplay 角色扮演者戴着长马尾假发，双手掩面坐在床沿呈害羞状 <video-locate video="demo.mp4" start="00:00" end="00:09" point="163,546">扮演者坐在床边捂脸</video-locate>。';
    const output = linkifyTimestamps(input);

    // Front timestamp should be converted into interactive link with coordinates attached
    expect(output).toContain(
      '* **害羞端坐** [00:00-00:09](#video-seek?start=0&end=9&point=163%2C546&video=demo.mp4&snippet=%E6%89%AE%E6%BC%94%E8%80%85%E5%9D%90%E5%9C%A8%E5%BA%8A%E8%BE%B9%E6%8D%82%E8%84%B8)：Cosplay 角色扮演者戴着长马尾假发，双手掩面坐在床沿呈害羞状。',
    );
    // Trailing locate tag should be removed without leaving extra spaces or duplicate buttons
    expect(output).not.toContain('<video-locate');
    expect(output).not.toContain('`[00:00-00:09]`');
    expect(output).not.toContain('捂脸 。');
  });

  it('handles Chinese full-width brackets （） around timestamps cleanly', () => {
    const input = '### 一、入座与准备阶段（00:00 - 02:03）';
    const output = linkifyTimestamps(input);
    expect(output).toBe('### 一、入座与准备阶段[00:00 - 02:03](#video-seek?start=0&end=123)');
  });

  it('cleanly deduplicates and enhances multi-bullet video navigation notes', () => {
    const input = [
      '### 一、入座与准备阶段（00:00 - 02:03）',
      '* **害羞端坐** `[00:00-00:09]`：Cosplay 角色扮演者戴着浅蓝银色长马尾假发，双手掩面坐在床沿呈害羞状 <video-locate video="clip.mp4" start="00:00" end="00:09" point="163,546">扮演者坐在床边捂脸</video-locate>。',
      '* **道具准备** `[00:10-00:25]`：切换为第一人称仰卧视角，男方平躺在床上并拿出润滑剂瓶子 <video-locate video="clip.mp4" start="00:21" end="00:25" point="657,194">拿取润滑剂</video-locate>。',
      '* **褪裙跨坐** `[00:26-01:28]`：女方爬上床跨坐在男方腿部上方，随后脱下深蓝色裙子，露出白皙的下半身 <video-locate video="clip.mp4" start="00:46" end="01:28" point="495,504">褪去下装跨坐</video-locate>。',
      '* **位置对准** `[01:29-02:03]`：镜头正对女方后侧臀部及私密处，女方调整跨坐姿态并对准角度准备坐下 <video-locate video="clip.mp4" start="01:54" end="02:03" point="664,510">特写调整体位</video-locate>。',
    ].join('\n');

    const output = linkifyTimestamps(input);

    // Header converted cleanly
    expect(output).toContain('### 一、入座与准备阶段[00:00 - 02:03](#video-seek?start=0&end=123)');

    // Item 1
    expect(output).toContain(
      '* **害羞端坐** [00:00-00:09](#video-seek?start=0&end=9&point=163%2C546&video=clip.mp4&snippet=%E6%89%AE%E6%BC%94%E8%80%85%E5%9D%90%E5%9C%A8%E5%BA%8A%E8%BE%B9%E6%8D%82%E8%84%B8)：Cosplay 角色扮演者戴着浅蓝银色长马尾假发，双手掩面坐在床沿呈害羞状。',
    );

    // Item 2
    expect(output).toContain(
      '* **道具准备** [00:10-00:25](#video-seek?start=10&end=25&point=657%2C194&video=clip.mp4&snippet=%E6%8B%BF%E5%8F%96%E6%B6%A6%E6%BB%91%E5%89%82)：切换为第一人称仰卧视角，男方平躺在床上并拿出润滑剂瓶子。',
    );

    // Item 3
    expect(output).toContain(
      '* **褪裙跨坐** [00:26-01:28](#video-seek?start=26&end=88&point=495%2C504&video=clip.mp4&snippet=%E8%A4%AA%E5%8E%BB%E4%B8%8B%E8%A3%85%E8%B7%A8%E5%9D%90)：女方爬上床跨坐在男方腿部上方，随后脱下深蓝色裙子，露出白皙的下半身。',
    );

    // Item 4
    expect(output).toContain(
      '* **位置对准** [01:29-02:03](#video-seek?start=89&end=123&point=664%2C510&video=clip.mp4&snippet=%E7%89%B9%E5%86%99%E8%B0%83%E6%95%B4%E4%BD%93%E4%BD%8D)：镜头正对女方后侧臀部及私密处，女方调整跨坐姿态并对准角度准备坐下。',
    );

    // Zero redundant locate tags remaining
    expect(output).not.toContain('<video-locate');
    expect(output).not.toContain('`[');
  });

  it('ignores invalid timestamps where seconds or minutes are out of range', () => {
    const input = '这并不是一个时间 12:88 或者 01:99，还有 1:65:20 也不是。';
    const output = linkifyTimestamps(input);
    expect(output).toBe(input);
  });

  it('does not linkify aspect ratios or scale ratios', () => {
    const input = '屏幕比例 16:10 以及地图比例尺 1:20，还有 aspect ratio: 16:10。';
    const output = linkifyTimestamps(input);
    expect(output).toBe(input);
  });

  it('does not linkify sports scores', () => {
    const input = '目前双方比分 2:10，第一回合战成 1:20。';
    const output = linkifyTimestamps(input);
    expect(output).toBe(input);
  });

  it('does not linkify explicit time of day with AM/PM indicators', () => {
    const input = '明天下午 02:30 准时开会，或者上午 10:30 也行，或者 09:30 am。';
    const output = linkifyTimestamps(input);
    expect(output).toBe(input);
  });
});
