import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArtifactPreviewScreenshotResult, ArtifactRecord } from '../../shared/contracts';
import {
  ARTIFACT_PREVIEW_COMMAND_SOURCE,
  buildArtifactPreviewDocument,
  isArtifactPreviewRuntimeEvent,
  validateArtifactPreview,
  type ArtifactPreviewCommand,
  type ArtifactPreviewCommandAction,
  type ArtifactPreviewRuntimeEvent,
  type ArtifactPreviewSnapshot,
} from '@/services/artifact-preview';
import { captureArtifactPreview } from '@/services/electron-api';
import { cn } from '@/utils/cn';

type PreviewRuntimeState = {
  status: 'loading' | 'ready' | 'error';
  snapshot: ArtifactPreviewSnapshot | null;
  errors: Array<{ message: string; stack?: string; emittedAt: string }>;
  blockedActions: Array<{ label: string; detail: string; emittedAt: string }>;
  commandResults: Array<{ label: string; status: 'completed' | 'failed' | 'blocked'; detail: string; emittedAt: string }>;
};

const initialRuntimeState = (): PreviewRuntimeState => ({
  status: 'loading',
  snapshot: null,
  errors: [],
  blockedActions: [],
  commandResults: [],
});

const severityClass = {
  info: 'border-slate-500/20 bg-slate-500/10 text-slate-300',
  warning: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
  blocked: 'border-rose-300/20 bg-rose-300/10 text-rose-100',
};

const formatCount = (value: number): string => value.toLocaleString();

