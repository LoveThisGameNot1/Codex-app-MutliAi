import { useMemo, useState } from 'react';
import type { AutomationRecord, AutomationWeekday } from '../../shared/contracts';
import { summarizeAutomationToolPolicy } from '../../shared/tool-policy';
import { automationRuntime } from '@/services/automation-runtime';
import {
  buildAutomationSchedule,
  defaultScheduleFormState,
  formatAutomationSchedule,
  formatAutomationTimestamp,
  getLatestAutomationRuns,
  isAutomationRunning,
  scheduleToFormState,
  type ScheduleFormState,
  weekdayOptions,
} from '@/services/automation-schedule';
import { useAppStore } from '@/store/app-store';

const copyFormState = (state: ScheduleFormState): ScheduleFormState => ({
  scheduleKind: state.scheduleKind,
  intervalMinutes: state.intervalMinutes,
  dailyHour: state.dailyHour,
  dailyMinute: state.dailyMinute,
  weeklyHour: state.weeklyHour,
  weeklyMinute: state.weeklyMinute,
  weeklyDays: [...state.weeklyDays],
});

const ScheduleFields = ({
  state,
  onChange,
}: {
  state: ScheduleFormState;
  onChange: (next: ScheduleFormState) => void;
}) => {
  const toggleWeeklyDay = (weekday: AutomationWeekday): void => {
    onChange({
      ...state,
      weeklyDays: state.weeklyDays.includes(weekday)
        ? state.weeklyDays.filter((value) => value !== weekday)
        : [...state.weeklyDays, weekday],
    });
  };

  return (
    <>
      <label className="flex flex-col gap-2 text-sm text-slate-300">
        Schedule
        <select
          value={state.scheduleKind}
          onChange={(event) =>
            onChange({
              ...state,
              scheduleKind: event.target.value as ScheduleFormState['scheduleKind'],
            })
          }
          className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
        >
          <option value="interval">Every N minutes</option>
          <option value="daily">Daily at a time</option>
          <option value="weekly">Weekly on selected days</option>
        </select>
      </label>

      {state.scheduleKind === 'interval' ? (
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Interval (minutes)
          <input
            type="number"
            min={5}
            step={5}
            value={state.intervalMinutes}
            onChange={(event) => onChange({ ...state, intervalMinutes: event.target.value })}
            className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
          />
        </label>
      ) : null}

      {state.scheduleKind === 'daily' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Hour
            <input
              type="number"
              min={0}
              max={23}
              value={state.dailyHour}
              onChange={(event) => onChange({ ...state, dailyHour: event.target.value })}
              className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Minute
            <input
              type="number"
              min={0}
              max={59}
              value={state.dailyMinute}
              onChange={(event) => onChange({ ...state, dailyMinute: event.target.value })}
              className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
            />
          </label>
        </div>
      ) : null}

      {state.scheduleKind === 'weekly' ? (
        <div className="grid gap-3">
          <div>
            <p className="text-sm text-slate-300">Weekdays</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {weekdayOptions.map((option) => {
                const selected = state.weeklyDays.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleWeeklyDay(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      selected
                        ? 'border-sky-400/30 bg-sky-400/10 text-sky-100'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Hour
              <input
                type="number"
                min={0}
                max={23}
                value={state.weeklyHour}
                onChange={(event) => onChange({ ...state, weeklyHour: event.target.value })}
                className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Minute
              <input
                type="number"
                min={0}
                max={59}
                value={state.weeklyMinute}
                onChange={(event) => onChange({ ...state, weeklyMinute: event.target.value })}
                className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
              />
            </label>
          </div>
        </div>
      ) : null}
    </>
  );
};

export const AutomationPanel = () => {
  const config = useAppStore((state) => state.config);
  const automations = useAppStore((state) => state.automations);
  const automationRuns = useAppStore((state) => state.automationRuns);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [createSchedule, setCreateSchedule] = useState<ScheduleFormState>(defaultScheduleFormState());
  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editSchedule, setEditSchedule] = useState<ScheduleFormState>(defaultScheduleFormState());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const latestRuns = useMemo(() => automationRuns.slice(0, 8), [automationRuns]);
  const latestRunByAutomationId = useMemo(() => getLatestAutomationRuns(automationRuns), [automationRuns]);
  const automationPolicySummary = useMemo(() => summarizeAutomationToolPolicy(config.toolPolicy), [config.toolPolicy]);

  const resetCreateForm = (): void => {
    setName('');
    setPrompt('');
    setCreateSchedule(defaultScheduleFormState());
  };

  const beginEditing = (automation: AutomationRecord): void => {
    setEditingAutomationId(automation.id);
    setEditName(automation.name);
    setEditPrompt(automation.prompt);
    setEditSchedule(copyFormState(scheduleToFormState(automation.schedule)));
    setEditError(null);
  };

  const cancelEditing = (): void => {
    setEditingAutomationId(null);
    setEditName('');
    setEditPrompt('');
    setEditSchedule(defaultScheduleFormState());
    setEditError(null);
  };

  const createNewAutomation = async (): Promise<void> => {
    setFormError(null);

    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    const schedule = buildAutomationSchedule(createSchedule);

    if (!trimmedName || !trimmedPrompt) {
      setFormError('Name and prompt are required.');
      return;
    }

    if (!schedule) {
      setFormError('Please provide a complete automation schedule.');
      return;
    }

    setIsSubmitting(true);
    try {
      await automationRuntime.create({
        name: trimmedName,
        prompt: trimmedPrompt,
        schedule,
      });
      resetCreateForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create automation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveEdit = async (): Promise<void> => {
    if (!editingAutomationId) {
      return;
    }

    setEditError(null);
    const trimmedName = editName.trim();
    const trimmedPrompt = editPrompt.trim();
    const schedule = buildAutomationSchedule(editSchedule);

    if (!trimmedName || !trimmedPrompt) {
      setEditError('Name and prompt are required.');
      return;
    }

    if (!schedule) {
      setEditError('Please provide a complete automation schedule.');
      return;
    }

    setIsSavingEdit(true);
    try {
      await automationRuntime.update({
        id: editingAutomationId,
        name: trimmedName,
        prompt: trimmedPrompt,
        schedule,
      });
      cancelEditing();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to update automation.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Automations</h4>
          <p className="mt-1 text-sm text-slate-500">
            Recurring jobs that can wake up later, use tools inside unattended-safe limits, and continue working without
            manual prompting.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {automations.length} total
          </span>
          <button
            type="button"
            onClick={() => void automationRuntime.refresh()}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-medium text-slate-100">Create Automation</p>
          <div className="mt-3 grid gap-3">
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100">Unattended Safety</p>
              <p className="mt-2 text-sm text-amber-50">{automationPolicySummary.headline}</p>
              <p className="mt-2 text-xs leading-6 text-amber-100/80">{automationPolicySummary.detail}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {automationPolicySummary.allowedCapabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[11px] text-emerald-100"
                  >
                    {capability}
                  </span>
                ))}
                {automationPolicySummary.approvalRequiredCapabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[11px] text-amber-100"
                  >
                    {capability} needs approval
                  </span>
                ))}
                {automationPolicySummary.blockedCapabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-rose-300/20 bg-rose-300/10 px-2.5 py-1 text-[11px] text-rose-100"
                  >
                    {capability} blocked
                  </span>
                ))}
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-slate-300">
                  outside-workspace access blocked
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-slate-300">
                  risky terminal blocked
                </span>
              </div>
            </div>
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nightly dependency check"
                className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Prompt
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={6}
                placeholder="Inspect package dependencies, run tests, and summarize any breakages."
                className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400/40"
              />
            </label>

            <ScheduleFields state={createSchedule} onChange={setCreateSchedule} />

            {formError ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {formError}
              </div>
            ) : null}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void createNewAutomation()}
              className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
            >
              {isSubmitting ? 'Creating...' : 'Create Automation'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-medium text-slate-100">Recent Runs</p>
          <div className="mt-3 space-y-3">
            {latestRuns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-4 text-sm text-slate-500">
                No automation runs yet.
              </div>
            ) : null}

            {latestRuns.map((run) => (
              <details key={run.id} className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-100">{run.automationName}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] ${
                      run.status === 'failed'
                        ? 'bg-rose-400/10 text-rose-200'
                        : run.status === 'running'
                          ? 'bg-sky-400/10 text-sky-200'
                          : 'bg-emerald-400/10 text-emerald-200'
                    }`}
                  >
                    {run.status}
                  </span>
                </summary>
                <p className="mt-3 text-sm text-slate-400">{run.summary}</p>
                <p className="mt-2 text-xs text-slate-500">{formatAutomationTimestamp(run.finishedAt ?? run.startedAt)}</p>
                {run.output ? (
                  <>
                    {run.outputTruncated ? (
                      <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                        Showing the first {run.output.length.toLocaleString()} of {run.outputCharacters?.toLocaleString() ?? '?'} characters.
                      </div>
                    ) : null}
                    <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-6 text-slate-300">
                      {run.output}
                    </pre>
                  </>
                ) : null}
              </details>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {automations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-4 text-sm text-slate-500">
            No automations configured yet.
          </div>
        ) : null}

        {automations.map((automation) => {
          const latestRun = latestRunByAutomationId.get(automation.id);
          const running = isAutomationRunning(automation, latestRunByAutomationId);
          const editing = editingAutomationId === automation.id;

          return (
            <div
              key={automation.id}
              className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 xl:flex-row xl:items-start xl:justify-between"
            >
              <div className="min-w-0 flex-1">
                {editing ? (
                  <div className="grid gap-3">
                    <label className="flex flex-col gap-2 text-sm text-slate-300">
                      Name
                      <input
                        type="text"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-slate-300">
                      Prompt
                      <textarea
                        value={editPrompt}
                        onChange={(event) => setEditPrompt(event.target.value)}
                        rows={5}
                        className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400/40"
                      />
                    </label>
                    <ScheduleFields state={editSchedule} onChange={setEditSchedule} />
                    {editError ? (
                      <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                        {editError}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">{automation.name}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] ${
                          automation.status === 'active'
                            ? 'bg-emerald-400/10 text-emerald-200'
                            : 'bg-amber-400/10 text-amber-200'
                        }`}
                      >
                        {automation.status}
                      </span>
                      <span className="rounded-full border border-white/10 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-400">
                        {formatAutomationSchedule(automation.schedule)}
                      </span>
                      {running ? (
                        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-sky-100">
                          Running now
                        </span>
                      ) : null}
                      {latestRun?.status === 'running' && latestRun.summary.toLowerCase().includes('approval') ? (
                        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100">
                          Waiting for approval
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{automation.prompt}</p>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                      <span>Next run: {formatAutomationTimestamp(automation.nextRunAt)}</span>
                      <span>Last run: {formatAutomationTimestamp(automation.lastRunAt)}</span>
                      <span>Last status: {automation.lastRunStatus || 'No runs yet'}</span>
                      <span>Last result: {automation.lastResultSummary || 'No runs yet'}</span>
                    </div>
                    {latestRun?.output ? (
                      <details className="mt-3 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
                        <summary className="cursor-pointer text-sm text-slate-300">Latest output</summary>
                        {latestRun.outputTruncated ? (
                          <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                            Showing the first {latestRun.output.length.toLocaleString()} of{' '}
                            {latestRun.outputCharacters?.toLocaleString() ?? '?'} characters.
                          </div>
                        ) : null}
                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-400">
                          {latestRun.output}
                        </pre>
                      </details>
                    ) : null}
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {editing ? (
                  <>
                    <button
                      type="button"
                      disabled={isSavingEdit}
                      onClick={() => void saveEdit()}
                      className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                    >
                      {isSavingEdit ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      disabled={isSavingEdit}
                      onClick={cancelEditing}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => beginEditing(automation)}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() =>
                        void automationRuntime.update({
                          id: automation.id,
                          status: automation.status === 'active' ? 'paused' : 'active',
                        })
                      }
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                    >
                      {automation.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => void automationRuntime.run(automation.id)}
                      className="rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                    >
                      {running ? 'Running...' : 'Run Now'}
                    </button>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => {
                        if (!window.confirm(`Delete automation "${automation.name}" permanently?`)) {
                          return;
                        }

                        void automationRuntime.delete(automation.id);
                      }}
                      className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
