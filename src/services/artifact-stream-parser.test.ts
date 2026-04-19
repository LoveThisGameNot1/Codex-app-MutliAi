import { describe, expect, it } from 'vitest';
import { ArtifactStreamParser } from './artifact-stream-parser';

type ParserEvent =
  | { type: 'text'; value: string }
  | { type: 'open'; id: string; title: string; artifactType: string; language: string }
  | { type: 'delta'; id: string; value: string }
  | { type: 'close'; id: string };

const collectEvents = (chunks: string[]): ParserEvent[] => {
  const events: ParserEvent[] = [];

  const parser = new ArtifactStreamParser({
    onText: (text) => {
      if (text) {
        events.push({ type: 'text', value: text });
      }
    },
    onArtifactOpen: (payload) => {
      events.push({
        type: 'open',
        id: payload.id,
        title: payload.title,
        artifactType: payload.type,
        language: payload.language,
      });
    },
    onArtifactDelta: (id, delta) => {
      if (delta) {
        events.push({ type: 'delta', id, value: delta });
      }
    },
    onArtifactClose: (id) => {
      events.push({ type: 'close', id });
    },
  });

  chunks.forEach((chunk) => parser.push(chunk));
  parser.finish();
  return events;
};

const joinText = (events: ParserEvent[]): string =>
  events
    .filter((event): event is Extract<ParserEvent, { type: 'text' }> => event.type === 'text')
    .map((event) => event.value)
    .join('');

const joinArtifactDelta = (events: ParserEvent[], artifactId: string): string =>
  events
    .filter(
      (event): event is Extract<ParserEvent, { type: 'delta' }> =>
        event.type === 'delta' && event.id === artifactId,
    )
    .map((event) => event.value)
    .join('');

describe('ArtifactStreamParser', () => {
  it('keeps plain text outside of artifacts', () => {
    const events = collectEvents(['Hello ', 'world']);

    expect(joinText(events)).toBe('Hello world');
  });

  it('extracts a complete artifact and preserves surrounding text', () => {
    const events = collectEvents([
      'Lead text <artifact type="react" title="Preview" language="tsx">',
      'export default function App() { return <div>Hi</div>; }',
      '</artifact> trailing text',
    ]);

    const openEvent = events.find((event): event is Extract<ParserEvent, { type: 'open' }> => event.type === 'open');
    expect(openEvent).toMatchObject({
      title: 'Preview',
      artifactType: 'react',
      language: 'tsx',
    });

    expect(joinText(events)).toBe('Lead text  trailing text');
    expect(joinArtifactDelta(events, openEvent!.id)).toBe(
      'export default function App() { return <div>Hi</div>; }',
    );
    expect(events.some((event) => event.type === 'close' && event.id === openEvent!.id)).toBe(true);
  });

  it('handles split opening and closing tags during streaming', () => {
    const events = collectEvents([
      'Start <arti',
      'fact type="html" title="Card" language="html"><div>',
      'Hi',
      '</div></art',
      'ifact> End',
    ]);

    const openEvent = events.find((event): event is Extract<ParserEvent, { type: 'open' }> => event.type === 'open');
    expect(openEvent).toMatchObject({ title: 'Card', artifactType: 'html', language: 'html' });
    expect(joinText(events)).toBe('Start  End');
    expect(joinArtifactDelta(events, openEvent!.id)).toBe('<div>Hi</div>');
  });

  it('flushes unfinished artifact content when the stream ends unexpectedly', () => {
    const events = collectEvents([
      '<artifact type="code" title="Config" language="json">',
      '{"name": "demo"',
    ]);

    const openEvent = events.find((event): event is Extract<ParserEvent, { type: 'open' }> => event.type === 'open');
    expect(openEvent).toMatchObject({ title: 'Config', artifactType: 'code', language: 'json' });
    expect(joinArtifactDelta(events, openEvent!.id)).toBe('{"name": "demo"');
    expect(events.some((event) => event.type === 'close' && event.id === openEvent!.id)).toBe(true);
  });
});