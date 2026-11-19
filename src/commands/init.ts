import { confirm } from '@inquirer/prompts';
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { getDefaultConfig, loadConfig, saveConfig } from '../config.js';
import { findRepoRoot } from '../git/repository.js';
import type { AgentConfig } from '../contracts.js';

export async function runInit(cwd: string): Promise<void> {
  const repositoryRoot = await findRepoRoot(cwd);
  const configPath = join(repositoryRoot, '.readme-agent.json');
  const hasConfig = await isRegularFile(configPath, 'configuration');

  let config: AgentConfig;
  let shouldSaveConfig = !hasConfig;
  let overwriteConfig = false;

  if (!hasConfig) {
    config = getDefaultConfig();
  } else {
    let existingConfig: AgentConfig | undefined;
    let configLoadError: unknown;
    try {
      existingConfig = await loadConfig(repositoryRoot);
    } catch (error) {
      configLoadError = error;
    }

    if (configLoadError !== undefined) {
      const replace = await askForConfirmation(
        `The existing configuration could not be loaded (${getErrorMessage(configLoadError)}). Replace it with defaults?`,
      );
      if (!replace) {
        throw configLoadError;
      }
      config = getDefaultConfig();
      shouldSaveConfig = true;
      overwriteConfig = true;
    } else {
      const replace = await askForConfirmation(
        `Configuration already exists at "${configPath}". Replace its settings with defaults?`,
      );
      if (replace) {
        config = getDefaultConfig();
        shouldSaveConfig = true;
        overwriteConfig = true;
      } else {
        if (existingConfig === undefined) {
          throw new Error('Existing configuration did not load correctly.');
        }
        config = existingConfig;
      }
    }
  }

  const readmeExists = await existingReadme(repositoryRoot, config.readmePath);
  let shouldCreateReadme = false;
  if (!readmeExists) {
    const createReadme = await askForConfirmation(
      `README "${config.readmePath}" is missing. Create it with a project heading and an empty generated section between "${config.startMarker}" and "${config.endMarker}"?`,
    );
    if (!createReadme) {
      console.log('Initialization cancelled; no files were changed.');
      return;
    }
    shouldCreateReadme = true;
  }

  if (shouldSaveConfig) {
    await saveConfig(repositoryRoot, config, { overwrite: overwriteConfig });
  }
  if (shouldCreateReadme) {
    await createReadme(repositoryRoot, config);
  }

  console.log(`Initialized readme-agent in "${repositoryRoot}".`);
}

async function askForConfirmation(message: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`${message} Approval requires an interactive terminal.`);
  }
  return confirm({ message, default: false });
}

async function isRegularFile(filePath: string, label: string): Promise<boolean> {
  try {
    const fileInfo = await lstat(filePath);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
      throw new Error(`${label} path is not a regular file: "${filePath}"`);
    }
    return true;
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function existingReadme(repositoryRoot: string, readmePath: string): Promise<boolean> {
  const readmeFile = resolveReadmePath(repositoryRoot, readmePath);
  const repositoryRealPath = await realpath(repositoryRoot);
  let currentDirectory = repositoryRoot;
  const parentSegments = relative(repositoryRoot, dirname(readmeFile))
    .split(sep)
    .filter(Boolean);

  for (const segment of parentSegments) {
    currentDirectory = join(currentDirectory, segment);
    let directoryInfo;
    try {
      directoryInfo = await lstat(currentDirectory);
    } catch (error) {
      if (getErrorCode(error) === 'ENOENT') {
        return false;
      }
      throw error;
    }

    if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
      throw new Error(`README parent path is not a safe directory: "${currentDirectory}"`);
    }
    assertPathInsideRepository(repositoryRealPath, await realpath(currentDirectory));
  }

  try {
    const readmeInfo = await lstat(readmeFile);
    if (readmeInfo.isSymbolicLink() || !readmeInfo.isFile()) {
      throw new Error(`README path is not a regular file: "${readmeFile}"`);
    }
    return true;
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function createReadme(repositoryRoot: string, config: AgentConfig): Promise<void> {
  const readmeFile = resolveReadmePath(repositoryRoot, config.readmePath);
  const repositoryRealPath = await realpath(repositoryRoot);
  let currentDirectory = repositoryRoot;
  const parentSegments = relative(repositoryRoot, dirname(readmeFile))
    .split(sep)
    .filter(Boolean);

  for (const segment of parentSegments) {
    currentDirectory = join(currentDirectory, segment);
    try {
      await mkdir(currentDirectory);
    } catch (error) {
      if (getErrorCode(error) !== 'EEXIST') {
        throw new Error(
          `Unable to create README directory "${currentDirectory}": ${getErrorMessage(error)}`,
        );
      }
    }

    const directoryInfo = await lstat(currentDirectory);
    if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
      throw new Error(`README parent path is not a safe directory: "${currentDirectory}"`);
    }
    assertPathInsideRepository(repositoryRealPath, await realpath(currentDirectory));
  }

  const projectName = basename(repositoryRoot).replace(/[\r\n]/g, ' ').trim() || 'Project';
  const contents =
    `# ${projectName}\n\n${config.startMarker}\n\n${config.endMarker}\n`;
  try {
    await writeFile(readmeFile, contents, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (getErrorCode(error) === 'EEXIST') {
      throw new Error(`README "${config.readmePath}" appeared during initialization; it was not overwritten.`);
    }
    throw new Error(`Unable to create README "${config.readmePath}": ${getErrorMessage(error)}`);
  }
}

function resolveReadmePath(repositoryRoot: string, readmePath: string): string {
  const readmeFile = resolve(repositoryRoot, readmePath);
  assertPathInsideRepository(repositoryRoot, readmeFile);
  return readmeFile;
}

function assertPathInsideRepository(repositoryRoot: string, candidatePath: string): void {
  const pathFromRoot = relative(repositoryRoot, candidatePath);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error('README path must remain inside the Git repository.');
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