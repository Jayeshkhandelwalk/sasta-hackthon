import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findRepoRoot, getChangeSet } from '../src/git/repository.js';

describe('Git repository changes', () => {
  let temporaryRoot: string;
  let repositoryRoot: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'readme-agent-git-'));
    repositoryRoot = join(temporaryRoot, 'repository');
    await mkdir(repositoryRoot);
    git(repositoryRoot, 'init');
    git(repositoryRoot, 'config', 'user.name', 'Readme Agent Test');
    git(repositoryRoot, 'config', 'user.email', 'readme-agent@example.invalid');
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('finds the repository root from a nested directory', async () => {
    const nestedDirectory = join(repositoryRoot, 'src', 'nested');
    await mkdir(nestedDirectory, { recursive: true });

    await expect(findRepoRoot(nestedDirectory)).resolves.toBe(repositoryRoot);
  });

  it('explains how to proceed when the directory is not a Git repository', async () => {
    const nonRepository = join(temporaryRoot, 'not-a-repository');
    await mkdir(nonRepository);

    await expect(findRepoRoot(nonRepository)).rejects.toThrow(
      /No Git repository found.*git init/i,
    );
  });

  it('includes staged, unstaged, and untracked changes', async () => {
    await writeFile(join(repositoryRoot, 'staged.txt'), 'original staged content\n');
    await writeFile(join(repositoryRoot, 'unstaged.txt'), 'original unstaged content\n');
    git(repositoryRoot, 'add', 'staged.txt', 'unstaged.txt');
    git(repositoryRoot, 'commit', '-m', 'Add initial files');

    await writeFile(join(repositoryRoot, 'staged.txt'), 'staged change content\n');
    git(repositoryRoot, 'add', 'staged.txt');
    await writeFile(join(repositoryRoot, 'unstaged.txt'), 'unstaged change content\n');
    await writeFile(join(repositoryRoot, 'untracked.txt'), 'untracked file content\n');

    const changes = await getChangeSet(repositoryRoot);

    expect(changes.changedFiles).toEqual([
      'staged.txt',
      'unstaged.txt',
      'untracked.txt',
    ]);
    expect(changes.diff).toContain('staged change content');
    expect(changes.diff).toContain('unstaged change content');
    expect(changes.diff).toContain('untracked file content');
  });

  it('returns an empty change set when the working tree is clean', async () => {
    await writeFile(join(repositoryRoot, 'clean.txt'), 'committed content\n');
    git(repositoryRoot, 'add', 'clean.txt');
    git(repositoryRoot, 'commit', '-m', 'Add clean file');

    await expect(getChangeSet(repositoryRoot)).resolves.toEqual({
      changedFiles: [],
      diff: '',
    });
  });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}