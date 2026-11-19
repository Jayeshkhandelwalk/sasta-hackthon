import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import type { AgentConfig, ChangeSet, UpdateContext } from '../contracts.js';

const MAX_SELECTED_FILES = 50;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_README_BYTES = 1024 * 1024;

const SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.conf',
  '.css',
  '.gradle',
  '.html',
  '.ini',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.properties',
  '.scss',
  '.toml',
  '.ts',
  '.tsx',
  '.xml',
  '.yaml',
  '.yml',
]);

const CONFIG_FILES = new Set([
  '.dockerignore',
  '.editorconfig',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  'docker-compose.yml',
  'dockerfile',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
]);

export async function collectContext(
  root: string,
  config: AgentConfig,
  changeSet: ChangeSet,
): Promise<UpdateContext> {
  if (!root || typeof root !== 'string') {
    throw new Error('Repository root must be a non-empty path.');
  }

  const repositoryRoot = await realRepositoryRoot(root);
  const readmePath = resolveSafeRepositoryPath(repositoryRoot, config.readmePath);
  const readmeText = await readTextFile(
    readmePath,
    relative(repositoryRoot, readmePath).split(sep).join('/'),
    MAX_README_BYTES,
    repositoryRoot,
  );

  const gitignore = await readIgnoreFile(repositoryRoot);
  const ignoreMatcher = createIgnoreMatcher(config.exclude, gitignore);
  const selectedFileContents: Record<string, string> = {};

  const changedFiles = normalizeChangedFiles(repositoryRoot, changeSet.changedFiles);
  const relevantFiles = changedFiles.filter((file) =>
    isRelevantChangedFile(file, config, ignoreMatcher),
  );

  if (relevantFiles.length > MAX_SELECTED_FILES) {
    throw new Error(
      `More than ${MAX_SELECTED_FILES} relevant changed files were found; narrow include/exclude settings.`,
    );
  }

  for (const file of relevantFiles) {
    if (isSecretPath(file)) {
      continue;
    }

    const absolutePath = resolveSafeRepositoryPath(repositoryRoot, file);
    try {
      await lstat(absolutePath);
    } catch (error) {
      if (getErrorCode(error) === 'ENOENT' && isDeletedInDiff(changeSet.diff, file)) {
        continue;
      }
      throw new Error(
        `Unable to collect required changed file "${file}": ${getErrorMessage(error)}`,
      );
    }

    let contents: string;
    try {
      contents = await readTextFile(
        absolutePath,
        file,
        MAX_FILE_BYTES,
        repositoryRoot,
      );
    } catch (error) {
      throw new Error(`Unable to collect required changed file "${file}": ${getErrorMessage(error)}`);
    }
    selectedFileContents[file] = contents;
  }

  return {
    repositoryRoot,
    readmeText,
    selectedFileContents,
    diff: changeSet.diff,
  };
}

export const collectProjectContext = collectContext;

async function realRepositoryRoot(root: string): Promise<string> {
  let absoluteRoot: string;
  try {
    absoluteRoot = await realpath(resolve(root));
  } catch (error) {
    throw new Error(`Unable to access repository root "${root}": ${getErrorMessage(error)}`);
  }

  try {
    const info = await lstat(absoluteRoot);
    if (!info.isDirectory()) {
      throw new Error(`Repository root is not a directory: "${absoluteRoot}"`);
    }
  } catch (error) {
    throw new Error(`Unable to verify repository root "${absoluteRoot}": ${getErrorMessage(error)}`);
  }
  return absoluteRoot;
}

async function readIgnoreFile(repositoryRoot: string): Promise<string> {
  try {
    return await readFile(join(repositoryRoot, '.gitignore'), 'utf8');
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      return '';
    }
    throw new Error(`Unable to read .gitignore: ${getErrorMessage(error)}`);
  }
}

function createIgnoreMatcher(excludes: string[], gitignore: string): Ignore {
  const matcher = ignore();
  if (gitignore.trim() !== '') {
    matcher.add(gitignore);
  }
  if (excludes.length > 0) {
    matcher.add(excludes);
  }
  matcher.add([
    '.git/',
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
  ]);
  return matcher;
}

