import { Suspense, lazy } from 'react';
import { buildArtifactPreviewDocument, canPreviewArtifact } from '@/services/artifact-preview';
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
  const artifacts = useAppStore((state) => state.artifacts.filter((artifact) => artifact.taskId === state.activeTaskId));
  const activeArtifactId = useAppStore((state) => state.activeArtifactId);
  const setActiveArtifactId = useAppStore((state) => state.setActiveArtifactId);
  const artifactView = useAppStore((state) => state.artifactView);
  const setArtifactView = useAppStore((state) => state.setArtifactView);
  const activeTask = useAppStore((state) => state.workspaceTasks.find((task) => task.id === state.activeTaskId) ?? null);

  const activeArtifact = artifacts.find((artifact) => artifact.id === activeArtifactId) ?? artifacts[0] ?? null;
  const previewEnabled = canPreviewArtifact(activeArtifact);

  return (
    <section className="flex min-h-[600px] flex-col rounded-[32px] border border-white/10 bg-slate-950/75 p-5 shadow-panel backdrop-blur">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">Artifact Studio</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Interactive Output Surface</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Parsed artifacts for {activeTask ? `"${activeTask.title}"` : 'the current task'} are streamed here in parallel to the chat. Use code view for inspection and preview mode for HTML or React artifacts.
          </p>
        </div>

        <div className="flex gap-2 self-start rounded-full border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setArtifactView('code')}
            className={cn(
              'rounded-full px-4 py-2 text-sm transition',
              artifactView === 'code' ? 'bg-sky-400/20 text-sky-100' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            Code View
          </button>
          <button
            type="button"
            disabled={!previewEnabled}
            onClick={() => setArtifactView('preview')}
            className={cn(
              'rounded-full px-4 py-2 text-sm transition',
              artifactView === 'preview'
                ? 'bg-emerald-400/20 text-emerald-100'
                : previewEnabled
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'cursor-not-allowed text-slate-600',
            )}
          >
            Live Preview
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
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
                'rounded-full border px-4 py-2 text-left text-sm transition',
                isActive
                  ? 'border-sky-400/30 bg-sky-400/10 text-sky-100'
                  : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200',
              )}
            >
              <span className="block font-medium">{artifact.title}</span>
              <span className="mt-1 block text-[11px] uppercase tracking-[0.2em] text-inherit/80">
                {artifact.type} | {artifact.language}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-slate-900/70">
        {!activeArtifact ? (
          <div className="flex h-full min-h-[480px] items-center justify-center p-8">
            <div className="max-w-lg text-center">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Awaiting Artifact</p>
              <p className="mt-4 text-lg font-medium text-slate-200">
                When the assistant emits an artifact tag, the extracted content will stream into this panel.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                React artifacts render in a sandboxed iframe, while all artifacts remain inspectable in Monaco.
              </p>
            </div>
          </div>
        ) : artifactView === 'preview' && previewEnabled ? (
          <iframe
            title={activeArtifact.title}
            sandbox="allow-scripts"
            srcDoc={buildArtifactPreviewDocument(activeArtifact)}
            className="h-full min-h-[540px] w-full border-0 bg-white"
          />
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full min-h-[540px] items-center justify-center text-sm text-slate-400">
                Loading Monaco editor...
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
                padding: { top: 20 },
              }}
            />
          </Suspense>
        )}
      </div>
    </section>
  );
};
