import { execFile } from 'node:child_process';
import path from 'node:path';
import type {
  GitBranchResult,
  GitChangeKind,
  GitChangedFile,
  GitCodeReviewResult,
  GitCommitDraft,
  GitCommitResult,
  GitCreateBranchInput,
  GitCreateCommitInput,
  GitDiffRequest,
  GitDiffResult,
  GitReviewFinding,
  GitReviewFindingCategory,
  GitReviewFindingSeverity,
  GitPullRequestPrep,
  GitReviewSnapshot,
} from '../shared/contracts';

const MAX_DIFF_BYTES = 64 * 1024;
const nowIso = (): string => new Date().toISOString();

const execGit = async (
  args: string[],
  cwd: string,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> =>
  new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
      },
      (error, stdout, stderr) => {
        if (error) {
          const commandError = error as NodeJS.ErrnoException & { code?: number | string };
          resolve({
            stdout,
            stderr,
            exitCode: typeof commandError.code === 'number' ? commandError.code : 1,
          });
          return;
        }

        resolve({
          stdout,
          stderr,
          exitCode: 0,
        });
      },
    );
  });

const toChangeKind = (code: string): GitChangeKind | undefined => {
  switch (code) {
    case 'A':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'T':
      return 'type-changed';
    case 'U':
      return 'conflicted';
    case '?':
      return 'untracked';
    default:
      return code === '.' || code === ' ' ? undefined : 'unknown';
  }
};

const toTitleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const formatList = (items: string[]): string => {
  if (items.length === 0) {
    return '';
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
};

const getTopLevelScope = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments.length <= 1) {
    const basename = path.posix.basename(normalized);
    const stem = basename.replace(/\.[^.]+$/, '');
    return stem || 'workspace';
  }

  return segments[0] || 'workspace';
};

const describePathScope = (paths: string[]): string => {
  if (paths.length === 0) {
    return 'workspace files';
  }

  if (paths.length === 1) {
    return path.posix.basename(paths[0]);
  }

  const scopes = [...new Set(paths.map(getTopLevelScope))].filter(Boolean);
  if (scopes.length > 0 && scopes.length <= 3) {
    return `${formatList(scopes)} workflows`;
  }

  return 'workspace files';
};

const getDominantVerb = (files: GitChangedFile[]): string => {
  const counts = new Map<GitChangeKind, number>();

  for (const file of files) {
    const kind = file.stagedKind ?? file.unstagedKind ?? 'unknown';
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  const dominantKind = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];

  switch (dominantKind) {
    case 'added':
    case 'untracked':
      return 'add';
    case 'deleted':
      return 'remove';
    case 'renamed':
      return 'rename';
    case 'conflicted':
      return 'resolve';
    default:
      return 'update';
  }
};

const getRelevantFiles = (snapshot: GitReviewSnapshot): GitChangedFile[] => {
  const preferred = snapshot.stagedFiles.length > 0 ? snapshot.stagedFiles : snapshot.unstagedFiles;
  if (preferred.length > 0) {
    return preferred;
  }

  return [...snapshot.stagedFiles, ...snapshot.unstagedFiles].filter(
    (file, index, files) => files.findIndex((candidate) => candidate.path === file.path) === index,
  );
};

type ReviewedDiffFile = {
  path: string;
  diff: string;
  startLine?: number;
};

const codeFilePattern = /\.(ts|tsx|js|jsx|json|css|scss|md)$/i;
const testFilePattern = /(^|\/).+\.(test|spec)\.(ts|tsx|js|jsx)$/i;

const getFirstChangedLine = (diff: string): number | undefined => {
  const match = diff.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/m);
  if (!match) {
    return undefined;
  }

  return Number(match[1]);
};

const severityRank: Record<GitReviewFindingSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const buildReviewSummary = (findings: GitReviewFinding[]): string => {
  if (findings.length === 0) {
    return 'No obvious review risks were detected by the built-in heuristics.';
  }

  const highest = findings.reduce<GitReviewFindingSeverity>(
    (current, finding) => (severityRank[finding.severity] > severityRank[current] ? finding.severity : current),
    'low',
  );

  return `${findings.length} review flag${findings.length === 1 ? '' : 's'} detected, with the highest severity at ${highest}.`;
};

