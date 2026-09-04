import { describe, expect, it, beforeEach } from 'vitest';
import {
  isSessionApproved,
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
  it('is true only for tools listed in disabledAutoApproveTools', () => {
    const s = server(['dangerous_tool']);
    expect(requiresApproval(s, 'dangerous_tool')).toBe(true);
    expect(requiresApproval(s, 'safe_tool')).toBe(false);
    expect(requiresApproval(server(undefined), 'anything')).toBe(false);
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
