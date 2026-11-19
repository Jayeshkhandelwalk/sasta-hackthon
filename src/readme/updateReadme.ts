import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import type { AgentConfig } from '../contracts.js';

const MAX_README_BYTES = 1024 * 1024;
const MAX_UPDATE_BYTES = 256 * 1024;

export function buildUpdatedReadme(
  readmeText: string,
  proposedSection: string,
  config: AgentConfig,
): string {
  validateTextArguments(readmeText, proposedSection, config);

  const startMarker = config.startMarker;
  const endMarker = config.endMarker;
  const startIndexes = findMarkerIndexes(readmeText, startMarker);
  const endIndexes = findMarkerIndexes(readmeText, endMarker);

  if (startIndexes.length === 0 || endIndexes.length === 0) {
    throw new Error(
      `Managed README section is missing: add exactly one "${startMarker}" marker and exactly one "${endMarker}" marker.`,
    );
  }
  if (startIndexes.length > 1 || endIndexes.length > 1) {
    throw new Error(
      `Managed README section is invalid: duplicate start or end markers found; keep exactly one of each.`,
    );
  }

  const startIndex = startIndexes[0];
  const endIndex = endIndexes[0];
  const sectionStart = startIndex + startMarker.length;
  if (endIndex < sectionStart) {
    throw new Error(
      `Managed README section is reversed: "${endMarker}" appears before "${startMarker}".`,
    );
  }

  const normalizedSection = normalizeSection(proposedSection);
  if (normalizedSection === '') {
    throw new Error('Proposed managed README section must not be empty.');
  }
  if (
    normalizedSection.includes(startMarker) ||
    normalizedSection.includes(endMarker)
  ) {
    throw new Error(
      'Proposed managed README section must not contain managed-section markers.',
    );
  }
  if (Buffer.byteLength(normalizedSection, 'utf8') > MAX_UPDATE_BYTES) {
    throw new Error(
      `Proposed managed section exceeds the ${MAX_UPDATE_BYTES}-byte limit.`,
    );
  }

  return (
    readmeText.slice(0, sectionStart) +
    `\n${normalizedSection}\n` +
    readmeText.slice(endIndex)
  );
}

export async function updateReadme(
  repositoryRoot: string,
  proposedSection: string,
  config: AgentConfig,
): Promise<string> {
  if (
    typeof repositoryRoot !== 'string' ||
    repositoryRoot.trim() === '' ||
    isAbsolute(config.readmePath) ||
    win32.isAbsolute(config.readmePath)
  ) {
    throw new Error('README update requires a repository root and a relative README path.');
  }

  const absoluteRoot = resolve(repositoryRoot);
  const readmePath = resolve(absoluteRoot, config.readmePath);
  assertInsideRepository(absoluteRoot, readmePath);

  let readmeInfo;
  try {
    readmeInfo = await lstat(readmePath);
  } catch (error) {
    throw new Error(`Unable to access README "${config.readmePath}": ${getErrorMessage(error)}`);
  }
  if (readmeInfo.isSymbolicLink()) {
    throw new Error(`README "${config.readmePath}" must not be a symbolic link.`);
  }
  if (!readmeInfo.isFile()) {
    throw new Error(`README "${config.readmePath}" is not a regular file.`);
  }
  if (readmeInfo.size > MAX_README_BYTES) {
    throw new Error(
      `README "${config.readmePath}" exceeds the ${MAX_README_BYTES}-byte limit.`,
    );
  }

  let readmeText: string;
  try {
    const buffer = await readFile(readmePath);
    if (buffer.includes(0)) {
      throw new Error(`README "${config.readmePath}" appears to be binary.`);
    }
    readmeText = buffer.toString('utf8');
  } catch (error) {
    throw new Error(`Unable to read README "${config.readmePath}": ${getErrorMessage(error)}`);
  }

  const updatedText = buildUpdatedReadme(readmeText, proposedSection, config);
  if (updatedText === readmeText) {
    return readmeText;
  }

  const temporaryPath = resolve(
    absoluteRoot,
    `.${randomUUID()}.readme-agent.tmp`,
  );
  await writeFile(temporaryPath, updatedText, { encoding: 'utf8', flag: 'wx' });

  try {
    await rename(temporaryPath, readmePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw new Error(`Unable to replace README "${config.readmePath}": ${getErrorMessage(error)}`);
  }

  return updatedText;
}

export const replaceManagedReadmeSection = buildUpdatedReadme;

function validateTextArguments(
  readmeText: string,
  proposedSection: string,
  config: AgentConfig,
): void {
  if (typeof readmeText !== 'string') {
    throw new Error('README text must be a string.');
  }
  if (typeof proposedSection !== 'string') {
    throw new Error('Proposed README section must be a string.');
  }
  if (
    typeof config.startMarker !== 'string' ||
    config.startMarker.trim() === '' ||
    typeof config.endMarker !== 'string' ||
    config.endMarker.trim() === ''
  ) {
    throw new Error('Managed README markers must be non-empty strings.');
  }
  if (config.startMarker === config.endMarker) {
    throw new Error('Managed README start and end markers must be different.');
  }
}

function findMarkerIndexes(text: string, marker: string): number[] {
  const indexes: number[] = [];
  let fromIndex = 0;
  while (true) {
    const index = text.indexOf(marker, fromIndex);
    if (index === -1) {
      return indexes;
    }
    indexes.push(index);
    fromIndex = index + marker.length;
  }
}

function normalizeSection(section: string): string {
  return section
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function assertInsideRepository(repositoryRoot: string, candidatePath: string): void {
  const pathFromRoot = relative(repositoryRoot, candidatePath);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error('README path must remain inside the Git repository.');
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}