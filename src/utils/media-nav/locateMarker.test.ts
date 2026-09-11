import { describe, expect, it } from 'vitest';
import {
  buildAudioLocateDirective,
  buildImageLocateDirective,
  buildPdfLocateDirective,
  buildVideoLocateDirective,
  parseLocateMarkers,
  stripLocateMarkers,
  toImageNavHighlight,
  toPdfNavHighlight,
} from './locateMarker';

describe('parseLocateMarkers (pdf)', () => {
  it('returns content untouched when no markers exist', () => {
    const content = 'Just a normal answer.';
    expect(parseLocateMarkers(content)).toEqual({
      cleanContent: content,
      pdfLocates: [],
      videoLocates: [],
      audioLocates: [],
      imageLocates: [],
    });
  });

  it('extracts a full marker with doc, page, box and snippet', () => {
    const content =
      '表格说明了营收情况。\n<pdf-locate doc="report.pdf" page="3" box="120,80,340,560">营收表格</pdf-locate>';
    const { cleanContent, pdfLocates, videoLocates } = parseLocateMarkers(content);
    expect(cleanContent.trim()).toBe('表格说明了营收情况。');
    expect(videoLocates).toEqual([]);
    expect(pdfLocates).toHaveLength(1);
    expect(pdfLocates[0]).toEqual({
      docName: 'report.pdf',
      pageNumber: 3,
      box2d: [120, 80, 340, 560],
      snippet: '营收表格',
    });
  });

  it('supports a marker without doc and box attributes', () => {
    const content = '见 <pdf-locate page="7">图 2</pdf-locate> 说明。';
    const { cleanContent, pdfLocates } = parseLocateMarkers(content);
    expect(cleanContent).toBe('见  说明。');
    expect(pdfLocates).toHaveLength(1);
    expect(pdfLocates[0]).toEqual({ docName: undefined, pageNumber: 7, box2d: undefined, snippet: '图 2' });
  });

  it('extracts multiple markers in order', () => {
    const content = [
      'a <pdf-locate page="1">one</pdf-locate>',
      'b <pdf-locate doc="b.pdf" page="12" box="1,2,3,4">two</pdf-locate>',
    ].join('\n');
    const { pdfLocates } = parseLocateMarkers(content);
    expect(pdfLocates.map((locate) => locate.pageNumber)).toEqual([1, 12]);
    expect(pdfLocates[1].docName).toBe('b.pdf');
    expect(pdfLocates[1].box2d).toEqual([1, 2, 3, 4]);
  });

  it('strips an unterminated marker tail (mid-stream)', () => {
    const content = '答案开始 <pdf-locate page="4" box="1,2,3,4">部分摘';
    const { cleanContent, pdfLocates } = parseLocateMarkers(content);
    expect(cleanContent).toBe('答案开始 ');
    expect(pdfLocates).toEqual([]);
  });

  it('strips an attribute-only unterminated marker without ">"', () => {
    const content = '答案 <pdf-locate page="4"';
    expect(stripLocateMarkers(content)).toBe('答案 ');
  });

  it('ignores markers with an invalid page number', () => {
    const content = '<pdf-locate page="abc">x</pdf-locate> 尾部';
    const { cleanContent, pdfLocates } = parseLocateMarkers(content);
    expect(pdfLocates).toEqual([]);
    expect(cleanContent.trim()).toBe('尾部');
  });

  it('tolerates malformed box values', () => {
    const content = '<pdf-locate page="2" box="10,20,30">x</pdf-locate>';
    const { pdfLocates } = parseLocateMarkers(content);
    expect(pdfLocates[0].box2d).toBeUndefined();
  });

  it('supports single-quoted and unquoted attributes', () => {
    const content =
      "<pdf-locate page='5' doc='handbook.pdf' box='100,200,300,400'>单引号</pdf-locate> <pdf-locate page=7>无引号</pdf-locate>";
    const { pdfLocates, cleanContent } = parseLocateMarkers(content);
    expect(pdfLocates).toHaveLength(2);
    expect(pdfLocates[0]).toEqual({
      pageNumber: 5,
      docName: 'handbook.pdf',
      box2d: [100, 200, 300, 400],
      point: undefined,
      snippet: '单引号',
    });
    expect(pdfLocates[1]).toEqual({
      pageNumber: 7,
      docName: undefined,
      box2d: undefined,
      point: undefined,
      snippet: '无引号',
    });
    expect(cleanContent.trim()).toBe('');
  });

  it('supports self-closing tags', () => {
    const content =
      '正文开始 <pdf-locate page="3" box="50,60,70,80" /> 补充说明 <image-locate point="500,500" arrow="top" label="Logo" /> 结尾';
    const { pdfLocates, imageLocates, cleanContent } = parseLocateMarkers(content);
    expect(pdfLocates).toEqual([
      {
        pageNumber: 3,
        docName: undefined,
        box2d: [50, 60, 70, 80],
        point: undefined,
        snippet: undefined,
      },
    ]);
    expect(imageLocates).toEqual([
      {
        imageName: undefined,
        box2d: undefined,
        point: [500, 500],
        arrow: 'top',
        label: 'Logo',
        snippet: undefined,
      },
    ]);
    expect(cleanContent.replace(/\s+/g, ' ').trim()).toBe('正文开始 补充说明 结尾');
  });
});

