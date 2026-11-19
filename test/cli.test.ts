import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isDirectEntryPoint } from '../src/cli.js';

describe('CLI entry point detection', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('recognizes a CLI entry path that passes through a directory link', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'readme-agent-cli-'));
    const packageDirectory = join(temporaryDirectory, 'package');
    const linkedDirectory = join(temporaryDirectory, 'linked-package');
    const distDirectory = join(packageDirectory, 'dist');
    const modulePath = join(distDirectory, 'cli.js');
    await mkdir(distDirectory, { recursive: true });
    await writeFile(modulePath, '');
    await symlink(
      packageDirectory,
      linkedDirectory,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    expect(
      isDirectEntryPoint(join(linkedDirectory, 'dist', 'cli.js'), modulePath),
    ).toBe(true);
    expect(isDirectEntryPoint(undefined, modulePath)).toBe(false);
  });
});
