import { describe, expect, it } from 'vitest';
import { hydratePersistedSession } from './session-hydrator';

describe('hydratePersistedSession', () => {
  it('rebuilds assistant text and artifacts from persisted messages', () => {
    const result = hydratePersistedSession({
      id: 'session-1',
      prompt: 'system prompt',
      updatedAt: '2026-04-19T12:00:00.000Z',
      messages: [
        { role: 'developer', content: 'system prompt' },
        { role: 'user', content: 'Build me something' },
        {
          role: 'assistant',
          content:
            'Here you go.<artifact type="react" title="Demo" language="tsx">export default function App() { return <div>Hello</div>; }</artifact>',
        },
      ],
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.role).toBe('user');
    expect(result.messages[1]?.role).toBe('assistant');
    expect(result.messages[1]?.content).toContain('Here you go.');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.title).toBe('Demo');
    expect(result.artifacts[0]?.content).toContain('export default function App()');
  });
});