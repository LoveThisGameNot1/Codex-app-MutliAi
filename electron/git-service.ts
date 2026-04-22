import { execFile } from 'node:child_process';
import type { GitChangeKind, GitChangedFile, GitDiffRequest, GitDiffResult, GitReviewSnapshot } from '../shared/contracts';

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
}
