export type PlanStatus = 'draft' | 'active' | 'completed' | 'archived';
export type PlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
export type PlanRisk = 'low' | 'medium' | 'high';

export type PlanStepRecord = {
  id: string;
  title: string;
  description: string;
  status: PlanStepStatus;
  acceptanceCriteria: string[];
  updatedAt: string;
};

export type PlanRecord = {
  id: string;
  title: string;
  goal: string;
  status: PlanStatus;
  risk: PlanRisk;
  createdAt: string;
  updatedAt: string;
  steps: PlanStepRecord[];
};

export type PlanProgress = {
  total: number;
  completed: number;
  blocked: number;
  active: number;
  percent: number;
  summary: string;
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const includesAny = (value: string, keywords: string[]): boolean =>
  keywords.some((keyword) => value.includes(keyword));

export const createPlanTitle = (goal: string): string => {
  const normalized = normalizeWhitespace(goal);
  if (!normalized) {
    return 'Untitled plan';
  }

  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
};

export const assessPlanRisk = (goal: string): PlanRisk => {
  const normalized = goal.toLowerCase();
  if (
    includesAny(normalized, [
      'security',
      'auth',
      'payment',
      'billing',
      'database',
      'migration',
      'delete',
      'production',
      'release',
      'execute',
      'terminal',
      'filesystem',
    ])
  ) {
    return 'high';
  }

  if (includesAny(normalized, ['refactor', 'test', 'automation', 'plugin', 'provider', 'api', 'performance'])) {
    return 'medium';
  }

  return 'low';
};

const createStep = (
  planId: string,
  index: number,
  title: string,
  description: string,
  acceptanceCriteria: string[],
  timestamp: string,
): PlanStepRecord => ({
  id: `${planId}:step:${index}`,
  title,
  description,
  status: 'pending',
  acceptanceCriteria,
  updatedAt: timestamp,
});

const createTailoredSteps = (goal: string): Array<Omit<PlanStepRecord, 'id' | 'status' | 'updatedAt'>> => {
  const normalized = goal.toLowerCase();
  const steps: Array<Omit<PlanStepRecord, 'id' | 'status' | 'updatedAt'>> = [];

  if (includesAny(normalized, ['ui', 'frontend', 'screen', 'layout', 'design', 'component'])) {
    steps.push({
      title: 'Define the interaction and visual direction',
      description: 'Map the user flow, component boundaries, responsive behavior, and visual constraints before editing UI code.',
      acceptanceCriteria: [
        'The target screen or component is identified.',
        'Responsive and empty-state behavior is explicit.',
        'The implementation follows the existing design language unless a new direction is required.',
      ],
    });
  }

  if (includesAny(normalized, ['test', 'bug', 'failure', 'fix', 'regression'])) {
    steps.push({
      title: 'Reproduce and isolate the failure',
      description: 'Run the smallest relevant verification first, capture the failure mode, and identify the root cause.',
      acceptanceCriteria: [
        'The failing command or scenario is known.',
        'The root cause is tied to a concrete file or behavior.',
        'The planned fix does not rely on broad rewrites.',
      ],
    });
  }

  if (includesAny(normalized, ['security', 'permission', 'sandbox', 'secret', 'auth', 'token'])) {
    steps.push({
      title: 'Review security and permission boundaries',
      description: 'Identify sensitive inputs, filesystem or network access, privilege boundaries, and failure handling.',
      acceptanceCriteria: [
        'Sensitive data is not exposed in logs or persisted unsafely.',
        'Risky actions have an approval or guardrail path.',
        'Failure modes are visible to the user.',
      ],
    });
  }

  if (includesAny(normalized, ['docs', 'readme', 'documentation', 'release', 'changelog'])) {
    steps.push({
      title: 'Update user-facing documentation',
      description: 'Capture setup, usage, behavioral changes, and known limitations in the relevant docs.',
      acceptanceCriteria: [
        'The documentation matches the shipped behavior.',
        'Usage instructions are actionable.',
        'Known limitations or follow-ups are stated plainly.',
      ],
    });
  }

  return steps;
};

export const createPlanFromGoal = (input: {
  id: string;
  goal: string;
  createdAt?: string;
}): PlanRecord => {
  const goal = normalizeWhitespace(input.goal);
  const timestamp = input.createdAt ?? new Date().toISOString();
  const tailoredSteps = createTailoredSteps(goal);
  const stepBlueprints = [
    {
      title: 'Confirm the outcome and constraints',
      description: 'Restate the goal, identify success criteria, and surface assumptions before implementation starts.',
      acceptanceCriteria: [
        'The desired outcome is specific.',
        'Major constraints or risks are visible.',
        'The next implementation slice is small enough to verify.',
      ],
    },
    {
      title: 'Inspect the current workspace context',
      description: 'Read the relevant files, tests, docs, and runtime paths before changing behavior.',
      acceptanceCriteria: [
        'Affected files and entry points are known.',
        'Existing conventions are identified.',
        'Unrelated local changes are preserved.',
      ],
    },
    ...tailoredSteps,
    {
      title: 'Ship the smallest complete vertical slice',
      description: 'Implement the change end-to-end with typed code, UI wiring, docs, and data flow as needed.',
      acceptanceCriteria: [
        'The feature works through the real app path.',
        'No placeholder logic remains.',
        'The implementation is scoped to the stated goal.',
      ],
    },
    {
      title: 'Verify and package the result',
      description: 'Run targeted tests first, then the broader build or packaging checks that match the change.',
      acceptanceCriteria: [
        'Relevant tests pass.',
        'The production build passes.',
        'Any non-blocking warnings are documented.',
      ],
    },
    {
      title: 'Report outcomes and follow-ups',
      description: 'Summarize what changed, what was verified, and what should be handled next.',
      acceptanceCriteria: [
        'Patch notes are factual.',
        'Known risks or blockers are explicit.',
        'The next backlog item is clear.',
      ],
    },
  ];

  return {
    id: input.id,
    title: createPlanTitle(goal),
    goal,
    status: 'draft',
    risk: assessPlanRisk(goal),
    createdAt: timestamp,
    updatedAt: timestamp,
    steps: stepBlueprints.map((step, index) =>
      createStep(input.id, index + 1, step.title, step.description, step.acceptanceCriteria, timestamp),
    ),
  };
};

export const summarizePlanProgress = (plan: PlanRecord): PlanProgress => {
  const total = plan.steps.length;
  const completed = plan.steps.filter((step) => step.status === 'completed').length;
  const blocked = plan.steps.filter((step) => step.status === 'blocked').length;
  const active = plan.steps.filter((step) => step.status === 'in_progress').length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return {
    total,
    completed,
    blocked,
    active,
    percent,
    summary: `${completed}/${total} complete, ${blocked} blocked`,
  };
};

export const derivePlanStatus = (steps: PlanStepRecord[], fallback: PlanStatus = 'draft'): PlanStatus => {
  if (fallback === 'archived') {
    return 'archived';
  }
  if (steps.length === 0) {
    return 'draft';
  }
  if (steps.every((step) => step.status === 'completed')) {
    return 'completed';
  }
  if (steps.some((step) => step.status === 'in_progress' || step.status === 'completed' || step.status === 'blocked')) {
    return 'active';
  }

  return 'draft';
};

export const updatePlanStepStatus = (
  plan: PlanRecord,
  stepId: string,
  status: PlanStepStatus,
  updatedAt = new Date().toISOString(),
): PlanRecord => {
  const steps = plan.steps.map((step) =>
    step.id === stepId
      ? {
          ...step,
          status,
          updatedAt,
        }
      : step,
  );

  return {
    ...plan,
    steps,
    status: derivePlanStatus(steps, plan.status),
    updatedAt,
  };
};

export const formatPlanForAgent = (plan: PlanRecord): string => {
  const progress = summarizePlanProgress(plan);
  return [
    `Use this execution plan for: ${plan.goal}`,
    '',
    `Plan status: ${plan.status}`,
    `Risk: ${plan.risk}`,
    `Progress: ${progress.summary}`,
    '',
    ...plan.steps.flatMap((step, index) => [
      `${index + 1}. [${step.status}] ${step.title}`,
      `   ${step.description}`,
      ...step.acceptanceCriteria.map((criterion) => `   - ${criterion}`),
    ]),
    '',
    'Start with the first pending or in-progress step. Keep the plan updated in your response when the work changes.',
  ].join('\n');
};