describe('parseLocateMarkers (video)', () => {
  it('extracts a moment marker with mm:ss', () => {
    const content = '讲到这里。\n<video-locate video="demo.mp4" start="03:25">关键演示</video-locate>';
    const { cleanContent, pdfLocates, videoLocates } = parseLocateMarkers(content);
    expect(cleanContent.trim()).toBe('讲到这里。');
    expect(pdfLocates).toEqual([]);
    expect(videoLocates).toEqual([
      { videoName: 'demo.mp4', startSeconds: 205, endSeconds: undefined, snippet: '关键演示' },
    ]);
  });

  it('extracts a segment marker and drops invalid ranges', () => {
    const content = [
      '<video-locate start="1:02:03" end="1:03:00">开头</video-locate>',
      '<video-locate start="05:00" end="04:00">倒置区间应丢弃 end</video-locate>',
    ].join('\n');
    const { videoLocates } = parseLocateMarkers(content);
    expect(videoLocates).toHaveLength(2);
    expect(videoLocates[0]).toMatchObject({ startSeconds: 3723, endSeconds: 3780, videoName: undefined });
    expect(videoLocates[1]).toMatchObject({ startSeconds: 300, endSeconds: undefined });
  });

  it('strips an unterminated video marker tail (mid-stream)', () => {
    const content = '答案 <video-locate start="00:10">部分';
    const { cleanContent, videoLocates } = parseLocateMarkers(content);
    expect(cleanContent).toBe('答案 ');
    expect(videoLocates).toEqual([]);
  });

  it('parses spatial point and box coordinates even when wrapped in brackets', () => {
    const content = '<video-locate start="00:15" point="[350, 520]" box="[100, 200, 300, 400]">测试标注</video-locate>';
    const { videoLocates } = parseLocateMarkers(content);
    expect(videoLocates[0].point).toEqual([350, 520]);
    expect(videoLocates[0].box2d).toEqual([100, 200, 300, 400]);
  });

  it('ignores markers without a parsable start', () => {
    const content = '<video-locate start="abc">x</video-locate> 尾部';
    const { videoLocates, cleanContent } = parseLocateMarkers(content);
    expect(videoLocates).toEqual([]);
    expect(cleanContent.trim()).toBe('尾部');
  });

  it('extracts pdf and video markers from the same answer', () => {
    const content = [
      '前文',
      '<pdf-locate page="2">表格</pdf-locate>',
      '<video-locate start="00:30">演示</video-locate>',
      '后文',
    ].join('\n');
    const { cleanContent, pdfLocates, videoLocates } = parseLocateMarkers(content);
    expect(pdfLocates).toHaveLength(1);
    expect(videoLocates).toHaveLength(1);
    expect(cleanContent).not.toContain('<pdf-locate');
    expect(cleanContent).not.toContain('<video-locate');
  });

  it('extracts box2d and point attributes on video markers', () => {
    const content = [
      '<video-locate video="clip.mp4" start="00:15" end="00:20" box="100,200,500,600">目标人物</video-locate>',
      '<video-locate video="clip.mp4" start="01:30" point="450,550">点击按钮</video-locate>',
    ].join('\n');
    const { videoLocates } = parseLocateMarkers(content);
    expect(videoLocates).toHaveLength(2);
    expect(videoLocates[0]).toEqual({
      videoName: 'clip.mp4',
      startSeconds: 15,
      endSeconds: 20,
      snippet: '目标人物',
      box2d: [100, 200, 500, 600],
      point: undefined,
    });
    expect(videoLocates[1]).toEqual({
      videoName: 'clip.mp4',
      startSeconds: 90,
      endSeconds: undefined,
      snippet: '点击按钮',
      box2d: undefined,
      point: [450, 550],
    });
  });
});

