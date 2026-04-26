import { readFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const workspaceRoot = path.resolve(process.cwd(), '..', '..');
const readmePath = path.join(workspaceRoot, 'README.md');

const send = (payload) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

const readReadmeSummary = async () => {
  const content = await readFile(readmePath, 'utf8');
  const headings = content
    .split(/\r?\n/)
    .filter((line) => line.startsWith('#'))
    .slice(0, 20);

  return [
    `README path: ${readmePath}`,
    `Characters: ${content.length}`,
    `Headings: ${headings.length > 0 ? headings.join(' | ') : 'none found'}`,
  ].join('\n');
};

const tools = [
  {
    name: 'readme_summary',
    description: 'Summarize README size and top-level heading structure for documentation maintenance.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

const handleRequest = async (request) => {
  if (request.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'readme-maintainer',
        version: '0.1.0',
      },
    };
  }

  if (request.method === 'tools/list') {
    return { tools };
  }

  if (request.method === 'tools/call') {
    const name = request.params?.name;
    if (name !== 'readme_summary') {
      throw new Error(`Unknown tool: ${name || 'missing'}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: await readReadmeSummary(),
        },
      ],
    };
  }

  return {};
};

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Number.POSITIVE_INFINITY,
});

input.on('line', async (line) => {
  if (!line.trim()) {
    return;
  }

  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    send({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: error instanceof Error ? error.message : 'Invalid JSON.',
      },
    });
    return;
  }

  if (!request.id) {
    return;
  }

  try {
    send({
      jsonrpc: '2.0',
      id: request.id,
      result: await handleRequest(request),
    });
  } catch (error) {
    send({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : 'MCP tool failed.',
      },
    });
  }
});
