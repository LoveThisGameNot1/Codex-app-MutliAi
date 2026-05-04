import { ChatPanel } from '@/components/ChatPanel';
import { ArtifactPanel } from '@/components/ArtifactPanel';
import { StatusBar } from '@/components/StatusBar';
import { WorkspaceSidebar } from '@/components/WorkspaceSidebar';
import { useAppStore } from '@/store/app-store';

export const LayoutShell = () => {
  const workspaceSection = useAppStore((state) => state.workspaceSection);

  return (
    <div className="relative h-screen overflow-hidden bg-app-gradient text-slate-100">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-[-14rem] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-sky-400/12 blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-12rem] h-[36rem] w-[36rem] rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <div className="relative grid h-screen grid-rows-[72px_minmax(0,1fr)] gap-4 p-4">
        <header className="glass-panel flex items-center justify-between gap-5 rounded-[30px] px-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-sky-300/20 bg-sky-300/10 shadow-glow">
              <span className="text-lg font-semibold text-sky-100">C</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold uppercase tracking-[0.24em] text-sky-100/90">
                  CodexApp Multi APIs
                </p>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-100">
                  Local-first
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted">
                Clean agent workspace for chat, tools, automations, memory, and artifacts.
              </p>
            </div>
          </div>

          <StatusBar />
        </header>

        <main
          className={`grid min-h-0 gap-4 ${
            workspaceSection === 'chat'
              ? 'xl:grid-cols-[286px_minmax(560px,0.95fr)_minmax(460px,1.05fr)]'
              : 'xl:grid-cols-[286px_minmax(680px,1fr)_minmax(380px,0.52fr)]'
          }`}
        >
          <WorkspaceSidebar />
          <ChatPanel />
          <ArtifactPanel />
        </main>
      </div>
    </div>
  );
};
