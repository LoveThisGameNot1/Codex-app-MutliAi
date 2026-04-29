import { describe, expect, it } from 'vitest';
import type { ArtifactRecord } from '../../shared/contracts';
import {
  ARTIFACT_PREVIEW_COMMAND_SOURCE,
  ARTIFACT_PREVIEW_MESSAGE_SOURCE,
  buildArtifactPreviewDocument,
  isArtifactPreviewRuntimeEvent,
  validateArtifactPreview,
} from './artifact-preview';

const createArtifact = (input: Partial<ArtifactRecord> & Pick<ArtifactRecord, 'type' | 'content'>): ArtifactRecord => ({
  id: input.id ?? 'artifact-1',
  taskId: input.taskId,
  type: input.type,
  title: input.title ?? 'Preview artifact',
  language: input.language ?? (input.type === 'react' ? 'tsx' : 'html'),
  content: input.content,
  status: input.status ?? 'complete',
  createdAt: input.createdAt ?? '2026-04-29T00:00:00.000Z',
  updatedAt: input.updatedAt ?? '2026-04-29T00:00:00.000Z',
  sourceMessageId: input.sourceMessageId ?? 'message-1',
});

describe('artifact preview browser validation', () => {
  it('injects CSP and runtime instrumentation into partial HTML previews', () => {
    const artifact = createArtifact({
      type: 'html',
      content: '<main><h1>Hello preview</h1><button>Run</button></main>',
    });
    const document = buildArtifactPreviewDocument(artifact);

    expect(document).toContain('Content-Security-Policy');
    expect(document).toContain("base-uri 'none'");
    expect(document).toContain("form-action 'none'");
    expect(document).toContain(ARTIFACT_PREVIEW_MESSAGE_SOURCE);
    expect(document).toContain(ARTIFACT_PREVIEW_COMMAND_SOURCE);
    expect(document).toContain('preview.ready');
    expect(document).toContain('preview.command-result');
  });

  it('preserves full HTML documents while adding guardrails', () => {
    const artifact = createArtifact({
      type: 'html',
      content: '<!doctype html><html><head><title>Custom</title></head><body><h1>Full doc</h1></body></html>',
    });
    const document = buildArtifactPreviewDocument(artifact);

    expect(document).toContain('<title>Custom</title>');
    expect(document).toContain('Content-Security-Policy');
    expect(document).toContain(ARTIFACT_PREVIEW_MESSAGE_SOURCE);
  });

  it('detects external resources and blocked browser actions before rendering', () => {
    const artifact = createArtifact({
      type: 'html',
      content: [
        '<script src="https://cdn.example.test/widget.js"></script>',
        '<a href="javascript:alert(1)">Unsafe link</a>',
        '<form action="https://example.test/pay" method="post"><button>Pay</button></form>',
        '<meta http-equiv="refresh" content="0; url=https://example.test">',
      ].join('\n'),
    });
    const validation = validateArtifactPreview(artifact);

    expect(validation.canPreview).toBe(true);
    expect(validation.cspApplied).toBe(true);
    expect(validation.instrumentationInjected).toBe(true);
    expect(validation.externalResourceCount).toBe(2);
    expect(validation.issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        'preview.external-resources',
        'preview.external-scripts',
        'preview.forms-blocked',
        'preview.javascript-url-blocked',
        'preview.meta-refresh-blocked',
      ]),
    );
  });

  it('builds React previews with the same browser instrumentation', () => {
    const artifact = createArtifact({
      type: 'react',
      content: 'export default function App() { return <button>Click</button>; }',
    });
    const document = buildArtifactPreviewDocument(artifact);

    expect(document).toContain('window.__artifactComponent');
    expect(document).toContain('react/jsx-runtime');
    expect(document).toContain(ARTIFACT_PREVIEW_MESSAGE_SOURCE);
  });

  it('validates runtime messages from the preview frame', () => {
    expect(
      isArtifactPreviewRuntimeEvent({
        source: ARTIFACT_PREVIEW_MESSAGE_SOURCE,
        type: 'preview.ready',
        emittedAt: '2026-04-29T00:00:00.000Z',
        snapshot: {
          title: '',
          url: 'about:srcdoc',
          bodyText: 'Ready',
          bodyTextTruncated: false,
          headings: [],
          landmarks: [],
          elements: {
            total: 1,
            buttons: 0,
            links: 0,
            forms: 0,
            inputs: 0,
            scripts: 1,
            images: 0,
            iframes: 0,
          },
        },
      }),
    ).toBe(true);
    expect(isArtifactPreviewRuntimeEvent({ source: 'other', type: 'preview.ready' })).toBe(false);
  });

  it('validates command-result messages from scripted preview interactions', () => {
    expect(
      isArtifactPreviewRuntimeEvent({
        source: ARTIFACT_PREVIEW_MESSAGE_SOURCE,
        type: 'preview.command-result',
        emittedAt: '2026-04-29T00:00:00.000Z',
        commandId: 'command-1',
        action: 'extract-dom',
        status: 'completed',
        detail: 'DOM snapshot extracted.',
      }),
    ).toBe(true);
  });
});
