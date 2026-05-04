import { Suspense, lazy, useMemo } from 'react';
import { canPreviewArtifact } from '@/services/artifact-preview';
import { ArtifactPreviewFrame } from '@/components/ArtifactPreviewFrame';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/utils/cn';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

const languageMap: Record<string, string> = {
  tsx: 'typescript',
  ts: 'typescript',
  jsx: 'javascript',
  js: 'javascript',
  html: 'html',
  css: 'css',
  json: 'json',
  md: 'markdown',
};

export const ArtifactPanel = () => {
  const allArtifacts = useAppStore((state) => state.artifacts);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const activeArtifactId = useAppStore((state) => state.activeArtifactId);
  const setActiveArtifactId = useAppStore((state) => state.setActiveArtifactId);
  const artifactView = useAppStore((state) => state.artifactView);
  const setArtifactView = useAppStore((state) => state.setArtifactView);
  const activeTask = useAppStore((state) => state.workspaceTasks.find((task) => task.id === state.activeTaskId) ?? null);

  const artifacts = useMemo(
    () => allArtifacts.filter((artifact) => artifact.taskId === activeTaskId),
    [activeTaskId, allArtifacts],
  );
  const activeArtifact = artifacts.find((artifact) => artifact.id === activeArtifactId) ?? artifacts[0] ?? null;
  const previewEnabled = canPreviewArtifact(activeArtifact);

  return (
    <section className="glass-panel-strong flex min-h-0 flex-col overflow-hidden rounded-[32px] p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.32em] text-emerald-200/75">Artifact Studio</p>
          <h2 className="mt-2 truncate text-2xl font-semibold tracking-[-0.03em] text-white">
            {activeArtifact?.title || 'Output surface'}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
            {activeTask
              ? `Artifacts for ${activeTask.title} stream here as code or live preview.`
              : 'Generated code, HTML, and React previews will appear here.'}
          </p>
        </div>

        <div className="flex shrink-0 rounded-full border border-white/10 bg-black/20 p-1">
          <button
            type="button"
            onClick={() => setArtifactView('code')}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition',
              artifactView === 'code' ? 'bg-sky-300/15 text-sky-100' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            Code
          </button>
          <button
            type="button"
            disabled={!previewEnabled}
            onClick={() => setArtifactView('preview')}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition',
              artifactView === 'preview'
                ? 'bg-emerald-300/15 text-emerald-100'
                : previewEnabled
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'cursor-not-allowed text-slate-600',
            )}
          >
            Preview
          </button>
        </div>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {artifacts.length === 0 ? (
          <span className="rounded-full border border-dashed border-slate-700 px-4 py-2 text-sm text-slate-500">
            No artifacts yet
          </span>
        ) : null}

        {artifacts.map((artifact) => {
          const isActive = activeArtifact?.id === artifact.id;
          return (
            <button
              type="button"
              key={artifact.id}
              onClick={() => setActiveArtifactId(artifact.id)}
              className={cn(
                'min-w-[160px] rounded-2xl border px-3 py-2 text-left text-sm transition',
                isActive
                  ? 'border-sky-300/25 bg-sky-300/10 text-sky-100 shadow-glow'
                  : 'border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200',
              )}
            >
              <span className="block truncate font-medium">{artifact.title}</span>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.2em] text-inherit/75">
                {artifact.type} | {artifact.language}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#050912]/90">
        {!activeArtifact ? (
          <div className="grid h-full min-h-[420px] place-items-center p-8">
            <div className="max-w-md text-center">
              <p className="text-xs uppercase tracking-[0.32em] text-slate-500">Awaiting artifact</p>
              <h3 className="mt-4 text-2xl font-semibold text-slate-100">The canvas is ready.</h3>
              <p className="mt-3 text-sm leading-6 text-muted">
                Ask the agent for a UI preview or code block. Parsed artifact tags will land here automatically.
              </p>
            </div>
          </div>
        ) : artifactView === 'preview' && previewEnabled ? (
          <ArtifactPreviewFrame artifact={activeArtifact} />
        ) : (
          <Suspense
            fallback={
              <div className="grid h-full min-h-[540px] place-items-center text-sm text-slate-400">
                Loading editor...
              </div>
            }
          >
            <MonacoEditor
              height="100%"
              defaultLanguage="typescript"
              language={languageMap[activeArtifact.language] ?? 'plaintext'}
              value={activeArtifact.content}
              theme="vs-dark"
              options={{
                readOnly: true,
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                smoothScrolling: true,
                tabSize: 2,
                padding: { top: 20, bottom: 20 },
                renderLineHighlight: 'gutter',
              }}
            />
          </Suspense>
        )}
      </div>
    </section>
  );
};
