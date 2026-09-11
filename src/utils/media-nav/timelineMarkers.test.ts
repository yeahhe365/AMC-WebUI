import { describe, expect, it } from 'vitest';
import type { ChatMessage, UploadedFile } from '@/types';
import { extractTimelineMarkers } from './timelineMarkers';

const mockFile = (id: string, name: string): UploadedFile =>
  ({
    id,
    name,
    type: 'video',
    size: 1024,
  }) as unknown as UploadedFile;

const mockMsg = (id: string, content: string): ChatMessage =>
  ({
    id,
    role: 'assistant',
    content,
    timestamp: Date.now(),
  }) as unknown as ChatMessage;

describe('extractTimelineMarkers', () => {
  it('returns empty array when messages are empty', () => {
    const file = mockFile('f1', 'test.mp4');
    expect(extractTimelineMarkers([], file, 'video')).toEqual([]);
  });

  it('extracts markers from structured <video-locate> tags', () => {
    const file = mockFile('f1', 'ayaka.mp4');
    const messages = [
      mockMsg(
        'm1',
        '开场动作：<video-locate video="ayaka.mp4" start="26.0" end="30.5" snippet="褪裙跨坐" /> 之后继续分析。',
      ),
      mockMsg('m2', '<video-locate video="ayaka.mp4" start="124.0" end="135.0" snippet="起步律动" />'),
    ];

    const markers = extractTimelineMarkers(messages, file, 'video');
    expect(markers).toHaveLength(2);
    expect(markers[0].time).toBe(26);
    expect(markers[0].endTime).toBe(30);
    expect(markers[0].snippet).toBe('褪裙跨坐');
    expect(markers[1].time).toBe(124);
    expect(markers[1].endTime).toBe(135);
  });

  it('extracts markers from markdown #video-seek links', () => {
    const file = mockFile('f1', 'ayaka.mp4');
    const messages = [
      mockMsg(
        'm1',
        '请看 [00:26](#video-seek?start=26.0&end=30.0&snippet=%E8%A4%AA%E8%A3%99%E8%B7%A8%E5%9D%90&video=ayaka.mp4) 处的动作细节。',
      ),
    ];

    const markers = extractTimelineMarkers(messages, file, 'video');
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(26);
    expect(markers[0].endTime).toBe(30);
    expect(markers[0].snippet).toBe('褪裙跨坐');
  });

  it('deduplicates tags and links that refer to the same moment', () => {
    const file = mockFile('f1', 'ayaka.mp4');
    const messages = [
      mockMsg(
        'm1',
        '<video-locate video="ayaka.mp4" start="26.0" end="30.0" snippet="褪裙跨坐" />\n[00:26](#video-seek?start=26.0&end=30.0&snippet=%E8%A4%AA%E8%A3%99%E8%B7%A8%E5%9D%90&video=ayaka.mp4)',
      ),
    ];

    const markers = extractTimelineMarkers(messages, file, 'video');
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(26);
    expect(markers[0].snippet).toBe('褪裙跨坐');
  });

  it('extracts audio markers for audio files', () => {
    const file = mockFile('a1', 'podcast.mp3');
    const messages = [mockMsg('m1', '<audio-locate audio="podcast.mp3" start="45.0" end="60.0" snippet="重点发言" />')];

    const markers = extractTimelineMarkers(messages, file, 'audio');
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(45);
    expect(markers[0].endTime).toBe(60);
    expect(markers[0].snippet).toBe('重点发言');
  });

  it('extracts markers from plain timestamps in message text', () => {
    const file = mockFile('f1', 'lecture.mp4');
    const messages = [
      mockMsg('m1', '主要内容节点：\n- [00:45] 介绍背景\n- 02:10-02:30 讨论核心方案\n在 05:15 处总结成果。'),
    ];

    const markers = extractTimelineMarkers(messages, file, 'video');
    expect(markers).toHaveLength(3);
    expect(markers[0].time).toBe(45);
    expect(markers[0].snippet).toBe('介绍背景');
    expect(markers[1].time).toBe(130);
    expect(markers[1].endTime).toBe(150);
    expect(markers[1].snippet).toBe('讨论核心方案');
    expect(markers[2].time).toBe(315);
    expect(markers[2].snippet).toBe('总结成果');
  });

  it('ignores false positive timestamps in text', () => {
    const file = mockFile('f1', 'lecture.mp4');
    const messages = [mockMsg('m1', '长宽比 16:9，总比分 2:1，上午 10:30 开会讨论。')];

    const markers = extractTimelineMarkers(messages, file, 'video');
    expect(markers).toHaveLength(0);
  });

  it('does not extract plain timestamps for video when message only has audio locates', () => {
    const videoFile = mockFile('v1', 'presentation.mp4');
    const messages = [
      mockMsg(
        'm1',
        '<audio-locate audio="podcast.mp3" start="45.0" snippet="音频重点" />\n在这个音频的 [00:45] 有精彩点评。',
      ),
    ];

    const markers = extractTimelineMarkers(messages, videoFile, 'video');
    expect(markers).toHaveLength(0);
  });
});
