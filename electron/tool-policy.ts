import path from 'node:path';
import type { ToolAccessMode, ToolPolicyConfig } from '../shared/contracts';
import { normalizeToolPolicy } from '../shared/tool-policy';

type ToolPolicyViolation = {
  mode: Exclude<ToolAccessMode, 'allow'>;
  message: string;
};

const normalizeForComparison = (value: string): string => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();

const isWithinWorkspace = (targetPath: string, workspaceRoot: string): boolean => {
  const normalizedTarget = normalizeForComparison(targetPath);
  const normalizedWorkspace = normalizeForComparison(workspaceRoot);
  return normalizedTarget === normalizedWorkspace || normalizedTarget.startsWith(`${normalizedWorkspace}${path.sep}`);
};

const buildViolation = (mode: Exclude<ToolAccessMode, 'allow'>, reason: string): ToolPolicyViolation => ({
  mode,
  message:
    mode === 'ask'
      ? `Approval required by tool policy: ${reason} Ask the user for confirmation before retrying this tool.`
      : `Blocked by tool policy: ${reason}`,
});

const RISKY_TERMINAL_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bdel\s+\/[qsf]/i,
  /\brd\s+\/s\b/i,
  /\bremove-item\b.*\brecurse\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bformat\b/i,
  /\bdiskpart\b/i,
  /\bmkfs\b/i,
  /\breg\s+delete\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\b.*\b-f\b/i,
  /\btaskkill\b.*\s\/f\b/i,
];

export const isRiskyTerminalCommand = (command: string): boolean =>
  RISKY_TERMINAL_PATTERNS.some((pattern) => pattern.test(command));

export const getReadPolicyViolation = (
  policyInput: ToolPolicyConfig,
  targetPath: string,
  workspaceRoot: string,
): ToolPolicyViolation | null => {
  const policy = normalizeToolPolicy(policyInput);
  if (policy.readFile !== 'allow') {
    return buildViolation(policy.readFile, 'read_file is not fully allowed in the current tool policy.');
  }

  if (!isWithinWorkspace(targetPath, workspaceRoot) && policy.outsideWorkspaceReads !== 'allow') {
    return buildViolation(
      policy.outsideWorkspaceReads,
      `reading outside the workspace is restricted (${targetPath}).`,
    );
  }

  return null;
};

export const getWritePolicyViolation = (
  policyInput: ToolPolicyConfig,
  targetPath: string,
  workspaceRoot: string,
): ToolPolicyViolation | null => {
  const policy = normalizeToolPolicy(policyInput);
  if (policy.writeFile !== 'allow') {
    return buildViolation(policy.writeFile, 'write_file is not fully allowed in the current tool policy.');
  }

  if (!isWithinWorkspace(targetPath, workspaceRoot) && policy.outsideWorkspaceWrites !== 'allow') {
    return buildViolation(
      policy.outsideWorkspaceWrites,
      `writing outside the workspace is restricted (${targetPath}).`,
    );
  }

  return null;
};

export const getTerminalPolicyViolation = (
  policyInput: ToolPolicyConfig,
  command: string,
  cwd: string,
  workspaceRoot: string,
): ToolPolicyViolation | null => {
  const policy = normalizeToolPolicy(policyInput);
  if (policy.executeTerminal !== 'allow') {
    return buildViolation(policy.executeTerminal, 'execute_terminal is not fully allowed in the current tool policy.');
  }

  if (!isWithinWorkspace(cwd, workspaceRoot) && policy.outsideWorkspaceTerminal !== 'allow') {
    return buildViolation(
      policy.outsideWorkspaceTerminal,
      `running terminal commands outside the workspace is restricted (${cwd}).`,
    );
  }

  if (isRiskyTerminalCommand(command) && policy.riskyTerminal !== 'allow') {
    return buildViolation(policy.riskyTerminal, `the command looks destructive or high-risk (${command}).`);
  }

  return null;
};
