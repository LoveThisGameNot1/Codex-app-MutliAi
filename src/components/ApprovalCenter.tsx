import { chatRuntime } from '@/services/chat-runtime';
import { useAppStore } from '@/store/app-store';
import { TOOL_POLICY_DESCRIPTIONS } from '../../shared/tool-policy';

export const ApprovalCenter = () => {
  const pendingToolApprovals = useAppStore((state) => state.pendingToolApprovals);

  if (pendingToolApprovals.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-5 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-amber-100/80">Approval Center</p>
          <h3 className="mt-2 text-xl font-semibold text-amber-50">Agent actions waiting for your decision</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/80">
            These tool calls hit an `ask first` policy. Approve one execution, approve the same policy for the rest of
            the current run, or reject the action.
          </p>
        </div>
        <span className="rounded-full border border-amber-100/20 bg-black/20 px-3 py-1 text-xs text-amber-50">
          {pendingToolApprovals.length} pending
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {pendingToolApprovals.map((approval) => (
          <article key={approval.id} className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                    {approval.source === 'automation' ? 'automation' : 'chat'}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-amber-50">
                    {approval.toolName}
                  </span>
                  <span className="text-xs text-amber-100/70">
                    {new Date(approval.requestedAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-amber-50">{approval.reason}</p>
                <p className="mt-2 text-xs leading-6 text-amber-100/70">
                  Policy: {TOOL_POLICY_DESCRIPTIONS[approval.policyKey].label}
                  {approval.scopeOptions.includes('always')
                    ? ' can be safely persisted for future runs.'
                    : ' is limited to temporary approvals for safety.'}
                </p>
                <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs leading-6 text-slate-300">
                  {approval.argumentsText}
                </pre>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void chatRuntime.approveToolRequest(approval.id, 'once')}
                  className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-50 transition hover:bg-emerald-300/20"
                >
                  Approve Once
                </button>
                <button
                  type="button"
                  onClick={() => void chatRuntime.approveToolRequest(approval.id, 'request')}
                  className="rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm text-sky-50 transition hover:bg-sky-300/20"
                >
                  Approve For Run
                </button>
                {approval.scopeOptions.includes('always') ? (
                  <button
                    type="button"
                    onClick={() => void chatRuntime.approveToolRequest(approval.id, 'always')}
                    className="rounded-full border border-violet-300/30 bg-violet-300/10 px-4 py-2 text-sm text-violet-50 transition hover:bg-violet-300/20"
                  >
                    Always Allow
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void chatRuntime.rejectToolRequest(approval.id)}
                  className="rounded-full border border-rose-300/30 bg-rose-300/10 px-4 py-2 text-sm text-rose-50 transition hover:bg-rose-300/20"
                >
                  Reject
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
