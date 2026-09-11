import { describe, it, expect } from 'vitest';
import {
  getLibraryFileType,
  isImageFileType,
  isVideoFileType,
  isDocumentFileType,
  formatLibraryDate,
  extractLibraryItemsFromSessions,
  filterAndSortLibraryItems,
  libraryItemToUploadedFile,
  getItemExtensions,
  matchesLibrarySearchToken,
  resolveLibraryItemToUploadedFile,
} from './libraryFiles';
import type { SavedChatSession, LibraryItem, LibraryFilterState } from '@/types';

describe('libraryFiles utils', () => {
  it('correctly classifies file types', () => {
    expect(getLibraryFileType('image/png', 'photo.png')).toBe('image');
    expect(getLibraryFileType('image/jpeg', 'photo.jpg')).toBe('image');
    expect(getLibraryFileType('application/pdf', 'paper.pdf')).toBe('pdf');
    expect(getLibraryFileType('text/csv', 'data.csv')).toBe('spreadsheet');
    expect(getLibraryFileType('application/vnd.ms-excel', 'data.xlsx')).toBe('spreadsheet');
    expect(getLibraryFileType('application/vnd.ms-powerpoint', 'slides.pptx')).toBe('presentation');
    expect(getLibraryFileType('text/plain', 'notes.txt')).toBe('document');
    expect(getLibraryFileType('text/markdown', 'readme.md')).toBe('document');
    expect(getLibraryFileType('audio/mp3', 'song.mp3')).toBe('audio');
    expect(getLibraryFileType('audio/wav', 'voice.wav')).toBe('audio');
    expect(getLibraryFileType('video/mp4', 'clip.mp4')).toBe('video');
    expect(getLibraryFileType('video/webm', 'recording.webm')).toBe('video');
  });

  it('determines isImageFileType and isDocumentFileType', () => {
    expect(isImageFileType('image/png', 'test.png')).toBe(true);
    expect(isImageFileType('application/pdf', 'test.pdf')).toBe(false);

    expect(isDocumentFileType('application/pdf', 'test.pdf')).toBe(true);
    expect(isDocumentFileType('image/png', 'test.png')).toBe(false);
    expect(isDocumentFileType('audio/mp3', 'test.mp3')).toBe(false);
    expect(isDocumentFileType('video/mp4', 'test.mp4')).toBe(false);
  });

  it('determines isVideoFileType correctly', () => {
    expect(isVideoFileType('video/mp4', 'clip.mp4')).toBe(true);
    expect(isVideoFileType('application/octet-stream', 'video.mov')).toBe(true);
    expect(isVideoFileType('video/webm', 'recording.webm')).toBe(true);
    expect(isVideoFileType('image/png', 'photo.png')).toBe(false);
    expect(isVideoFileType('application/pdf', 'document.pdf')).toBe(false);
    expect(isVideoFileType('audio/mp3', 'song.mp3')).toBe(false);
  });

  it('formats library dates nicely', () => {
    const now = Date.now();
    expect(formatLibraryDate(now, 'zh')).toBe('今天');
    expect(formatLibraryDate(now, 'en')).toBe('Today');

    const yesterday = now - 24 * 60 * 60 * 1000;
    expect(formatLibraryDate(yesterday, 'zh')).toBe('昨天');
    expect(formatLibraryDate(yesterday, 'en')).toBe('Yesterday');

    // 4 days ago
    const fourDaysAgo = now - 4 * 24 * 60 * 60 * 1000;
    const dateStr = formatLibraryDate(fourDaysAgo, 'zh');
    expect(dateStr.startsWith('星期')).toBe(true);
  });

  it('extracts library items from saved sessions', () => {
    const mockSessions: SavedChatSession[] = [
      {
        id: 'session-1',
        title: 'Session One',
        timestamp: 1000,
        settings: {} as any,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Here is a file',
            timestamp: new Date(1000),
            files: [
              {
                id: 'file-1',
                name: 'diagram.png',
                type: 'image/png',
                size: 1024,
              },
            ],
          },
          {
            id: 'msg-2',
            role: 'model',
            content: 'Here is another file',
            timestamp: new Date(2000),
            files: [
              {
                id: 'file-2',
                name: 'report.pdf',
                type: 'application/pdf',
                size: 2048,
              },
            ],
          },
        ],
      },
    ];

    const items = extractLibraryItemsFromSessions(mockSessions);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('file-1');
    expect(items[0].source).toBe('uploaded');
    expect(items[0].sessionTitle).toBe('Session One');

    expect(items[1].id).toBe('file-2');
    expect(items[1].source).toBe('generated');
  });

  it('filters and sorts library items', () => {
    const items: LibraryItem[] = [
      {
        id: '1',
        name: 'A-photo.png',
        type: 'image/png',
        size: 500,
        timestamp: 100,
        source: 'uploaded',
      },
      {
        id: '2',
        name: 'B-doc.pdf',
        type: 'application/pdf',
        size: 2000,
        timestamp: 300,
        source: 'uploaded',
      },
      {
        id: '3',
        name: 'C-photo.jpg',
        type: 'image/jpeg',
        size: 1500,
        timestamp: 200,
        source: 'generated',
      },
      {
        id: '4',
        name: 'D-voice.mp3',
        type: 'audio/mp3',
        size: 800,
        timestamp: 250,
        source: 'uploaded',
      },
      {
        id: '5',
        name: 'E-clip.mp4',
        type: 'video/mp4',
        size: 3000,
        timestamp: 350,
        source: 'uploaded',
      },
    ];

    const baseFilter: LibraryFilterState = {
      category: 'all',
      source: 'all',
      fileType: 'all',
      sort: 'date_desc',
      searchQuery: '',
      viewMode: 'list',
    };

    // Category: image
    const imageOnly = filterAndSortLibraryItems(items, { ...baseFilter, category: 'image' });
    expect(imageOnly).toHaveLength(2);
    expect(imageOnly.map((i) => i.id)).toEqual(['3', '1']); // Sorted by date desc: 200 > 100

    // Category: document
    const docOnly = filterAndSortLibraryItems(items, { ...baseFilter, category: 'document' });
    expect(docOnly).toHaveLength(1);
    expect(docOnly[0].id).toBe('2');

    // Category: audio
    const audioOnly = filterAndSortLibraryItems(items, { ...baseFilter, category: 'audio' });
    expect(audioOnly).toHaveLength(1);
    expect(audioOnly[0].id).toBe('4');

    // Category: video
    const videoOnly = filterAndSortLibraryItems(items, { ...baseFilter, category: 'video' });
    expect(videoOnly).toHaveLength(1);
    expect(videoOnly[0].id).toBe('5');

    // Source: generated
    const genOnly = filterAndSortLibraryItems(items, { ...baseFilter, source: 'generated' });
    expect(genOnly).toHaveLength(1);
    expect(genOnly[0].id).toBe('3');

    // Sort: name_asc
    const nameAsc = filterAndSortLibraryItems(items, { ...baseFilter, sort: 'name_asc' });
    expect(nameAsc.map((i) => i.name)).toEqual([
      'A-photo.png',
      'B-doc.pdf',
      'C-photo.jpg',
      'D-voice.mp3',
      'E-clip.mp4',
    ]);

    // Sort: size_desc
    const sizeDesc = filterAndSortLibraryItems(items, { ...baseFilter, sort: 'size_desc' });
    expect(sizeDesc.map((i) => i.size)).toEqual([3000, 2000, 1500, 800, 500]);

    // Search query
    const searchDoc = filterAndSortLibraryItems(items, { ...baseFilter, searchQuery: 'doc' });
    expect(searchDoc).toHaveLength(1);
    expect(searchDoc[0].id).toBe('2');
  });

  it('converts library item to uploaded file', () => {
    const item: LibraryItem = {
      id: 'f-1',
      name: 'test.png',
      type: 'image/png',
      size: 1234,
      timestamp: 100,
      source: 'uploaded',
      textContent: 'hello',
    };

    const uploaded = libraryItemToUploadedFile(item);
    expect(uploaded.id).toBe('f-1');
    expect(uploaded.name).toBe('test.png');
    expect(uploaded.type).toBe('image/png');
    expect(uploaded.size).toBe(1234);
    expect(uploaded.textContent).toBe('hello');
  });

  it('preserves Files API metadata when extracting and converting library items', () => {
    const mockSessions: SavedChatSession[] = [
      {
        id: 'session-files-api',
        title: 'Files API Chat',
        timestamp: 1000,
        settings: {} as any,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Uploaded via Files API',
            timestamp: new Date(1000),
            files: [
              {
                id: 'file-api-1',
                name: 'document.pdf',
                type: 'application/pdf',
                size: 10240,
                fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123xyz',
                fileApiName: 'files/abc123xyz',
                fileApiExpirationTime: '2026-09-06T00:00:00.000Z',
                fileApiKeyFingerprint: 'key-fingerprint-123',
                transferStrategy: 'files-api',
                uploadState: 'active',
              },
            ],
          },
        ],
      },
    ];

    const items = extractLibraryItemsFromSessions(mockSessions);
    expect(items).toHaveLength(1);
    expect(items[0].fileUri).toBe('https://generativelanguage.googleapis.com/v1beta/files/abc123xyz');
    expect(items[0].fileApiName).toBe('files/abc123xyz');
    expect(items[0].fileApiExpirationTime).toBe('2026-09-06T00:00:00.000Z');
    expect(items[0].fileApiKeyFingerprint).toBe('key-fingerprint-123');
    expect(items[0].transferStrategy).toBe('files-api');
    expect(items[0].uploadState).toBe('active');

    const converted = libraryItemToUploadedFile(items[0]);
    expect(converted.fileUri).toBe('https://generativelanguage.googleapis.com/v1beta/files/abc123xyz');
    expect(converted.fileApiName).toBe('files/abc123xyz');
    expect(converted.fileApiExpirationTime).toBe('2026-09-06T00:00:00.000Z');
    expect(converted.fileApiKeyFingerprint).toBe('key-fingerprint-123');
    expect(converted.transferStrategy).toBe('files-api');
    expect(converted.uploadState).toBe('active');
  });

  describe('file extension extraction and search support', () => {
    it('matches search tokens directly with matchesLibrarySearchToken', () => {
      const item: LibraryItem = {
        id: 'item-1',
        name: 'Report.pdf',
        type: 'application/pdf',
        size: 100,
        timestamp: 100,
        source: 'uploaded',
        sessionTitle: 'Quarterly Sync',
      };
      const exts = getItemExtensions(item.name, item.type);
      expect(matchesLibrarySearchToken(item, 'report', exts)).toBe(true);
      expect(matchesLibrarySearchToken(item, 'sync', exts)).toBe(true);
      expect(matchesLibrarySearchToken(item, '.pdf', exts)).toBe(true);
      expect(matchesLibrarySearchToken(item, 'ext:pdf', exts)).toBe(true);
      expect(matchesLibrarySearchToken(item, 'ext:png', exts)).toBe(false);
      expect(matchesLibrarySearchToken(item, '.png', exts)).toBe(false);
    });

    it('extracts extensions from filename and MIME type with aliases', () => {
      // From filename with extension
      const exts1 = getItemExtensions('report.pdf', 'application/pdf');
      expect(exts1.has('pdf')).toBe(true);

      // From compound extension
      const exts2 = getItemExtensions('backup.tar.gz', 'application/gzip');
      expect(exts2.has('gz')).toBe(true);
      expect(exts2.has('tar.gz')).toBe(true);

      // From file without extension in filename, but with MIME type
      const exts3 = getItemExtensions('my-photo', 'image/png');
      expect(exts3.has('png')).toBe(true);

      // Alias expansions: jpg <-> jpeg
      const exts4 = getItemExtensions('photo.jpeg', 'image/jpeg');
      expect(exts4.has('jpeg')).toBe(true);
      expect(exts4.has('jpg')).toBe(true);

      // Alias expansions: docx <-> doc
      const exts5 = getItemExtensions(
        'paper.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(exts5.has('docx')).toBe(true);
      expect(exts5.has('doc')).toBe(true);

      // Alias expansions: xlsx <-> xls
      const exts6 = getItemExtensions(
        'sheet.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(exts6.has('xlsx')).toBe(true);
      expect(exts6.has('xls')).toBe(true);

      // Alias expansions: md <-> markdown
      const exts7 = getItemExtensions('README.md', 'text/markdown');
      expect(exts7.has('md')).toBe(true);
      expect(exts7.has('markdown')).toBe(true);
    });

    it('filters items by file extension with dot prefix, bare extension, and wildcard', () => {
      const sampleItems: LibraryItem[] = [
        {
          id: '1',
          name: 'Annual Report.pdf',
          type: 'application/pdf',
          size: 100,
          timestamp: 100,
          source: 'uploaded',
        },
        {
          id: '2',
          name: 'quarterly_financials', // no extension in filename
          type: 'application/pdf',
          size: 200,
          timestamp: 200,
          source: 'uploaded',
        },
        {
          id: '3',
          name: 'company_logo.png',
          type: 'image/png',
          size: 300,
          timestamp: 300,
          source: 'uploaded',
        },
        {
          id: '4',
          name: 'budget_overview.xlsx',
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 400,
          timestamp: 400,
          source: 'uploaded',
        },
        {
          id: '5',
          name: 'meeting_notes.md',
          type: 'text/markdown',
          size: 500,
          timestamp: 500,
          source: 'uploaded',
          sessionTitle: 'Project Planning',
        },
        {
          id: '6',
          name: 'pdf_helper.ts', // has 'pdf' in name, but is a TypeScript file
          type: 'text/javascript',
          size: 600,
          timestamp: 600,
          source: 'uploaded',
        },
      ];

      const baseFilter: LibraryFilterState = {
        category: 'all',
        source: 'all',
        fileType: 'all',
        sort: 'date_desc',
        searchQuery: '',
        viewMode: 'list',
      };

      // 1. Search by dot-prefixed extension: ".pdf"
      // Should match "Annual Report.pdf" and "quarterly_financials" (by MIME), but NOT "pdf_helper.ts"
      const dotPdf = filterAndSortLibraryItems(sampleItems, { ...baseFilter, searchQuery: '.pdf' });
      expect(dotPdf.map((i) => i.id)).toEqual(['2', '1']);

      // 2. Search by bare extension: "pdf"
      // Matches "Annual Report.pdf", "quarterly_financials" (by MIME), and "pdf_helper.ts" (by name substring)
      const barePdf = filterAndSortLibraryItems(sampleItems, { ...baseFilter, searchQuery: 'pdf' });
      expect(barePdf.map((i) => i.id)).toEqual(['6', '2', '1']);

      // 3. Search with explicit extension filter: "ext:pdf"
      // Only matches PDF files, NOT "pdf_helper.ts"
      const extPdf = filterAndSortLibraryItems(sampleItems, { ...baseFilter, searchQuery: 'ext:pdf' });
      expect(extPdf.map((i) => i.id)).toEqual(['2', '1']);

      // 4. Search with wildcard: "*.pdf"
      const wildPdf = filterAndSortLibraryItems(sampleItems, { ...baseFilter, searchQuery: '*.pdf' });
      expect(wildPdf.map((i) => i.id)).toEqual(['2', '1']);

      // 5. Incremental dot search: ".pd"
      const incPd = filterAndSortLibraryItems(sampleItems, { ...baseFilter, searchQuery: '.pd' });
      expect(incPd.map((i) => i.id)).toEqual(['2', '1']);

      // 6. Search for Excel spreadsheet: "xlsx" and ".xlsx"
      const searchXlsx = filterAndSortLibraryItems(sampleItems, { ...baseFilter, searchQuery: 'xlsx' });
      expect(searchXlsx).toHaveLength(1);
      expect(searchXlsx[0].id).toBe('4');

      const searchDotXlsx = filterAndSortLibraryItems(sampleItems, { ...baseFilter, searchQuery: '.xlsx' });
      expect(searchDotXlsx).toHaveLength(1);
      expect(searchDotXlsx[0].id).toBe('4');

      // 7. Search for Markdown: "md" and ".md"
      const searchMd = filterAndSortLibraryItems(sampleItems, { ...baseFilter, searchQuery: 'md' });
      expect(searchMd).toHaveLength(1);
      expect(searchMd[0].id).toBe('5');

      // 8. Multi-token query: "annual .pdf"
      const multiToken1 = filterAndSortLibraryItems(sampleItems, { ...baseFilter, searchQuery: 'annual .pdf' });
      expect(multiToken1).toHaveLength(1);
      expect(multiToken1[0].id).toBe('1');

      // 9. Multi-token query: "planning md" (sessionTitle + extension)
      const multiToken2 = filterAndSortLibraryItems(sampleItems, { ...baseFilter, searchQuery: 'planning md' });
      expect(multiToken2).toHaveLength(1);
      expect(multiToken2[0].id).toBe('5');

      // 10. Non-matching extension: ".gif"
      const noMatch = filterAndSortLibraryItems(sampleItems, { ...baseFilter, searchQuery: '.gif' });
      expect(noMatch).toHaveLength(0);

      // 11. Bidirectional extension aliases (e.g. searching ts finds .tsx, searching js finds .jsx)
      const codeItems: LibraryItem[] = [
        { id: 'c-1', name: 'Component.tsx', type: 'text/plain', size: 10, timestamp: 1, source: 'uploaded' },
        { id: 'c-2', name: 'script.jsx', type: 'text/javascript', size: 10, timestamp: 2, source: 'uploaded' },
        { id: 'c-3', name: 'config.yml', type: 'text/yaml', size: 10, timestamp: 3, source: 'uploaded' },
        { id: 'c-4', name: 'readme.markdown', type: 'text/markdown', size: 10, timestamp: 4, source: 'uploaded' },
      ];
      const matchTs = filterAndSortLibraryItems(codeItems, { ...baseFilter, searchQuery: 'ts' });
      expect(matchTs.map((i) => i.id)).toContain('c-1');

      const matchJs = filterAndSortLibraryItems(codeItems, { ...baseFilter, searchQuery: 'js' });
      expect(matchJs.map((i) => i.id)).toContain('c-2');

      const matchYaml = filterAndSortLibraryItems(codeItems, { ...baseFilter, searchQuery: 'yaml' });
      expect(matchYaml.map((i) => i.id)).toContain('c-3');

      const matchMd = filterAndSortLibraryItems(codeItems, { ...baseFilter, searchQuery: 'md' });
      expect(matchMd.map((i) => i.id)).toContain('c-4');
    });
  });

  describe('resolveLibraryItemToUploadedFile', () => {
    it('generates dataUrl for PDF files and defaults uploadState to active', async () => {
      const mockBlob = new Blob(['%PDF-1.4 test content'], { type: 'application/pdf' });
      const item: LibraryItem = {
        id: 'lib-pdf-1',
        name: 'document.pdf',
        type: 'application/pdf',
        size: 100,
        timestamp: Date.now(),
        isStandalone: true,
        source: 'uploaded',
        rawFile: mockBlob,
      };

      const resolved = await resolveLibraryItemToUploadedFile(item);

      expect(resolved.id).toBe('lib-pdf-1');
      expect(resolved.uploadState).toBe('active');
      expect(resolved.isProcessing).toBe(false);
      expect(resolved.progress).toBe(100);
      expect(resolved.dataUrl).toBeDefined();
      expect(resolved.dataUrl?.startsWith('blob:')).toBe(true);
      expect(resolved.rawFile).toBeInstanceOf(File);
      expect((resolved.rawFile as File)?.name).toBe('document.pdf');
    });

    it('generates a fresh unique id when generateNewId is requested', async () => {
      const mockBlob = new Blob(['test content'], { type: 'text/plain' });
      const item: LibraryItem = {
        id: 'old-session-file-id',
        name: 'notes.txt',
        type: 'text/plain',
        size: 50,
        timestamp: Date.now(),
        isStandalone: false,
        source: 'uploaded',
        rawFile: mockBlob,
      };

      const resolved = await resolveLibraryItemToUploadedFile(item, undefined, { generateNewId: true });

      expect(resolved.id).not.toBe('old-session-file-id');
      expect(resolved.id.length).toBeGreaterThan(5);
      expect(resolved.uploadState).toBe('active');
      expect(resolved.dataUrl).toBeDefined();
    });
  });
});
