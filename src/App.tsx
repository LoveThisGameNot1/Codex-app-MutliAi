import { useEffect } from 'react';
import { LayoutShell } from '@/components/LayoutShell';
import { automationRuntime } from '@/services/automation-runtime';
import { chatRuntime } from '@/services/chat-runtime';
import { getConfig, getDesktopAppInfo } from '@/services/electron-api';
import { gitRuntime } from '@/services/git-runtime';
import { pluginRuntime } from '@/services/plugin-runtime';
import { useAppStore } from '@/store/app-store';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_PROVIDER_ID, DEFAULT_SYSTEM_PROMPT } from '../shared/contracts';
import { DEFAULT_TOOL_POLICY } from '../shared/tool-policy';

const App = () => {
  const setAppInfo = useAppStore((state) => state.setAppInfo);
  const hydrateConfig = useAppStore((state) => state.hydrateConfig);

  useEffect(() => {
    chatRuntime.initialize();
    automationRuntime.initialize();
    void gitRuntime.refreshReview();
    void pluginRuntime.refreshPlugins();

    void getDesktopAppInfo().then(setAppInfo).catch(() => {
      setAppInfo(null);
    });

    void getConfig().then(hydrateConfig).catch(() => {
      hydrateConfig({
        providerId: DEFAULT_PROVIDER_ID,
        baseUrl: DEFAULT_BASE_URL,
        apiKey: '',
        model: DEFAULT_MODEL,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        toolPolicy: DEFAULT_TOOL_POLICY,
      });
    });
  }, [hydrateConfig, setAppInfo]);

  return <LayoutShell />;
};

export default App;
