import { describe, expect, it } from 'vitest';
import { applyMcpServerUpdate, generateUniqueServerId, slugifyName, validateAndBuildNewServer } from './mcpPatch';
import type { McpServerConfig } from '@/types';

describe('mcpPatch', () => {
  describe('slugifyName', () => {
    it('normalizes names into clean identifiers', () => {
      expect(slugifyName('My MCP Server 123')).toBe('my_mcp_server_123');
      expect(slugifyName('---Test Server---')).toBe('test_server');
      expect(slugifyName('***')).toBe('server');
    });
  });

  describe('generateUniqueServerId', () => {
    it('generates a clean unique ID avoiding collisions', () => {
      const existing = ['mcp_github', 'mcp_github_2'];
      expect(generateUniqueServerId('GitHub', existing)).toBe('mcp_github_3');
      expect(generateUniqueServerId('Slack', existing)).toBe('mcp_slack');
    });
  });

  describe('validateAndBuildNewServer', () => {
    it('validates and builds a valid HTTP server with bearer token', () => {
      const { server, error } = validateAndBuildNewServer(
        {
          name: 'Remote Tool',
          transport: 'http',
          url: 'https://api.example.com/mcp',
          bearerToken: 'token-12345',
          headers: { 'X-Custom': 'val' },
          timeout: 30,
        },
        [],
      );

      expect(error).toBeUndefined();
      expect(server).toBeDefined();
      expect(server?.name).toBe('Remote Tool');
      expect(server?.transport).toBe('http');
      expect(server?.url).toBe('https://api.example.com/mcp');
      expect(server?.auth).toEqual({ type: 'bearer', token: 'token-12345' });
      expect(server?.headers).toEqual({ 'X-Custom': 'val' });
      expect(server?.timeout).toBe(30);
      expect(server?.enabled).toBe(true);
      expect(server?.isTrusted).toBe(true);
    });

    it('validates and builds a valid stdio server', () => {
      const { server, error } = validateAndBuildNewServer(
        {
          name: 'Filesystem MCP',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
          env: { BASE_DIR: '/tmp' },
        },
        [],
      );

      expect(error).toBeUndefined();
      expect(server?.transport).toBe('stdio');
      expect(server?.command).toBe('npx');
      expect(server?.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem']);
      expect(server?.env).toEqual({ BASE_DIR: '/tmp' });
    });

    it('returns error when required fields are missing', () => {
      expect(validateAndBuildNewServer({}, []).error).toContain('name is required');
      expect(validateAndBuildNewServer({ name: 'Test' }, []).error).toContain('Transport must be one of');
      expect(validateAndBuildNewServer({ name: 'Test', transport: 'http' }, []).error).toContain('URL is required');
      expect(validateAndBuildNewServer({ name: 'Test', transport: 'http', url: 'invalid-url' }, []).error).toContain(
        'Invalid HTTP/HTTPS URL',
      );
      expect(validateAndBuildNewServer({ name: 'Test', transport: 'stdio' }, []).error).toContain(
        'Command is required',
      );
    });

    it('returns error when ID conflicts', () => {
      const existing: McpServerConfig[] = [{ id: 'mcp_existing', name: 'Existing', transport: 'stdio', enabled: true }];
      const result = validateAndBuildNewServer(
        { id: 'mcp_existing', name: 'Dup', transport: 'stdio', command: 'node' },
        existing,
      );
      expect(result.error).toContain('already exists');
    });
  });

  describe('applyMcpServerUpdate', () => {
    const original: McpServerConfig = {
      id: 'srv-1',
      name: 'Original Name',
      transport: 'http',
      url: 'https://original.com/mcp',
      enabled: true,
      auth: { type: 'bearer', token: 'old-token' },
    };

    it('updates specified fields while keeping unmodified fields', () => {
      const { updatedServer, error } = applyMcpServerUpdate(original, {
        name: 'New Name',
        url: 'https://updated.com/mcp',
        bearerToken: 'new-token',
        enabled: false,
      });

      expect(error).toBeUndefined();
      expect(updatedServer?.name).toBe('New Name');
      expect(updatedServer?.url).toBe('https://updated.com/mcp');
      expect(updatedServer?.auth).toEqual({ type: 'bearer', token: 'new-token' });
      expect(updatedServer?.enabled).toBe(false);
      expect(updatedServer?.id).toBe('srv-1');
    });

    it('rejects invalid URL on update', () => {
      const { error } = applyMcpServerUpdate(original, {
        url: 'not-a-valid-url',
      });
      expect(error).toContain('Invalid HTTP/HTTPS URL');
    });
  });
});
