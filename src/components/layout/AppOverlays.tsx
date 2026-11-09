import React, { Suspense } from 'react';
import { ToastViewport } from '@/components/shared/toast/ToastViewport';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';

const LazyMcpToolApprovalDialog = lazyNamedComponent(
  () => import('@/components/mcp/McpToolApprovalDialog'),
  'McpToolApprovalDialog',
);
const LazyMcpShareInstallGate = lazyNamedComponent(
  () => import('@/components/mcp/McpShareInstallGate'),
  'McpShareInstallGate',
);
const LazyAssistantApiKeyDialog = lazyNamedComponent(
  () => import('@/components/settings/sections/providers/assistant/AssistantApiKeyDialog'),
  'AssistantApiKeyDialog',
);

/**
 * App-wide overlays that answer to whoever is looking at the app: toasts and
 * the dialogs the app itself opens (MCP tool approval, shared-server install,
 * assistant API key).
 *
 * Mount this inside the active `WindowProvider`. While Picture-in-Picture is
 * open the app lives in a second window, and an overlay rendered anywhere else
 * shows up in the window the user is not looking at — its Esc handling
 * included — so a pending tool approval would never be answered.
 */
export const AppOverlays: React.FC = () => (
  <>
    <ToastViewport />
    <Suspense fallback={null}>
      <LazyMcpToolApprovalDialog />
    </Suspense>
    <Suspense fallback={null}>
      <LazyMcpShareInstallGate />
    </Suspense>
    <Suspense fallback={null}>
      <LazyAssistantApiKeyDialog />
    </Suspense>
  </>
);
