import React from 'react';
import { AlertCircle, Loader2, Wrench } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { AssistantItem } from '@/stores/settingsAssistantStore';
import { ApiKeyHandoffCard } from './ApiKeyHandoffCard';
import { ConnectionChangeCard } from './ConnectionChangeCard';

/** Tool display names are UI copy, so they are translated rather than shown raw. */
const TOOL_LABEL_KEYS: Record<string, string> = {
  list_templates: 'assistantToolListTemplates',
  list_connections: 'assistantToolListConnections',
  create_connection: 'assistantToolCreateConnection',
  update_connection: 'assistantToolUpdateConnection',
};

interface AssistantMessageListProps {
  items: AssistantItem[];
}

export const AssistantMessageList: React.FC<AssistantMessageListProps> = ({ items }) => {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      {items.map((item) => {
        switch (item.kind) {
          case 'user':
            return (
              <div key={item.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg bg-[var(--theme-bg-accent)] px-3 py-2 text-xs text-[var(--theme-text-accent)] whitespace-pre-wrap">
                  {item.text}
                </div>
              </div>
            );
          case 'assistant':
            return (
              <div key={item.id} className="max-w-[90%] text-xs text-[var(--theme-text-primary)] whitespace-pre-wrap">
                {item.text}
              </div>
            );
          case 'tool': {
            const labelKey = TOOL_LABEL_KEYS[item.name];
            return (
              <div
                key={item.id}
                data-testid={`assistant-tool-${item.id}`}
                data-tool-name={item.name}
                className="flex items-center gap-2 text-[11px] text-[var(--theme-text-secondary)]"
              >
                {item.status === 'running' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Wrench size={12} className={item.status === 'error' ? 'text-[var(--theme-text-error)]' : ''} />
                )}
                <span>{labelKey ? t(labelKey) : item.name}</span>
                {item.detail ? <span>· {item.detail}</span> : null}
              </div>
            );
          }
          case 'change':
            return <ConnectionChangeCard key={item.id} connectionId={item.connectionId} changed={item.changed} />;
          case 'key-request':
            return (
              <ApiKeyHandoffCard key={item.id} connectionId={item.connectionId} connectionName={item.connectionName} />
            );
          case 'error':
            return (
              <div key={item.id} className="flex items-center gap-2 text-xs text-[var(--theme-text-error)]">
                <AlertCircle size={13} />
                <span>{item.message}</span>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
};
