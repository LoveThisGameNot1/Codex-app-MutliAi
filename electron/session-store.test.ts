import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionStore, toSessionSummary } from './session-store';

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-sessions-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('SessionStore', () => {
  it('persists and reloads stored sessions', async () => {
    const baseDir = await createTempDir();
    const store = new SessionStore(baseDir);

    await store.upsert({
      id: 'session-1',
      prompt: 'system prompt',
      providerId: 'openai',
      providerLabel: 'OpenAI',
      model: 'gpt-5.4',
      messages: [{ role: 'developer', content: 'system prompt' }, { role: 'user', content: 'Hello' }],
      updatedAt: '2026-04-19T12:00:00.000Z',
    });

    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('session-1');
    expect(loaded[0]?.providerId).toBe('openai');
    expect(loaded[0]?.providerLabel).toBe('OpenAI');
    expect(loaded[0]?.model).toBe('gpt-5.4');
    expect(loaded[0]?.messages).toHaveLength(2);
  });

  it('keeps the latest version when a session is updated', async () => {
    const baseDir = await createTempDir();
    const store = new SessionStore(baseDir);

    await store.upsert({
      id: 'session-1',
      prompt: 'first',
      messages: [{ role: 'developer', content: 'first' }],
      updatedAt: '2026-04-19T12:00:00.000Z',
    });

    await store.upsert({
      id: 'session-1',
      prompt: 'second',
      messages: [{ role: 'developer', content: 'second' }, { role: 'user', content: 'Ping' }],
      updatedAt: '2026-04-19T12:01:00.000Z',
    });

    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.prompt).toBe('second');
    expect(loaded[0]?.messages).toHaveLength(2);
  });

  it('deletes sessions cleanly', async () => {
    const baseDir = await createTempDir();
    const store = new SessionStore(baseDir);

    await store.upsert({
      id: 'session-1',
      prompt: 'prompt',
      messages: [{ role: 'developer', content: 'prompt' }],
      updatedAt: '2026-04-19T12:00:00.000Z',
    });

    await store.delete('session-1');
    const loaded = await store.loadAll();
    expect(loaded).toEqual([]);
  });

  it('imports sessions by merging newer records and skipping stale duplicates', async () => {
    const baseDir = await createTempDir();
    const store = new SessionStore(baseDir);

    await store.upsert({
      id: 'session-1',
      prompt: 'current prompt',
      messages: [{ role: 'developer', content: 'current prompt' }],
      updatedAt: '2026-04-19T12:00:00.000Z',
    });

    const result = await store.importSessions(
      [
        {
          id: 'session-1',
          prompt: 'stale prompt',
          messages: [{ role: 'developer', content: 'stale prompt' }],
          updatedAt: '2026-04-18T12:00:00.000Z',
        },
        {
          id: 'session-2',
          prompt: 'imported prompt',
          messages: [{ role: 'developer', content: 'imported prompt' }],
          updatedAt: '2026-04-20T12:00:00.000Z',
        },
      ],
      'merge',
    );

    const loaded = await store.loadAll();
    expect(result.importedSessions).toBe(1);
    expect(result.skippedSessions).toBe(1);
    expect(loaded).toHaveLength(2);
    expect(loaded.find((session) => session.id === 'session-1')?.prompt).toBe('current prompt');
    expect(loaded.find((session) => session.id === 'session-2')?.prompt).toBe('imported prompt');
  });

  it('can replace the stored session library from an import', async () => {
    const baseDir = await createTempDir();
    const store = new SessionStore(baseDir);

    await store.upsert({
      id: 'session-1',
      prompt: 'old prompt',
      messages: [{ role: 'developer', content: 'old prompt' }],
      updatedAt: '2026-04-19T12:00:00.000Z',
    });

    const result = await store.importSessions(
      [
        {
          id: 'session-2',
          prompt: 'replacement prompt',
          messages: [{ role: 'developer', content: 'replacement prompt' }],
          updatedAt: '2026-04-20T12:00:00.000Z',
        },
      ],
      'replace',
    );

    const loaded = await store.loadAll();
    expect(result.importedSessions).toBe(1);
    expect(result.totalSessions).toBe(1);
    expect(loaded.map((session) => session.id)).toEqual(['session-2']);
  });

  it('builds user-facing summaries from chat content', () => {
    const summary = toSessionSummary({
      id: 'session-1',
      prompt: 'system prompt fallback',
      updatedAt: '2026-04-19T12:00:00.000Z',
      messages: [
        { role: 'developer', content: 'system prompt fallback' },
        { role: 'user', content: 'Build a responsive dashboard for deployment metrics.' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Here is the dashboard artifact and the rollout checklist.' }],
        },
      ],
    });

    expect(summary.title).toBe('Build a responsive dashboard for deployment metrics.');
    expect(summary.preview).toBe('Here is the dashboard artifact and the rollout checklist.');
    expect(summary.messageCount).toBe(3);
    expect(summary.resumeSummary).toContain('Latest user: Build a responsive dashboard');
    expect(summary.resumeSummary).toContain('Latest assistant: Here is the dashboard artifact');
  });

  it('adds searchable provider, model, tool, and artifact metadata to summaries', () => {
    const summary = toSessionSummary({
      id: 'session-3',
      prompt: 'system prompt fallback',
      updatedAt: '2026-04-19T12:00:00.000Z',
      providerId: 'anthropic',
      providerLabel: 'Anthropic',
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'developer', content: 'system prompt fallback' },
        { role: 'user', content: 'Create a UI and write it to disk.' },
        {
          role: 'assistant',
          content:
            'I will write it.<artifact type="react" title="Panel" language="tsx">export const Panel = () => null;</artifact><artifact type="html" title="Preview" language="html"><div>Preview</div></artifact>',
        },
        {
          role: 'tool',
          tool_call_id: 'request-1:write_file:call-1',
          content: 'Wrote src/Panel.tsx',
        },
      ],
    });

    expect(summary.providerId).toBe('anthropic');
    expect(summary.providerLabel).toBe('Anthropic');
    expect(summary.model).toBe('claude-sonnet-4-5');
    expect(summary.toolNames).toEqual(['write_file']);
    expect(summary.artifactTypes).toEqual(['html', 'react']);
  });

  it('falls back to the persisted prompt when no user message exists', () => {
    const summary = toSessionSummary({
      id: 'session-2',
      prompt: 'Use the system instructions as the fallback summary.',
      updatedAt: '2026-04-19T12:00:00.000Z',
      messages: [{ role: 'developer', content: 'Use the system instructions as the fallback summary.' }],
    });

    expect(summary.title).toBe('Use the system instructions as the fallback summary.');
    expect(summary.preview).toBe('Use the system instructions as the fallback summary.');
  });
});
