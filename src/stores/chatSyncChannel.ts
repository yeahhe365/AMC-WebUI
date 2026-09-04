import type { SyncMessage } from '@/types/sync';

export const CHAT_SYNC_CHANNEL_NAME = 'all_model_chat_sync_v1';

let syncChannel: BroadcastChannel | null = null;

export function getChatSyncChannel(): BroadcastChannel {
  if (!syncChannel) {
    syncChannel = new BroadcastChannel(CHAT_SYNC_CHANNEL_NAME);
  }
  return syncChannel;
}

export function broadcastSyncMessage(syncMessage: SyncMessage) {
  try {
    getChatSyncChannel().postMessage(syncMessage);
  } catch {
    // Ignore sync failures in unsupported or restricted environments.
  }
}

// Test-only reset helper to allow singleton isolation after centralized flush changes
export function _resetSyncChannelForTests(): void {
  try {
    syncChannel?.close();
  } catch {
    // Ignore close failures in restricted contexts
  }
  syncChannel = null;
}
