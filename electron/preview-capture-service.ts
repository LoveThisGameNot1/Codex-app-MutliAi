import type { BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactPreviewScreenshotResult, CaptureArtifactPreviewInput } from '../shared/contracts';

const nowIso = (): string => new Date().toISOString();

export const sanitizeScreenshotTitle = (title: string): string => {
  const normalized = title
    .trim()
    .replace(/[\u0000-\u001F<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return normalized.slice(0, 80) || 'artifact-preview';
};

export const createPreviewScreenshotFilename = (input: CaptureArtifactPreviewInput, capturedAt: string): string => {
  const timestamp = capturedAt.replace(/[:.]/g, '-');
  return `${sanitizeScreenshotTitle(input.title)}-${input.artifactId.slice(0, 12)}-${timestamp}.png`;
};

export class PreviewCaptureService {
  public constructor(
    private readonly screenshotsDir: string,
    private readonly getWindow: () => BrowserWindow | null,
  ) {}

  public async capture(input: CaptureArtifactPreviewInput): Promise<ArtifactPreviewScreenshotResult> {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) {
      throw new Error('Cannot capture preview screenshot because the app window is not available.');
    }

    const capturedAt = nowIso();
    const image = await window.webContents.capturePage();
    const size = image.getSize();
    const buffer = image.toPNG();
    const filename = createPreviewScreenshotFilename(input, capturedAt);
    const targetPath = path.join(this.screenshotsDir, filename);

    await fs.mkdir(this.screenshotsDir, { recursive: true });
    await fs.writeFile(targetPath, buffer);

    return {
      path: targetPath,
      width: size.width,
      height: size.height,
      bytes: buffer.byteLength,
      capturedAt,
    };
  }
}
