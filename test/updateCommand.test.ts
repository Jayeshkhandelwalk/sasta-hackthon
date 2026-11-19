import { describe, expect, it, vi, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runUpdate } from '../src/commands/update.js';
import type { AgentConfig, ChangeSet, UpdateContext } from '../src/contracts.js';

describe('readme-agent update command', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  const config: AgentConfig = {
    readmePath: 'README.md',
    include: ['**/*'],
    exclude: [],
    startMarker: '<!-- README-AGENT:START -->',
    endMarker: '<!-- README-AGENT:END -->',
    updateMode: 'manual',
  };

  it('applies an approved update', async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'readme-agent-update-'));
    temporaryDirectories.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, 'README.md'),
      '# Project\n\n<!-- README-AGENT:START -->\nOld\n<!-- README-AGENT:END -->\n',
    );

    const context = createContext();
    context.repositoryRoot = repositoryRoot;
    const findRepositoryRoot = vi.fn().mockResolvedValue(repositoryRoot);
    const loadRepositoryConfig = vi.fn().mockResolvedValue(config);
    const collectRepositoryChanges = vi.fn().mockResolvedValue({
      changedFiles: ['src/app.ts'],
      diff: 'diff --git a/src/app.ts b/src/app.ts',
    } satisfies ChangeSet);
    const collectUpdateContext = vi.fn().mockResolvedValue(context);
    const draftSection = vi.fn().mockResolvedValue('## Updated\n\nApproved text.');

    await runUpdate(repositoryRoot, {
      explicitApproval: true,
      findRepositoryRoot,
      loadRepositoryConfig,
      collectRepositoryChanges,
      collectUpdateContext,
      draftSection,
      writePreview: vi.fn(),
    });

    const updatedReadme = await readFile(join(repositoryRoot, 'README.md'), 'utf8');
    expect(findRepositoryRoot).toHaveBeenCalledWith(repositoryRoot);
    expect(loadRepositoryConfig).toHaveBeenCalledWith(repositoryRoot);
    expect(draftSection).toHaveBeenCalledWith(context, config);
    expect(updatedReadme).toContain('Approved text.');
    expect(updatedReadme).toContain('<!-- README-AGENT:START -->');
  });

  it('does not apply when approval is declined', async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'readme-agent-update-'));
    temporaryDirectories.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, 'README.md'),
      '# Project\n\n<!-- README-AGENT:START -->\nOld\n<!-- README-AGENT:END -->\n',
    );
    const context = createContext();
    context.repositoryRoot = repositoryRoot;

    await expect(
      runUpdate(repositoryRoot, {
        findRepositoryRoot: vi.fn().mockResolvedValue(repositoryRoot),
        loadRepositoryConfig: vi.fn().mockResolvedValue(config),
        collectRepositoryChanges: vi.fn().mockResolvedValue({
          changedFiles: ['src/app.ts'],
          diff: 'diff',
        } satisfies ChangeSet),
        collectUpdateContext: vi.fn().mockResolvedValue(context),
        draftSection: vi.fn().mockResolvedValue('Declined text'),
        isInteractive: () => true,
        askForApproval: vi.fn().mockResolvedValue(false),
        writePreview: vi.fn(),
      }),
    ).resolves.toBeUndefined();

    const readmeAfterDecline = await readFile(
      join(repositoryRoot, 'README.md'),
      'utf8',
    );
    expect(readmeAfterDecline).toContain('\nOld\n');
    expect(readmeAfterDecline).not.toContain('Declined text');
  });

  it('stops when there are no Git changes', async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'readme-agent-update-'));
    temporaryDirectories.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, 'README.md'),
      '# Project\n\n<!-- README-AGENT:START -->\nOld\n<!-- README-AGENT:END -->\n',
    );
    const collectUpdateContext = vi.fn();

    await runUpdate(repositoryRoot, {
      findRepositoryRoot: vi.fn().mockResolvedValue(repositoryRoot),
      loadRepositoryConfig: vi.fn().mockResolvedValue(config),
      collectRepositoryChanges: vi.fn().mockResolvedValue({
        changedFiles: [],
        diff: '',
      } satisfies ChangeSet),
      collectUpdateContext,
    });

    expect(collectUpdateContext).not.toHaveBeenCalled();
  });

  it('reports missing configuration clearly', async () => {
    await expect(
      runUpdate('C:\\repo', {
        findRepositoryRoot: vi.fn().mockResolvedValue('C:\\repo'),
        loadRepositoryConfig: vi
          .fn()
          .mockRejectedValue(new Error('Configuration file not found')),
      }),
    ).rejects.toThrow(/unable to load configuration.*Configuration file not found/i);
  });

  it('reports provider failures and does not apply', async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'readme-agent-update-'));
    temporaryDirectories.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, 'README.md'),
      '# Project\n\n<!-- README-AGENT:START -->\nOld\n<!-- README-AGENT:END -->\n',
    );
    const context = createContext();
    context.repositoryRoot = repositoryRoot;

    await expect(
      runUpdate(repositoryRoot, {
        explicitApproval: true,
        findRepositoryRoot: vi.fn().mockResolvedValue(repositoryRoot),
        loadRepositoryConfig: vi.fn().mockResolvedValue(config),
        collectRepositoryChanges: vi.fn().mockResolvedValue({
          changedFiles: ['src/app.ts'],
          diff: 'diff',
        } satisfies ChangeSet),
        collectUpdateContext: vi.fn().mockResolvedValue(context),
        draftSection: vi
          .fn()
          .mockRejectedValue(new Error('Missing GEMINI_API_KEY')),
        writePreview: vi.fn(),
      }),
    ).rejects.toThrow(/Cannot draft README section.*Missing GEMINI_API_KEY/i);

    const readmeAfterFailure = await readFile(
      join(repositoryRoot, 'README.md'),
      'utf8',
    );
    expect(readmeAfterFailure).toContain('\nOld\n');
    expect(readmeAfterFailure).not.toContain('Missing GEMINI_API_KEY');
  });
});

function createContext(): UpdateContext {
  return {
    repositoryRoot: 'C:\\repo',
    readmeText:
      '# Project\n\n<!-- README-AGENT:START -->\nOld\n<!-- README-AGENT:END -->\n',
    selectedFileContents: {
      'src/app.ts': 'export const app = true;',
    },
    diff: 'diff --git a/src/app.ts b/src/app.ts',
  };
}