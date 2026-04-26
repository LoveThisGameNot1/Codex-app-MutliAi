import { useMemo } from 'react';
import type { PlanRecord, PlanStepStatus } from '@/services/planning';
import { formatPlanForAgent, summarizePlanProgress } from '@/services/planning';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/utils/cn';

const statusLabels: Record<PlanStepStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Done',
  blocked: 'Blocked',
};

const statusTone = (status: string): string => {
  switch (status) {
    case 'completed':
      return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
    case 'in_progress':
    case 'active':
      return 'border-sky-300/30 bg-sky-300/10 text-sky-100';
    case 'blocked':
      return 'border-rose-300/30 bg-rose-300/10 text-rose-100';
    case 'high':
      return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
    case 'medium':
      return 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100';
    default:
      return 'border-slate-300/20 bg-slate-300/10 text-slate-200';
  }
};

const sectionStyle = 'rounded-[26px] border border-white/10 bg-slate-950/60 p-4';

const PlanListItem = ({
  plan,
  active,
  onSelect,
}: {
  plan: PlanRecord;
  active: boolean;
  onSelect: () => void;
}) => {
  const progress = summarizePlanProgress(plan);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition',
        active ? 'border-sky-300/30 bg-sky-300/10' : 'border-white/10 bg-black/20 hover:bg-white/5',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{plan.title}</p>
          <p className="mt-1 text-xs text-slate-500">{new Date(plan.updatedAt).toLocaleString()}</p>
        </div>
        <span className={cn('rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]', statusTone(plan.status))}>
          {plan.status}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-900">
        <div className="h-full rounded-full bg-sky-300" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-400">{progress.summary}</p>
    </button>
  );
};

export const PlannerPanel = () => {
  const plans = useAppStore((state) => state.plans);
  const activePlanId = useAppStore((state) => state.activePlanId);
  const planGoalDraft = useAppStore((state) => state.planGoalDraft);
  const setPlanGoalDraft = useAppStore((state) => state.setPlanGoalDraft);
  const createPlan = useAppStore((state) => state.createPlan);
  const setActivePlanId = useAppStore((state) => state.setActivePlanId);
  const updatePlanStepStatus = useAppStore((state) => state.updatePlanStepStatus);
  const deletePlan = useAppStore((state) => state.deletePlan);
  const setComposerValue = useAppStore((state) => state.setComposerValue);
  const setWorkspaceSection = useAppStore((state) => state.setWorkspaceSection);

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? null,
    [activePlanId, plans],
  );
  const activeProgress = activePlan ? summarizePlanProgress(activePlan) : null;

  const createPlanFromDraft = () => {
    createPlan(planGoalDraft);
  };

  const queuePlanForAgent = () => {
    if (!activePlan) {
      return;
    }

    setComposerValue(formatPlanForAgent(activePlan));
    setWorkspaceSection('chat');
  };

  return (
    <section className="flex min-h-[680px] flex-col rounded-[30px] border border-white/10 bg-slate-900/80 p-5 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-sky-200/80">Planner</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Break large goals into executable steps</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Create local plans before starting agent work, track step status, and queue the structured plan into chat when ready.
          </p>
        </div>
        {activeProgress ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            <span className="text-sky-100">{activeProgress.percent}%</span> complete, {activeProgress.blocked} blocked
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(280px,0.38fr)_minmax(440px,0.62fr)]">
        <div className={sectionStyle}>
          <p className="text-sm font-semibold text-white">New plan</p>
          <textarea
            value={planGoalDraft}
            onChange={(event) => setPlanGoalDraft(event.target.value)}
            rows={5}
            placeholder="Describe a larger goal, for example: Add provider health diagnostics with tests and UI."
            className="mt-3 min-h-[118px] w-full resize-none rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400/40"
          />
          <button
            type="button"
            onClick={createPlanFromDraft}
            disabled={!planGoalDraft.trim()}
            className="mt-3 w-full rounded-full border border-sky-400/30 bg-sky-400/15 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create structured plan
          </button>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-slate-500">
              <span>Saved plans</span>
              <span>{plans.length}</span>
            </div>
            <div className="mt-3 space-y-3">
              {plans.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-500">
                  No plans yet. Create one from a goal to start tracking structured work.
                </div>
              ) : (
                plans.map((plan) => (
                  <PlanListItem
                    key={plan.id}
                    plan={plan}
                    active={plan.id === activePlan?.id}
                    onSelect={() => setActivePlanId(plan.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <div className={sectionStyle}>
          {!activePlan ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/10 p-8 text-center">
              <div className="max-w-md">
                <p className="text-sm uppercase tracking-[0.3em] text-slate-500">No active plan</p>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Plans are stored locally with the workspace state and can be used as agent-ready prompts.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-white">{activePlan.title}</h3>
                    <span className={cn('rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]', statusTone(activePlan.status))}>
                      {activePlan.status}
                    </span>
                    <span className={cn('rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]', statusTone(activePlan.risk))}>
                      {activePlan.risk} risk
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{activePlan.goal}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={queuePlanForAgent}
                    className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-300/15"
                  >
                    Queue in chat
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePlan(activePlan.id)}
                    className="rounded-full border border-rose-300/30 bg-rose-300/10 px-4 py-2 text-sm text-rose-100 transition hover:bg-rose-300/15"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-900">
                <div className="h-full rounded-full bg-sky-300" style={{ width: `${activeProgress?.percent ?? 0}%` }} />
              </div>

              <div className="mt-5 space-y-3">
                {activePlan.steps.map((step, index) => (
                  <article key={step.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-400">
                            Step {index + 1}
                          </span>
                          <span className={cn('rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]', statusTone(step.status))}>
                            {statusLabels[step.status]}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-white">{step.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{step.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(['pending', 'in_progress', 'completed', 'blocked'] as PlanStepStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => updatePlanStepStatus(activePlan.id, step.id, status)}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-xs transition',
                              step.status === status ? statusTone(status) : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                            )}
                          >
                            {statusLabels[status]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Acceptance criteria</p>
                      <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-300">
                        {step.acceptanceCriteria.map((criterion) => (
                          <li key={criterion}>- {criterion}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
