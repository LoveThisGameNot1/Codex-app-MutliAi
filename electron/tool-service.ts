import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ToolPolicyConfig } from '../shared/contracts';
import { DEFAULT_TOOL_POLICY } from '../shared/tool-policy';
import { getReadPolicyViolation, getTerminalPolicyViolation, getWritePolicyViolation } from './tool-policy';

const MAX_FILE_BYTES = 1024 * 1024 * 2;
const MAX_RETURN_BYTES = 120 * 1024;

export type ToolContext = {
  workspaceRoot: string;
  signal?: AbortSignal;
  toolPolicy?: ToolPolicyConfig;
};

export type ReadFileArgs = {
  path: string;
};

export type WriteFileArgs = {
  path: string;
  content: string;
};

export type ExecuteTerminalArgs = {
  command: string;
  cwd?: string;
};

const truncateText = (value: string): string => {
  const size = Buffer.byteLength(value, 'utf8');
  if (size <= MAX_RETURN_BYTES) {
    return value;
  }

  const truncated = value.slice(0, MAX_RETURN_BYTES);
  return `${truncated}\n\n[truncated ${size - MAX_RETURN_BYTES} bytes]`;
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new Error('Tool execution was cancelled.');
  }
};

const resolveInputPath = (inputPath: string, workspaceRoot: string): string => {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    throw new Error('Path must not be empty.');
  }

  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(workspaceRoot, trimmed);
};

const getToolPolicy = (context: ToolContext): ToolPolicyConfig => context.toolPolicy ?? DEFAULT_TOOL_POLICY;

export const readFileTool = async (args: ReadFileArgs, context: ToolContext): Promise<string> => {
  throwIfAborted(context.signal);
  const targetPath = resolveInputPath(args.path, context.workspaceRoot);
  const violation = getReadPolicyViolation(getToolPolicy(context), targetPath, context.workspaceRoot);
  if (violation) {
    throw new Error(violation.message);
  }
  const stats = await fs.stat(targetPath);

  if (!stats.isFile()) {
    throw new Error(`Path is not a file: ${targetPath}`);
  }

  if (stats.size > MAX_FILE_BYTES) {
    throw new Error(`File is too large to read safely (${stats.size} bytes). Limit is ${MAX_FILE_BYTES} bytes.`);
  }

  const content = await fs.readFile(targetPath, 'utf8');
  throwIfAborted(context.signal);
  return JSON.stringify(
    {
      path: targetPath,
      size: stats.size,
      content: truncateText(content),
    },
    null,
    2,
  );
};

export const writeFileTool = async (args: WriteFileArgs, context: ToolContext): Promise<string> => {
  throwIfAborted(context.signal);
  const targetPath = resolveInputPath(args.path, context.workspaceRoot);
  const violation = getWritePolicyViolation(getToolPolicy(context), targetPath, context.workspaceRoot);
  if (violation) {
    throw new Error(violation.message);
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, args.content, 'utf8');
  throwIfAborted(context.signal);

  return JSON.stringify(
    {
      path: targetPath,
      bytesWritten: Buffer.byteLength(args.content, 'utf8'),
    },
    null,
    2,
  );
};

const getShell = (): string | undefined => {
  if (process.platform === 'win32') {
    return 'powershell.exe';
  }

  return process.env.SHELL || '/bin/bash';
};

const execCommand = async (
  command: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> =>
  new Promise((resolve) => {
    const child = exec(
      command,
      {
        cwd,
        shell: getShell(),
        timeout: 60_000,
        maxBuffer: 1024 * 1024 * 4,
        windowsHide: true,
        signal,
      },
      (error, stdout, stderr) => {
        if (error) {
          const commandError = error as NodeJS.ErrnoException & {
            code?: number | string;
          };

          resolve({
            stdout: truncateText(stdout.trim()),
            stderr: truncateText(
              signal?.aborted ? 'Command cancelled.' : (stderr.trim() || commandError.message),
            ),
            exitCode: typeof commandError.code === 'number' ? commandError.code : signal?.aborted ? 130 : -1,
          });
          return;
        }

        resolve({
          stdout: truncateText(stdout.trim()),
          stderr: truncateText(stderr.trim()),
          exitCode: 0,
        });
      },
    );

    signal?.addEventListener(
      'abort',
      () => {
        child.kill();
      },
      { once: true },
    );
  });

export const executeTerminalTool = async (
  args: ExecuteTerminalArgs,
  context: ToolContext,
): Promise<string> => {
  throwIfAborted(context.signal);
  const command = args.command.trim();
  if (!command) {
    throw new Error('Command must not be empty.');
  }

  const cwd = args.cwd ? resolveInputPath(args.cwd, context.workspaceRoot) : context.workspaceRoot;
  const violation = getTerminalPolicyViolation(getToolPolicy(context), command, cwd, context.workspaceRoot);
  if (violation) {
    throw new Error(violation.message);
  }
  const result = await execCommand(command, cwd, context.signal);

  return JSON.stringify(
    {
      cwd,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    },
    null,
    2,
  );
};
