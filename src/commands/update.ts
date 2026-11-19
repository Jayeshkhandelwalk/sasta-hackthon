import { lstat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import type { AgentConfig, ChangeSet, UpdateContext } from '../contracts.js';
import { findRepoRoot, getChangeSet, getCommitChangeSet } from '../git/repository.js';
import { loadConfig } from '../config.js';
import { collectContext } from '../readme/collectContext.js';
import { draftManagedReadmeSection, ProviderError } from '../ai/provider.js';
import { previewReadme } from '../readme/preview.js';
import { buildUpdatedReadme, updateReadme } from '../readme/updateReadme.js';

export interface UpdateCommandOptions {
  explicitApproval?: boolean;
  commitRef?: string;
  findRepositoryRoot?: (cwd: string) => Promise<string>;
  loadRepositoryConfig?: (root: string) => Promise<AgentConfig>;
  collectRepositoryChanges?: (root: string) => Promise<ChangeSet>;
  collectUpdateContext?: (
    root: string,
    config: AgentConfig,
    changes: ChangeSet,
  ) => Promise<UpdateContext>;
  draftSection?: (
    context: UpdateContext,
    config: AgentConfig,
  ) => Promise<string>;
  isInteractive?: () => boolean;
  askForApproval?: (message: string) => Promise<boolean>;
  writePreview?: (preview: string) => void;
}

export async function runUpdate(
  cwd: string,
  options: UpdateCommandOptions = {},
): Promise<void> {
  if (typeof cwd !== 'string' || cwd.trim() === '') {
    throw new Error('Working directory must be a non-empty path.');
  }

  const findRoot = options.findRepositoryRoot ?? findRepoRoot;
  const loadConfigForRoot = options.loadRepositoryConfig ?? loadConfig;
  const commitRef = options.commitRef;
  const getChanges = options.collectRepositoryChanges ??
    (commitRef ? (root: string) => getCommitChangeSet(root, commitRef) : getChangeSet);
  const collect = options.collectUpdateContext ?? collectContext;
  const draft =
    options.draftSection ??
    ((context: UpdateContext, config: AgentConfig) =>
      draftSection(context, config));

  const repositoryRoot = await findRoot(cwd);
  let config: AgentConfig;
  try {
    config = await loadConfigForRoot(repositoryRoot);
  } catch (error) {
    throw new Error(
      `Cannot update README: unable to load configuration. ${getErrorMessage(error)}`,
    );
  }

  await requireExistingReadme(repositoryRoot, config);

  let changes: ChangeSet;
  try {
    changes = await getChanges(repositoryRoot);
  } catch (error) {
    throw new Error(`Cannot update README: ${getErrorMessage(error)}`);
  }

  if (changes.changedFiles.length === 0 && changes.diff.trim() === '') {
    console.log('No Git changes found; README remains unchanged.');
    return;
  }

  let context: UpdateContext;
  try {
    context = await collect(repositoryRoot, config, changes);
  } catch (error) {
    throw new Error(`Cannot collect README update context: ${getErrorMessage(error)}`);
  }

  let proposedSection: string;
  try {
    proposedSection = await draft(context, config);
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    throw new Error(`Cannot draft README section: ${getErrorMessage(error)}`);
  }

  let updatedText: string;
  try {
    updatedText = buildUpdatedReadme(
      context.readmeText,
      proposedSection,
      config,
    );
  } catch (error) {
    throw new Error(`Cannot update README section: ${getErrorMessage(error)}`);
  }

  const preview = await previewReadme(context.readmeText, updatedText, {
    explicitApproval: options.explicitApproval,
    isInteractive: options.isInteractive,
    askForApproval: options.askForApproval,
    writePreview: options.writePreview,
  });

  if (!preview.approved) {
    console.log('README update declined; README remains unchanged.');
    return;
  }

  try {
    await updateReadme(repositoryRoot, proposedSection, config);
  } catch (error) {
    throw new Error(`Cannot apply README update: ${getErrorMessage(error)}`);
  }

  console.log(`Updated managed README section in "${config.readmePath}".`);
}

async function requireExistingReadme(
  repositoryRoot: string,
  config: AgentConfig,
): Promise<void> {
  if (isAbsolute(config.readmePath) || win32.isAbsolute(config.readmePath)) {
    throw new Error('Cannot update README: configured README path must be relative.');
  }

  const readmePath = resolve(repositoryRoot, config.readmePath);
  const root = resolve(repositoryRoot);
  const pathFromRoot = relative(root, readmePath);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error('Cannot update README: configured README path is outside the repository.');
  }

  try {
    const info = await lstat(readmePath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(
        `Cannot update README: "${config.readmePath}" is not a regular file.`,
      );
    }
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      throw new Error(
        `Cannot update README: "${config.readmePath}" does not exist. Run "readme-agent init" to create it.`,
      );
    }
    throw error;
  }
}

async function draftSection(
  context: UpdateContext,
  config: AgentConfig,
): Promise<string> {
  if (config.ai?.enabled) {
    return draftManagedReadmeSection(context, config);
  }

  const files = Object.keys(context.selectedFileContents).sort();
  const summary =
    files.length > 0
      ? `Recent changes affect the following files: ${formatFileList(files)}.`
      : 'Recent repository changes were detected, but no relevant source or configuration files were selected for a detailed summary.';

  return [
    '## Recent changes',
    '',
    summary,
  ].join('\n').trim();
}

function formatFileList(files: string[]): string {
  const formattedFiles = files.map((file) => `\`${file}\``);
  if (formattedFiles.length === 1) {
    return formattedFiles[0];
  }
  if (formattedFiles.length === 2) {
    return `${formattedFiles[0]} and ${formattedFiles[1]}`;
  }
  return `${formattedFiles.slice(0, -1).join(', ')}, and ${formattedFiles[formattedFiles.length - 1]}`;
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