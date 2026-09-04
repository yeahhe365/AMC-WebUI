import React from 'react';
import { ExternalLink } from 'lucide-react';

/** Curated external registries (pure links, mirroring Cherry Studio's market grid). */
const MCP_MARKETPLACES = [
  { name: 'mcp.so', url: 'https://mcp.so/' },
  { name: 'smithery.ai', url: 'https://smithery.ai/' },
  { name: 'glama.ai', url: 'https://glama.ai/mcp/servers' },
  { name: 'PulseMCP', url: 'https://pulsemcp.com/' },
  { name: 'ModelScope', url: 'https://www.modelscope.cn/mcp' },
  { name: 'Higress', url: 'https://mcp.higress.ai/' },
  { name: 'MCP World', url: 'https://www.mcpworld.com' },
  { name: 'Official Registry', url: 'https://github.com/modelcontextprotocol/servers' },
];

/** Monogram link tiles for the curated MCP registries. */
export const McpMarketplaceGrid: React.FC = () => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="mcp-marketplace-grid">
    {MCP_MARKETPLACES.map((market) => (
      <a
        key={market.url}
        href={market.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-center gap-2 rounded-lg border border-[var(--theme-border-secondary)] px-2.5 py-2 text-xs text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]"
      >
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--theme-bg-tertiary)] text-[11px] font-semibold uppercase text-[var(--theme-text-secondary)]"
        >
          {market.name.charAt(0)}
        </span>
        <span className="min-w-0 flex-1 truncate">{market.name}</span>
        <ExternalLink size={12} strokeWidth={1.7} className="shrink-0 text-[var(--theme-text-tertiary)]" />
      </a>
    ))}
  </div>
);
