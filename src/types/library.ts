import type { FileTransferStrategy } from './chat';

export type LibraryCategoryFilter = 'all' | 'image' | 'document' | 'audio' | 'video';

export type LibrarySourceFilter = 'all' | 'uploaded' | 'generated';

export type LibraryFileTypeFilter =
  'all' | 'image' | 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'audio' | 'video';

export type LibrarySortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc';

export type LibraryViewMode = 'list' | 'grid';

export interface LibraryItem {
  id: string;
  name: string;
  type: string;
  size: number;
  timestamp: number;
  sessionId?: string;
  sessionTitle?: string;
  messageId?: string;
  rawFile?: Blob | File;
  dataUrl?: string;
  textContent?: string;
  source: 'uploaded' | 'generated';
  isStandalone?: boolean;
  fileUri?: string;
  fileApiName?: string;
  fileApiExpirationTime?: string;
  fileApiKeyFingerprint?: string;
  transferStrategy?: FileTransferStrategy;
  uploadState?: 'pending' | 'uploading' | 'processing_api' | 'active' | 'failed' | 'cancelled';
}

export interface LibraryFilterState {
  category: LibraryCategoryFilter;
  source: LibrarySourceFilter;
  fileType: LibraryFileTypeFilter;
  sort: LibrarySortOption;
  searchQuery: string;
  viewMode: LibraryViewMode;
}