function normalizeChangedFiles(
  repositoryRoot: string,
  changedFiles: string[],
): string[] {
  const normalized = new Set<string>();
  for (const file of changedFiles) {
    if (typeof file !== 'string' || file.trim() === '') {
      throw new Error('Changed file list contains an empty path.');
    }
    const portable = file.replace(/\\/g, '/');
    if (
      isAbsolute(file) ||
      win32.isAbsolute(file) ||
      portable.startsWith('/')
    ) {
      throw new Error(`Changed-file path "${file}" is outside the repository.`);
    }

    resolveSafeRepositoryPath(repositoryRoot, portable);
    normalized.add(portable.replace(/^\.\//, '').replace(/\/+/g, '/'));
  }
  return [...normalized].sort();
}

function isRelevantChangedFile(
  file: string,
  config: AgentConfig,
  ignoreMatcher: Ignore,
): boolean {
  if (isSecretPath(file) || ignoreMatcher.ignores(file)) {
    return false;
  }

  if (!matchesConfiguredInclude(file, config.include)) {
    return false;
  }

  const lowerFile = file.toLowerCase();
  const baseName = lowerFile.split('/').pop() ?? lowerFile;
  const extensionIndex = baseName.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? baseName.slice(extensionIndex) : '';

  return (
    SOURCE_EXTENSIONS.has(extension) ||
    CONFIG_FILES.has(baseName)
  );
}

function matchesConfiguredInclude(file: string, includes: string[]): boolean {
  if (includes.length === 0) {
    return true;
  }
  return includes.some((pattern) => globMatches(file, pattern));
}

function globMatches(file: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\?/g, '[^/]')
    .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<DOUBLESTAR>>>\//g, '(?:[^/]+/)*')
    .replace(/<<<DOUBLESTAR>>>/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(file);
}

function isSecretPath(file: string): boolean {
  const lower = file.toLowerCase();
  const base = lower.split('/').pop() ?? lower;
  return (
    base === '.env' ||
    base.startsWith('.env.') ||
    lower.includes('/.env') ||
    base.endsWith('.pem') ||
    base.endsWith('.key') ||
    base.endsWith('.p12') ||
    base.includes('credentials') ||
    base.includes('secret')
  );
}

function resolveSafeRepositoryPath(
  repositoryRoot: string,
  relativePath: string,
): string {
  if (
    typeof relativePath !== 'string' ||
    relativePath.trim() === '' ||
    isAbsolute(relativePath) ||
    win32.isAbsolute(relativePath)
  ) {
    throw new Error(`Path "${relativePath}" must be relative to the repository root.`);
  }

  const portable = relativePath.replace(/\\/g, '/');
  if (portable.includes('\0') || portable.split('/').includes('..')) {
    throw new Error(`Path "${relativePath}" is outside the repository.`);
  }

  const candidate = resolve(repositoryRoot, portable);
  const pathFromRoot = relative(repositoryRoot, candidate);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(`Path "${relativePath}" is outside the repository.`);
  }
  return candidate;
}

async function readTextFile(
  absolutePath: string,
  reportedPath: string,
  maxBytes: number,
  repositoryRoot: string,
): Promise<string> {
  let info;
  try {
    info = await lstat(absolutePath);
  } catch (error) {
    throw new Error(`Unable to access "${reportedPath}": ${getErrorMessage(error)}`);
  }

  if (info.isSymbolicLink()) {
    throw new Error(`Symbolic link "${reportedPath}" is not allowed.`);
  }
  if (!info.isFile()) {
    throw new Error(`Path "${reportedPath}" is not a regular file.`);
  }
  if (info.size > maxBytes) {
    throw new Error(
      `File "${reportedPath}" exceeds the ${maxBytes}-byte context limit.`,
    );
  }

  let resolvedPath: string;
  try {
    resolvedPath = await realpath(absolutePath);
  } catch (error) {
    throw new Error(`Unable to resolve "${reportedPath}": ${getErrorMessage(error)}`);
  }
  const pathFromRoot = relative(repositoryRoot, resolvedPath);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(`Path "${reportedPath}" resolves outside the repository.`);
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(absolutePath);
  } catch (error) {
    throw new Error(`Unable to read "${reportedPath}": ${getErrorMessage(error)}`);
  }
  if (buffer.includes(0)) {
    throw new Error(`File "${reportedPath}" appears to be binary.`);
  }
  return buffer.toString('utf8');
}

function isDeletedInDiff(diff: string, file: string): boolean {
  const escapedPath = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^--- a/${escapedPath}\\r?\\n\\+\\+\\+ /dev/null$`,
    'm',
  ).test(diff);
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