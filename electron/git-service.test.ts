import { describe, expect, it } from 'vitest';
import { parseGitStatusPorcelain } from './git-service';

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
