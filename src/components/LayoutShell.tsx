import { ChatPanel } from '@/components/ChatPanel';
import { ArtifactPanel } from '@/components/ArtifactPanel';
import { StatusBar } from '@/components/StatusBar';
import { WorkspaceSidebar } from '@/components/WorkspaceSidebar';

export const LayoutShell = () => {
  return (
    <div className="min-h-screen bg-app-gradient text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1880px] flex-col px-4 py-4 lg:px-6">
        <header className="mb-4 rounded-[28px] border border-white/10 bg-slate-900/70 px-5 py-4 shadow-panel backdrop-blur">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">AI Desktop Workspace</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">Chat, tools, automations, and artifacts</h1>
            </div>
            <StatusBar />
          </div>
        </header>

        <main className="grid flex-1 gap-4 xl:grid-cols-[280px_minmax(390px,0.36fr)_minmax(560px,0.64fr)]">
          <WorkspaceSidebar />
          <ChatPanel />
          <ArtifactPanel />
        </main>
      </div>
    </div>
  );
};
