import type { SessionItemProps } from './SessionItem';

/**
 * Everything SessionItem accepts beyond the session itself. Lives in this leaf
 * module (not on GroupItem) because group rows, sortable wrappers, and the
 * limited list all forward these props — importing them from GroupItem would
 * make the sidebar component graph cyclic.
 */
export type SessionItemPassedProps = Omit<SessionItemProps, 'session'>;
