import { randomUUID } from 'node:crypto';
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, posix, resolve, win32 } from 'node:path';
import type { AgentConfig, UpdateMode } from './contracts.js';

const CONFIG_FILE_NAME = '.readme-agent.json';
const DEFAULT_CONFIG: AgentConfig = {
  readmePath: 'README.md',
  include: ['**/*'],
  exclude: [
    '.git/**',
    'node_modules/**',
    'dist/**',
    'build/**',
    '.env',
    '.env.*',
    '**/.env',
    '**/.env.*',
    '**/*.pem',
    '**/*.key',
  ],
  startMarker: '<!-- README-AGENT:START -->',
  endMarker: '<!-- README-AGENT:END -->',
  updateMode: 'manual',
};

const CONFIG_KEYS = new Set([
  'readmePath',
  'include',
  'exclude',
  'startMarker',
  'endMarker',
  'updateMode',
  'ai',
]);
const AI_CONFIG_KEYS = new Set(['enabled', 'provider', 'model']);
const UPDATE_MODES = new Set<UpdateMode>(['manual', 'watch', 'post-commit']);

export function getDefaultConfig(): AgentConfig {
  return {
    ...DEFAULT_CONFIG,
    include: [...DEFAULT_CONFIG.include],
    exclude: [...DEFAULT_CONFIG.exclude],
  };
}

export class ConfigAlreadyExistsError extends Error {
  constructor(filePath: string) {
    super(
      `Configuration already exists at ${filePath}; refusing to overwrite it.`,
    );
    this.name = 'ConfigAlreadyExistsError';
  }
}

export async function createDefaultConfig(root: string): Promise<AgentConfig> {
  const config = getDefaultConfig();

  try {
    await saveConfig(root, config);
    return config;
  } catch (error) {
    if (error instanceof ConfigAlreadyExistsError) {
      return loadConfig(root);
    }

    throw error;
  }
}

export async function loadConfig(root: string): Promise<AgentConfig> {
  const configPath = await getConfigPath(root);
  let contents: string;

  try {
    contents = await readFile(configPath, 'utf8');
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      throw new Error(
        `Configuration file not found at ${configPath}; run "readme-agent init" first.`,
      );
    }

    throw new Error(`Unable to read configuration at ${configPath}: ${getErrorMessage(error)}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Configuration at ${configPath} contains invalid JSON: ${getErrorMessage(error)}`);
  }

  try {
    return validateAgentConfig(value);
  } catch (error) {
    throw new Error(`Invalid configuration at ${configPath}: ${getErrorMessage(error)}`);
  }
}