export const ArtifactPreviewFrame = ({ artifact }: { artifact: ArtifactRecord }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const commandCounter = useRef(0);
  const previewDocument = useMemo(() => buildArtifactPreviewDocument(artifact), [artifact]);
  const validation = useMemo(() => validateArtifactPreview(artifact), [artifact]);
  const [runtime, setRuntime] = useState<PreviewRuntimeState>(() => initialRuntimeState());
  const [screenshot, setScreenshot] = useState<
    | { status: 'idle' }
    | { status: 'capturing' }
    | { status: 'saved'; result: ArtifactPreviewScreenshotResult }
    | { status: 'failed'; message: string }
  >({ status: 'idle' });

  useEffect(() => {
    setRuntime(initialRuntimeState());

    const handleMessage = (event: MessageEvent<unknown>): void => {
      if (!isArtifactPreviewRuntimeEvent(event.data)) {
        return;
      }

      const previewEvent: ArtifactPreviewRuntimeEvent = event.data;
      setRuntime((current) => {
        if (previewEvent.type === 'preview.ready') {
          return {
            ...current,
            status: current.errors.length > 0 ? 'error' : 'ready',
            snapshot: previewEvent.snapshot,
          };
        }

        if (previewEvent.type === 'preview.error') {
          return {
            ...current,
            status: 'error',
            errors: [
              ...current.errors,
              {
                message: previewEvent.message,
                stack: previewEvent.stack,
                emittedAt: previewEvent.emittedAt,
              },
            ].slice(-5),
          };
        }

        if (previewEvent.type === 'preview.navigation-blocked') {
          return {
            ...current,
            blockedActions: [
              ...current.blockedActions,
              {
                label: 'Navigation blocked',
                detail: previewEvent.label ? `${previewEvent.label} -> ${previewEvent.href}` : previewEvent.href,
                emittedAt: previewEvent.emittedAt,
              },
            ].slice(-8),
          };
        }

        if (previewEvent.type === 'preview.command-result') {
          return {
            ...current,
            snapshot: previewEvent.snapshot ?? current.snapshot,
            commandResults: [
              ...current.commandResults,
              {
                label: previewEvent.action,
                status: previewEvent.status,
                detail: previewEvent.detail,
                emittedAt: previewEvent.emittedAt,
              },
            ].slice(-8),
          };
        }

        return {
          ...current,
          blockedActions: [
            ...current.blockedActions,
            {
              label: 'Form submit blocked',
              detail: `${previewEvent.method.toUpperCase()} ${previewEvent.action || '(no action)'}`,
              emittedAt: previewEvent.emittedAt,
            },
          ].slice(-8),
        };
      });
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [previewDocument]);

  const sendPreviewCommand = (
    action: ArtifactPreviewCommandAction,
    input: Omit<ArtifactPreviewCommand, 'source' | 'type' | 'commandId' | 'action'> = {},
  ): void => {
    const target = iframeRef.current?.contentWindow;
    if (!target) {
      setRuntime((current) => ({
        ...current,
        commandResults: [
          ...current.commandResults,
          {
            label: action,
            status: 'failed' as const,
            detail: 'Preview frame is not ready yet.',
            emittedAt: new Date().toISOString(),
          },
        ].slice(-8),
      }));
      return;
    }

    commandCounter.current += 1;
    target.postMessage(
      {
        source: ARTIFACT_PREVIEW_COMMAND_SOURCE,
        type: 'preview.command',
        commandId: `${artifact.id}:command:${commandCounter.current}`,
        action,
        ...input,
      } satisfies ArtifactPreviewCommand,
      '*',
    );
  };

  const captureScreenshot = async (): Promise<void> => {
    setScreenshot({ status: 'capturing' });
    try {
      const result = await captureArtifactPreview({
        artifactId: artifact.id,
        title: artifact.title,
      });
      setScreenshot({ status: 'saved', result });
    } catch (error) {
      setScreenshot({
        status: 'failed',
        message: error instanceof Error ? error.message : 'Failed to capture preview screenshot.',
      });
    }
  };

  const statusLabel =
    runtime.status === 'loading'
      ? 'Loading'
      : runtime.status === 'error'
        ? 'Runtime issue'
        : 'DOM ready';
  const snapshot = runtime.snapshot;

  return (
    <div className="flex h-full min-h-[540px] flex-col bg-slate-950">
      <div className="border-b border-white/10 bg-slate-950/95 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-200">
              Browser Validation
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Sandboxed iframe with CSP, DOM extraction, script-error capture, and blocked external actions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[11px] text-emerald-100">
              Sandbox
            </span>
            <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-[11px] text-sky-100">
              CSP
            </span>
            <span
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px]',
                runtime.status === 'error'
                  ? 'border-rose-300/20 bg-rose-300/10 text-rose-100'
                  : runtime.status === 'ready'
                    ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                    : 'border-slate-500/20 bg-slate-500/10 text-slate-300',
              )}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => sendPreviewCommand('extract-dom')}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
          >
            Refresh DOM
          </button>
          <button
            type="button"
            onClick={() => sendPreviewCommand('navigate', { href: '#codex-preview-smoke' })}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
          >
            Hash Navigate
          </button>
          <button
            type="button"
            onClick={() => sendPreviewCommand('click', { selector: 'button,[role="button"],a[href]' })}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
          >
            Click Smoke Test
          </button>
          <button
            type="button"
            onClick={() =>
              sendPreviewCommand('type', {
                selector: 'input,textarea,[contenteditable="true"]',
                value: 'CodexApp preview smoke test',
              })
            }
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
          >
            Type Smoke Test
          </button>
          <button
            type="button"
            disabled={screenshot.status === 'capturing'}
            onClick={() => void captureScreenshot()}
            className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
          >
            {screenshot.status === 'capturing' ? 'Capturing...' : 'Capture Screenshot'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {validation.issues.length === 0 ? (
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[11px] text-emerald-100">
              No static guardrail issues
            </span>
          ) : null}
          {validation.issues.map((issue) => (
            <span
              key={issue.id}
              title={issue.evidence}
              className={cn('rounded-full border px-2.5 py-1 text-[11px]', severityClass[issue.severity])}
            >
              {issue.severity}: {issue.message}
            </span>
          ))}
        </div>

        {snapshot ? (
          <div className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-4">
            <span>DOM nodes: {formatCount(snapshot.elements.total)}</span>
            <span>Buttons: {formatCount(snapshot.elements.buttons)}</span>
            <span>Links: {formatCount(snapshot.elements.links)}</span>
            <span>Forms: {formatCount(snapshot.elements.forms)}</span>
          </div>
        ) : null}

        {snapshot?.headings.length ? (
          <p className="mt-2 truncate text-xs text-slate-500">Headings: {snapshot.headings.join(' | ')}</p>
        ) : null}

        {runtime.blockedActions.length > 0 ? (
          <div className="mt-3 space-y-2">
            {runtime.blockedActions.map((action) => (
              <div
                key={`${action.emittedAt}:${action.detail}`}
                className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100"
              >
                {action.label}: {action.detail}
              </div>
            ))}
          </div>
        ) : null}

        {runtime.commandResults.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {runtime.commandResults.map((result) => (
              <span
                key={`${result.emittedAt}:${result.label}:${result.detail}`}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px]',
                  result.status === 'completed'
                    ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                    : result.status === 'blocked'
                      ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
                      : 'border-rose-300/20 bg-rose-300/10 text-rose-100',
                )}
              >
                {result.label}: {result.detail}
              </span>
            ))}
          </div>
        ) : null}

        {screenshot.status === 'saved' ? (
          <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100">
            Screenshot saved to {screenshot.result.path} ({formatCount(screenshot.result.width)}x
            {formatCount(screenshot.result.height)}, {formatCount(screenshot.result.bytes)} bytes).
          </div>
        ) : null}

        {screenshot.status === 'failed' ? (
          <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">
            Screenshot failed: {screenshot.message}
          </div>
        ) : null}

        {runtime.errors.length > 0 ? (
          <div className="mt-3 space-y-2">
            {runtime.errors.map((error) => (
              <details
                key={`${error.emittedAt}:${error.message}`}
                className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100"
              >
                <summary className="cursor-pointer">{error.message}</summary>
                {error.stack ? <pre className="mt-2 whitespace-pre-wrap text-rose-100/80">{error.stack}</pre> : null}
              </details>
            ))}
          </div>
        ) : null}
      </div>

      <iframe
        ref={iframeRef}
        title={artifact.title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={previewDocument}
        className="min-h-[420px] flex-1 border-0 bg-white"
      />
    </div>
  );
};
