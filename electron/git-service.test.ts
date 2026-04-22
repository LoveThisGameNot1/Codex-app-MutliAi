import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCommitDraftFromSnapshot, buildPullRequestPrep, GitService, parseGitStatusPorcelain, toSuggestedBranchName } from './git-service';

const execGit = async (cwd: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || stdout || String(error)));
          return;
        }

        resolve(stdout.trim());
      },
    );
  });

const tempDirs: string[] = [];

const createTempRepo = async (): Promise<string> => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), 'codexapp-git-service-'));
  tempDirs.push(repoPath);

  await execGit(repoPath, ['init', '--initial-branch=main']);
  await execGit(repoPath, ['config', 'user.name', 'Codex Test']);
  await execGit(repoPath, ['config', 'user.email', 'codex@example.com']);
  await writeFile(path.join(repoPath, 'README.md'), '# Test repo\n', 'utf8');
  await execGit(repoPath, ['add', 'README.md']);
  await execGit(repoPath, ['commit', '-m', 'Initial commit']);

  return repoPath;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe('parseGitStatusPorcelain', () => {
  it('parses branch metadata, staged files, and unstaged files', () => {
    const snapshot = parseGitStatusPorcelain(`# branch.oid abcdef
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -1
1 M. N... 100644 100644 100644 abcdef abcdef src/app.ts
1 .M N... 100644 100644 100644 abcdef abcdef src/store.ts
? src/new-file.ts
`);

    expect(snapshot.branch).toBe('main');
    expect(snapshot.upstream).toBe('origin/main');
    expect(snapshot.ahead).toBe(2);
    expect(snapshot.behind).toBe(1);
    expect(snapshot.stagedCount).toBe(1);
    expect(snapshot.unstagedCount).toBe(2);
    expect(snapshot.summary).toBe('1 staged | 2 unstaged');
    expect(snapshot.stagedFiles[0]).toMatchObject({
      path: 'src/app.ts',
      stagedKind: 'modified',
    });
    expect(snapshot.unstagedFiles.find((file) => file.path === 'src/store.ts')).toMatchObject({
      unstagedKind: 'modified',
    });
    expect(snapshot.unstagedFiles.find((file) => file.path === 'src/new-file.ts')).toMatchObject({
      unstagedKind: 'untracked',
    });
  });

  it('parses renames and conflicts', () => {
    const snapshot = parseGitStatusPorcelain(`# branch.oid abcdef
# branch.head feature/review
2 R. N... 100644 100644 100644 abcdef abcdef R100 src/new-name.ts	src/old-name.ts
u UU N... 100644 100644 100644 100644 abcdef abcdef abcdef conflicted.ts
`);

    expect(snapshot.stagedFiles.find((file) => file.path === 'src/new-name.ts')).toMatchObject({
      previousPath: 'src/old-name.ts',
      stagedKind: 'renamed',
    });
    expect(snapshot.conflictedCount).toBe(1);
    expect(snapshot.summary).toContain('1 conflicted');
  });
});

describe('git drafting helpers', () => {
  it('builds a commit draft from the current snapshot', () => {
    const draft = buildCommitDraftFromSnapshot({
      available: true,
      branch: 'feature/review',
      upstream: 'origin/feature/review',
      latestCommitSummary: 'abc123 Previous change',
      ahead: 1,
      behind: 0,
      stagedCount: 2,
      unstagedCount: 0,
      conflictedCount: 0,
      summary: '2 staged',
      stagedFiles: [
        { path: 'src/components/ReviewPanel.tsx', staged: true, unstaged: false, conflicted: false, stagedKind: 'modified' },
        { path: 'electron/git-service.ts', staged: true, unstaged: false, conflicted: false, stagedKind: 'added' },
      ],
      unstagedFiles: [],
      generatedAt: new Date().toISOString(),
    });

    expect(draft.message).toBe('Update src and electron workflows');
    expect(draft.summary).toContain('2 staged files');
  });

  it('creates a codex branch suggestion from a draft', () => {
    expect(toSuggestedBranchName('Update src and electron workflows')).toBe('codex/update-src-and-electron-workflows');
  });

  it('builds pull request prep markdown from review state', () => {
    const prep = buildPullRequestPrep({
      snapshot: {
        available: true,
        branch: 'feature/review',
        upstream: 'origin/feature/review',
        latestCommitSummary: 'abc123 Previous change',
        ahead: 1,
        behind: 0,
        stagedCount: 2,
        unstagedCount: 0,
        conflictedCount: 0,
        summary: '2 staged',
        stagedFiles: [
          { path: 'src/components/ReviewPanel.tsx', staged: true, unstaged: false, conflicted: false, stagedKind: 'modified' },
          { path: 'electron/git-service.ts', staged: true, unstaged: false, conflicted: false, stagedKind: 'added' },
        ],
        unstagedFiles: [],
        generatedAt: new Date().toISOString(),
      },
      commitDraft: {
        message: 'Update src and electron workflows',
        summary: 'Drafted from staged files.',
        generatedAt: new Date().toISOString(),
      },
      commitSummaries: ['1234567 Update review panel'],
      diffStat: ' src/components/ReviewPanel.tsx | 10 +++++++++-\n 1 file changed, 9 insertions(+), 1 deletion(-)',
    });

    expect(prep.suggestedTitle).toBe('Update src and electron workflows');
    expect(prep.suggestedBranchName).toBe('codex/update-src-and-electron-workflows');
    expect(prep.body).toContain('## Summary');
    expect(prep.body).toContain('## Testing');
  });
});

describe('GitService integrations', () => {
  it('creates or switches branches inside a repository', async () => {
    const repoPath = await createTempRepo();
    const service = new GitService(repoPath);

    const created = await service.createOrSwitchBranch({
      name: 'codex/review-center',
    });
    expect(created.branch).toBe('codex/review-center');
    expect(created.created).toBe(true);

    const switched = await service.createOrSwitchBranch({
      name: 'main',
    });
    expect(switched.branch).toBe('main');
    expect(switched.created).toBe(false);
  });

  it('creates a staged commit and returns its summary', async () => {
    const repoPath = await createTempRepo();
    const service = new GitService(repoPath);

    await writeFile(path.join(repoPath, 'README.md'), '# Test repo\n\nUpdated body.\n', 'utf8');
    await execGit(repoPath, ['add', 'README.md']);

    const result = await service.createCommit({
      message: 'Update README',
    });

    expect(result.summary).toContain('Update README');
    const fileContents = await readFile(path.join(repoPath, 'README.md'), 'utf8');
    expect(fileContents).toContain('Updated body.');
  });
});
