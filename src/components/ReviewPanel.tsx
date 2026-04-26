import { useEffect, useMemo, useState } from 'react';
import type {
  GitChangedFile,
  GitCodeReviewResult,
  GitCommitDraft,
  GitDiffResult,
  GitInlineReviewComment,
  GitPullRequestPrep,
} from '../../shared/contracts';
import { createGitBranch, createGitCommit, draftGitCommit, getGitDiff, prepareGitPullRequest, reviewGitChanges } from '@/services/electron-api';
import { parseUnifiedDiffForComments, type ParsedDiffLine } from '@/services/git-review-comments';
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

const actionButtonStyle =
  'rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50';

const diffLineTone = (kind: ParsedDiffLine['kind']): string => {
  switch (kind) {
    case 'added':
      return 'bg-emerald-300/10 text-emerald-100';
    case 'removed':
      return 'bg-rose-300/10 text-rose-100';
    case 'meta':
      return 'bg-sky-300/10 text-sky-200';
    default:
      return 'text-slate-200';
  }
};

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

const InlineCommentCard = ({
  comment,
  onResolve,
  onDelete,
}: {
  comment: GitInlineReviewComment;
  onResolve: (commentId: string) => void;
  onDelete: (commentId: string) => void;
}) => (
  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
          {comment.filePath}:{comment.lineNumber}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{comment.body}</p>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]',
          comment.status === 'open'
            ? 'border-amber-300/30 bg-amber-300/10 text-amber-100'
            : 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
        )}
      >
        {comment.status}
      </span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {comment.status === 'open' ? (
        <button
          type="button"
          onClick={() => onResolve(comment.id)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
        >
          Resolve
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onDelete(comment.id)}
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
      >
        Delete
      </button>
    </div>
  </div>
);

export const ReviewPanel = () => {
  const gitReview = useAppStore((state) => state.gitReview);
  const setGitReview = useAppStore((state) => state.setGitReview);
  const gitReviewComments = useAppStore((state) => state.gitReviewComments);
  const addGitReviewComment = useAppStore((state) => state.addGitReviewComment);
  const resolveGitReviewComment = useAppStore((state) => state.resolveGitReviewComment);
  const deleteGitReviewComment = useAppStore((state) => state.deleteGitReviewComment);
  const [selected, setSelected] = useState<{ file: GitChangedFile; staged: boolean } | null>(null);
  const [diffResult, setDiffResult] = useState<GitDiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [commitDraft, setCommitDraft] = useState<GitCommitDraft | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [branchName, setBranchName] = useState('');
  const [prPrep, setPrPrep] = useState<GitPullRequestPrep | null>(null);
  const [codeReview, setCodeReview] = useState<GitCodeReviewResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [branchLoading, setBranchLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [prPrepLoading, setPrPrepLoading] = useState(false);
  const [codeReviewLoading, setCodeReviewLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState<{
    filePath: string;
    lineNumber: number;
    body: string;
  } | null>(null);

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
  const diffLines = useMemo(
    () => (diffResult?.diff ? parseUnifiedDiffForComments(diffResult.diff) : []),
    [diffResult?.diff],
  );
  const selectedFileComments = useMemo(
    () =>
      selected
        ? gitReviewComments
            .filter((comment) => comment.filePath === selected.file.path)
            .sort((left, right) => {
              if (left.status !== right.status) {
                return left.status === 'open' ? -1 : 1;
              }
              return left.lineNumber - right.lineNumber;
            })
        : [],
    [gitReviewComments, selected],
  );
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

  const loadCommitDraft = async () => {
    setDraftLoading(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const draft = await draftGitCommit();
      setCommitDraft(draft);
      setCommitMessage(draft.message);
      setBranchName((current) => current || draft.message.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^/, 'codex/'));
      setActionNotice('Commit draft refreshed from the current review state.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to draft a commit message.');
    } finally {
      setDraftLoading(false);
    }
  };

  const handleCreateBranch = async () => {
    setBranchLoading(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const result = await createGitBranch({
        name: branchName,
      });
      setActionNotice(
        result.created
          ? `Created and switched to ${result.branch}.`
          : `Switched to existing branch ${result.branch}.`,
      );
      const refreshed = await gitRuntime.refreshReview();
      if (refreshed) {
        setGitReview(refreshed);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to create or switch branches.');
    } finally {
      setBranchLoading(false);
    }
  };

  const handleCreateCommit = async () => {
    setCommitLoading(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const result = await createGitCommit({
        message: commitMessage,
      });
      setActionNotice(`Created commit ${result.summary}.`);
      const refreshed = await gitRuntime.refreshReview();
      if (refreshed) {
        setGitReview(refreshed);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to create a commit.');
    } finally {
      setCommitLoading(false);
    }
  };

  const handlePreparePr = async () => {
    setPrPrepLoading(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const prep = await prepareGitPullRequest();
      setPrPrep(prep);
      setBranchName((current) => current || prep.suggestedBranchName);
      setCommitMessage((current) => current || prep.suggestedTitle);
      setActionNotice('PR prep draft refreshed from the current branch state.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to prepare a pull request draft.');
    } finally {
      setPrPrepLoading(false);
    }
  };

  const handleRunCodeReview = async () => {
    setCodeReviewLoading(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const result = await reviewGitChanges();
      setCodeReview(result);
      setActionNotice('Code review heuristics refreshed from the current Git diff.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to run a code review pass.');
    } finally {
      setCodeReviewLoading(false);
    }
  };

  const startCommentDraft = (filePath: string, lineNumber: number, body = '') => {
    setCommentDraft({
      filePath,
      lineNumber,
      body,
    });
  };

  const submitCommentDraft = () => {
    if (!commentDraft?.body.trim()) {
      return;
    }

    addGitReviewComment({
      filePath: commentDraft.filePath,
      lineNumber: commentDraft.lineNumber,
      body: commentDraft.body.trim(),
    });
    setCommentDraft(null);
    setActionNotice(`Added inline review comment on ${commentDraft.filePath}:${commentDraft.lineNumber}.`);
  };

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

      <div className="grid gap-4 xl:grid-cols-3">
        <div className={sectionStyle}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-100">Commit Draft</p>
              <p className="mt-1 text-xs text-slate-500">Generate a suggested commit message from the current review scope, then commit staged changes.</p>
            </div>
            <button type="button" onClick={() => void loadCommitDraft()} className={actionButtonStyle} disabled={draftLoading}>
              {draftLoading ? 'Drafting...' : 'Draft message'}
            </button>
          </div>

          <textarea
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.target.value)}
            placeholder="Draft or edit a commit message"
            className="mt-4 min-h-[110px] w-full rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/40"
          />

          {commitDraft ? <p className="mt-3 text-xs text-slate-500">{commitDraft.summary}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCreateCommit()}
              className={actionButtonStyle}
              disabled={commitLoading || !commitMessage.trim()}
            >
              {commitLoading ? 'Committing...' : 'Commit staged changes'}
            </button>
          </div>
        </div>

        <div className={sectionStyle}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-100">Branch Flow</p>
              <p className="mt-1 text-xs text-slate-500">Create a new working branch or switch to an existing one without leaving the review center.</p>
            </div>
          </div>

          <input
            value={branchName}
            onChange={(event) => setBranchName(event.target.value)}
            placeholder="codex/review-center"
            className="mt-4 w-full rounded-full border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/40"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCreateBranch()}
              className={actionButtonStyle}
              disabled={branchLoading || !branchName.trim()}
            >
              {branchLoading ? 'Switching...' : 'Create or switch branch'}
            </button>
          </div>
        </div>

        <div className={sectionStyle}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-100">PR Prep</p>
              <p className="mt-1 text-xs text-slate-500">Generate a PR-ready title, body, and testing checklist from the current branch and review state.</p>
            </div>
            <button type="button" onClick={() => void handlePreparePr()} className={actionButtonStyle} disabled={prPrepLoading}>
              {prPrepLoading ? 'Preparing...' : 'Generate PR prep'}
            </button>
          </div>

          {prPrep ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Suggested title</p>
                <p className="mt-2 text-sm font-medium text-slate-100">{prPrep.suggestedTitle}</p>
                <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">Suggested branch</p>
                <p className="mt-2 text-sm text-slate-300">{prPrep.suggestedBranchName}</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">PR body</p>
                <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-200">{prPrep.body}</pre>
              </div>

              {prPrep.warning ? <p className="text-xs text-amber-300">{prPrep.warning}</p> : null}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-500">
              No PR draft generated yet.
            </div>
          )}
        </div>
      </div>

      {actionError ? <div className="rounded-3xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">{actionError}</div> : null}
      {actionNotice ? <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{actionNotice}</div> : null}

      <div className={sectionStyle}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-100">Code Review Mode</p>
            <p className="mt-1 text-sm text-slate-400">
              Run a focused reviewer pass over the current Git diff to highlight risks, likely regressions, and missing test coverage.
            </p>
          </div>
          <button type="button" onClick={() => void handleRunCodeReview()} className={actionButtonStyle} disabled={codeReviewLoading}>
            {codeReviewLoading ? 'Reviewing...' : 'Run review'}
          </button>
        </div>

        {codeReview ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(320px,0.55fr)_minmax(280px,0.45fr)]">
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-slate-100">Findings</p>
                <p className="mt-1 text-xs text-slate-500">{codeReview.summary}</p>
                <div className="mt-4 space-y-3">
                  {codeReview.findings.length === 0 ? (
                    <p className="text-sm text-slate-400">No review findings were raised by the current heuristics.</p>
                  ) : (
                    codeReview.findings.map((finding) => (
                      <div key={finding.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]',
                              finding.severity === 'high'
                                ? 'border-rose-300/30 bg-rose-300/10 text-rose-100'
                                : finding.severity === 'medium'
                                  ? 'border-amber-300/30 bg-amber-300/10 text-amber-100'
                                  : 'border-sky-300/30 bg-sky-300/10 text-sky-100',
                            )}
                          >
                            {finding.severity}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                            {finding.category}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-100">{finding.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{finding.summary}</p>
                        {finding.filePath ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <p className="text-xs text-slate-500">
                              {finding.filePath}
                              {finding.startLine ? `:${finding.startLine}` : ''}
                            </p>
                            {finding.startLine ? (
                              <button
                                type="button"
                                onClick={() => startCommentDraft(finding.filePath!, finding.startLine!, finding.summary)}
                                className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
                              >
                                Add inline comment
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-slate-100">Strengths</p>
                <div className="mt-3 space-y-2">
                  {codeReview.strengths.length === 0 ? (
                    <p className="text-sm text-slate-500">No notable strengths were detected automatically yet.</p>
                  ) : (
                    codeReview.strengths.map((strength) => (
                      <p key={strength} className="text-sm leading-6 text-slate-300">
                        {strength}
                      </p>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-slate-100">Testing Gaps</p>
                <div className="mt-3 space-y-2">
                  {codeReview.testingGaps.length === 0 ? (
                    <p className="text-sm text-slate-500">No obvious testing gaps were detected automatically.</p>
                  ) : (
                    codeReview.testingGaps.map((gap) => (
                      <p key={gap} className="text-sm leading-6 text-slate-300">
                        {gap}
                      </p>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-slate-100">Reviewed Files</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {codeReview.reviewedFiles.map((filePath) => (
                    <span key={filePath} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                      {filePath}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-3xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-500">
            No code review pass generated yet.
          </div>
        )}
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
            ) : diffResult && diffLines.length > 0 ? (
              <div className="max-h-[560px] overflow-auto py-2 font-mono text-xs">
                {diffLines.map((line) => {
                  const lineComments = selected
                    ? gitReviewComments.filter(
                        (comment) =>
                          comment.filePath === selected.file.path &&
                          comment.lineNumber === line.anchorLineNumber,
                      )
                    : [];

                  return (
                    <div key={line.id} className={cn('group grid grid-cols-[72px_1fr_auto] gap-3 px-3 py-1', diffLineTone(line.kind))}>
                      <span className="select-none text-right text-slate-500">
                        {line.newLineNumber ?? line.oldLineNumber ?? ''}
                      </span>
                      <span className="whitespace-pre-wrap break-words">{line.content || ' '}</span>
                      {selected && line.anchorLineNumber ? (
                        <button
                          type="button"
                          onClick={() => startCommentDraft(selected.file.path, line.anchorLineNumber ?? 1)}
                          className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-slate-300 opacity-0 transition hover:bg-white/10 group-hover:opacity-100"
                        >
                          Comment
                        </button>
                      ) : (
                        <span />
                      )}
                      {lineComments.length > 0 ? (
                        <div className="col-span-3 ml-[72px] space-y-2 border-l border-sky-300/20 pl-3">
                          {lineComments.map((comment) => (
                            <InlineCommentCard
                              key={comment.id}
                              comment={comment}
                              onResolve={resolveGitReviewComment}
                              onDelete={deleteGitReviewComment}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : diffResult ? (
              <div className="p-4 text-sm text-slate-500">No diff output for this file.</div>
            ) : (
              <div className="p-4 text-sm text-slate-500">No file selected yet.</div>
            )}
          </div>

          {commentDraft ? (
            <div className="mt-4 rounded-3xl border border-sky-300/20 bg-sky-300/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-100">
                  Comment on {commentDraft.filePath}:{commentDraft.lineNumber}
                </p>
                <button
                  type="button"
                  onClick={() => setCommentDraft(null)}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
              <textarea
                value={commentDraft.body}
                onChange={(event) =>
                  setCommentDraft({
                    ...commentDraft,
                    body: event.target.value,
                  })
                }
                className="mt-3 min-h-[96px] w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/40"
                placeholder="Write an actionable review comment..."
              />
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={submitCommentDraft} className={actionButtonStyle} disabled={!commentDraft.body.trim()}>
                  Save comment
                </button>
              </div>
            </div>
          ) : null}

          {selected && selectedFileComments.length > 0 ? (
            <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-slate-100">Comments on this file</p>
              <div className="mt-3 space-y-2">
                {selectedFileComments.map((comment) => (
                  <InlineCommentCard
                    key={comment.id}
                    comment={comment}
                    onResolve={resolveGitReviewComment}
                    onDelete={deleteGitReviewComment}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};
