export type ParsedDiffLineKind = 'context' | 'added' | 'removed' | 'meta';

export type ParsedDiffLine = {
  id: string;
  kind: ParsedDiffLineKind;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
  anchorLineNumber: number | null;
};

const hunkPattern = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export const parseUnifiedDiffForComments = (diff: string): ParsedDiffLine[] => {
  const lines = diff.split(/\r?\n/);
  const parsed: ParsedDiffLine[] = [];
  let oldLineNumber = 0;
  let newLineNumber = 0;

  for (const [index, line] of lines.entries()) {
    const hunkMatch = line.match(hunkPattern);
    if (hunkMatch) {
      oldLineNumber = Number(hunkMatch[1]);
      newLineNumber = Number(hunkMatch[2]);
      parsed.push({
        id: `${index}:meta`,
        kind: 'meta',
        oldLineNumber: null,
        newLineNumber: null,
        content: line,
        anchorLineNumber: null,
      });
      continue;
    }

    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) {
      parsed.push({
        id: `${index}:meta`,
        kind: 'meta',
        oldLineNumber: null,
        newLineNumber: null,
        content: line,
        anchorLineNumber: null,
      });
      continue;
    }

    if (line.startsWith('+')) {
      const currentNewLine = newLineNumber;
      parsed.push({
        id: `${index}:added:${currentNewLine}`,
        kind: 'added',
        oldLineNumber: null,
        newLineNumber: currentNewLine,
        content: line,
        anchorLineNumber: currentNewLine,
      });
      newLineNumber += 1;
      continue;
    }

    if (line.startsWith('-')) {
      const currentOldLine = oldLineNumber;
      parsed.push({
        id: `${index}:removed:${currentOldLine}`,
        kind: 'removed',
        oldLineNumber: currentOldLine,
        newLineNumber: null,
        content: line,
        anchorLineNumber: currentOldLine,
      });
      oldLineNumber += 1;
      continue;
    }

    const currentOldLine = oldLineNumber;
    const currentNewLine = newLineNumber;
    parsed.push({
      id: `${index}:context:${currentNewLine}`,
      kind: 'context',
      oldLineNumber: currentOldLine || null,
      newLineNumber: currentNewLine || null,
      content: line,
      anchorLineNumber: currentNewLine || currentOldLine || null,
    });
    oldLineNumber += 1;
    newLineNumber += 1;
  }

  return parsed;
};