const addFinding = (
  findings: GitReviewFinding[],
  input: {
    id: string;
    title: string;
    summary: string;
    severity: GitReviewFindingSeverity;
    category: GitReviewFindingCategory;
    filePath?: string;
    startLine?: number;
    endLine?: number;
  },
): void => {
  findings.push(input);
};

export const buildCodeReviewFromSnapshot = (input: {
  snapshot: GitReviewSnapshot;
  reviewedDiffs: ReviewedDiffFile[];
}): GitCodeReviewResult => {
  const reviewedFiles = input.reviewedDiffs.map((file) => file.path);
  const changedFiles = getRelevantFiles(input.snapshot);
  const changedPaths = changedFiles.map((file) => file.path);
  const testFiles = reviewedFiles.filter((filePath) => testFilePattern.test(filePath));
  const codeFiles = reviewedFiles.filter((filePath) => codeFilePattern.test(filePath) && !testFilePattern.test(filePath));
  const bridgeDiff = input.reviewedDiffs.find((file) =>
    ['shared/contracts.ts', 'electron/preload.ts', 'electron/main.ts', 'src/services/electron-api.ts'].includes(
      file.path.replace(/\\/g, '/'),
    ),
  );
  const persistenceDiff = input.reviewedDiffs.find((file) =>
    ['src/store/app-store.ts', 'electron/session-store.ts', 'electron/automation-store.ts'].includes(
      file.path.replace(/\\/g, '/'),
    ),
  );
  const uiDiff = input.reviewedDiffs.find((file) => file.path.replace(/\\/g, '/').startsWith('src/components/'));
  const electronDiff = input.reviewedDiffs.find((file) => file.path.replace(/\\/g, '/').startsWith('electron/'));
  const findings: GitReviewFinding[] = [];

  if (input.snapshot.conflictedCount > 0) {
    addFinding(findings, {
      id: 'conflicts-present',
      title: 'Resolve merge conflicts before review',
      summary: 'The working tree still contains conflicted files, so any review conclusions are provisional until those conflicts are resolved.',
      severity: 'high',
      category: 'risk',
      filePath: changedFiles.find((file) => file.conflicted)?.path,
    });
  }

  if (bridgeDiff) {
    addFinding(findings, {
      id: 'bridge-contract-sync',
      title: 'Bridge contract changes need end-to-end verification',
      summary:
        'Main-process, preload, and renderer contract changes can drift out of sync. Double-check the full Electron round-trip, especially packaged behavior and preload exposure.',
      severity: 'medium',
      category: 'regression',
      filePath: bridgeDiff.path,
      startLine: bridgeDiff.startLine,
    });
  }

  if (persistenceDiff) {
    addFinding(findings, {
      id: 'persistence-rehydration',
      title: 'Persistence changes can affect restored sessions',
      summary:
        'State-store or persistence-layer edits can break rehydration paths in subtle ways. A restart smoke test is worth doing before shipping this branch.',
      severity: 'medium',
      category: 'regression',
      filePath: persistenceDiff.path,
      startLine: persistenceDiff.startLine,
    });
  }

  if (uiDiff) {
    addFinding(findings, {
      id: 'ui-review-regression',
      title: 'UI workflow changes need interaction coverage',
      summary:
        'Review-center layout and control changes can regress discoverability or overflow behavior. It is worth checking the updated workflow at desktop sizes before release.',
      severity: 'low',
      category: 'risk',
      filePath: uiDiff.path,
      startLine: uiDiff.startLine,
    });
  }

  if (codeFiles.length > 0 && testFiles.length === 0) {
    addFinding(findings, {
      id: 'missing-test-updates',
      title: 'Code changes do not include matching test updates',
      summary:
        'The current change set touches implementation files, but there are no changed automated tests alongside them. Consider adding or updating focused coverage before merging.',
      severity: 'medium',
      category: 'tests',
      filePath: codeFiles[0],
      startLine: input.reviewedDiffs.find((file) => file.path === codeFiles[0])?.startLine,
    });
  }

  if (electronDiff && !testFiles.some((filePath) => filePath.startsWith('electron/'))) {
    addFinding(findings, {
      id: 'main-process-coverage-gap',
      title: 'Main-process behavior lacks matching backend coverage',
      summary:
        'Electron-side changes are present, but there is no matching Electron test update in the diff. Packaging and IPC flows should be covered carefully.',
      severity: 'medium',
      category: 'tests',
      filePath: electronDiff.path,
      startLine: electronDiff.startLine,
    });
  }

  const strengths: string[] = [];
  if (testFiles.length > 0) {
    strengths.push('The change set updates automated coverage alongside implementation changes.');
  }
  if (input.snapshot.stagedCount > 0 && input.snapshot.unstagedCount === 0) {
    strengths.push('The working tree is fully staged, which makes the review scope easier to reason about.');
  }
  const topScopes = [...new Set(changedPaths.map(getTopLevelScope))];
  if (topScopes.length > 0 && topScopes.length <= 2) {
    strengths.push(`The review scope stays fairly concentrated in ${formatList(topScopes)}.`);
  }

  const testingGaps: string[] = [];
  if (testFiles.length === 0 && codeFiles.length > 0) {
    testingGaps.push('No automated test files changed with the current implementation edits.');
  }
  if (uiDiff) {
    testingGaps.push('Run a quick desktop smoke test for the updated review workflow and layout states.');
  }
  if (electronDiff) {
    testingGaps.push('Validate packaged Electron behavior after the Git workflow changes.');
  }

  return {
    summary: buildReviewSummary(findings),
    findings,
    strengths,
    testingGaps,
    reviewedFiles,
    generatedAt: nowIso(),
  };
};

