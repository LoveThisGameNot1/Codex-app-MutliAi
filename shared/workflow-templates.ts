export type WorkflowTemplateId =
  | 'code-review'
  | 'test-repair'
  | 'release-prep'
  | 'dependency-audit'
  | 'ui-generation';

export type WorkflowTemplateCategory = 'quality' | 'release' | 'maintenance' | 'frontend';

export type WorkflowTemplateRecord = {
  id: WorkflowTemplateId;
  title: string;
  summary: string;
  category: WorkflowTemplateCategory;
  slashCommands: string[];
  defaultScope: string;
  automationSummary: string;
  createPrompt: (scope: string) => string;
};

export type WorkflowCommandExpansion =
  | {
      matched: true;
      template: WorkflowTemplateRecord;
      command: string;
      args: string;
      prompt: string;
    }
  | {
      matched: false;
      command: string;
      args: string;
    };

const normalizeScope = (scope: string, fallback: string): string => {
  const trimmed = scope.trim();
  return trimmed || fallback;
};

export const WORKFLOW_TEMPLATES: WorkflowTemplateRecord[] = [
  {
    id: 'code-review',
    title: 'Code Review',
    summary: 'Review changed code for regressions, missing tests, security risks, and maintainability issues.',
    category: 'quality',
    slashCommands: ['code-review', 'review-code', 'cr'],
    defaultScope: 'the current workspace changes',
    automationSummary: 'Recurring review of changed files, risky diffs, and missing validation.',
    createPrompt: (scope) =>
      [
        `Run a rigorous code review for ${normalizeScope(scope, 'the current workspace changes')}.`,
        '',
        'Review rules:',
        '- Focus first on concrete findings ordered by severity.',
        '- Check for behavioral regressions, missing tests, unsafe filesystem or terminal behavior, packaging risk, and UX regressions.',
        '- Use git and file inspection tools as needed.',
        '- Include exact file and line references for actionable issues.',
        '- If there are no findings, say that explicitly and list residual test or coverage gaps.',
      ].join('\n'),
  },
  {
    id: 'test-repair',
    title: 'Test Repair',
    summary: 'Diagnose failing tests, implement the smallest durable fix, and rerun targeted validation.',
    category: 'quality',
    slashCommands: ['fix-tests', 'test-fix', 'tests'],
    defaultScope: 'the current failing tests',
    automationSummary: 'Scheduled test failure diagnosis and repair attempt inside the configured tool policy.',
    createPrompt: (scope) =>
      [
        `Diagnose and fix the failing tests for ${normalizeScope(scope, 'the current failing tests')}.`,
        '',
        'Workflow:',
        '- Run the relevant test command first when it is safe.',
        '- Identify the root cause before editing files.',
        '- Make the smallest durable code change.',
        '- Rerun the affected tests and the broader validation that fits the change.',
        '- Summarize changed files, verification commands, and any remaining risk.',
      ].join('\n'),
  },
  {
    id: 'release-prep',
    title: 'Release Prep',
    summary: 'Prepare release notes from git history and call out known risks, testing, and user-facing changes.',
    category: 'release',
    slashCommands: ['release-prep', 'release-notes', 'release', 'changelog'],
    defaultScope: 'the next release',
    automationSummary: 'Recurring release-note preparation from recent git changes and validation results.',
    createPrompt: (scope) =>
      [
        `Prepare release notes for ${normalizeScope(scope, 'the next release')}.`,
        '',
        'Workflow:',
        '- Inspect recent git changes and summarize user-facing changes, fixes, and internal improvements.',
        '- Separate breaking changes, migration notes, known risks, and validation status.',
        '- Keep the notes concise, factual, and ready to paste into a GitHub release or changelog.',
        '- Include follow-up actions only when they are specific and actionable.',
      ].join('\n'),
  },
  {
    id: 'dependency-audit',
    title: 'Dependency Audit',
    summary: 'Inspect dependency health, lockfile drift, outdated packages, and test/build impact.',
    category: 'maintenance',
    slashCommands: ['dependency-audit', 'deps', 'audit', 'dependency-check'],
    defaultScope: 'the current package dependencies',
    automationSummary: 'Scheduled dependency risk sweep with package, lockfile, and validation checks.',
    createPrompt: (scope) =>
      [
        `Run a dependency audit for ${normalizeScope(scope, 'the current package dependencies')}.`,
        '',
        'Workflow:',
        '- Inspect package manifests and lockfiles before changing anything.',
        '- Identify outdated, duplicated, vulnerable, or unused dependencies where local tooling can verify them.',
        '- Run safe package manager diagnostics when available, then explain any command failures.',
        '- Do not upgrade dependencies unless the user or automation prompt explicitly asks for changes.',
        '- Summarize risks, recommended upgrades, validation commands, and blockers.',
      ].join('\n'),
  },
  {
    id: 'ui-generation',
    title: 'UI Generation',
    summary: 'Design and implement polished frontend UI with typed code and artifact previews when useful.',
    category: 'frontend',
    slashCommands: ['ui', 'design', 'frontend', 'screen'],
    defaultScope: 'the requested interface',
    automationSummary: 'Repeatable UI generation or polish workflow with artifact preview expectations.',
    createPrompt: (scope) =>
      [
        `Design and implement this UI request: ${normalizeScope(scope, 'the requested interface')}.`,
        '',
        'Workflow:',
        '- Prefer a polished, intentional visual direction instead of generic defaults.',
        '- Use the existing app structure and style language unless the request clearly asks for a new direction.',
        '- Write production-ready typed code and keep accessibility, responsiveness, and empty states in scope.',
        '- When useful, produce an interactive artifact preview and explain how the UI behaves.',
        '- Verify with the most relevant build, typecheck, or component-level checks available.',
      ].join('\n'),
  },
];

