import path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const packageJson = require('./package.json') as {
  dependencies?: Record<string, string>;
};
const electronExternalPackages = Object.keys(packageJson.dependencies ?? {});
const electronExternalModules = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  ...electronExternalPackages,
]);
const isElectronExternal = (id: string): boolean =>
  [...electronExternalModules].some((moduleName) => id === moduleName || id.startsWith(`${moduleName}/`));
const electronPlugins = electron([
  {
    entry: 'electron/main.ts',
    vite: {
      build: {
        rollupOptions: {
          external: (id) => isElectronExternal(id),
        },
      },
    },
  },
  {
    entry: 'electron/preload.ts',
    onstart({ reload }) {
      reload();
    },
    vite: {
      build: {
        outDir: 'dist-electron',
        lib: {
          entry: path.join(__dirname, 'electron/preload.ts'),
          formats: ['es'],
          fileName: () => 'preload',
        },
        rollupOptions: {
          external: (id) => isElectronExternal(id),
          output: {
            entryFileNames: '[name].mjs',
            chunkFileNames: '[name].mjs',
            assetFileNames: '[name].[ext]',
            codeSplitting: false,
          } as any,
        },
      },
    },
  },
]);

export default defineConfig({
  plugins: [
    react(),
    ...electronPlugins,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/monaco-editor') || id.includes('node_modules/@monaco-editor')) {
            return 'monaco';
          }

          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/mdast') || id.includes('node_modules/micromark') || id.includes('node_modules/remark') || id.includes('node_modules/unified') || id.includes('node_modules/hast') || id.includes('node_modules/unist')) {
            return 'markdown';
          }

          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react-vendor';
          }

          if (id.includes('node_modules/zustand') || id.includes('node_modules/clsx') || id.includes('node_modules/sucrase')) {
            return 'app-vendor';
          }

          return undefined;
        },
      },
    },
  },
  clearScreen: false,
});
