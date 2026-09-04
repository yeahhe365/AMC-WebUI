import { describe, expect, it } from 'vitest';
import {
  buildAudioLocateDirective,
  buildPdfLocateDirective,
  buildVideoLocateDirective,
  parseLocateMarkers,
  stripLocateMarkers,
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
