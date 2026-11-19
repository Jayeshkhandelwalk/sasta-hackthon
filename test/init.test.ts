import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultConfig, loadConfig } from '../src/config.js';
import { simpleGit } from 'simple-git';
import { runInit } from '../src/commands/init.js';

describe('repository configuration', () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await mkdtemp(join(tmpdir(), 'readme-agent-config-'));
  });

  afterEach(async () => {
    await rm(repositoryRoot, { recursive: true, force: true });
  });

  it('creates defaults and loads them from the repository root', async () => {
    const created = await createDefaultConfig(repositoryRoot);
    const loaded = await loadConfig(repositoryRoot);

    expect(loaded).toEqual(created);
    expect(await readFile(join(repositoryRoot, '.readme-agent.json'), 'utf8')).toContain(
      '"readmePath": "README.md"',
    );
  });

  it('reports malformed configuration JSON', async () => {
    await writeFile(join(repositoryRoot, '.readme-agent.json'), '{"readmePath":');

    await expect(loadConfig(repositoryRoot)).rejects.toThrow(/invalid JSON/i);
  });

  it('preserves existing settings when defaults are requested again', async () => {
    const existingConfig = {
      readmePath: 'docs/PROJECT.md',
      include: ['src/**'],
      exclude: ['build/**'],
      startMarker: '<!-- PROJECT-START -->',
      endMarker: '<!-- PROJECT-END -->',
      updateMode: 'manual',
    };
    const serializedConfig = `${JSON.stringify(existingConfig, null, 2)}\n`;
    const configPath = join(repositoryRoot, '.readme-agent.json');
    await writeFile(configPath, serializedConfig);

    const returnedConfig = await createDefaultConfig(repositoryRoot);

    expect(returnedConfig).toEqual(existingConfig);
    expect(await readFile(configPath, 'utf8')).toBe(serializedConfig);
  });

  it('rejects secret-bearing config fields', async () => {
    await writeFile(
      join(repositoryRoot, '.readme-agent.json'),
      `${JSON.stringify({
        readmePath: 'README.md',
        include: ['**/*'],
        exclude: [],
        startMarker: '<!-- README-AGENT:START -->',
        endMarker: '<!-- README-AGENT:END -->',
        updateMode: 'manual',
        apiKey: 'not-a-real-key',
      })}\n`,
    );

    await expect(loadConfig(repositoryRoot)).rejects.toThrow(
      /unsupported field "apiKey"; do not store secrets/i,
    );
  });

  it('accepts the Gemini provider and configured model', async () => {
    const config = {
      readmePath: 'README.md',
      include: ['**/*'],
      exclude: [],
      startMarker: '<!-- README-AGENT:START -->',
      endMarker: '<!-- README-AGENT:END -->',
      updateMode: 'manual',
      ai: {
        enabled: true,
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
      },
    };
    await writeFile(
      join(repositoryRoot, '.readme-agent.json'),
      `${JSON.stringify(config)}\n`,
    );

    await expect(loadConfig(repositoryRoot)).resolves.toMatchObject({
      ai: {
        enabled: true,
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
      },
    });
  });

  describe('readme-agent initialization', () => {
    let repositoryRoot: string;

    beforeEach(async () => {
      repositoryRoot = await mkdtemp(join(tmpdir(), 'readme-agent-init-'));
      await simpleGit(repositoryRoot).init();
    });

    afterEach(async () => {
      await rm(repositoryRoot, { recursive: true, force: true });
    });

    it('adds managed markers to an existing README', async () => {
      await writeFile(join(repositoryRoot, 'README.md'), '# Existing project\n');

      await runInit(repositoryRoot);

      const readme = await readFile(join(repositoryRoot, 'README.md'), 'utf8');
      expect(readme).toContain('# Existing project');
      expect(readme).toContain('<!-- README-AGENT:START -->');
      expect(readme).toContain('<!-- README-AGENT:END -->');
    });
  });

  it('rejects OpenAI provider settings with a migration hint', async () => {
    const config = {
      readmePath: 'README.md',
      include: ['**/*'],
      exclude: [],
      startMarker: '<!-- README-AGENT:START -->',
      endMarker: '<!-- README-AGENT:END -->',
      updateMode: 'manual',
      ai: { enabled: true, provider: 'openai' },
    };
    await writeFile(
      join(repositoryRoot, '.readme-agent.json'),
      `${JSON.stringify(config)}\n`,
    );

    await expect(loadConfig(repositoryRoot)).rejects.toThrow(
      /ai\.provider must be "gemini"/i,
    );
  });

  it('rejects README paths that escape the repository', async () => {
    await writeFile(
      join(repositoryRoot, '.readme-agent.json'),
      `${JSON.stringify({
        readmePath: '../README.md',
        include: ['**/*'],
        exclude: [],
        startMarker: '<!-- README-AGENT:START -->',
        endMarker: '<!-- README-AGENT:END -->',
        updateMode: 'manual',
      })}\n`,
    );

    await expect(loadConfig(repositoryRoot)).rejects.toThrow(
      /readmePath must not escape the repository/i,
    );
  });
});