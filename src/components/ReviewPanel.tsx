import { useEffect, useMemo, useState } from 'react';
import type { GitChangedFile, GitDiffResult } from '../../shared/contracts';
import { getGitDiff } from '@/services/electron-api';
import { gitRuntime } from '@/services/git-runtime';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/utils/cn';

const changeTone = (kind?: string): string => {
  switch (kind) {
    case 'added':
    case 'untracked':
      return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
    case 'modified':
    case 'renamed':
    case 'copied':
      return 'border-sky-300/30 bg-sky-300/10 text-sky-100';
    case 'deleted':
      return 'border-rose-300/30 bg-rose-300/10 text-rose-100';
    case 'conflicted':
      return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
    default:
      return 'border-white/10 bg-white/5 text-slate-300';
  }
};

const sectionStyle = 'rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-panel backdrop-blur';

const DiffCard = ({
  title,
  files,
  selectedKey,
  onSelect,
}: {
  title: string;
  files: GitChangedFile[];
  selectedKey: string | null;
  onSelect: (file: GitChangedFile, staged: boolean) => void;
}) => (
  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
        {files.length}
      </span>
    </div>
    <div className="mt-4 space-y-2">
      {files.length === 0 ? (
        <p className="text-sm text-slate-500">No files in this section.</p>
      ) : (
        files.map((file) => {
          const staged = title === 'Staged';
          const key = `${staged ? 'staged' : 'unstaged'}:${file.path}`;
          const kind = staged ? file.stagedKind : file.unstagedKind;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(file, staged)}
              className={cn(
                'w-full rounded-2xl border px-3 py-3 text-left transition',
                selectedKey === key ? 'border-sky-300/30 bg-sky-300/10' : 'border-white/10 bg-black/10 hover:bg-white/5',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{file.path}</p>
                  {file.previousPath ? (
                    <p className="mt-1 truncate text-xs text-slate-500">from {file.previousPath}</p>
                  ) : null}
                </div>
                <span className={cn('rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]', changeTone(kind))}>
                  {kind || 'changed'}
                </span>
              </div>
            </button>
          );
        })
      )}
    </div>
  </div>
);

export const ReviewPanel = () => {
  const gitReview = useAppStore((state) => state.gitReview);
  const setGitReview = useAppStore((state) => state.setGitReview);
  const [selected, setSelected] = useState<{ file: GitChangedFile; staged: boolean } | null>(null);
  const [diffResult, setDiffResult] = useState<GitDiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    void gitRuntime.refreshReview();
  }, []);

  useEffect(() => {
    if (!selected) {
      setDiffResult(null);
      setDiffError(null);
      return;
    }

    let cancelled = false;
    setDiffLoading(true);
    setDiffError(null);

    void getGitDiff({
      path: selected.file.path,
      staged: selected.staged,
    })
      .then((result) => {
        if (!cancelled) {
          setDiffResult(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDiffError(error instanceof Error ? error.message : 'Unable to load diff preview.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDiffLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const selectedKey = selected ? `${selected.staged ? 'staged' : 'unstaged'}:${selected.file.path}` : null;
  const summaryCards = useMemo(
    () =>
      gitReview
        ? [
            `${gitReview.branch || 'detached'}${gitReview.upstream ? ` -> ${gitReview.upstream}` : ''}`,
            `${gitReview.stagedCount} staged`,
            `${gitReview.unstagedCount} unstaged`,
            `${gitReview.conflictedCount} conflicted`,
            `${gitReview.ahead} ahead / ${gitReview.behind} behind`,
          ]
        : [],
    [gitReview],
  );

  if (!gitReview) {
    return (
      <section className={sectionStyle}>
        <p className="text-sm text-slate-400">Loading git review state…</p>
      </section>
    );
  }

  if (!gitReview.available) {
    return (
      <section className={sectionStyle}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Git Review</p>
            <p className="mt-1 text-sm text-slate-500">{gitReview.summary}</p>
          </div>
          <button
            type="button"
            onClick={() => void gitRuntime.refreshReview()}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className={sectionStyle}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-100">Git Review Center</p>
            <p className="mt-1 text-sm text-slate-400">
              Inspect changed files, staged vs unstaged work, and per-file diffs without leaving the app.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setDiffResult(null);
              void gitRuntime.refreshReview();
            }}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {summaryCards.map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {item}
            </span>
          ))}
        </div>
        {gitReview.latestCommitSummary ? (
          <p className="mt-3 text-xs text-slate-500">Latest commit: {gitReview.latestCommitSummary}</p>
        ) : null}
        <p className="mt-3 text-xs text-slate-500">{gitReview.summary}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.45fr)_minmax(300px,0.55fr)]">
        <div className="grid gap-4">
          <DiffCard
            title="Staged"
            files={gitReview.stagedFiles}
            selectedKey={selectedKey}
            onSelect={(file, staged) => setSelected({ file, staged })}
          />
          <DiffCard
            title="Unstaged"
            files={gitReview.unstagedFiles}
            selectedKey={selectedKey}
            onSelect={(file, staged) => setSelected({ file, staged })}
          />
        </div>

        <div className={sectionStyle}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-100">Diff Preview</p>
              <p className="mt-1 text-xs text-slate-500">
                {selected ? `${selected.staged ? 'Staged' : 'Unstaged'} diff for ${selected.file.path}` : 'Select a changed file to inspect its diff.'}
              </p>
            </div>
            {selected ? (
              <span className={cn('rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]', changeTone(selected.staged ? selected.file.stagedKind : selected.file.unstagedKind))}>
                {selected.staged ? selected.file.stagedKind || 'staged' : selected.file.unstagedKind || 'unstaged'}
              </span>
            ) : null}
          </div>

          <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-black/30">
            {diffLoading ? (
              <div className="p-4 text-sm text-slate-400">Loading diff…</div>
            ) : diffError ? (
              <div className="p-4 text-sm text-rose-300">{diffError}</div>
            ) : diffResult ? (
              <pre className="max-h-[560px] overflow-auto p-4 text-xs leading-6 text-slate-200">
                {diffResult.diff || 'No diff output for this file.'}
              </pre>
            ) : (
              <div className="p-4 text-sm text-slate-500">No file selected yet.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
