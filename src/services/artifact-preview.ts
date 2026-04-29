import { transform } from 'sucrase';
import type { ArtifactRecord } from '../../shared/contracts';

const previewCsp =
  "default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; img-src data: https: http:; media-src data: https: http:; font-src data: https: http:; connect-src https: http:; style-src 'unsafe-inline' https: http:; script-src 'unsafe-inline' 'unsafe-eval' https: http:; frame-src https: http:;";
export const ARTIFACT_PREVIEW_MESSAGE_SOURCE = 'codexapp-artifact-preview';
const MAX_SNAPSHOT_TEXT_LENGTH = 5_000;

export type ArtifactPreviewIssueSeverity = 'info' | 'warning' | 'blocked';

export type ArtifactPreviewGuardrailIssue = {
  id: string;
  severity: ArtifactPreviewIssueSeverity;
  message: string;
  evidence?: string;
};

export type ArtifactPreviewValidation = {
  canPreview: boolean;
  cspApplied: boolean;
  instrumentationInjected: boolean;
  externalResourceCount: number;
  issues: ArtifactPreviewGuardrailIssue[];
};

export type ArtifactPreviewSnapshot = {
  title: string;
  url: string;
  bodyText: string;
  bodyTextTruncated: boolean;
  headings: string[];
  landmarks: string[];
  elements: {
    total: number;
    buttons: number;
    links: number;
    forms: number;
    inputs: number;
    scripts: number;
    images: number;
    iframes: number;
  };
};

export type ArtifactPreviewRuntimeEvent =
  | {
      source: typeof ARTIFACT_PREVIEW_MESSAGE_SOURCE;
      type: 'preview.ready';
      emittedAt: string;
      snapshot: ArtifactPreviewSnapshot;
    }
  | {
      source: typeof ARTIFACT_PREVIEW_MESSAGE_SOURCE;
      type: 'preview.error';
      emittedAt: string;
      message: string;
      stack?: string;
    }
  | {
      source: typeof ARTIFACT_PREVIEW_MESSAGE_SOURCE;
      type: 'preview.navigation-blocked';
      emittedAt: string;
      href: string;
      label: string;
    }
  | {
      source: typeof ARTIFACT_PREVIEW_MESSAGE_SOURCE;
      type: 'preview.form-blocked';
      emittedAt: string;
      action: string;
      method: string;
    };

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

const escapeAttribute = escapeHtml;

const previewCspMeta = (): string =>
  `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(previewCsp)}" />`;

const previewInstrumentationScript = (): string => `<script>
(() => {
  const SOURCE = ${JSON.stringify(ARTIFACT_PREVIEW_MESSAGE_SOURCE)};
  const MAX_TEXT = ${MAX_SNAPSHOT_TEXT_LENGTH};
  const post = (payload) => {
    try {
      window.parent?.postMessage({ source: SOURCE, emittedAt: new Date().toISOString(), ...payload }, '*');
    } catch {
      // Preview telemetry must never break the rendered artifact.
    }
  };
  const count = (selector) => document.querySelectorAll(selector).length;
  const clippedTexts = (selector) =>
    Array.from(document.querySelectorAll(selector))
      .map((element) => (element.textContent || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 12);
  const snapshot = () => {
    const bodyText = (document.body?.innerText || '').replace(/\\s+$/g, '');
    return {
      title: document.title || '',
      url: window.location.href,
      bodyText: bodyText.slice(0, MAX_TEXT),
      bodyTextTruncated: bodyText.length > MAX_TEXT,
      headings: clippedTexts('h1,h2,h3'),
      landmarks: clippedTexts('[aria-label],header,nav,main,footer,section[aria-labelledby]'),
      elements: {
        total: count('*'),
        buttons: count('button,[role="button"]'),
        links: count('a[href]'),
        forms: count('form'),
        inputs: count('input,textarea,select'),
        scripts: count('script'),
        images: count('img'),
        iframes: count('iframe')
      }
    };
  };
  const emitReady = () => post({ type: 'preview.ready', snapshot: snapshot() });
  window.addEventListener('error', (event) => {
    post({
      type: 'preview.error',
      message: event.message || 'Preview script error.',
      stack: event.error?.stack
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    post({
      type: 'preview.error',
      message: reason instanceof Error ? reason.message : String(reason || 'Unhandled preview promise rejection.'),
      stack: reason instanceof Error ? reason.stack : undefined
    });
  });
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest('a[href]');
    if (!anchor) {
      return;
    }
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    post({
      type: 'preview.navigation-blocked',
      href: anchor.href || href,
      label: (anchor.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160)
    });
  }, true);
  document.addEventListener('submit', (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    event.preventDefault();
    event.stopPropagation();
    post({
      type: 'preview.form-blocked',
      action: form?.action || '',
      method: form?.method || 'get'
    });
  }, true);
  const emitAfterRender = () => {
    emitReady();
    window.setTimeout(emitReady, 250);
    window.setTimeout(emitReady, 1_000);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', emitAfterRender, { once: true });
  } else {
    emitAfterRender();
  }
})();
</script>`;

