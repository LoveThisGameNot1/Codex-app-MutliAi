import { describe, expect, it } from 'vitest';
import { parseUnifiedDiffForComments } from './git-review-comments';

describe('parseUnifiedDiffForComments', () => {
  it('anchors added, removed, and context lines to diff line numbers', () => {
    const parsed = parseUnifiedDiffForComments(`diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +10,4 @@
 const kept = true;
-const oldValue = 1;
+const newValue = 2;
+const added = true;
 export { kept };
`);

    const addedLine = parsed.find((line) => line.content === '+const newValue = 2;');
    const removedLine = parsed.find((line) => line.content === '-const oldValue = 1;');
    const contextLine = parsed.find((line) => line.content === ' export { kept };');

    expect(addedLine).toMatchObject({
      kind: 'added',
      newLineNumber: 11,
      anchorLineNumber: 11,
    });
    expect(removedLine).toMatchObject({
      kind: 'removed',
      oldLineNumber: 11,
      anchorLineNumber: 11,
    });
    expect(contextLine).toMatchObject({
      kind: 'context',
      oldLineNumber: 12,
      newLineNumber: 13,
      anchorLineNumber: 13,
    });
  });

  it('keeps diff metadata unanchored', () => {
    const parsed = parseUnifiedDiffForComments(`diff --git a/a.ts b/a.ts
index 111..222 100644
@@ -1 +1 @@
-old
+new`);

    expect(parsed.filter((line) => line.kind === 'meta').every((line) => line.anchorLineNumber === null)).toBe(true);
  });
});