export const buildCommitDraftFromSnapshot = (snapshot: GitReviewSnapshot): GitCommitDraft => {
  const files = getRelevantFiles(snapshot);
  const paths = files.map((file) => file.path);
  const verb = getDominantVerb(files);
  const target = describePathScope(paths);
  const message = `${toTitleCase(verb)} ${target}`.trim();

  return {
    message,
    summary:
      files.length > 0
        ? `Drafted from ${files.length} ${snapshot.stagedFiles.length > 0 ? 'staged' : 'changed'} file${files.length === 1 ? '' : 's'}.`
        : 'No changes detected yet.',
    generatedAt: nowIso(),
  };
};

export const toSuggestedBranchName = (message: string): string => {
  const slug = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `codex/${slug || 'workspace-update'}`;
};

export const buildPullRequestPrep = (input: {
  snapshot: GitReviewSnapshot;
  commitDraft: GitCommitDraft;
  commitSummaries: string[];
  diffStat: string;
  warning?: string;
}): GitPullRequestPrep => {
  const relevantFiles = getRelevantFiles(input.snapshot);
  const paths = relevantFiles.map((file) => file.path);
  const scope = describePathScope(paths);
  const summary = [
    `${input.commitDraft.message}.`,
    relevantFiles.length > 0
      ? `Touches ${scope} across ${relevantFiles.length} file${relevantFiles.length === 1 ? '' : 's'}.`
      : 'No changed files are currently available in the workspace snapshot.',
    input.snapshot.latestCommitSummary
      ? `Latest local commit: ${input.snapshot.latestCommitSummary}.`
      : 'No local commits are available yet.',
  ];
  const testingChecklist = ['npm run test', 'npm run build', 'npm run dist'];
  const body = [
    '## Summary',
    ...summary.map((item) => `- ${item}`),
    '',
    '## Testing',
    ...testingChecklist.map((item) => `- [ ] ${item}`),
    '',
    '## Commit Context',
    ...(input.commitSummaries.length > 0 ? input.commitSummaries.map((item) => `- ${item}`) : ['- No branch-specific commits detected yet.']),
    '',
    '## Diff Stat',
    '```text',
    input.diffStat || 'No diff stat available.',
    '```',
  ].join('\n');

  return {
    branch: input.snapshot.branch,
    upstream: input.snapshot.upstream,
    suggestedTitle: input.commitDraft.message,
    suggestedBranchName: toSuggestedBranchName(input.commitDraft.message),
    summary,
    testingChecklist,
    commitSummaries: input.commitSummaries,
    diffStat: input.diffStat,
    body,
    generatedAt: nowIso(),
    warning: input.warning,
  };
};