describe('parseLocateMarkers (audio)', () => {
  it('extracts a moment marker with mm:ss', () => {
    const content = '录音里说到这点。\n<audio-locate audio="interview.mp3" start="12:05">关键回答</audio-locate>';
    const { cleanContent, pdfLocates, videoLocates, audioLocates } = parseLocateMarkers(content);
    expect(cleanContent.trim()).toBe('录音里说到这点。');
    expect(pdfLocates).toEqual([]);
    expect(videoLocates).toEqual([]);
    expect(audioLocates).toEqual([
      { audioName: 'interview.mp3', startSeconds: 725, endSeconds: undefined, snippet: '关键回答' },
    ]);
  });

  it('extracts a segment marker and drops inverted ranges', () => {
    const content = [
      '<audio-locate start="00:30" end="01:15">开场</audio-locate>',
      '<audio-locate start="05:00" end="04:00">倒置区间应丢弃 end</audio-locate>',
    ].join('\n');
    const { audioLocates } = parseLocateMarkers(content);
    expect(audioLocates).toHaveLength(2);
    expect(audioLocates[0]).toMatchObject({ startSeconds: 30, endSeconds: 75 });
    expect(audioLocates[1]).toMatchObject({ startSeconds: 300, endSeconds: undefined });
  });

  it('strips an unterminated audio marker tail (mid-stream)', () => {
    const content = '答案 <audio-locate start="00:10">部分';
    const { cleanContent, audioLocates } = parseLocateMarkers(content);
    expect(cleanContent).toBe('答案 ');
    expect(audioLocates).toEqual([]);
  });

  it('extracts pdf, video and audio markers from the same answer', () => {
    const content = [
      '<pdf-locate page="2">表格</pdf-locate>',
      '<video-locate start="00:30">演示</video-locate>',
      '<audio-locate start="01:00">访谈</audio-locate>',
    ].join('\n');
    const { cleanContent, pdfLocates, videoLocates, audioLocates } = parseLocateMarkers(content);
    expect(pdfLocates).toHaveLength(1);
    expect(videoLocates).toHaveLength(1);
    expect(audioLocates).toHaveLength(1);
    expect(cleanContent).not.toContain('-locate');
  });
});

describe('buildAudioLocateDirective', () => {
  it('describes the marker format and lists audio names', () => {
    const directive = buildAudioLocateDirective(['a.mp3', 'b.wav']);
    expect(directive).toContain('"a.mp3", "b.wav"');
    expect(directive).toContain('<audio-locate audio="FILE_NAME" start="mm:ss"');
  });

  it('omits the name list when empty', () => {
    expect(buildAudioLocateDirective([])).not.toContain('available audio file names');
  });
});

describe('stripLocateMarkers', () => {
  it('removes markers but keeps surrounding text', () => {
    const content = '前文 <pdf-locate page="9">q</pdf-locate> 中 <video-locate start="00:05">v</video-locate> 后文';
    expect(stripLocateMarkers(content)).toBe('前文  中  后文');
  });
});

