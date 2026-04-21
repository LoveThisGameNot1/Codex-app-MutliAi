import { describe, expect, it, vi } from 'vitest';
import type { ChatStreamEvent, ToolApprovalRequestRecord } from '../shared/contracts';
import { ApprovalRegistry } from './approval-registry';

const createApproval = (overrides?: Partial<ToolApprovalRequestRecord>): ToolApprovalRequestRecord => ({
  id: 'approval-1',
  requestId: 'request-1',
  source: 'chat',
  toolName: 'write_file',
  policyKey: 'writeFile',
  argumentsText: '{\n  "path": "notes.txt"\n}',
  reason: 'write_file requires approval.',
  requestedAt: '2026-04-21T12:00:00.000Z',
  scopeOptions: ['once', 'request', 'always', 'unsafe-run'],
  ...overrides,
});

describe('ApprovalRegistry', () => {
  it('ignores replayed resolution attempts after an approval is already resolved', async () => {
    const registry = new ApprovalRegistry(5_000);
    const emitEvent = vi.fn<(event: ChatStreamEvent) => void>();
    const promise = registry.register({
      requestId: 'request-1',
      approval: createApproval(),
      emitEvent,
    });

    expect(registry.resolve({ approvalId: 'approval-1', decision: 'approve', scope: 'request' })).toBe('resolved');
    await expect(promise).resolves.toMatchObject({
      approved: true,
      scope: 'request',
      reason: 'approved',
    });
    expect(registry.resolve({ approvalId: 'approval-1', decision: 'approve', scope: 'request' })).toBe('replayed');
    expect(emitEvent).toHaveBeenCalledTimes(2);
  });

  it('rejects pending approvals when a request is cancelled', async () => {
    const registry = new ApprovalRegistry(5_000);
    const emitEvent = vi.fn<(event: ChatStreamEvent) => void>();
    const promise = registry.register({
      requestId: 'request-1',
      approval: createApproval(),
      emitEvent,
    });

    expect(registry.rejectPendingForRequest('request-1', 'cancelled')).toBe(1);
    await expect(promise).resolves.toMatchObject({
      approved: false,
      reason: 'cancelled',
    });
    expect(emitEvent).toHaveBeenCalledTimes(2);
  });

  it('expires approvals that sit unresolved past the timeout', async () => {
    const registry = new ApprovalRegistry(10);
    const emitEvent = vi.fn<(event: ChatStreamEvent) => void>();
    const promise = registry.register({
      requestId: 'request-1',
      approval: createApproval(),
      emitEvent,
    });

    await expect(promise).resolves.toMatchObject({
      approved: false,
      reason: 'expired',
    });
    expect(emitEvent).toHaveBeenCalledTimes(2);
  });

  it('enables unsafe auto-approve for the rest of a request when requested', async () => {
    const registry = new ApprovalRegistry(5_000);
    const emitEvent = vi.fn<(event: ChatStreamEvent) => void>();
    const promise = registry.register({
      requestId: 'request-1',
      approval: createApproval(),
      emitEvent,
    });

    expect(registry.isUnsafeAutoApproveEnabled('request-1')).toBe(false);
    registry.resolve({ approvalId: 'approval-1', decision: 'approve', scope: 'unsafe-run' });
    await expect(promise).resolves.toMatchObject({
      approved: true,
      scope: 'unsafe-run',
      reason: 'approved',
    });
    expect(registry.isUnsafeAutoApproveEnabled('request-1')).toBe(true);

    registry.clearRequestState('request-1');
    expect(registry.isUnsafeAutoApproveEnabled('request-1')).toBe(false);
  });
});
