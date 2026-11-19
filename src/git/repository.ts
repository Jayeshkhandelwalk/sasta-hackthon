import { simpleGit } from 'simple-git';
import { createTwoFilesPatch } from 'diff';
import { lstat, readFile, readlink, realpath } from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';
import type { ChangeSet } from '../contracts.js';

const MAX_UNTRACKED_TEXT_BYTES = 1024 * 1024;

export async function findRepoRoot(cwd: string): Promise<string> {
  if (typeof cwd !== 'string' || cwd.trim() === '') {
    throw new Error('Working directory must be a non-empty path.');
  }

  const workingDirectory = resolve(cwd);
  const git = simpleGit(workingDirectory);

  let repositoryRoot: string;
  try {
    repositoryRoot = (await git.revparse(['--show-toplevel'])).trim();
  } catch (error) {
    const detail = getErrorMessage(error);
    if (/not a git repository|not a git work tree/i.test(detail)) {
      throw new Error(
        `No Git repository found from "${workingDirectory}". Run "git init" in the project folder or change to an existing repository.`,
      );
    }

    throw new Error(
      `Could not determine the Git repository root from "${workingDirectory}": ${detail}`,
    );
  }

  if (repositoryRoot === '' || !isAbsolute(repositoryRoot)) {
    throw new Error(
      `Git returned an invalid repository root for "${workingDirectory}": "${repositoryRoot}"`,
    );
  }

  return resolve(repositoryRoot);
}

/**
 * Collects tracked changes against HEAD (staged and unstaged) plus untracked
 * files. Ignored files are excluded by Git status.
 */
export async function getChangeSet(root: string): Promise<ChangeSet> {
  const repositoryRoot = await findRepoRoot(root);
  const git = simpleGit(repositoryRoot);
  const status = await readGitStatus(git, repositoryRoot);

  const changedFiles = new Set<string>();
  for (const file of status.files) {
    changedFiles.add(normalizeRepoPath(repositoryRoot, file.path));
  }
  for (const file of status.not_added) {
    changedFiles.add(normalizeRepoPath(repositoryRoot, file));
  }

  const sortedChangedFiles = [...changedFiles].sort();
  if (sortedChangedFiles.length === 0) {
    return { changedFiles: [], diff: '' };
  }

  let trackedDiff: string;
  try {
    const hasHead = await repositoryHasHead(git);
    if (hasHead) {
      trackedDiff = await git.diff(['--no-ext-diff', 'HEAD']);
    } else {
      const [stagedDiff, unstagedDiff] = await Promise.all([
        git.diff(['--no-ext-diff', '--cached']),
        git.diff(['--no-ext-diff']),
      ]);
      trackedDiff = [stagedDiff, unstagedDiff].filter(Boolean).join('\n');
    }
  } catch {
    throw new Error(
      `Unable to calculate the Git diff in "${repositoryRoot}". Verify Git status and repository permissions.`,
    );
  }

  const untrackedFiles = new Set(
    status.not_added.map((file) => normalizeRepoPath(repositoryRoot, file)),
  );
  const untrackedDiffs: string[] = [];
  for (const file of [...untrackedFiles].sort()) {
    untrackedDiffs.push(await createUntrackedFileDiff(repositoryRoot, file));
  }

  return {
    changedFiles: sortedChangedFiles,
    diff: [trackedDiff, ...untrackedDiffs].filter(Boolean).join('\n'),
  };
}

