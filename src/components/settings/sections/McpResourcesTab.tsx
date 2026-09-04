import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';
import {
  fetchMcpResource,
  type McpResourceDefinition,
  type McpResourceTemplateDefinition,
} from '@/services/api/mcpApi';
import type { McpServerConfig } from '@/types';

const MAX_PREVIEW_LENGTH = 4000;

interface McpResourcesTabProps {
  server: McpServerConfig;
  resources: McpResourceDefinition[];
  templates: McpResourceTemplateDefinition[];
  t: (key: string) => string;
}

interface Row {
  key: string;
  uri?: string;
  uriTemplate?: string;
  name: string;
  mimeType?: string;
  description?: string;
}

export const McpResourcesTab: React.FC<McpResourcesTabProps> = ({ server, resources, templates, t }) => {
  const all: Row[] = [
    ...resources.map((r) => ({
      key: r.uri,
      uri: r.uri,
      name: r.name,
      mimeType: r.mimeType,
      description: r.description,
    })),
    ...templates.map((tpl) => ({
      key: tpl.uriTemplate,
      uriTemplate: tpl.uriTemplate,
      name: tpl.name,
      mimeType: tpl.mimeType,
      description: tpl.description,
    })),
  ];
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loadingUri, setLoadingUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!all.length) {
    return <div className="p-4 text-sm text-[var(--theme-text-secondary)]">{t('settingsMcpEmptyResources')}</div>;
  }

  const readResource = async (row: Row) => {
    if (!row.uri) return;
    setLoadingUri(row.uri);
    setError(null);
    setPreviewText(null);
    try {
      const body = await fetchMcpResource(server, row.uri);
      const contents = body.result?.contents ?? [];
      const first = contents.find((entry) => typeof entry.text === 'string');
      if (!first || typeof first.text !== 'string') {
        setPreviewText(t('settingsMcpResourceBinary'));
      } else {
        const text = first.text;
        setPreviewText(text.length > MAX_PREVIEW_LENGTH ? `${text.slice(0, MAX_PREVIEW_LENGTH)}…` : text);
      }
    } catch (resourceFetchError) {
      setError(resourceFetchError instanceof Error ? resourceFetchError.message : String(resourceFetchError));
    } finally {
      setLoadingUri(null);
    }
  };

  return (
    <div className="divide-y">
      {all.map((row) => {
        const expanded = expandedKey === row.key;
        return (
          <div key={row.key} className="px-3 py-2">
            <button
              type="button"
              data-testid={`mcp-resource-row-${row.key}`}
              onClick={() => {
                setExpandedKey(expanded ? null : row.key);
                setPreviewText(null);
                setError(null);
              }}
              className="flex w-full items-center gap-2 text-left"
            >
              {expanded ? (
                <ChevronDown size={14} className="shrink-0" />
              ) : (
                <ChevronRight size={14} className="shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate font-mono text-sm">
                {row.uri ?? row.uriTemplate ?? row.name}
              </span>
              {row.mimeType ? (
                <span className="shrink-0 rounded bg-[var(--theme-bg-tertiary)] px-1.5 py-0.5 text-[10px]">
                  {row.mimeType}
                </span>
              ) : null}
            </button>
            {expanded && (
              <div className="mt-2 pl-6">
                <div className="text-xs text-[var(--theme-text-secondary)]">{row.name}</div>
                {row.description && <div className="mt-0.5 text-xs">{row.description}</div>}
                {row.uri && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={loadingUri === row.uri}
                      onClick={() => void readResource(row)}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-[var(--theme-bg-tertiary)] disabled:opacity-50"
                    >
                      {loadingUri === row.uri ? t('settingsMcpLoading') : t('settingsMcpResourcesRead')}
                    </button>
                  </div>
                )}
                {error && <div className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</div>}
                {previewText !== null && (
                  <div className="mt-2">
                    <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded border p-2 text-xs">
                      {previewText}
                    </pre>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(previewText);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="mt-1 flex items-center gap-1 text-[11px]"
                    >
                      <Copy className="h-3 w-3" />
                      {copied ? t('settingsMcpCopied') : t('settingsMcpCopy')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
