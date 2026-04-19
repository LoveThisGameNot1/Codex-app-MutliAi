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
      messages: [{ role: 'developer', content: 'system prompt' }, { role: 'user', content: 'Hello' }],
      updatedAt: '2026-04-19T12:00:00.000Z',
    });

    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('session-1');
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