describe('toPdfNavHighlight', () => {
  it('maps a locate to a highlight payload', () => {
    expect(
      toPdfNavHighlight({ docName: 'a.pdf', pageNumber: 5, box2d: [1, 2, 3, 4], snippet: 's' }, { messageId: 'm1' }),
    ).toEqual({ messageId: 'm1', docName: 'a.pdf', pageNumber: 5, box2d: [1, 2, 3, 4], snippet: 's' });
  });
});

describe('buildPdfLocateDirective', () => {
  it('lists the document names when provided', () => {
    const directive = buildPdfLocateDirective(['a.pdf', 'b.pdf']);
    expect(directive).toContain('"a.pdf", "b.pdf"');
    expect(directive).toContain('<pdf-locate doc="FILE_NAME" page="PAGE_NUMBER"');
  });

  it('omits the name list when empty', () => {
    expect(buildPdfLocateDirective([])).not.toContain('available PDF file names');
  });
});

describe('buildVideoLocateDirective', () => {
  it('describes the marker format and lists video names', () => {
    const directive = buildVideoLocateDirective(['a.mp4', 'b.webm']);
    expect(directive).toContain('"a.mp4", "b.webm"');
    expect(directive).toContain('<video-locate video="FILE_NAME" start="mm:ss"');
    expect(directive).toContain('h:mm:ss');
  });

  it('omits the name list when empty', () => {
    expect(buildVideoLocateDirective([])).not.toContain('available video file names');
  });
});

describe('parseLocateMarkers (image)', () => {
  it('extracts an image marker with box, point, arrow, and label', () => {
    const content =
      '找到目标元素：\n<image-locate file="screen.png" box="100,200,300,400" point="150,250" arrow="top-left" label="搜索栏">搜索框入口</image-locate>';
    const { cleanContent, imageLocates } = parseLocateMarkers(content);
    expect(cleanContent.trim()).toBe('找到目标元素：');
    expect(imageLocates).toHaveLength(1);
    expect(imageLocates[0]).toEqual({
      imageName: 'screen.png',
      box2d: [100, 200, 300, 400],
      point: [150, 250],
      arrow: 'top-left',
      label: '搜索栏',
      snippet: '搜索框入口',
    });
  });

  it('supports an image marker with only box or only point', () => {
    const content =
      '<image-locate box="50,60,70,80">区域</image-locate> 和 <image-locate point="500,500">中心点</image-locate>';
    const { imageLocates } = parseLocateMarkers(content);
    expect(imageLocates).toHaveLength(2);
    expect(imageLocates[0].box2d).toEqual([50, 60, 70, 80]);
    expect(imageLocates[0].point).toBeUndefined();
    expect(imageLocates[1].box2d).toBeUndefined();
    expect(imageLocates[1].point).toEqual([500, 500]);
  });

  it('converts to ImageNavHighlight', () => {
    const highlight = toImageNavHighlight(
      {
        imageName: 'ui.png',
        box2d: [10, 20, 30, 40],
        point: [15, 25],
        arrow: 'right',
        label: '按钮',
        snippet: '确定',
      },
      { messageId: 'm1', focusToken: 5 },
    );
    expect(highlight).toEqual({
      messageId: 'm1',
      imageName: 'ui.png',
      box2d: [10, 20, 30, 40],
      point: [15, 25],
      arrow: 'right',
      label: '按钮',
      snippet: '确定',
      focusToken: 5,
    });
  });
});

describe('buildImageLocateDirective', () => {
  it('describes the image visual grounding protocol and lists image names', () => {
    const directive = buildImageLocateDirective(['shot1.png', 'shot2.jpg']);
    expect(directive).toContain('"shot1.png", "shot2.jpg"');
    expect(directive).toContain('<image-locate file="FILE_NAME" box="ymin,xmin,ymax,xmax"');
  });

  it('omits the name list when empty', () => {
    expect(buildImageLocateDirective([])).not.toContain('available image file names');
  });
});
