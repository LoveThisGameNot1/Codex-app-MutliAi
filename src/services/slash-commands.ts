import type { WorkspaceSection } from '@/store/app-store';
import {
  expandWorkflowTemplate,
  type WorkflowTemplateId,
} from '../../shared/workflow-templates';

export type SlashCommandCategory = 'session' | 'navigation' | 'workspace' | 'agent-workflow';
export type SlashCommandKind = 'local' | 'prompt-template';
export type SlashCommandId =
  | 'help'
  | 'new'
  | 'reset'
  | 'search'
  | 'review'
  | 'plugins'
  | 'plan'
  | 'automations'
  | 'settings'
  | 'safe-clone'
  | 'live-workspace'
  | 'code-review'
  | 'fix-tests'
  | 'dependency-audit'
  | 'release-prep'
  | 'release-notes'
  | 'ui';

export type SlashCommandDefinition = {
  id: SlashCommandId;
  aliases: string[];
  title: string;
  summary: string;
  usage: string;
  category: SlashCommandCategory;
  kind: SlashCommandKind;
  targetSection?: WorkspaceSection;
  workflowTemplateId?: WorkflowTemplateId;
};

export type SlashCommandInvocation =
  | {
      matched: true;
      command: SlashCommandDefinition;
      args: string;
      rawInput: string;
    }
  | {
      matched: false;
      token: string;
      args: string;
      rawInput: string;
      error: string;
    };

export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    id: 'help',
    aliases: ['?'],
    title: 'Show slash commands',
    summary: 'Prints the available local commands and workflow templates into the chat.',
    usage: '/help',
    category: 'session',
    kind: 'local',
  },
  {
    id: 'new',
    aliases: ['task'],
    title: 'Create task',
    summary: 'Creates a new task in the current session.',
    usage: '/new Optional task title',
    category: 'session',
    kind: 'local',
  },
  {
    id: 'reset',
    aliases: ['clear', 'new-session'],
    title: 'Reset session',
    summary: 'Starts a fresh chat session and clears the active task graph.',
    usage: '/reset',
    category: 'session',
    kind: 'local',
  },
  {
    id: 'search',
    aliases: ['find'],
    title: 'Open search',
    summary: 'Switches to workspace search.',
    usage: '/search',
    category: 'navigation',
    kind: 'local',
    targetSection: 'search',
  },
  {
    id: 'review',
    aliases: ['git', 'diff'],
    title: 'Open review center',
    summary: 'Switches to the Git review center.',
    usage: '/review',
    category: 'navigation',
    kind: 'local',
    targetSection: 'review',
  },
  {
    id: 'plugins',
    aliases: ['integrations', 'mcp'],
    title: 'Open plugins',
    summary: 'Switches to plugins, providers, and MCP connectors.',
    usage: '/plugins',
    category: 'navigation',
    kind: 'local',
    targetSection: 'plugins',
  },
  {
    id: 'plan',
    aliases: ['planner', 'breakdown'],
    title: 'Open planner',
    summary: 'Opens the planning tool or creates a structured plan from the provided goal.',
    usage: '/plan Optional goal',
    category: 'workspace',
    kind: 'local',
    targetSection: 'planner',
  },
  {
    id: 'automations',
    aliases: ['automation', 'runs'],
    title: 'Open automations',
    summary: 'Switches to scheduled work and automation runs.',
    usage: '/automations',
    category: 'navigation',
    kind: 'local',
    targetSection: 'automations',
  },
  {
    id: 'settings',
    aliases: ['config'],
    title: 'Open settings',
    summary: 'Switches to runtime settings and provider configuration.',
    usage: '/settings',
    category: 'navigation',
    kind: 'local',
    targetSection: 'settings',
  },
  {
    id: 'safe-clone',
    aliases: ['isolate', 'sandbox'],
    title: 'Use safe clone',
    summary: 'Moves the active task into an isolated safe workspace clone.',
    usage: '/safe-clone',
    category: 'workspace',
    kind: 'local',
  },
  {
    id: 'live-workspace',
    aliases: ['live', 'workspace'],
    title: 'Use live workspace',
    summary: 'Discards the active task safe clone and returns to the live workspace.',
    usage: '/live-workspace',
    category: 'workspace',
    kind: 'local',
  },
  {
    id: 'code-review',
    aliases: ['review-code', 'cr'],
    title: 'Run code review',
    summary: 'Expands into a rigorous review prompt focused on regressions, risks, and tests.',
    usage: '/code-review Optional scope',
    category: 'agent-workflow',
    kind: 'prompt-template',
    workflowTemplateId: 'code-review',
  },
  {
    id: 'fix-tests',
    aliases: ['test-fix', 'tests'],
    title: 'Fix tests',
    summary: 'Expands into a test diagnosis and repair workflow.',
    usage: '/fix-tests Optional test command or failure summary',
    category: 'agent-workflow',
    kind: 'prompt-template',
    workflowTemplateId: 'test-repair',
  },
  {
    id: 'dependency-audit',
    aliases: ['deps', 'audit', 'dependency-check'],
    title: 'Run dependency audit',
    summary: 'Expands into a dependency health, lockfile, package audit, and validation workflow.',
    usage: '/dependency-audit Optional package manager or scope',
    category: 'agent-workflow',
    kind: 'prompt-template',
    workflowTemplateId: 'dependency-audit',
  },
  {
    id: 'release-prep',
    aliases: ['release'],
    title: 'Prepare release',
    summary: 'Expands into a release preparation workflow with notes, risks, and validation status.',
    usage: '/release-prep Optional version or scope',
    category: 'agent-workflow',
    kind: 'prompt-template',
    workflowTemplateId: 'release-prep',
  },
  {
    id: 'release-notes',
    aliases: ['changelog'],
    title: 'Draft release notes',
    summary: 'Expands into a Git-aware release-note preparation workflow.',
    usage: '/release-notes Optional version or scope',
    category: 'agent-workflow',
    kind: 'prompt-template',
    workflowTemplateId: 'release-prep',
  },
  {
    id: 'ui',
    aliases: ['design', 'frontend'],
    title: 'Build UI',
    summary: 'Expands into a frontend implementation prompt with artifact expectations.',
    usage: '/ui Describe the interface or screen',
    category: 'agent-workflow',
    kind: 'prompt-template',
    workflowTemplateId: 'ui-generation',
  },
];

