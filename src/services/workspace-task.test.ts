import { describe, expect, it } from 'vitest';
import {
  createTaskTitleFromPrompt,
  createWorkspaceTask,
  deriveStreamingState,
  isTaskBusy,
  recoverWorkspaceGraph,
} from './workspace-task';

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
    expect(task.workingDirectory).toBeNull();
  });

  it('stores a custom working directory per task', () => {
    const task = createWorkspaceTask({
      id: 'task-2',
      workspaceSessionId: 'workspace-abc',
      title: 'Isolated task',
      workingDirectory: 'packages/desktop-app',
      createdAt: '2026-04-21T12:05:00.000Z',
    });

    expect(task.workingDirectory).toBe('packages/desktop-app');
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

  it('recovers persisted task graphs after restart', () => {
    const rootTask = {
      ...createWorkspaceTask({
        id: 'task-root',
        workspaceSessionId: 'workspace-abc',
        title: 'Main task',
        createdAt: '2026-04-21T12:00:00.000Z',
      }),
      status: 'completed' as const,
      updatedAt: '2026-04-21T12:10:00.000Z',
    };
    const blockedChildTask = {
      ...createWorkspaceTask({
        id: 'task-child',
        workspaceSessionId: 'workspace-abc',
        title: 'Subtask',
        parentTaskId: 'task-root',
        scopeSummary: 'Only inspect src/components',
        createdAt: '2026-04-21T12:11:00.000Z',
      }),
      status: 'blocked' as const,
      requestId: 'request-child',
      updatedAt: '2026-04-21T12:12:00.000Z',
    };

    const result = recoverWorkspaceGraph({
      workspaceSessionId: 'workspace-abc',
      workspaceTasks: [rootTask, blockedChildTask],
      activeTaskId: 'missing-task',
      messages: [
        {
          taskId: 'task-child',
          content: 'Inspect the sidebar implementation and report risks.',
          createdAt: '2026-04-21T12:13:00.000Z',
        },
        {
          taskId: 'task-orphan',
          content: 'Recovered task prompt',
          createdAt: '2026-04-21T12:20:00.000Z',
        },
      ],
      artifacts: [
        {
          taskId: 'task-orphan',
          createdAt: '2026-04-21T12:21:00.000Z',
          updatedAt: '2026-04-21T12:21:00.000Z',
        },
      ],
      toolExecutions: [
        {
          taskId: 'task-child',
          startedAt: '2026-04-21T12:14:00.000Z',
          finishedAt: '2026-04-21T12:15:00.000Z',
        },
      ],
    });

    expect(result.workspaceTasks).toHaveLength(3);
    expect(result.activeTaskId).toBe('task-orphan');

    const recoveredChild = result.workspaceTasks.find((task) => task.id === 'task-child');
    expect(recoveredChild).toMatchObject({
      parentTaskId: 'task-root',
      status: 'failed',
      requestId: null,
      scopeSummary: 'Only inspect src/components',
      workingDirectory: null,
      lastMessagePreview: 'Inspect the sidebar implementation and report risks.',
    });

    const recoveredOrphan = result.workspaceTasks.find((task) => task.id === 'task-orphan');
    expect(recoveredOrphan).toMatchObject({
      title: 'Recovered task prompt',
      parentTaskId: null,
      status: 'idle',
      requestId: null,
      lastMessagePreview: 'Recovered task prompt',
    });
  });

  it('drops invalid parent references during recovery', () => {
    const orphanedChild = {
      ...createWorkspaceTask({
        id: 'task-child',
        workspaceSessionId: 'workspace-abc',
        title: 'Child task',
        parentTaskId: 'missing-parent',
        workingDirectory: 'apps/review-bot',
        createdAt: '2026-04-21T12:11:00.000Z',
      }),
      status: 'running' as const,
      requestId: 'request-child',
    };

    const result = recoverWorkspaceGraph({
      workspaceSessionId: 'workspace-abc',
      workspaceTasks: [orphanedChild],
      activeTaskId: 'task-child',
      messages: [],
      artifacts: [],
      toolExecutions: [],
    });

    expect(result.workspaceTasks[0]).toMatchObject({
      id: 'task-child',
      parentTaskId: null,
      workingDirectory: 'apps/review-bot',
      status: 'failed',
      requestId: null,
    });
    expect(result.activeTaskId).toBe('task-child');
  });
});
