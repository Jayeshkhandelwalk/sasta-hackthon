import { execFileSync } from 'node:child_process';
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createHookContents,
  installPostCommitHook,
  uninstallPostCommitHook,
} from '../src/commands/hook.js';

describe('optional post-commit hook', () => {
  let temporaryRoot: string | undefined;

  afterEach(async () => {
    if (temporaryRoot) {
      await rm(temporaryRoot, { recursive: true, force: true });
      temporaryRoot = undefined;
    }
  });

  it('installs an executable managed hook and removes only that hook', async () => {
    const repositoryRoot = await createRepository();
    const hookPath = await installPostCommitHook(repositoryRoot, {
      nodeExecutable: process.execPath,
      cliEntryPath: process.execPath,
    });

    expect(await readFile(hookPath, 'utf8')).toContain(
      'update --commit HEAD',
    );
    expect((await lstat(hookPath)).isFile()).toBe(true);
    expect(await installPostCommitHook(repositoryRoot, {
      nodeExecutable: process.execPath,
      cliEntryPath: process.execPath,
    })).toBe(hookPath);

    await expect(uninstallPostCommitHook(repositoryRoot)).resolves.toBe(true);
    await expect(uninstallPostCommitHook(repositoryRoot)).resolves.toBe(false);
  });

  it('does not overwrite an existing user hook', async () => {
    const repositoryRoot = await createRepository();
    const hooksDirectory = join(repositoryRoot, '.git', 'hooks');
    await mkdir(hooksDirectory, { recursive: true });
    const hookPath = join(hooksDirectory, 'post-commit');
    await writeFile(hookPath, '#!/bin/sh\necho user hook\n');

    await expect(
      installPostCommitHook(repositoryRoot, {
        nodeExecutable: process.execPath,
        cliEntryPath: process.execPath,
      }),
    ).rejects.toThrow(/already exists.*not overwritten/i);
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(
      '#!/bin/sh\necho user hook\n',
    );
  });

  it('rejects attempts to remove a user hook', async () => {
    const repositoryRoot = await createRepository();
    const hooksDirectory = join(repositoryRoot, '.git', 'hooks');
    await mkdir(hooksDirectory, { recursive: true });
    const hookPath = join(hooksDirectory, 'post-commit');
    await writeFile(hookPath, '#!/bin/sh\necho user hook\n');

    await expect(uninstallPostCommitHook(repositoryRoot)).rejects.toThrow(
      /not a readme-agent-managed hook/i,
    );
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(
      '#!/bin/sh\necho user hook\n',
    );
  });

  it('quotes executable paths in generated scripts', () => {
    const contents = createHookContents(
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Tools\\Readme Agent\\cli.js',
    );
    expect(contents).toContain("'C:/Program Files/nodejs/node.exe'");
    expect(contents).toContain("'C:/Tools/Readme Agent/cli.js'");
  });

  async function createRepository(): Promise<string> {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'readme-agent-hook-'));
    const repositoryRoot = join(temporaryRoot, 'repository');
    await mkdir(repositoryRoot);
    execFileSync('git', ['init'], { cwd: repositoryRoot, stdio: 'ignore' });
    execFileSync(
      'git',
      ['config', 'core.hooksPath', '.git/hooks'],
      { cwd: repositoryRoot, stdio: 'ignore' },
    );
    await writeFile(
      join(repositoryRoot, '.readme-agent.json'),
      `${JSON.stringify({
        readmePath: 'README.md',
        include: ['**/*'],
        exclude: [],
        startMarker: '<!-- README-AGENT:START -->',
        endMarker: '<!-- README-AGENT:END -->',
        updateMode: 'manual',
      })}\n`,
    );
    return repositoryRoot;
  }
});