const commandByToken = new Map<string, SlashCommandDefinition>(
  SLASH_COMMANDS.flatMap((command) => [
    [command.id, command],
    ...command.aliases.map((alias) => [alias, command] as const),
  ]),
);

const normalizeToken = (token: string): string => token.trim().replace(/^\/+/, '').toLowerCase();

export const parseSlashCommand = (input: string): SlashCommandInvocation | null => {
  const trimmedStart = input.trimStart();
  if (!trimmedStart.startsWith('/')) {
    return null;
  }

  const withoutSlash = trimmedStart.slice(1);
  const [rawToken = '', ...rest] = withoutSlash.split(/\s+/);
  const token = normalizeToken(rawToken);
  const args = rest.join(' ').trim();

  if (!token) {
    return null;
  }

  const command = commandByToken.get(token);
  if (!command) {
    return {
      matched: false,
      token,
      args,
      rawInput: input,
      error: `Unknown slash command "/${token}". Type /help to see available commands.`,
    };
  }

  return {
    matched: true,
    command,
    args,
    rawInput: input,
  };
};

export const getSlashCommandSuggestions = (input: string, limit = 8): SlashCommandDefinition[] => {
  const trimmedStart = input.trimStart();
  if (!trimmedStart.startsWith('/')) {
    return [];
  }

  const query = normalizeToken(trimmedStart.slice(1).split(/\s+/)[0] ?? '');
  if (trimmedStart.slice(1).includes(' ') && commandByToken.has(query)) {
    return [];
  }

  const matches = SLASH_COMMANDS.filter((command) => {
    if (!query) {
      return true;
    }

    return (
      command.id.includes(query) ||
      command.title.toLowerCase().includes(query) ||
      command.aliases.some((alias) => alias.includes(query))
    );
  });

  return matches
    .sort((left, right) => {
      const leftExact = left.id === query || left.aliases.includes(query);
      const rightExact = right.id === query || right.aliases.includes(query);
      if (leftExact !== rightExact) {
        return leftExact ? -1 : 1;
      }

      return left.id.localeCompare(right.id);
    })
    .slice(0, limit);
};

export const createSlashCommandPrompt = (command: SlashCommandDefinition, args: string): string => {
  return command.workflowTemplateId ? expandWorkflowTemplate(command.workflowTemplateId, args) : args.trim();
};

export const formatSlashCommandHelp = (): string => {
  const groups: Array<{ category: SlashCommandCategory; title: string }> = [
    { category: 'session', title: 'Session' },
    { category: 'navigation', title: 'Navigation' },
    { category: 'workspace', title: 'Workspace' },
    { category: 'agent-workflow', title: 'Agent workflows' },
  ];

  return [
    'Available slash commands:',
    '',
    ...groups.flatMap((group) => {
      const commands = SLASH_COMMANDS.filter((command) => command.category === group.category);
      return [
        `**${group.title}**`,
        ...commands.map((command) => `- \`${command.usage}\` - ${command.summary}`),
        '',
      ];
    }),
  ].join('\n').trim();
};
