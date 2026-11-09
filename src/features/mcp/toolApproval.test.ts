import { describe, expect, it, beforeEach } from 'vitest';
import {
  isSessionApproved,
  needsApprovalNow,
  rememberSessionApproval,
  resetSessionApprovals,
  requiresApproval,
  sessionApprovalKey,
} from './toolApproval';
import type { McpServerConfig } from '../../../shared/mcpServerConfig';

const server = (disabledAutoApproveTools?: string[]): McpServerConfig => ({
  id: 's1',
  name: 'S1',
  enabled: true,
  transport: 'http',
  url: 'https://x.example.com',
  disabledAutoApproveTools,
});

describe('requiresApproval', () => {
  const configured = (autoApproveTools?: string[], disabledAutoApproveTools?: string[]): McpServerConfig => ({
    ...server(disabledAutoApproveTools),
    autoApproveTools,
  });

  it('asks by default for a server that declares no allowlist', () => {
    // The old rule was the inverse: anything not deny-listed ran unattended.
    expect(requiresApproval(configured(), 'anything')).toBe(true);
    expect(requiresApproval(server(undefined), 'anything')).toBe(true);
  });

  it('skips the dialog only for allowlisted tools', () => {
    const s = configured(['safe_tool']);
    expect(requiresApproval(s, 'safe_tool')).toBe(false);
    expect(requiresApproval(s, 'other_tool')).toBe(true);
  });

  it('still gates a legacy deny-listed tool even if it is also allowlisted', () => {
    const s = configured(['dangerous_tool'], ['dangerous_tool']);
    expect(requiresApproval(s, 'dangerous_tool')).toBe(true);
  });

  it('keeps gating what an old configuration denylisted', () => {
    const s = server(['write_file']);
    expect(requiresApproval(s, 'write_file')).toBe(true);
    expect(requiresApproval(s, 'read_file')).toBe(true);
  });
});

describe('needsApprovalNow', () => {
  beforeEach(() => resetSessionApprovals());

  it('reports false once the user allowed the tool for this session', () => {
    const s = { ...server(undefined), id: 's1' } as McpServerConfig;
    expect(needsApprovalNow(s, 'w')).toBe(true);
    rememberSessionApproval(sessionApprovalKey('s1', 'w'));
    expect(needsApprovalNow(s, 'w')).toBe(false);
  });

  it('reports false for allowlisted tools', () => {
    const s = { ...server(undefined), autoApproveTools: ['r'] } as McpServerConfig;
    expect(needsApprovalNow(s, 'r')).toBe(false);
  });
});

describe('session approvals', () => {
  beforeEach(() => resetSessionApprovals());

  it('remembers per server+tool for the session', () => {
    const key = sessionApprovalKey('s1', 'dangerous_tool');
    expect(isSessionApproved(key)).toBe(false);
    rememberSessionApproval(key);
    expect(isSessionApproved(key)).toBe(true);
    expect(isSessionApproved(sessionApprovalKey('s1', 'other'))).toBe(false);
  });

  it('resetSessionApprovals forgets everything', () => {
    rememberSessionApproval(sessionApprovalKey('s1', 't'));
    resetSessionApprovals();
    expect(isSessionApproved(sessionApprovalKey('s1', 't'))).toBe(false);
  });
});
