import { describe, expect, it } from 'vitest';
import { buildAutomationChangeSummary, buildSessionResumeSummary } from './change-summary';

describe('change summaries', () => {
  it('builds a resume summary from persisted session messages', () => {
    const summary = buildSessionResumeSummary({
      prompt: 'Fallback prompt',
      updatedAt: '2026-05-04T20:00:00.000Z',
      messages: [
        { role: 'developer', content: 'system prompt' },
        { role: 'user', content: 'Add automation history summaries.' },
        {
          role: 'assistant',
          content:
            'Implemented the feature.<artifact type="code" title="Summary" language="ts">export const ok = true;</artifact>',
        },
        { role: 'tool', content: 'npm run test passed.' },
      ],
    });

    expect(summary).toContain('Last active 2026-05-04T20:00:00.000Z');
    expect(summary).toContain('Latest user: Add automation history summaries.');
    expect(summary).toContain('Latest assistant: Implemented the feature.');
    expect(summary).toContain('Latest tool result: npm run test passed.');
    expect(summary).toContain('1 artifact captured.');
  });

  it('reports the first automation run without a previous baseline', () => {
    const summary = buildAutomationChangeSummary({
      currentRun: {
        status: 'completed',
        startedAt: '2026-05-04T20:00:00.000Z',
        finishedAt: '2026-05-04T20:01:00.000Z',
        summary: 'Tests passed.',
      },
    });

    expect(summary).toContain('First recorded run');
    expect(summary).toContain('completed at 2026-05-04T20:01:00.000Z');
  });

  it('compares current automation output with the previous run', () => {
    const summary = buildAutomationChangeSummary({
      previousRun: {
        status: 'completed',
        startedAt: '2026-05-04T19:00:00.000Z',
        finishedAt: '2026-05-04T19:01:00.000Z',
        summary: 'Tests passed with two warnings.',
      },
      currentRun: {
        status: 'failed',
        startedAt: '2026-05-04T20:00:00.000Z',
        finishedAt: '2026-05-04T20:01:00.000Z',
        summary: 'Tests failed in preview validation.',
      },
    });

    expect(summary).toContain('Status changed since last run');
    expect(summary).toContain('Previous completed');
    expect(summary).toContain('Current failed');
  });
});
