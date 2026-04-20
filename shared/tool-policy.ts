import type { ToolAccessMode, ToolPolicyConfig } from './contracts';

export const TOOL_ACCESS_MODES: ToolAccessMode[] = ['allow', 'ask', 'block'];

export const DEFAULT_TOOL_POLICY: ToolPolicyConfig = {
  readFile: 'allow',
  outsideWorkspaceReads: 'ask',
  writeFile: 'allow',
  outsideWorkspaceWrites: 'ask',
  executeTerminal: 'allow',
  outsideWorkspaceTerminal: 'ask',
  riskyTerminal: 'ask',
};

export const TOOL_POLICY_LABELS: Record<ToolAccessMode, string> = {
  allow: 'Allow',
  ask: 'Ask first',
  block: 'Block',
};

export const TOOL_POLICY_DESCRIPTIONS: Record<keyof ToolPolicyConfig, { label: string; description: string }> = {
  readFile: {
    label: 'Read files',
    description: 'Base permission for the read_file tool.',
  },
  outsideWorkspaceReads: {
    label: 'Read outside workspace',
    description: 'Extra guard when the agent tries to read files outside the current project folder.',
  },
  writeFile: {
    label: 'Write files',
    description: 'Base permission for the write_file tool.',
  },
  outsideWorkspaceWrites: {
    label: 'Write outside workspace',
    description: 'Extra guard when the agent tries to write files outside the current project folder.',
  },
  executeTerminal: {
    label: 'Run terminal commands',
    description: 'Base permission for execute_terminal.',
  },
  outsideWorkspaceTerminal: {
    label: 'Run terminal outside workspace',
    description: 'Extra guard when the shell working directory is outside the current project folder.',
  },
  riskyTerminal: {
    label: 'Run risky terminal commands',
    description: 'Extra guard for destructive shell commands like deletes, shutdowns, or force resets.',
  },
};

const normalizeMode = (value: unknown, fallback: ToolAccessMode): ToolAccessMode =>
  typeof value === 'string' && TOOL_ACCESS_MODES.includes(value as ToolAccessMode) ? (value as ToolAccessMode) : fallback;

export const normalizeToolPolicy = (input?: Partial<ToolPolicyConfig> | null): ToolPolicyConfig => ({
  readFile: normalizeMode(input?.readFile, DEFAULT_TOOL_POLICY.readFile),
  outsideWorkspaceReads: normalizeMode(input?.outsideWorkspaceReads, DEFAULT_TOOL_POLICY.outsideWorkspaceReads),
  writeFile: normalizeMode(input?.writeFile, DEFAULT_TOOL_POLICY.writeFile),
  outsideWorkspaceWrites: normalizeMode(input?.outsideWorkspaceWrites, DEFAULT_TOOL_POLICY.outsideWorkspaceWrites),
  executeTerminal: normalizeMode(input?.executeTerminal, DEFAULT_TOOL_POLICY.executeTerminal),
  outsideWorkspaceTerminal: normalizeMode(input?.outsideWorkspaceTerminal, DEFAULT_TOOL_POLICY.outsideWorkspaceTerminal),
  riskyTerminal: normalizeMode(input?.riskyTerminal, DEFAULT_TOOL_POLICY.riskyTerminal),
});

export const describeToolPolicyForPrompt = (policy: ToolPolicyConfig): string[] => [
  `- read_file: ${policy.readFile}`,
  `- read_file outside workspace: ${policy.outsideWorkspaceReads}`,
  `- write_file: ${policy.writeFile}`,
  `- write_file outside workspace: ${policy.outsideWorkspaceWrites}`,
  `- execute_terminal: ${policy.executeTerminal}`,
  `- execute_terminal outside workspace: ${policy.outsideWorkspaceTerminal}`,
  `- execute_terminal for risky/destructive commands: ${policy.riskyTerminal}`,
  '- If a tool is marked ask, explain the action and wait for the user to approve it before trying again.',
  '- If a tool is marked block, do not attempt it and offer a safer alternative.',
];

export const deriveAutomationToolPolicy = (policyInput?: Partial<ToolPolicyConfig> | null): ToolPolicyConfig => {
  const policy = normalizeToolPolicy(policyInput);

  return {
    readFile: policy.readFile === 'allow' ? 'allow' : 'block',
    outsideWorkspaceReads: 'block',
    writeFile: policy.writeFile === 'allow' ? 'allow' : 'block',
    outsideWorkspaceWrites: 'block',
    executeTerminal: policy.executeTerminal === 'allow' ? 'allow' : 'block',
    outsideWorkspaceTerminal: 'block',
    riskyTerminal: 'block',
  };
};

export type AutomationToolPolicySummary = {
  headline: string;
  detail: string;
  allowedCapabilities: string[];
  blockedCapabilities: string[];
};

const joinLabels = (labels: string[]): string => {
  if (labels.length === 0) {
    return '';
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
};

export const summarizeAutomationToolPolicy = (
  policyInput?: Partial<ToolPolicyConfig> | null,
): AutomationToolPolicySummary => {
  const policy = deriveAutomationToolPolicy(policyInput);
  const allowedCapabilities: string[] = [];
  const blockedCapabilities: string[] = [];

  if (policy.readFile === 'allow') {
    allowedCapabilities.push('workspace reads');
  } else {
    blockedCapabilities.push('workspace reads');
  }

  if (policy.writeFile === 'allow') {
    allowedCapabilities.push('workspace writes');
  } else {
    blockedCapabilities.push('workspace writes');
  }

  if (policy.executeTerminal === 'allow') {
    allowedCapabilities.push('workspace terminal runs');
  } else {
    blockedCapabilities.push('workspace terminal runs');
  }

  const headline =
    allowedCapabilities.length > 0
      ? `Scheduled runs can use ${joinLabels(allowedCapabilities)} without stopping for approval.`
      : 'Scheduled runs are currently limited to chat-only work until unattended tool access is allowed.';

  const limitedDetail =
    blockedCapabilities.length > 0
      ? `Currently blocked for unattended runs: ${joinLabels(blockedCapabilities)}.`
      : 'All in-workspace tool categories currently stay available to scheduled runs.';

  return {
    headline,
    detail: `${limitedDetail} Outside-workspace file access, terminal runs outside the project, and risky terminal commands are always blocked.`,
    allowedCapabilities,
    blockedCapabilities,
  };
};
