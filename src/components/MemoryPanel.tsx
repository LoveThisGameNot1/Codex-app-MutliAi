import { useEffect, useMemo, useState } from 'react';
import type { ContinuityImportMode, ContinuityImportResult, ProjectMemoryRecord } from '../../shared/contracts';
import { continuityRuntime } from '@/services/continuity-runtime';
import { projectMemoryRuntime } from '@/services/project-memory-runtime';
import { useAppStore } from '@/store/app-store';

const parseTags = (value: string): string[] =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const formatTimestamp = (value: string | undefined): string =>
  value ? new Date(value).toLocaleString() : 'Not saved yet';

const formatImportSummary = (result: ContinuityImportResult): string =>
  `Imported ${result.importedSessions} sessions and ${result.importedMemories} memory entries. Skipped ${result.skippedSessions} sessions and ${result.skippedMemories} memory entries. Instructions ${
    result.instructionsUpdated ? 'were updated' : 'were unchanged'
  }.`;

export const MemoryPanel = () => {
  const appInfo = useAppStore((state) => state.appInfo);
  const workspaceInstructions = useAppStore((state) => state.workspaceInstructions);
  const projectMemory = useAppStore((state) => state.projectMemory);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');
  const [tagsDraft, setTagsDraft] = useState('');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [continuityBusy, setContinuityBusy] = useState(false);
  const workspaceRoot = appInfo?.workspaceRoot ?? workspaceInstructions?.workspaceRoot ?? 'Current workspace';

  useEffect(() => {
    setInstructionsDraft(workspaceInstructions?.content ?? '');
  }, [workspaceInstructions?.content]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const memory of projectMemory) {
      for (const tag of memory.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [projectMemory]);

  const saveInstructions = async (): Promise<void> => {
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await projectMemoryRuntime.updateInstructions({ content: instructionsDraft });
      setStatusMessage('Workspace instructions saved. They will be injected into future model runs.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save workspace instructions.');
    }
  };

  const createMemory = async (): Promise<void> => {
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await projectMemoryRuntime.create({
        title: titleDraft,
        content: contentDraft,
        tags: parseTags(tagsDraft),
      });
      setTitleDraft('');
      setContentDraft('');
      setTagsDraft('');
      setStatusMessage('Project memory saved. It will be available in future model runs.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create project memory.');
    }
  };

  const beginEditing = (memory: ProjectMemoryRecord): void => {
    setEditingMemoryId(memory.id);
    setEditTitle(memory.title);
    setEditContent(memory.content);
    setEditTags(memory.tags.join(', '));
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const cancelEditing = (): void => {
    setEditingMemoryId(null);
    setEditTitle('');
    setEditContent('');
    setEditTags('');
  };

  const saveEdit = async (): Promise<void> => {
    if (!editingMemoryId) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await projectMemoryRuntime.update({
        id: editingMemoryId,
        title: editTitle,
        content: editContent,
        tags: parseTags(editTags),
      });
      cancelEditing();
      setStatusMessage('Project memory updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update project memory.');
    }
  };

  const deleteMemory = async (memoryId: string): Promise<void> => {
    if (!window.confirm('Delete this project memory item permanently?')) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await projectMemoryRuntime.delete(memoryId);
      setStatusMessage('Project memory deleted.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete project memory.');
    }
  };

  const exportContinuity = async (): Promise<void> => {
    setStatusMessage(null);
    setErrorMessage(null);
    setContinuityBusy(true);
    try {
      const result = await continuityRuntime.exportData();
      if (!result) {
        setStatusMessage('Export cancelled.');
        return;
      }

      setStatusMessage(
        `Exported ${result.sessionCount} sessions and ${result.memoryCount} memory entries to ${result.path}.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to export sessions and memory.');
    } finally {
      setContinuityBusy(false);
    }
  };

  const importContinuity = async (mode: ContinuityImportMode): Promise<void> => {
    if (
      mode === 'replace' &&
      !window.confirm('Replace local sessions and this workspace memory with the selected backup? This cannot be undone.')
    ) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    setContinuityBusy(true);
    try {
      const result = await continuityRuntime.importData({ mode });
      if (!result) {
        setStatusMessage('Import cancelled.');
        return;
      }

      setStatusMessage(formatImportSummary(result));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to import sessions and memory.');
    } finally {
      setContinuityBusy(false);
    }
  };

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Project Memory</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Store durable facts and reusable instructions for this workspace. These are injected into future agent runs
            separately from chat history.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void projectMemoryRuntime.refresh()}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-sky-300/15 bg-sky-300/5 px-4 py-3 text-xs text-slate-400">
        Workspace root: <span className="text-sky-100">{workspaceRoot}</span>
      </div>

      <div className="mt-4 rounded-3xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Continuity Backup</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Export saved sessions, workspace instructions, and project memory into one JSON file. Import can merge
              with local data or replace it when moving to a clean setup.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={continuityBusy}
              onClick={() => void exportContinuity()}
              className="rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export JSON
            </button>
            <button
              type="button"
              disabled={continuityBusy}
              onClick={() => void importContinuity('merge')}
              className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Import Merge
            </button>
            <button
              type="button"
              disabled={continuityBusy}
              onClick={() => void importContinuity('replace')}
              className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Import Replace
            </button>
          </div>
        </div>
      </div>

      {statusMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4">
        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Workspace Instructions</p>
              <p className="mt-1 text-sm text-slate-500">
                Preferences, coding standards, verification rules, and project conventions for every future run.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
              Updated: {formatTimestamp(workspaceInstructions?.updatedAt)}
            </span>
          </div>
          <textarea
            value={instructionsDraft}
            onChange={(event) => setInstructionsDraft(event.target.value)}
            rows={8}
            placeholder="Example: Always run npm run test and npm run dist before pushing. Keep commit messages in English. Prefer safe-clone mode for risky refactors."
            className="mt-4 w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400/40"
          />
          <button
            type="button"
            onClick={() => void saveInstructions()}
            className="mt-3 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Save Instructions
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Add Memory</p>
          <div className="mt-4 grid gap-3">
            <input
              type="text"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              placeholder="Short memory title"
              className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
            />
            <textarea
              value={contentDraft}
              onChange={(event) => setContentDraft(event.target.value)}
              rows={5}
              placeholder="Durable project fact, user preference, architecture note, or recurring constraint."
              className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400/40"
            />
            <input
              type="text"
              value={tagsDraft}
              onChange={(event) => setTagsDraft(event.target.value)}
              placeholder="Optional tags, comma separated"
              className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
            />
            <button
              type="button"
              onClick={() => void createMemory()}
              className="rounded-full border border-sky-400/30 bg-sky-400/10 px-5 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20"
            >
              Save Memory
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Saved Memory</p>
            <p className="mt-1 text-sm text-slate-500">{projectMemory.length} durable entries for this workspace.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tagCounts.length === 0 ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-500">
                no tags
              </span>
            ) : null}
            {tagCounts.slice(0, 8).map(([tag, count]) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300"
              >
                {tag} {count}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {projectMemory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-4 text-sm text-slate-500">
              No project memory yet.
            </div>
          ) : null}

          {projectMemory.map((memory) => {
            const editing = editingMemoryId === memory.id;
            return (
              <div key={memory.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                {editing ? (
                  <div className="grid gap-3">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
                    />
                    <textarea
                      value={editContent}
                      onChange={(event) => setEditContent(event.target.value)}
                      rows={5}
                      className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400/40"
                    />
                    <input
                      type="text"
                      value={editTags}
                      onChange={(event) => setEditTags(event.target.value)}
                      className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEdit()}
                        className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-100">{memory.title}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">{memory.content}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {memory.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-[11px] text-sky-100"
                          >
                            {tag}
                          </span>
                        ))}
                        <span className="rounded-full border border-white/10 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-500">
                          Updated {formatTimestamp(memory.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => beginEditing(memory)}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteMemory(memory.id)}
                        className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm text-rose-100 transition hover:bg-rose-400/20"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
