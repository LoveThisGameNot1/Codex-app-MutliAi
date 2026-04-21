import type { ChatStreamEvent, ToolApprovalDecision, ToolApprovalRequestRecord, ToolApprovalScope } from '../shared/contracts';

const nowIso = (): string => new Date().toISOString();
const MAX_RECENTLY_RESOLVED_APPROVAL_IDS = 500;
export const DEFAULT_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

export type ApprovalOutcome = {
  approved: boolean;
  scope?: ToolApprovalScope;
  reason: 'approved' | 'rejected' | 'cancelled' | 'expired';
};

type EmitEvent = (event: ChatStreamEvent) => void;

type PendingApproval = {
  requestId: string;
  approval: ToolApprovalRequestRecord;
  emitEvent: EmitEvent;
  resolve: (value: ApprovalOutcome) => void;
  timer: NodeJS.Timeout;
};

type ResolveApprovalInput = {
  approvalId: string;
  decision: ToolApprovalDecision;
  scope?: ToolApprovalScope;
};

export type ResolveApprovalStatus = 'resolved' | 'replayed' | 'missing';

const createApprovalOutcome = (input: {
  approved: boolean;
  scope?: ToolApprovalScope;
  reason: ApprovalOutcome['reason'];
}): ApprovalOutcome => ({
  approved: input.approved,
  scope: input.scope,
  reason: input.reason,
});

export class ApprovalRegistry {
  private readonly pending = new Map<string, PendingApproval>();
  private readonly recentlyResolvedIds = new Set<string>();
  private readonly recentlyResolvedQueue: string[] = [];
  private readonly unsafeAutoApproveRequests = new Set<string>();

  public constructor(private readonly timeoutMs = DEFAULT_APPROVAL_TIMEOUT_MS) {}

  public register(input: {
    requestId: string;
    approval: ToolApprovalRequestRecord;
    emitEvent: EmitEvent;
  }): Promise<ApprovalOutcome> {
    const timer = setTimeout(() => {
      this.resolvePendingApproval(input.approval.id, createApprovalOutcome({ approved: false, reason: 'expired' }));
    }, this.timeoutMs);
    timer.unref?.();

    input.emitEvent({
      type: 'approval.requested',
      requestId: input.requestId,
      approval: input.approval,
    });

    return new Promise<ApprovalOutcome>((resolve) => {
      this.pending.set(input.approval.id, {
        requestId: input.requestId,
        approval: input.approval,
        emitEvent: input.emitEvent,
        resolve,
        timer,
      });
    });
  }

  public resolve(input: ResolveApprovalInput): ResolveApprovalStatus {
    const pending = this.pending.get(input.approvalId);
    if (!pending) {
      return this.recentlyResolvedIds.has(input.approvalId) ? 'replayed' : 'missing';
    }

    const outcome =
      input.decision === 'approve'
        ? createApprovalOutcome({ approved: true, scope: input.scope, reason: 'approved' })
        : createApprovalOutcome({ approved: false, reason: 'rejected' });

    this.resolvePendingApproval(input.approvalId, outcome);
    return 'resolved';
  }

  public rejectPendingForRequest(requestId: string, reason: 'cancelled' | 'expired' = 'cancelled'): number {
    const matchingApprovalIds = [...this.pending.values()]
      .filter((pending) => pending.requestId === requestId)
      .map((pending) => pending.approval.id);

    for (const approvalId of matchingApprovalIds) {
      this.resolvePendingApproval(approvalId, createApprovalOutcome({ approved: false, reason }));
    }

    return matchingApprovalIds.length;
  }

  public enableUnsafeAutoApproveForRequest(requestId: string): void {
    this.unsafeAutoApproveRequests.add(requestId);
  }

  public isUnsafeAutoApproveEnabled(requestId: string): boolean {
    return this.unsafeAutoApproveRequests.has(requestId);
  }

  public clearRequestState(requestId: string): void {
    this.unsafeAutoApproveRequests.delete(requestId);
  }

  private resolvePendingApproval(approvalId: string, outcome: ApprovalOutcome): void {
    const pending = this.pending.get(approvalId);
    if (!pending) {
      return;
    }

    this.pending.delete(approvalId);
    clearTimeout(pending.timer);
    this.trackResolvedApprovalId(approvalId);

    if (outcome.approved && outcome.scope === 'unsafe-run') {
      this.enableUnsafeAutoApproveForRequest(pending.requestId);
    }

    pending.resolve(outcome);
    pending.emitEvent({
      type: 'approval.resolved',
      requestId: pending.requestId,
      approvalId,
      decision: outcome.approved ? 'approve' : 'reject',
      scope: outcome.scope,
      finishedAt: nowIso(),
    });
  }

  private trackResolvedApprovalId(approvalId: string): void {
    this.recentlyResolvedIds.add(approvalId);
    this.recentlyResolvedQueue.push(approvalId);

    while (this.recentlyResolvedQueue.length > MAX_RECENTLY_RESOLVED_APPROVAL_IDS) {
      const oldestApprovalId = this.recentlyResolvedQueue.shift();
      if (!oldestApprovalId) {
        break;
      }
      this.recentlyResolvedIds.delete(oldestApprovalId);
    }
  }
}