type ParsedReviewSnapshot = Omit<GitReviewSnapshot, 'generatedAt' | 'available'> & {
  available: true;
};

export const parseGitStatusPorcelain = (input: string): ParsedReviewSnapshot => {
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const files = new Map<string, GitChangedFile>();

  for (const line of input.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    if (line.startsWith('# branch.head ')) {
      const value = line.slice('# branch.head '.length).trim();
      branch = value === '(detached)' ? '(detached)' : value;
      continue;
    }

    if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice('# branch.upstream '.length).trim();
      continue;
    }

    if (line.startsWith('# branch.ab ')) {
      const match = line.match(/# branch\.ab \+(\d+) -(\d+)/);
      if (match) {
        ahead = Number(match[1]);
        behind = Number(match[2]);
      }
      continue;
    }

    if (line.startsWith('1 ')) {
      const match = line.match(/^1 ([A-Z.]{2}) \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/);
      if (!match) {
        continue;
      }

      const xy = match[1];
      const filePath = match[2];
      const stagedKind = toChangeKind(xy[0] ?? '.');
      const unstagedKind = toChangeKind(xy[1] ?? '.');
      files.set(filePath, {
        path: filePath,
        stagedKind,
        unstagedKind,
        staged: Boolean(stagedKind && stagedKind !== 'untracked'),
        unstaged: Boolean(unstagedKind && unstagedKind !== 'untracked'),
        conflicted: stagedKind === 'conflicted' || unstagedKind === 'conflicted',
      });
      continue;
    }

    if (line.startsWith('2 ')) {
      const parts = line.split('\t');
      const metadata = parts[0] ?? '';
      const previousPath = parts[1]?.trim();
      const renamedPath = metadata.split(' ').at(-1)?.trim();
      const metaMatch = metadata.match(/^2 ([A-Z.]{2}) /);
      if (!metaMatch || !renamedPath) {
        continue;
      }

      const xy = metaMatch[1];
      const stagedKind = toChangeKind(xy[0] ?? '.') ?? 'renamed';
      const unstagedKind = toChangeKind(xy[1] ?? '.');
      files.set(renamedPath, {
        path: renamedPath,
        previousPath,
        stagedKind,
        unstagedKind,
        staged: true,
        unstaged: Boolean(unstagedKind && unstagedKind !== 'untracked'),
        conflicted: stagedKind === 'conflicted' || unstagedKind === 'conflicted',
      });
      continue;
    }

    if (line.startsWith('u ')) {
      const parts = line.split(' ');
      const filePath = parts.at(-1)?.trim();
      if (!filePath) {
        continue;
      }

      files.set(filePath, {
        path: filePath,
        stagedKind: 'conflicted',
        unstagedKind: 'conflicted',
        staged: true,
        unstaged: true,
        conflicted: true,
      });
      continue;
    }

    if (line.startsWith('? ')) {
      const filePath = line.slice(2).trim();
      files.set(filePath, {
        path: filePath,
        unstagedKind: 'untracked',
        staged: false,
        unstaged: true,
        conflicted: false,
      });
    }
  }

  const allFiles = [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
  const stagedFiles = allFiles.filter((file) => file.staged);
  const unstagedFiles = allFiles.filter((file) => file.unstaged);
  const conflictedCount = allFiles.filter((file) => file.conflicted).length;
  const stagedCount = stagedFiles.length;
  const unstagedCount = unstagedFiles.length;
  const summaryParts = [];

  if (stagedCount > 0) {
    summaryParts.push(`${stagedCount} staged`);
  }
  if (unstagedCount > 0) {
    summaryParts.push(`${unstagedCount} unstaged`);
  }
  if (conflictedCount > 0) {
    summaryParts.push(`${conflictedCount} conflicted`);
  }

  return {
    available: true,
    branch,
    upstream,
    latestCommitSummary: null,
    ahead,
    behind,
    stagedCount,
    unstagedCount,
    conflictedCount,
    stagedFiles,
    unstagedFiles,
    summary: summaryParts.join(' | ') || 'Working tree clean',
  };
};

export class GitService {
  public constructor(private readonly workspaceRoot: string) {}

  public async getReviewSnapshot(): Promise<GitReviewSnapshot> {
    const insideWorkTree = await execGit(['rev-parse', '--is-inside-work-tree'], this.workspaceRoot);
    if (insideWorkTree.exitCode !== 0 || !insideWorkTree.stdout.trim().includes('true')) {
      return {
        available: false,
        branch: null,
        upstream: null,
        latestCommitSummary: null,
        ahead: 0,
        behind: 0,
        stagedCount: 0,
        unstagedCount: 0,
        conflictedCount: 0,
        summary: 'Git repository unavailable',
        stagedFiles: [],
        unstagedFiles: [],
        generatedAt: nowIso(),
      };
    }

    const statusResult = await execGit(['status', '--porcelain=2', '--branch'], this.workspaceRoot);
    if (statusResult.exitCode !== 0) {
      throw new Error(statusResult.stderr.trim() || 'Unable to inspect git status.');
    }

    const latestCommitResult = await execGit(['log', '-1', '--pretty=format:%h %s'], this.workspaceRoot);
    const parsed = parseGitStatusPorcelain(statusResult.stdout);

    return {
      ...parsed,
      latestCommitSummary: latestCommitResult.exitCode === 0 ? latestCommitResult.stdout.trim() || null : null,
      generatedAt: nowIso(),
    };
  }

  public async getDiff(request: GitDiffRequest): Promise<GitDiffResult> {
    const args = request.staged ? ['diff', '--cached', '--', request.path] : ['diff', '--', request.path];
    const diffResult = await execGit(args, this.workspaceRoot);
    if (diffResult.exitCode !== 0) {
      throw new Error(diffResult.stderr.trim() || `Unable to load git diff for ${request.path}.`);
    }

    const rawDiff = diffResult.stdout || '';
    const truncated = Buffer.byteLength(rawDiff, 'utf8') > MAX_DIFF_BYTES;
    const diff = truncated ? rawDiff.slice(0, MAX_DIFF_BYTES) + '\n\n[diff truncated]' : rawDiff;

    return {
      path: request.path,
      staged: request.staged,
      diff,
      truncated,
      generatedAt: nowIso(),
    };
  }

  public async draftCommitMessage(): Promise<GitCommitDraft> {
    const snapshot = await this.getReviewSnapshot();
    if (!snapshot.available) {
      throw new Error('Git repository unavailable.');
    }

    return buildCommitDraftFromSnapshot(snapshot);
  }

  public async createOrSwitchBranch(input: GitCreateBranchInput): Promise<GitBranchResult> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Branch name is required.');
    }

    const previousBranch = await this.getCurrentBranchName();
    const branchExists = await execGit(['rev-parse', '--verify', `refs/heads/${name}`], this.workspaceRoot);

    if (branchExists.exitCode === 0) {
      const switchResult = await execGit(['switch', name], this.workspaceRoot);
      if (switchResult.exitCode !== 0) {
        throw new Error(switchResult.stderr.trim() || `Unable to switch to ${name}.`);
      }

      return {
        branch: name,
        previousBranch,
        created: false,
        switchedAt: nowIso(),
      };
    }

    const args = ['switch', '-c', name];
    if (input.fromRef?.trim()) {
      args.push(input.fromRef.trim());
    }

    const createResult = await execGit(args, this.workspaceRoot);
    if (createResult.exitCode !== 0) {
      throw new Error(createResult.stderr.trim() || `Unable to create branch ${name}.`);
    }

    return {
      branch: name,
      previousBranch,
      created: true,
      switchedAt: nowIso(),
    };
  }

  public async createCommit(input: GitCreateCommitInput): Promise<GitCommitResult> {
    const message = input.message.trim();
    if (!message) {
      throw new Error('Commit message is required.');
    }

    const snapshot = await this.getReviewSnapshot();
    if (!snapshot.available) {
      throw new Error('Git repository unavailable.');
    }

    if (snapshot.stagedCount === 0) {
      throw new Error('Stage changes before creating a commit.');
    }

    const commitResult = await execGit(['commit', '-m', message], this.workspaceRoot);
    if (commitResult.exitCode !== 0) {
      throw new Error(commitResult.stderr.trim() || commitResult.stdout.trim() || 'Unable to create commit.');
    }

    const summaryResult = await execGit(['log', '-1', '--pretty=format:%H%n%h %s'], this.workspaceRoot);
    if (summaryResult.exitCode !== 0) {
      throw new Error(summaryResult.stderr.trim() || 'Commit was created, but its summary could not be loaded.');
    }

    const [hash = '', summary = message] = summaryResult.stdout.trim().split(/\r?\n/, 2);

    return {
      branch: await this.getCurrentBranchName(),
      hash,
      summary,
      createdAt: nowIso(),
    };
  }

  public async preparePullRequest(): Promise<GitPullRequestPrep> {
    const snapshot = await this.getReviewSnapshot();
    if (!snapshot.available) {
      throw new Error('Git repository unavailable.');
    }

    const commitDraft = buildCommitDraftFromSnapshot(snapshot);
    const range = snapshot.upstream ? `${snapshot.upstream}..HEAD` : null;
    const commitLogResult = await execGit(
      range ? ['log', '--pretty=format:%h %s', range] : ['log', '-5', '--pretty=format:%h %s'],
      this.workspaceRoot,
    );
    const diffStatResult = await execGit(
      range ? ['diff', '--stat', `${snapshot.upstream}...HEAD`] : ['diff', '--stat'],
      this.workspaceRoot,
    );
    const commitSummaries =
      commitLogResult.exitCode === 0
        ? commitLogResult.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        : [];
    const diffStat = diffStatResult.exitCode === 0 ? diffStatResult.stdout.trim() || 'No diff stat available.' : 'No diff stat available.';

    return buildPullRequestPrep({
      snapshot,
      commitDraft,
      commitSummaries,
      diffStat,
      warning: snapshot.upstream ? undefined : 'No upstream branch is configured yet. This draft is based on the current local branch and working tree.',
    });
  }

  public async reviewChanges(): Promise<GitCodeReviewResult> {
    const snapshot = await this.getReviewSnapshot();
    if (!snapshot.available) {
      throw new Error('Git repository unavailable.');
    }

    const reviewedFiles = getRelevantFiles(snapshot);
    const reviewedDiffs = await Promise.all(
      reviewedFiles.map(async (file) => {
        const diffParts: string[] = [];
        if (file.staged) {
          const stagedDiff = await this.getDiff({
            path: file.path,
            staged: true,
          });
          if (stagedDiff.diff.trim()) {
            diffParts.push(stagedDiff.diff);
          }
        }
        if (file.unstaged) {
          const unstagedDiff = await this.getDiff({
            path: file.path,
            staged: false,
          });
          if (unstagedDiff.diff.trim()) {
            diffParts.push(unstagedDiff.diff);
          }
        }

        const diff = diffParts.join('\n');
        return {
          path: file.path,
          diff,
          startLine: getFirstChangedLine(diff),
        };
      }),
    );

    return buildCodeReviewFromSnapshot({
      snapshot,
      reviewedDiffs,
    });
  }

  private async getCurrentBranchName(): Promise<string | null> {
    const branchResult = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], this.workspaceRoot);
    if (branchResult.exitCode !== 0) {
      return null;
    }

    const branch = branchResult.stdout.trim();
    if (!branch || branch === 'HEAD') {
      return '(detached)';
    }

    return branch;
  }
}
