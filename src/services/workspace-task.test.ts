import { describe, expect, it } from 'vitest';
import { createTaskTitleFromPrompt, createWorkspaceTask, deriveStreamingState, isTaskBusy } from './workspace-task';

describe('workspace-task helpers', () => {
  it('creates readable task titles from prompts', () => {
    expect(createTaskTitleFromPrompt('   Build a multi-agent review flow for this repo   ')).toBe(
      'Build a multi-agent review flow for this repo',
    );
    expect(createTaskTitleFromPrompt('')).toBe('New task');
  });

  it('creates task-scoped session ids from the workspace session id', () => {
    const task = createWorkspaceTask({
      id: 'task-1',
      workspaceSessionId: 'workspace-abc',
      title: 'Background task',
      parentTaskId: 'task-root',
      scopeSummary: 'Only inspect src/components',
      createdAt: '2026-04-21T12:00:00.000Z',
    });

    expect(task.sessionId).toBe('workspace-abc:task:task-1');
    expect(task.status).toBe('idle');
    expect(task.parentTaskId).toBe('task-root');
    expect(task.scopeSummary).toBe('Only inspect src/components');
  });

  it('derives global streaming state from task statuses', () => {
    const idleTask = createWorkspaceTask({
      id: 'task-1',
      workspaceSessionId: 'workspace-abc',
      title: 'Idle',
      createdAt: '2026-04-21T12:00:00.000Z',
    });
    const runningTask = {
      ...createWorkspaceTask({
        id: 'task-2',
        workspaceSessionId: 'workspace-abc',
        title: 'Running',
        createdAt: '2026-04-21T12:01:00.000Z',
      }),
      status: 'running' as const,
      requestId: 'request-2',
    };

    expect(isTaskBusy(idleTask.status)).toBe(false);
    expect(isTaskBusy(runningTask.status)).toBe(true);
    expect(deriveStreamingState([idleTask, runningTask], runningTask.id)).toEqual({
      isStreaming: true,
      activeRequestId: 'request-2',
    });
  });
});