export async function saveConfig(
  root: string,
  config: AgentConfig,
  options: { overwrite?: boolean } = {},
): Promise<void> {
  const configPath = await getConfigPath(root);
  const validatedConfig = validateAgentConfig(config);
  const contents = `${JSON.stringify(validatedConfig, null, 2)}\n`;

  if (!options.overwrite) {
    try {
      await writeFile(configPath, contents, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (getErrorCode(error) === 'EEXIST') {
        throw new ConfigAlreadyExistsError(configPath);
      }

      throw new Error(`Unable to create configuration at ${configPath}: ${getErrorMessage(error)}`);
    }
    return;
  }

  const temporaryPath = resolve(
    await getRootDirectory(root),
    `${CONFIG_FILE_NAME}.${process.pid}.${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' });

  try {
    await rename(temporaryPath, configPath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if (getErrorCode(cleanupError) !== 'ENOENT') {
        throw new Error(
          `Unable to replace configuration at ${configPath}: ${getErrorMessage(error)}. ` +
            `Also unable to remove temporary file ${temporaryPath}: ${getErrorMessage(cleanupError)}`,
        );
      }
    }

    throw new Error(`Unable to replace configuration at ${configPath}: ${getErrorMessage(error)}`);
  }
}

function validateAgentConfig(value: unknown): AgentConfig {
  if (!isRecord(value)) {
    throw new Error('expected a JSON object');
  }

  rejectUnknownKeys(value, CONFIG_KEYS, 'configuration');

  const readmePath = validateRelativePath(value.readmePath, 'readmePath');
  if (/[?*\[\]{}]/.test(readmePath) || extname(readmePath).toLowerCase() !== '.md') {
    throw new Error('readmePath must be a Markdown file path without glob characters');
  }

  if (!Array.isArray(value.include)) {
    throw new Error('include must be an array of relative paths or glob patterns');
  }
  if (!Array.isArray(value.exclude)) {
    throw new Error('exclude must be an array of relative paths or glob patterns');
  }

  const include = value.include.map((item, index) =>
    validateRelativePath(item, `include[${index}]`),
  );
  const exclude = value.exclude.map((item, index) =>
    validateRelativePath(item, `exclude[${index}]`),
  );

  const startMarker = validateNonEmptyString(value.startMarker, 'startMarker');
  const endMarker = validateNonEmptyString(value.endMarker, 'endMarker');
  if (startMarker === endMarker) {
    throw new Error('startMarker and endMarker must be different');
  }

  const updateMode = value.updateMode === undefined ? 'manual' : value.updateMode;
  if (typeof updateMode !== 'string' || !UPDATE_MODES.has(updateMode as UpdateMode)) {
    throw new Error('updateMode must be "manual", "watch", or "post-commit"');
  }

  const config: AgentConfig = {
    readmePath,
    include,
    exclude,
    startMarker,
    endMarker,
    updateMode: updateMode as UpdateMode,
  };

  if (value.ai !== undefined) {
    config.ai = validateAiConfig(value.ai);
  }

  return config;
}

function validateAiConfig(value: unknown): NonNullable<AgentConfig['ai']> {
  if (!isRecord(value)) {
    throw new Error('ai must be an object');
  }
  rejectUnknownKeys(value, AI_CONFIG_KEYS, 'ai configuration');

  const ai: NonNullable<AgentConfig['ai']> = {};

  if (value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') {
      throw new Error('ai.enabled must be a boolean');
    }
    ai.enabled = value.enabled;
  }

  if (value.provider !== undefined) {
    if (value.provider !== 'gemini') {
      throw new Error('ai.provider must be "gemini" when specified');
    }
    ai.provider = value.provider;
  }

  if (value.model !== undefined) {
    ai.model = validateNonEmptyString(value.model, 'ai.model');
  }

  return ai;
}

function validateRelativePath(value: unknown, field: string): string {
  const input = validateNonEmptyString(value, field);
  const portablePath = input.replace(/\\/g, '/');

  if (
    portablePath.includes('\0') ||
    isAbsolute(input) ||
    posix.isAbsolute(portablePath) ||
    win32.isAbsolute(input) ||
    /^[a-zA-Z]:/.test(input)
  ) {
    throw new Error(`${field} must be relative to the repository root`);
  }

  const segments = portablePath.split('/');
  if (segments.includes('..')) {
    throw new Error(`${field} must not escape the repository root`);
  }

  const normalizedPath = posix.normalize(portablePath).replace(/^\.\//, '');
  if (normalizedPath === '.' || normalizedPath === '') {
    throw new Error(`${field} must not refer to the repository root`);
  }

  return normalizedPath;
}

function validateNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (value.includes('\0')) {
    throw new Error(`${field} must not contain a null character`);
  }
  return value.trim();
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: Set<string>,
  field: string,
): void {
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknownKey !== undefined) {
    throw new Error(`${field} contains unsupported field "${unknownKey}"; do not store secrets here`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function getConfigPath(root: string): Promise<string> {
  return resolve(await getRootDirectory(root), CONFIG_FILE_NAME);
}

async function getRootDirectory(root: string): Promise<string> {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new Error('Repository root must be a non-empty path');
  }

  const absoluteRoot = resolve(root);
  let rootStats;
  try {
    rootStats = await stat(absoluteRoot);
  } catch (error) {
    throw new Error(`Unable to access repository root ${absoluteRoot}: ${getErrorMessage(error)}`);
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`Repository root is not a directory: ${absoluteRoot}`);
  }

  return absoluteRoot;
}

function getErrorCode(error: unknown): string | undefined {
  if (isRecord(error) && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}