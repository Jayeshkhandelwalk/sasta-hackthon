import { chmod, lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { simpleGit } from 'simple-git';
import { loadConfig } from '../config.js';
import { findRepoRoot } from '../git/repository.js';

const HOOK_NAME = 'post-commit';
const MANAGED_HOOK_MARKER = '# readme-agent-managed-hook:v1';

export interface HookOptions {
  nodeExecutable?: string;
  cliEntryPath?: string;
}

export async function installPostCommitHook(
  cwd: string,
  options: HookOptions = {},
): Promise<string> {
  const repositoryRoot = await findRepoRoot(cwd);
  await loadConfig(repositoryRoot);
  const hooksDirectory = await getHooksDirectory(repositoryRoot);
  await mkdir(hooksDirectory, { recursive: true });

  const hookPath = resolve(hooksDirectory, HOOK_NAME);
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const cliEntryPath = options.cliEntryPath ?? fileURLToPath(import.meta.url);
  const contents = createHookContents(nodeExecutable, cliEntryPath);

  try {
    const info = await lstat(hookPath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(
        `Cannot install post-commit hook: "${hookPath}" exists and is not a regular file. It was not changed.`,
      );
    }

    const existing = await readFile(hookPath, 'utf8');
    if (isManagedHook(existing)) {
      return hookPath;
    }
    throw new Error(
      `Cannot install post-commit hook: "${hookPath}" already exists. It was not overwritten; integrate readme-agent manually or move the existing hook yourself.`,
    );
  } catch (error) {
    if (getErrorCode(error) !== 'ENOENT') {
      throw error;
    }
  }

  try {
    await writeFile(hookPath, contents, { encoding: 'utf8', flag: 'wx', mode: 0o755 });
    await chmod(hookPath, 0o755);
  } catch (error) {
    if (getErrorCode(error) === 'EEXIST') {
      throw new Error(
        `Cannot install post-commit hook: "${hookPath}" appeared during installation; it was not overwritten.`,
      );
    }
    await unlink(hookPath).catch((cleanupError) => {
      if (getErrorCode(cleanupError) !== 'ENOENT') {
        throw new Error(
          `Unable to install hook and clean up "${hookPath}": ${getErrorMessage(error)}; ${getErrorMessage(cleanupError)}`,
        );
      }
    });
    throw new Error(`Unable to install post-commit hook: ${getErrorMessage(error)}`);
  }

  return hookPath;
}

export async function uninstallPostCommitHook(cwd: string): Promise<boolean> {
  const repositoryRoot = await findRepoRoot(cwd);
  const hooksDirectory = await getHooksDirectory(repositoryRoot);
  const hookPath = resolve(hooksDirectory, HOOK_NAME);

  let info;
  try {
    info = await lstat(hookPath);
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      return false;
    }
    throw new Error(`Unable to inspect post-commit hook: ${getErrorMessage(error)}`);
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(
      `Refusing to remove post-commit hook "${hookPath}" because it is not a regular file.`,
    );
  }

  let contents: string;
  try {
    contents = await readFile(hookPath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read post-commit hook: ${getErrorMessage(error)}`);
  }
  if (!isManagedHook(contents)) {
    throw new Error(
      `Refusing to remove "${hookPath}": it is not a readme-agent-managed hook.`,
    );
  }

  try {
    await unlink(hookPath);
  } catch (error) {
    throw new Error(`Unable to remove post-commit hook: ${getErrorMessage(error)}`);
  }
  return true;
}

export function createHookContents(nodeExecutable: string, cliEntryPath: string): string {
  if (
    !nodeExecutable.trim() ||
    !cliEntryPath.trim() ||
    !isAbsolute(nodeExecutable) ||
    !isAbsolute(cliEntryPath)
  ) {
    throw new Error('Hook requires absolute Node.js and readme-agent CLI paths.');
  }

  return [
    '#!/bin/sh',
    MANAGED_HOOK_MARKER,
    `exec ${quoteShellPath(nodeExecutable)} ${quoteShellPath(cliEntryPath)} update --commit HEAD`,
    '',
  ].join('\n');
}

function isManagedHook(contents: string): boolean {
  const lines = contents.replace(/\r\n/g, '\n').split('\n');
  return (
    lines.length === 4 &&
    lines[0] === '#!/bin/sh' &&
    lines[1] === MANAGED_HOOK_MARKER &&
    lines[2].startsWith('exec ') &&
    lines[2].endsWith(' update --commit HEAD') &&
    lines[3] === ''
  );
}

function quoteShellPath(path: string): string {
  const portablePath = path.replace(/\\/g, '/');
  return `'${portablePath.replace(/'/g, `'"'"'`)}'`;
}

async function getHooksDirectory(repositoryRoot: string): Promise<string> {
  const git = simpleGit(repositoryRoot);
  let gitHooksPath: string;
  let gitCommonDirectory: string;
  try {
    [gitHooksPath, gitCommonDirectory] = await Promise.all([
      git.raw(['rev-parse', '--git-path', 'hooks']),
      git.raw(['rev-parse', '--git-common-dir']),
    ]);
    gitHooksPath = gitHooksPath.trim();
    gitCommonDirectory = gitCommonDirectory.trim();
  } catch {
    throw new Error('Unable to find the Git hooks directory for this repository.');
  }
  if (!gitHooksPath) {
    throw new Error('Git returned an empty hooks directory path.');
  }

  const resolvedPath = resolve(repositoryRoot, gitHooksPath);
  const resolvedCommonDirectory = resolve(repositoryRoot, gitCommonDirectory);
  const pathFromGitDirectory = relative(resolvedCommonDirectory, resolvedPath);
  if (
    !isAbsolute(resolvedPath) ||
    pathFromGitDirectory === '..' ||
    pathFromGitDirectory.startsWith(`..${sep}`) ||
    isAbsolute(pathFromGitDirectory)
  ) {
    throw new Error('Git returned an invalid hooks directory path.');
  }
  return resolvedPath;
}

function getErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
