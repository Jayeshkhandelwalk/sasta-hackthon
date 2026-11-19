import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectContext } from '../src/readme/collectContext.js';
import type { AgentConfig, ChangeSet } from '../src/contracts.js';

describe('safe project context collection', () => {
  let temporaryRoot: string;
  let repositoryRoot: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'readme-agent-context-'));
    repositoryRoot = join(temporaryRoot, 'repository');
    await mkdir(repositoryRoot);
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('collects the README, Git diff, and relevant source/config files only', async () => {
    await writeFile(join(repositoryRoot, 'README.md'), '# Example\n');
    await writeFile(join(repositoryRoot, 'package.json'), '{"scripts":{"test":"vitest"}}\n');
    await writeFile(join(repositoryRoot, 'src.ts'), 'export const value = 1;\n');
    await mkdir(join(repositoryRoot, 'src'));
    await writeFile(join(repositoryRoot, 'src', 'nested.ts'), 'export const nested = 2;\n');
    await writeFile(join(repositoryRoot, 'notes.txt'), 'not relevant\n');

    const result = await collectContext(
      repositoryRoot,
      createConfig(),
      {
        changedFiles: ['README.md', 'package.json', 'src.ts', 'src/nested.ts', 'notes.txt'],
        diff: 'diff for src.ts',
      },
    );

    expect(result.repositoryRoot).toBe(repositoryRoot);
    expect(result.readmeText).toBe('# Example\n');
    expect(result.diff).toBe('diff for src.ts');
    expect(result.selectedFileContents).toEqual({
      'package.json': '{"scripts":{"test":"vitest"}}\n',
      'src.ts': 'export const value = 1;\n',
      'src/nested.ts': 'export const nested = 2;\n',
    });
  });

  it('excludes ignored and secret files', async () => {
    await writeFile(join(repositoryRoot, 'README.md'), '# Example\n');
    await writeFile(join(repositoryRoot, '.gitignore'), 'generated/**\n');
    await mkdir(join(repositoryRoot, 'generated'));
    await writeFile(join(repositoryRoot, 'generated/output.js'), 'generated\n');
    await writeFile(join(repositoryRoot, '.env'), 'TOKEN=fake-placeholder\n');
    await writeFile(join(repositoryRoot, 'src.js'), 'export const safe = true;\n');

    const result = await collectContext(
      repositoryRoot,
      createConfig(),
      {
        changedFiles: ['generated/output.js', '.env', 'src.js'],
        diff: 'safe diff',
      },
    );

    expect(result.selectedFileContents).toEqual({
      'src.js': 'export const safe = true;\n',
    });
  });

  it('rejects changed paths outside the repository', async () => {
    await writeFile(join(repositoryRoot, 'README.md'), '# Example\n');

    await expect(
      collectContext(repositoryRoot, createConfig(), {
        changedFiles: ['../outside.ts'],
        diff: '',
      }),
    ).rejects.toThrow(/outside the repository/i);
  });

  it('rejects files larger than the context limit', async () => {
    await writeFile(join(repositoryRoot, 'README.md'), '# Example\n');
    await writeFile(join(repositoryRoot, 'large.ts'), 'x'.repeat(256 * 1024 + 1));

    await expect(
      collectContext(repositoryRoot, createConfig(), {
        changedFiles: ['large.ts'],
        diff: '',
      }),
    ).rejects.toThrow(/exceeds the 262144-byte/i);
  });

  it('handles deleted changed files without trying to read them', async () => {
    await writeFile(join(repositoryRoot, 'README.md'), '# Example\n');

    const result = await collectContext(repositoryRoot, createConfig(), {
      changedFiles: ['src/deleted.ts'],
      diff:
        'diff --git a/src/deleted.ts b/src/deleted.ts\n' +
        'deleted file mode 100644\n' +
        '--- a/src/deleted.ts\n' +
        '+++ /dev/null\n',
    });

    expect(result.selectedFileContents).toEqual({});
    expect(result.diff).toContain('deleted file mode');
  });
});

function createConfig(): AgentConfig {
  return {
    readmePath: 'README.md',
    include: ['**/*'],
    exclude: ['.env', '.env.*', '**/.env', '**/.env.*', '**/*.pem', '**/*.key'],
    startMarker: '<!-- README-AGENT:START -->',
    endMarker: '<!-- README-AGENT:END -->',
    updateMode: 'manual',
  };
}