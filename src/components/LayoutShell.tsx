import { ChatPanel } from '@/components/ChatPanel';
import { ArtifactPanel } from '@/components/ArtifactPanel';
import { StatusBar } from '@/components/StatusBar';

export const LayoutShell = () => {
  return (
    <div className="min-h-screen bg-app-gradient text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1880px] flex-col px-4 py-4 lg:px-6">
        <header className="mb-4 rounded-[32px] border border-white/10 bg-slate-900/70 px-6 py-5 shadow-panel backdrop-blur">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">AI Desktop Workspace</p>
              <h1 className="mt-2 text-3xl font-semibold text-white">Chat, Tools, Artifacts, and Automations</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                A Cursor-style Electron workspace with streaming LLM chat, a robust artifact parser, Monaco editing,
                sandboxed previews, direct file-system plus terminal tools, and recurring automations.
              </p>
            </div>
            <StatusBar />
          </div>
        </header>

        <main className="grid flex-1 gap-4 xl:grid-cols-[minmax(390px,0.38fr)_minmax(560px,0.62fr)]">
          <ChatPanel />
          <ArtifactPanel />
        </main>
      </div>
    </div>
  );
};
