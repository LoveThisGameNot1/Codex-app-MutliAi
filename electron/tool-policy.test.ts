import { describe, expect, it } from 'vitest';
import { DEFAULT_TOOL_POLICY, normalizeToolPolicy } from '../shared/tool-policy';
import { getReadPolicyViolation, getTerminalPolicyViolation, getWritePolicyViolation, isRiskyTerminalCommand } from './tool-policy';

describe('tool-policy', () => {
  it('normalizes partial policies against the defaults', () => {
    const policy = normalizeToolPolicy({
      writeFile: 'block',
    });

    expect(policy.readFile).toBe(DEFAULT_TOOL_POLICY.readFile);
    expect(policy.writeFile).toBe('block');
    expect(policy.riskyTerminal).toBe(DEFAULT_TOOL_POLICY.riskyTerminal);
  });

  it('requires approval for reads outside the workspace by default', () => {
    const violation = getReadPolicyViolation(DEFAULT_TOOL_POLICY, 'C:\\secret\\notes.txt', 'C:\\workspace');

    expect(violation?.mode).toBe('ask');
    expect(violation?.message).toContain('Approval required');
  });

  it('blocks writes outside the workspace when configured to block', () => {
    const violation = getWritePolicyViolation(
      {
        ...DEFAULT_TOOL_POLICY,
        outsideWorkspaceWrites: 'block',
      },
      'C:\\outside\\notes.txt',
      'C:\\workspace',
    );

    expect(violation?.mode).toBe('block');
    expect(violation?.message).toContain('Blocked by tool policy');
  });

  it('detects risky terminal commands and asks for approval by default', () => {
    expect(isRiskyTerminalCommand('git reset --hard HEAD')).toBe(true);

    const violation = getTerminalPolicyViolation(DEFAULT_TOOL_POLICY, 'git reset --hard HEAD', 'C:\\workspace', 'C:\\workspace');
    expect(violation?.mode).toBe('ask');
  });

  it('allows safe terminal commands when the base terminal policy is allow', () => {
    const violation = getTerminalPolicyViolation(DEFAULT_TOOL_POLICY, 'npm run test', 'C:\\workspace', 'C:\\workspace');
    expect(violation).toBeNull();
  });

  it('requires approval for terminal runs outside the workspace by default', () => {
    const violation = getTerminalPolicyViolation(DEFAULT_TOOL_POLICY, 'npm run test', 'C:\\outside', 'C:\\workspace');

    expect(violation?.mode).toBe('ask');
    expect(violation?.message).toContain('outside the workspace');
  });
});
