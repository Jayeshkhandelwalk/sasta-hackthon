import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import ignore from 'ignore';
import { loadConfig } from '../config.js';
import type { AgentConfig } from '../contracts.js';
import { findRepoRoot } from '../git/repository.js';
import { runUpdate } from './update.js';

const DEFAULT_IGNORES = [
  '.git/',
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
];
const WATCHABLE_EXTENSIONS = new Set([
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
const WATCHABLE_CONFIGS = new Set([
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
]);

export interface WatchOptions {
  debounceMs?: number;
  findRepositoryRoot?: (cwd: string) => Promise<string>;
  loadRepositoryConfig?: (root: string) => Promise<AgentConfig>;
  watcherFactory?: (root: string, ignored: (path: string) => boolean) => FSWatcher;
  update?: (root: string) => Promise<void>;
  writeOutput?: (message: string) => void;
  writeError?: (message: string) => void;
  signal?: AbortSignal;
}

export async function runWatch(
  cwd: string,
  options: WatchOptions = {},
): Promise<void> {
  const findRoot = options.findRepositoryRoot ?? findRepoRoot;
  const loadConfigForRoot = options.loadRepositoryConfig ?? loadConfig;
  const root = await findRoot(cwd);
  const config = await loadConfigForRoot(root);
  const gitignore = await readGitignore(root);
  const matcher = ignore();
  if (gitignore.trim() !== '') {
    matcher.add(gitignore);
  }
  matcher.add(config.exclude);
  matcher.add(DEFAULT_IGNORES);

  const shouldIgnore = (path: string): boolean => {
    const relativePath = relative(root, resolve(path)).split(sep).join('/');
    if (
      relativePath === '..' ||
      relativePath.startsWith('../') ||
      isAbsolute(relativePath)
    ) {
      return true;
    }
    if (relativePath === '') {
      return false;
    }
    return (
      relativePath.toLowerCase() === config.readmePath.toLowerCase() ||
      isSecretPath(relativePath) ||
      matcher.ignores(relativePath)
    );
  };

  const createWatcher = options.watcherFactory ??
    ((repositoryRoot, ignored) =>
      chokidarWatch(repositoryRoot, {
        ignoreInitial: true,
        persistent: true,
        followSymlinks: false,
        ignored,
      }));
  const watcher = createWatcher(root, shouldIgnore);
  const update = options.update ?? runUpdate;
  const writeOutput = options.writeOutput ?? console.log;
  const writeError = options.writeError ?? console.error;
  const debounceMs = options.debounceMs ?? 800;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let updating = false;
  let pending = false;

  const runPendingUpdate = async (): Promise<void> => {
    if (updating) {
      pending = true;
      return;
    }

    updating = true;
    try {
      await update(root);
    } catch (error) {
      writeError(`Watch update failed: ${getErrorMessage(error)}`);
    } finally {
      updating = false;
      if (pending) {
        pending = false;
        scheduleUpdate();
      }
    }
  };

  const scheduleUpdate = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      void runPendingUpdate();
    }, debounceMs);
  };

  watcher.on('all', (event, changedPath) => {
    if (
      (event === 'add' || event === 'change' || event === 'unlink') &&
      isWatchablePath(root, changedPath, config) &&
      !shouldIgnore(changedPath)
    ) {
      scheduleUpdate();
    }
  });

  writeOutput(
    `Watching "${root}" for relevant changes. README and ignored/build paths are excluded. Press Ctrl+C to stop.`,
  );

  await new Promise<void>((resolvePromise, rejectPromise) => {
    let finished = false;
    const cleanUp = (): void => {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      options.signal?.removeEventListener('abort', stop);
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
    const finish = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      cleanUp();
      resolvePromise();
    };
    const stop = (): void => {
      void watcher.close().then(finish, (error) => {
        finished = true;
        cleanUp();
        rejectPromise(error);
      });
    };

    watcher.once('ready', () => {
      writeOutput('Watch mode is ready.');
    });
    watcher.once('close', finish);
    watcher.once('error', (error) => {
      if (!finished) {
        finished = true;
        cleanUp();
        void watcher.close().then(
          () => rejectPromise(error),
          () => rejectPromise(error),
        );
      }
    });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    if (options.signal?.aborted) {
      stop();
    } else {
      options.signal?.addEventListener('abort', stop, { once: true });
    }
  });
}

export function isWatchablePath(
  repositoryRoot: string,
  changedPath: string,
  config: AgentConfig,
): boolean {
  const relativePath = relative(repositoryRoot, resolve(repositoryRoot, changedPath))
    .split(sep)
    .join('/');
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    isAbsolute(relativePath)
  ) {
    return false;
  }

  const lower = relativePath.toLowerCase();
  const basename = lower.split('/').pop() ?? lower;
  if (
    lower === config.readmePath.toLowerCase() ||
    isSecretPath(relativePath) ||
    DEFAULT_IGNORES.some((entry) => lower === entry.slice(0, -1) || lower.startsWith(`${entry.slice(0, -1)}/`))
  ) {
    return false;
  }

  const extensionIndex = basename.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? basename.slice(extensionIndex) : '';
  if (!WATCHABLE_EXTENSIONS.has(extension) && !WATCHABLE_CONFIGS.has(basename)) {
    return false;
  }
  return matchesAnyPattern(relativePath, config.include);
}

function matchesAnyPattern(file: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return true;
  }
  return patterns.some((pattern) => {
    let normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
    const directoryPrefix = normalized.endsWith('/**');
    if (directoryPrefix) {
      normalized = normalized.slice(0, -3);
    }
    const expression = normalized
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\?/g, '[^/]')
      .replace(/\*\*\//g, '<<<DOUBLESTAR_DIR>>>')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<DOUBLESTAR_DIR>>>/g, '(?:.*/)?')
    if (directoryPrefix) {
      return new RegExp(`^${expression}(?:/.*)?$`, 'i').test(file);
    }
    return new RegExp(`^${expression}$`, 'i').test(file);
  });
}

function isSecretPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  const basename = lower.split('/').pop() ?? lower;
  return (
    basename === '.env' ||
    basename.startsWith('.env.') ||
    basename.endsWith('.pem') ||
    basename.endsWith('.key') ||
    basename.endsWith('.p12')
  );
}

async function readGitignore(root: string): Promise<string> {
  try {
    return await readFile(resolve(root, '.gitignore'), 'utf8');
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      return '';
    }
    throw new Error(`Unable to read .gitignore for watch mode: ${getErrorMessage(error)}`);
  }
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
