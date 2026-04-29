import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPreviewScreenshotFilename,
  PreviewCaptureService,
  sanitizeScreenshotTitle,
} from './preview-capture-service';

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-preview-capture-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('PreviewCaptureService', () => {
  it('sanitizes artifact titles for screenshot filenames', () => {
    expect(sanitizeScreenshotTitle('Unsafe: / Preview * Name?')).toBe('unsafe-preview-name');
    expect(sanitizeScreenshotTitle('   ')).toBe('artifact-preview');
  });

  it('creates deterministic PNG filenames with artifact id and timestamp', () => {
    expect(
      createPreviewScreenshotFilename(
        {
          artifactId: 'artifact-1234567890',
          title: 'Checkout Flow',
        },
        '2026-04-29T20:33:39.398Z',
      ),
    ).toBe('checkout-flow-artifact-123-2026-04-29T20-33-39-398Z.png');
  });

  it('captures the current app window into the screenshot directory', async () => {
    const screenshotsDir = await createTempDir();
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const service = new PreviewCaptureService(screenshotsDir, () =>
      ({
        isDestroyed: () => false,
        webContents: {
          capturePage: async () => ({
            getSize: () => ({ width: 1280, height: 720 }),
            toPNG: () => pngBytes,
          }),
        },
      }) as never,
    );

    const result = await service.capture({
      artifactId: 'artifact-abcdef',
      title: 'Preview Capture',
    });
    const saved = await fs.readFile(result.path);

    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(result.bytes).toBe(pngBytes.byteLength);
    expect(path.dirname(result.path)).toBe(screenshotsDir);
    expect(saved).toEqual(pngBytes);
  });

  it('fails clearly when no app window is available', async () => {
    const service = new PreviewCaptureService(await createTempDir(), () => null);

    await expect(
      service.capture({
        artifactId: 'artifact-1',
        title: 'Missing window',
      }),
    ).rejects.toThrow('Cannot capture preview screenshot because the app window is not available.');
  });
});
