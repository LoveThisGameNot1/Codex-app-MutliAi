import { execFile } from 'node:child_process';
import path from 'node:path';
import type {
  GitBranchResult,
  GitChangeKind,
  GitChangedFile,
  GitCommitDraft,
  GitCommitResult,
  GitCreateBranchInput,
  GitCreateCommitInput,
  GitDiffRequest,
  GitDiffResult,
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
