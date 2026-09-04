import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';
import { ensureAllFeatureTranslations } from '@/i18n/translations';

import { installBrowserTestEnvironment, resetBrowserTestEnvironment } from './browser/environment';

// Core service mocks are registered once here instead of being copy-pasted into
// every suite. Suites that test the REAL modules opt out with vi.unmock().
vi.mock('@/services/logService', async () => {
  const { createLogServiceMockModule } = await import('./doubles/moduleMocks');
  return createLogServiceMockModule();
});
vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('./doubles/moduleMocks');
  return createDbServiceMockModule();
});
vi.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' }, version: 'mock' },
  Document: ({ children }: { children: unknown }) => children,
  Page: () => null,
  Outline: () => null,
  Thumbnail: () => null,
  useDocumentContext: () => ({}),
  useOutlineContext: () => ({}),
  usePageContext: () => ({}),
  PasswordResponses: {},
}));

// installBrowserTestEnvironment centralizes IS_REACT_ACT_ENVIRONMENT and browser API shims.
installBrowserTestEnvironment();

await ensureAllFeatureTranslations();

afterEach(() => {
  cleanup();
  resetBrowserTestEnvironment();

  if (typeof document !== 'undefined') {
    document.body.innerHTML = '';
  }
});
