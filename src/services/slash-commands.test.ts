import { describe, expect, it } from 'vitest';
import {
  createSlashCommandPrompt,
  formatSlashCommandHelp,
  getSlashCommandSuggestions,
  parseSlashCommand,
} from './slash-commands';

describe('slash command registry', () => {
  it('parses known commands and preserves arguments', () => {
    const invocation = parseSlashCommand('/code-review changed git files');

    expect(invocation).toMatchObject({
      matched: true,
      args: 'changed git files',
    });
    expect(invocation?.matched && invocation.command.id).toBe('code-review');
  });

  it('supports aliases', () => {
    const invocation = parseSlashCommand('/cr src/services');

    expect(invocation?.matched && invocation.command.id).toBe('code-review');
    expect(invocation?.matched && invocation.args).toBe('src/services');
  });

  it('returns null for normal chat prompts and incomplete slash input', () => {
    expect(parseSlashCommand('Build a React artifact')).toBeNull();
    expect(parseSlashCommand('/')).toBeNull();
  });

  it('returns an actionable error for unknown commands', () => {
    const invocation = parseSlashCommand('/unknown value');

    expect(invocation).toMatchObject({
      matched: false,
      token: 'unknown',
      error: 'Unknown slash command "/unknown". Type /help to see available commands.',
    });
  });

  it('suggests commands while the user types', () => {
    expect(getSlashCommandSuggestions('/pl').map((command) => command.id)).toEqual(['plugins']);
    expect(getSlashCommandSuggestions('/').length).toBeGreaterThan(4);
    expect(getSlashCommandSuggestions('/plugins now')).toEqual([]);
  });

  it('expands prompt-template commands into durable prompts', () => {
    const invocation = parseSlashCommand('/fix-tests npm run test');
    if (!invocation?.matched) {
      throw new Error('Expected matched command.');
    }

    expect(createSlashCommandPrompt(invocation.command, invocation.args)).toContain(
      'Diagnose and fix the failing tests for npm run test.',
    );
  });

  it('formats help with all major command groups', () => {
    const help = formatSlashCommandHelp();

    expect(help).toContain('**Session**');
    expect(help).toContain('**Navigation**');
    expect(help).toContain('**Workspace**');
    expect(help).toContain('**Agent workflows**');
    expect(help).toContain('`/code-review Optional scope`');
  });
});
