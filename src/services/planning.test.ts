import { describe, expect, it } from 'vitest';
import {
  assessPlanRisk,
  createPlanFromGoal,
  formatPlanForAgent,
  summarizePlanProgress,
  updatePlanStepStatus,
} from './planning';

describe('planning service', () => {
  it('creates a deterministic structured plan from a goal', () => {
    const plan = createPlanFromGoal({
      id: 'plan-1',
      goal: 'Build a polished frontend UI and add tests',
      createdAt: '2026-04-26T19:40:00.000Z',
    });

    expect(plan).toMatchObject({
      id: 'plan-1',
      title: 'Build a polished frontend UI and add tests',
      status: 'draft',
      risk: 'medium',
    });
    expect(plan.steps.map((step) => step.title)).toContain('Define the interaction and visual direction');
    expect(plan.steps.map((step) => step.title)).toContain('Reproduce and isolate the failure');
    expect(plan.steps[0]?.id).toBe('plan-1:step:1');
  });

  it('assesses high risk plans from sensitive keywords', () => {
    expect(assessPlanRisk('Change auth token storage and billing behavior')).toBe('high');
    expect(assessPlanRisk('Improve local UI copy')).toBe('low');
  });

  it('updates progress and plan status when steps change', () => {
    const plan = createPlanFromGoal({
      id: 'plan-2',
      goal: 'Ship docs',
      createdAt: '2026-04-26T19:40:00.000Z',
    });
    const updated = updatePlanStepStatus(plan, plan.steps[0]!.id, 'completed', '2026-04-26T19:45:00.000Z');
    const progress = summarizePlanProgress(updated);

    expect(updated.status).toBe('active');
    expect(updated.updatedAt).toBe('2026-04-26T19:45:00.000Z');
    expect(progress.completed).toBe(1);
    expect(progress.percent).toBeGreaterThan(0);
  });

  it('formats a plan into an agent-ready prompt', () => {
    const plan = createPlanFromGoal({
      id: 'plan-3',
      goal: 'Prepare release notes',
      createdAt: '2026-04-26T19:40:00.000Z',
    });

    expect(formatPlanForAgent(plan)).toContain('Use this execution plan for: Prepare release notes');
    expect(formatPlanForAgent(plan)).toContain('1. [pending] Confirm the outcome and constraints');
  });
});