const workflowById = new Map<WorkflowTemplateId, WorkflowTemplateRecord>(
  WORKFLOW_TEMPLATES.map((template) => [template.id, template]),
);

const workflowByCommand = new Map<string, WorkflowTemplateRecord>(
  WORKFLOW_TEMPLATES.flatMap((template) => template.slashCommands.map((command) => [command, template] as const)),
);

export const getWorkflowTemplate = (id: WorkflowTemplateId): WorkflowTemplateRecord => {
  const template = workflowById.get(id);
  if (!template) {
    throw new Error(`Unknown workflow template: ${id}`);
  }

  return template;
};

export const expandWorkflowTemplate = (id: WorkflowTemplateId, scope: string): string =>
  getWorkflowTemplate(id).createPrompt(scope);

const parseWorkflowCommandParts = (input: string): { command: string; args: string } | null => {
  const trimmedStart = input.trimStart();
  if (!trimmedStart.startsWith('/')) {
    return null;
  }

  const withoutSlash = trimmedStart.slice(1);
  const [rawCommand = '', ...rest] = withoutSlash.split(/\s+/);
  const command = rawCommand.trim().toLowerCase();
  if (!command) {
    return null;
  }

  return {
    command,
    args: rest.join(' ').trim(),
  };
};

export const expandWorkflowCommand = (input: string): WorkflowCommandExpansion | null => {
  const parsed = parseWorkflowCommandParts(input);
  if (!parsed) {
    return null;
  }

  const template = workflowByCommand.get(parsed.command);
  if (!template) {
    return {
      matched: false,
      command: parsed.command,
      args: parsed.args,
    };
  }

  return {
    matched: true,
    template,
    command: parsed.command,
    args: parsed.args,
    prompt: template.createPrompt(parsed.args),
  };
};

export const formatWorkflowTemplateList = (): string =>
  WORKFLOW_TEMPLATES.map(
    (template) => `- \`/${template.slashCommands[0]} Optional scope\` - ${template.summary}`,
  ).join('\n');