export async function getCommitChangeSet(
  root: string,
  commitRef: string,
): Promise<ChangeSet> {
  const repositoryRoot = await findRepoRoot(root);
  if (typeof commitRef !== 'string' || commitRef.trim() === '') {
    throw new Error('Commit reference must be a non-empty Git revision.');
  }

  const git = simpleGit(repositoryRoot);
  let commitHash: string;
  try {
    commitHash = (
      await git.raw([
        'rev-parse',
        '--verify',
        '--end-of-options',
        `${commitRef}^{commit}`,
      ])
    ).trim();
  } catch {
    throw new Error(`Could not resolve "${commitRef}" to a commit in this repository.`);
  }
  if (!/^[0-9a-f]{40,64}$/i.test(commitHash)) {
    throw new Error('Git returned an invalid commit identifier.');
  }

  let changedPathsOutput: string;
  let diff: string;
  try {
    [changedPathsOutput, diff] = await Promise.all([
      git.raw([
        'diff-tree',
        '--root',
        '--no-commit-id',
        '--name-only',
        '-r',
        '-z',
        '--no-renames',
        commitHash,
      ]),
      git.raw([
        'diff-tree',
        '--root',
        '--no-commit-id',
        '--no-ext-diff',
        '--no-renames',
        '-p',
        '-r',
        commitHash,
      ]),
    ]);
  } catch {
    throw new Error(`Unable to read the committed changes for "${commitHash}".`);
  }

  const changedFiles = [...new Set(
    changedPathsOutput
      .split('\0')
      .filter(Boolean)
      .map((file) => normalizeRepoPath(repositoryRoot, file)),
  )].sort();

  return { changedFiles, diff };
}

async function readGitStatus(git: ReturnType<typeof simpleGit>, repositoryRoot: string) {
  try {
    return await git.status(['--untracked-files=all']);
  } catch {
    throw new Error(`Unable to read Git status in "${repositoryRoot}".`);
  }
}

async function repositoryHasHead(git: ReturnType<typeof simpleGit>): Promise<boolean> {
  try {
    await git.revparse(['--verify', 'HEAD']);
    return true;
  } catch (error) {
    const message = getErrorMessage(error);
    if (/needed a single revision|unknown revision|ambiguous argument ['"]?HEAD/i.test(message)) {
      return false;
    }

    throw error;
  }
}

async function createUntrackedFileDiff(
  repositoryRoot: string,
  relativePath: string,
): Promise<string> {
  const absolutePath = resolve(repositoryRoot, relativePath);
  const repositoryRealPath = await realpath(repositoryRoot);
  const parentRealPath = await realpath(dirname(absolutePath));
  assertPathInsideRepository(repositoryRealPath, parentRealPath, relativePath);

  const fileInfo = await lstat(absolutePath);
  let contents: string;
  if (fileInfo.isSymbolicLink()) {
    contents = `${await readlink(absolutePath)}\n`;
  } else {
    if (!fileInfo.isFile()) {
      throw new Error(`Cannot create a text diff for non-file path "${relativePath}".`);
    }
    if (fileInfo.size > MAX_UNTRACKED_TEXT_BYTES) {
      throw new Error(
        `Untracked file "${relativePath}" exceeds the ${MAX_UNTRACKED_TEXT_BYTES}-byte diff limit.`,
      );
    }

    const buffer = await readFile(absolutePath);
    if (buffer.includes(0)) {
      return `Binary file "${relativePath}" is untracked; contents omitted from the text diff.`;
    }
    contents = buffer.toString('utf8');
  }

  return createTwoFilesPatch('/dev/null', `b/${relativePath}`, '', contents);
}

function normalizeRepoPath(repositoryRoot: string, filePath: string): string {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error('Git returned an empty changed-file path.');
  }

  const portablePath = filePath.replace(/\\/g, '/');
  if (isAbsolute(filePath) || win32.isAbsolute(filePath) || portablePath.startsWith('/')) {
    throw new Error('Git returned a changed-file path outside the repository.');
  }

  const absolutePath = resolve(repositoryRoot, portablePath);
  assertPathInsideRepository(repositoryRoot, absolutePath, portablePath);
  return relative(repositoryRoot, absolutePath).split(sep).join('/');
}

function assertPathInsideRepository(
  repositoryRoot: string,
  candidatePath: string,
  reportedPath: string,
): void {
  const relativePath = relative(repositoryRoot, candidatePath);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Changed-file path "${reportedPath}" is outside the repository.`);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}