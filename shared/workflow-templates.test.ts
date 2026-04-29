import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_TEMPLATES,
  expandWorkflowCommand,
  expandWorkflowTemplate,
  formatWorkflowTemplateList,
  getWorkflowTemplate,
} from './workflow-templates';

describe('workflow templates', () => {
  it('expands dependency audit templates with a provided scope', () => {
    const prompt = expandWorkflowTemplate('dependency-audit', 'npm workspace packages');

    expect(prompt).toContain('Run a dependency audit for npm workspace packages.');
    expect(prompt).toContain('Inspect package manifests and lockfiles before changing anything.');
    expect(prompt).toContain('Do not upgrade dependencies unless the user or automation prompt explicitly asks for changes.');
  });

  it('falls back to a durable default scope when no scope is provided', () => {
    const prompt = expandWorkflowTemplate('release-prep', '   ');

    expect(prompt).toContain('Prepare release notes for the next release.');
  });

  it('resolves workflow command aliases', () => {
    const expansion = expandWorkflowCommand('/deps weekly dependency risk sweep');

    expect(expansion).toMatchObject({
      matched: true,
      command: 'deps',
      args: 'weekly dependency risk sweep',
    });
    expect(expansion?.matched && expansion.template.id).toBe('dependency-audit');
    expect(expansion?.matched && expansion.prompt).toContain('Run a dependency audit for weekly dependency risk sweep.');
  });

  it('leaves non-workflow slash commands unmatched', () => {
    expect(expandWorkflowCommand('/help')).toEqual({
      matched: false,
      command: 'help',
      args: '',
    });
    expect(expandWorkflowCommand('normal prompt')).toBeNull();
  });

  it('formats all workflow templates for user-facing help', () => {
    const help = formatWorkflowTemplateList();

    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    expect(getWorkflowTemplate('code-review').slashCommands).toContain('cr');
    expect(help).toContain('/dependency-audit Optional scope');
    expect(help).toContain('UI');
  });
});