const hasFullHtmlDocument = (content: string): boolean => /<!doctype/i.test(content) || /<html[\s>]/i.test(content);

const injectIntoHead = (html: string, markup: string): string => {
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n    ${markup}`);
  }

  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1>\n  <head>\n    ${markup}\n  </head>`);
  }

  return `${markup}\n${html}`;
};

const injectBeforeBodyEnd = (html: string, markup: string): string => {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `  ${markup}\n  </body>`);
  }

  return `${html}\n${markup}`;
};

const instrumentHtmlDocument = (html: string): string =>
  injectBeforeBodyEnd(injectIntoHead(html, previewCspMeta()), previewInstrumentationScript());

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
    ${previewCspMeta()}
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
    ${previewInstrumentationScript()}
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
<html lang="en"><head><meta charset="UTF-8" />${previewCspMeta()}<style>${previewStyle}</style></head><body><pre id="preview-error">${escapeHtml(message)}</pre>${previewInstrumentationScript()}</body></html>`;
  }
};

const buildHtmlDocument = (artifact: ArtifactRecord): string => {
  if (hasFullHtmlDocument(artifact.content)) {
    return instrumentHtmlDocument(artifact.content);
  }

  return instrumentHtmlDocument(`<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>${previewStyle}</style></head><body>${artifact.content}</body></html>`);
};

export const canPreviewArtifact = (artifact: ArtifactRecord | null): boolean =>
  Boolean(artifact && (artifact.type === 'html' || artifact.type === 'react'));

export const buildArtifactPreviewDocument = (artifact: ArtifactRecord | null): string => {
  if (!artifact) {
    return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />${previewCspMeta()}<style>${previewStyle}</style></head><body><pre id="preview-error">No artifact selected.</pre>${previewInstrumentationScript()}</body></html>`;
  }

  if (artifact.type === 'react') {
    return buildReactDocument(artifact);
  }

  if (artifact.type === 'html') {
    return buildHtmlDocument(artifact);
  }

  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />${previewCspMeta()}<style>${previewStyle}</style></head><body><pre id="preview-error">Preview is only available for HTML and React artifacts.</pre>${previewInstrumentationScript()}</body></html>`;
};

const attributeValues = (content: string, attribute: string): string[] =>
  [...content.matchAll(new RegExp(`\\s${attribute}\\s*=\\s*["']([^"']+)["']`, 'gi'))].map((match) => match[1] ?? '');

const tagAttributeValues = (content: string, tagName: string, attribute: string): string[] =>
  [...content.matchAll(new RegExp(`<${tagName}\\b[^>]*\\s${attribute}\\s*=\\s*["']([^"']+)["'][^>]*>`, 'gi'))].map(
    (match) => match[1] ?? '',
  );

const countMatches = (content: string, pattern: RegExp): number => [...content.matchAll(pattern)].length;

const isExternalUrl = (value: string): boolean => /^https?:\/\//i.test(value.trim()) || /^\/\//.test(value.trim());

export const validateArtifactPreview = (artifact: ArtifactRecord | null): ArtifactPreviewValidation => {
  if (!artifact) {
    return {
      canPreview: false,
      cspApplied: true,
      instrumentationInjected: true,
      externalResourceCount: 0,
      issues: [
        {
          id: 'preview.no-artifact',
          severity: 'info',
          message: 'No artifact is selected for preview.',
        },
      ],
    };
  }

  if (!canPreviewArtifact(artifact)) {
    return {
      canPreview: false,
      cspApplied: true,
      instrumentationInjected: true,
      externalResourceCount: 0,
      issues: [
        {
          id: 'preview.unsupported-type',
          severity: 'info',
          message: 'Preview is only available for HTML and React artifacts.',
          evidence: artifact.type,
        },
      ],
    };
  }

  const content = artifact.content;
  const urls = [
    ...attributeValues(content, 'src'),
    ...attributeValues(content, 'href'),
    ...attributeValues(content, 'action'),
  ];
  const externalUrls = urls.filter(isExternalUrl);
  const issues: ArtifactPreviewGuardrailIssue[] = [];

  if (externalUrls.length > 0) {
    issues.push({
      id: 'preview.external-resources',
      severity: 'warning',
      message: 'The preview references external resources. They stay inside the sandboxed preview frame.',
      evidence: externalUrls.slice(0, 4).join(', '),
    });
  }

  const externalScripts = tagAttributeValues(content, 'script', 'src').filter(isExternalUrl);
  if (externalScripts.length > 0 && /<script\b/i.test(content)) {
    issues.push({
      id: 'preview.external-scripts',
      severity: 'warning',
      message: 'External scripts are visible in validation so generated previews can be reviewed before use.',
      evidence: externalScripts.slice(0, 4).join(', '),
    });
  }

  if (/<form\b/i.test(content)) {
    issues.push({
      id: 'preview.forms-blocked',
      severity: 'blocked',
      message: 'Form submissions are blocked by the iframe sandbox and preview instrumentation.',
    });
  }

  if (/<iframe\b/i.test(content)) {
    issues.push({
      id: 'preview.nested-frames',
      severity: 'warning',
      message: 'Nested frames are allowed only inside the preview sandbox and should be reviewed carefully.',
    });
  }

  if (/\son[a-z]+\s*=/i.test(content)) {
    issues.push({
      id: 'preview.inline-handlers',
      severity: 'warning',
      message: 'Inline event handlers were detected. Runtime errors will be reported by preview validation.',
    });
  }

  if (/javascript\s*:/i.test(content)) {
    issues.push({
      id: 'preview.javascript-url-blocked',
      severity: 'blocked',
      message: 'javascript: URLs are treated as unsafe and are blocked by preview navigation guardrails.',
    });
  }

  if (/<meta\b[^>]+http-equiv\s*=\s*["']?refresh/i.test(content)) {
    issues.push({
      id: 'preview.meta-refresh-blocked',
      severity: 'blocked',
      message: 'Meta refresh navigation is unsafe for previews and is blocked by sandbox guardrails.',
    });
  }

  if (/<base\b/i.test(content)) {
    issues.push({
      id: 'preview.base-uri-blocked',
      severity: 'blocked',
      message: 'Base URL changes are blocked by the preview Content Security Policy.',
    });
  }

  const scriptCount = countMatches(content, /<script\b/gi);
  if (scriptCount === 0 && artifact.type === 'html') {
    issues.push({
      id: 'preview.static-dom',
      severity: 'info',
      message: 'This HTML preview is static. DOM extraction still runs after load.',
    });
  }

  return {
    canPreview: true,
    cspApplied: true,
    instrumentationInjected: true,
    externalResourceCount: externalUrls.length,
    issues,
  };
};

export const isArtifactPreviewRuntimeEvent = (value: unknown): value is ArtifactPreviewRuntimeEvent => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const event = value as Partial<ArtifactPreviewRuntimeEvent>;
  return (
    event.source === ARTIFACT_PREVIEW_MESSAGE_SOURCE &&
    (event.type === 'preview.ready' ||
      event.type === 'preview.error' ||
      event.type === 'preview.navigation-blocked' ||
      event.type === 'preview.form-blocked') &&
    typeof event.emittedAt === 'string'
  );
};
