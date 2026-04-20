import { describe, expect, it } from 'vitest';
import { DEFAULT_TOOL_POLICY, canPersistApprovalForPolicyKey, summarizeAutomationToolPolicy } from './tool-policy';

describe('summarizeAutomationToolPolicy', () => {
  it('shows allowed in-workspace capabilities when base policy allows them', () => {
    const summary = summarizeAutomationToolPolicy(DEFAULT_TOOL_POLICY);

    expect(summary.allowedCapabilities).toEqual(['workspace reads', 'workspace writes', 'workspace terminal runs']);
    expect(summary.blockedCapabilities).toEqual([]);
    expect(summary.headline).toContain('workspace reads, workspace writes, and workspace terminal runs');
    expect(summary.detail).toContain('always blocked');
  });

  it('downgrades unattended runs to chat-only when all interactive tools are not allowed', () => {
    const summary = summarizeAutomationToolPolicy({
      readFile: 'ask',
      writeFile: 'block',
      executeTerminal: 'ask',
    });

    expect(summary.allowedCapabilities).toEqual([]);
    expect(summary.blockedCapabilities).toEqual(['workspace reads', 'workspace writes', 'workspace terminal runs']);
    expect(summary.headline).toContain('chat-only work');
    expect(summary.detail).toContain('Currently blocked for unattended runs');
  });

  it('only marks safe in-workspace policy keys as eligible for persistent approvals', () => {
    expect(canPersistApprovalForPolicyKey('readFile')).toBe(true);
    expect(canPersistApprovalForPolicyKey('writeFile')).toBe(true);
    expect(canPersistApprovalForPolicyKey('executeTerminal')).toBe(true);
    expect(canPersistApprovalForPolicyKey('outsideWorkspaceReads')).toBe(false);
    expect(canPersistApprovalForPolicyKey('outsideWorkspaceWrites')).toBe(false);
    expect(canPersistApprovalForPolicyKey('outsideWorkspaceTerminal')).toBe(false);
    expect(canPersistApprovalForPolicyKey('riskyTerminal')).toBe(false);
  });
});
