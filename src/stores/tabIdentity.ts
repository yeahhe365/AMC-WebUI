/**
 * Stable per-tab id for cross-tab ownership (leases, loading origin, abort).
 *
 * Persisted in `sessionStorage` so it survives a page refresh (a refresh must
 * keep owning its in-flight generation so the favicon/stream can resume),
 * while remaining unique per tab — sessionStorage is scoped to a single tab
 * and its navigations, unlike localStorage which is shared across tabs.
 */
const TAB_ID_STORAGE_KEY = 'amc_tab_id_v1';

const createTabId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

export const TAB_ID = (() => {
  try {
    const existing = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const next = createTabId();
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, next);
    return next;
  } catch {
    // sessionStorage is unavailable (restricted contexts, SSR prerenders, etc).
    return createTabId();
  }
})();
