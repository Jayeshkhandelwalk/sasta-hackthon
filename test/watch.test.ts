import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isWatchablePath, runWatch } from '../src/commands/watch.js';
import type { AgentConfig } from '../src/contracts.js';

describe('watch path filtering', () => {
  const root = 'C:\\repo';
  const config: AgentConfig = {
    readmePath: 'README.md',
    include: ['src/**/*', 'package.json'],
    exclude: ['src/generated/**'],
    startMarker: '<!-- README-AGENT:START -->',
    endMarker: '<!-- README-AGENT:END -->',
    updateMode: 'watch',
  };

  it('watches included source and configuration paths', () => {
    expect(isWatchablePath(root, 'src/app.ts', config)).toBe(true);
    expect(isWatchablePath(root, 'src/nested/app.ts', config)).toBe(true);
    expect(isWatchablePath(root, 'package.json', config)).toBe(true);
  });

  it('excludes README, secrets, build output, and irrelevant files', () => {
    expect(isWatchablePath(root, 'README.md', config)).toBe(false);
    expect(isWatchablePath(root, '.env', config)).toBe(false);
    expect(isWatchablePath(root, 'dist/cli.js', config)).toBe(false);
    expect(isWatchablePath(root, 'notes.txt', config)).toBe(false);
  });

  it('does not watch paths outside the repository', () => {
    expect(isWatchablePath(root, '..\\outside.ts', config)).toBe(false);
  });

  it('debounces eligible file events and can be stopped cleanly', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'readme-agent-watch-'));
    const repositoryRoot = join(temporaryRoot, 'repository');
    await mkdir(join(repositoryRoot, 'src'), { recursive: true });
    await writeFile(
      join(repositoryRoot, '.readme-agent.json'),
      `${JSON.stringify({
        ...config,
        readmePath: 'README.md',
      })}\n`,
    );
    await writeFile(
      join(repositoryRoot, 'README.md'),
      '# Project\n<!-- README-AGENT:START -->\nOld\n<!-- README-AGENT:END -->\n',
    );
    const controller = new AbortController();
    let updateCount = 0;
    let ready: (() => void) | undefined;
    const readyPromise = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let watchPromise: Promise<void> | undefined;

    try {
      watchPromise = runWatch(repositoryRoot, {
        debounceMs: 100,
        signal: controller.signal,
        findRepositoryRoot: async () => repositoryRoot,
        loadRepositoryConfig: async () => ({
          ...config,
          readmePath: 'README.md',
          include: ['src/**/*'],
        }),
        update: async () => {
          updateCount += 1;
        },
        writeOutput: (message) => {
          if (message === 'Watch mode is ready.') {
            ready?.();
          }
        },
        writeError: (message) => {
          throw new Error(message);
        },
      });

      await Promise.race([
        readyPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('watcher did not become ready')), 3000),
        ),
      ]);
      await writeFile(join(repositoryRoot, 'src', 'app.ts'), 'export const a = 1;\n');
      await new Promise((resolve) => setTimeout(resolve, 20));
      await writeFile(join(repositoryRoot, 'src', 'app.ts'), 'export const a = 2;\n');

      await waitFor(() => updateCount > 0);
      await new Promise((resolve) => setTimeout(resolve, 180));
      expect(updateCount).toBe(1);

      controller.abort();
      await watchPromise;
    } finally {
      controller.abort();
      await watchPromise?.catch(() => undefined);
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for watch update.');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
