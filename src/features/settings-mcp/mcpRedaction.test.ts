import { describe, expect, it } from 'vitest';
import { maskSecret, toMcpServerSummary, toVirtualMcpServerSummary } from './mcpRedaction';
import type { McpServerConfig } from '@/types';
import type { VirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';

describe('mcpRedaction', () => {
  describe('maskSecret', () => {
    it('returns null for undefined, null, or empty string', () => {
      expect(maskSecret(undefined)).toBeNull();
      expect(maskSecret('')).toBeNull();
      expect(maskSecret('   ')).toBeNull();
    });

    it('returns *** for short secrets <= 6 chars', () => {
      expect(maskSecret('12345')).toBe('***');
      expect(maskSecret('abcdef')).toBe('***');
    });

    it('masks longer secrets keeping first 3 and last 3 characters', () => {
      expect(maskSecret('ghp_secretTokenValue12345')).toBe('ghp****345');
    });
  });

  describe('toMcpServerSummary', () => {
    it('redacts sensitive bearer token and headers for HTTP server', () => {
      const server: McpServerConfig = {
        id: 'srv-http',
        name: 'Remote HTTP Service',
        transport: 'http',
        enabled: true,
        url: 'https://mcp.example.com/api',
        headers: {
          Authorization: 'Bearer secret-key-here',
          'X-Custom': 'custom-value',
        },
        auth: {
          type: 'bearer',
          token: 'super-secret-token-12345',
        },
        timeout: 60,
      };

      const summary = toMcpServerSummary(server);

      expect(summary.id).toBe('srv-http');
      expect(summary.name).toBe('Remote HTTP Service');
      expect(summary.transport).toBe('http');
      expect(summary.hasAuth).toBe(true);
      expect(summary.authType).toBe('bearer');
      expect(summary.maskedToken).toBe('sup****345');
      // Headers should only expose header names, not values!
      expect(summary.headerNames).toEqual(['Authorization', 'X-Custom']);
      expect((summary as unknown as Record<string, unknown>).headers).toBeUndefined();
    });

    it('redacts environment variables for stdio server', () => {
      const server: McpServerConfig = {
        id: 'srv-stdio',
        name: 'Local Stdio Service',
        transport: 'stdio',
        enabled: false,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
        env: {
          SECRET_API_KEY: 'sensitive-api-key',
          DEBUG: 'true',
        },
      };

      const summary = toMcpServerSummary(server);

      expect(summary.id).toBe('srv-stdio');
      expect(summary.command).toBe('npx');
      expect(summary.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/path']);
      expect(summary.envVarNames).toEqual(['SECRET_API_KEY', 'DEBUG']);
      expect((summary as unknown as Record<string, unknown>).env).toBeUndefined();
    });
  });

  describe('toVirtualMcpServerSummary', () => {
    it('creates virtual server summary with enabled state and virtual flag', () => {
      const vServer: VirtualMcpServer = {
        id: 'v-server-1',
        name: 'Virtual Server',
        description: 'Test virtual server',
        disabledAutoApproveTools: ['toolA'],
        listTools: async () => [],
        callTool: async () => ({}),
      };

      const summary = toVirtualMcpServerSummary(vServer, true);

      expect(summary).toEqual({
        id: 'v-server-1',
        name: 'Virtual Server',
        description: 'Test virtual server',
        enabled: true,
        isVirtual: true,
        disabledAutoApproveTools: ['toolA'],
      });
    });
  });
});
