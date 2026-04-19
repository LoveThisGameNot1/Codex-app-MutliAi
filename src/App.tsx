import { useEffect } from 'react';
import { LayoutShell } from '@/components/LayoutShell';
import { automationRuntime } from '@/services/automation-runtime';
import { chatRuntime } from '@/services/chat-runtime';
import { getConfig, getDesktopAppInfo } from '@/services/electron-api';
import { useAppStore } from '@/store/app-store';
import { DEFAULT_BASE_URL, DEFAULT_PROVIDER_ID, DEFAULT_SYSTEM_PROMPT } from '../shared/contracts';

const App = () => {
  const setAppInfo = useAppStore((state) => state.setAppInfo);
  const hydrateConfig = useAppStore((state) => state.hydrateConfig);

  useEffect(() => {
    chatRuntime.initialize();
    automationRuntime.initialize();

    void getDesktopAppInfo().then(setAppInfo).catch(() => {
      setAppInfo(null);
    });

    void getConfig().then(hydrateConfig).catch(() => {
      hydrateConfig({
        providerId: DEFAULT_PROVIDER_ID,
        baseUrl: DEFAULT_BASE_URL,
        apiKey: '',
        model: 'gpt-5.4',
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
      });
    });
  }, [hydrateConfig, setAppInfo]);

  return <LayoutShell />;
};

export default App;
