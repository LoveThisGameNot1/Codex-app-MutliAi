import { transform } from 'sucrase';
import type { ArtifactRecord } from '../../shared/contracts';

const previewCsp =
  "default-src 'none'; img-src data: https: http:; media-src data: https: http:; font-src data: https: http:; connect-src https: http:; style-src 'unsafe-inline' https: http:; script-src 'unsafe-inline' 'unsafe-eval' https: http:; frame-src https: http:;";

const previewStyle = `
  :root {
    color-scheme: dark;
    font-family: Inter, system-ui, sans-serif;
    background: #020617;
    color: #e2e8f0;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    min-height: 100%;
    background:
      radial-gradient(circle at top, rgba(56, 189, 248, 0.18), transparent 28%),
      linear-gradient(180deg, #020617 0%, #0f172a 100%);
  }

  body { padding: 24px; }
  #root { min-height: calc(100vh - 48px); }

  #preview-error {
    white-space: pre-wrap;
    border: 1px solid rgba(248, 113, 113, 0.35);
    background: rgba(127, 29, 29, 0.45);
    color: #fecaca;
    border-radius: 16px;
    padding: 16px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }
`;

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const detectDefaultExportSymbol = (source: string): { code: string; symbol: string } => {
  const functionMatch = source.match(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)/);
  if (functionMatch) {
    return {
      code: source.replace('export default function', 'function'),
      symbol: functionMatch[1],
    };
  }

  const classMatch = source.match(/export\s+default\s+class\s+([A-Za-z_$][\w$]*)/);
  if (classMatch) {
    return {
      code: source.replace('export default class', 'class'),
      symbol: classMatch[1],
    };
  }

  const identifierMatch = source.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/);
  if (identifierMatch) {
    return {
      code: source.replace(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/, ''),
      symbol: identifierMatch[1],
    };
  }

  return {
    code: `${source}\nconst __artifactDefaultExport = (typeof App !== 'undefined' ? App : typeof Artifact !== 'undefined' ? Artifact : null);`,
    symbol: '__artifactDefaultExport',
  };
};

const buildReactDocument = (artifact: ArtifactRecord): string => {
  try {
    const normalized = detectDefaultExportSymbol(artifact.content);
    const transpiled = transform(`${normalized.code}\nwindow.__artifactComponent = ${normalized.symbol};`, {
      transforms: ['typescript', 'jsx'],
      production: true,
      jsxRuntime: 'automatic',
    }).code;

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${previewCsp}" />
    <script async src="https://esm.sh/es-module-shims@1.10.0"></script>
    <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@19",
          "react/jsx-runtime": "https://esm.sh/react@19/jsx-runtime",
          "react-dom/client": "https://esm.sh/react-dom@19/client"
        }
      }
    </script>
    <style>${previewStyle}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      const showError = (value) => {
        const container = document.getElementById('root');
        container.innerHTML = '<pre id="preview-error"></pre>';
        const element = document.getElementById('preview-error');
        element.textContent = value;
      };

      try {
${transpiled}
        const React = await import('react');
        const { createRoot } = await import('react-dom/client');
        const Component = window.__artifactComponent;

        if (!Component) {
          throw new Error('No default export was found. Export a React component with export default.');
        }

        const root = createRoot(document.getElementById('root'));
        root.render(React.createElement(Component));
      } catch (error) {
        showError(error instanceof Error ? error.stack || error.message : String(error));
      }
    </script>
  </body>
</html>`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="${previewCsp}" /><style>${previewStyle}</style></head><body><pre id="preview-error">${escapeHtml(message)}</pre></body></html>`;
  }
};

const buildHtmlDocument = (artifact: ArtifactRecord): string => {
  if (/<!doctype/i.test(artifact.content) || /<html[\s>]/i.test(artifact.content)) {
    return artifact.content;
  }

  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta http-equiv="Content-Security-Policy" content="${previewCsp}" /><style>${previewStyle}</style></head><body>${artifact.content}</body></html>`;
};

export const canPreviewArtifact = (artifact: ArtifactRecord | null): boolean =>
  Boolean(artifact && (artifact.type === 'html' || artifact.type === 'react'));

export const buildArtifactPreviewDocument = (artifact: ArtifactRecord | null): string => {
  if (!artifact) {
    return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="${previewCsp}" /><style>${previewStyle}</style></head><body><pre id="preview-error">No artifact selected.</pre></body></html>`;
  }

  if (artifact.type === 'react') {
    return buildReactDocument(artifact);
  }

  if (artifact.type === 'html') {
    return buildHtmlDocument(artifact);
  }

  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="${previewCsp}" /><style>${previewStyle}</style></head><body><pre id="preview-error">Preview is only available for HTML and React artifacts.</pre></body></html>`;
};
