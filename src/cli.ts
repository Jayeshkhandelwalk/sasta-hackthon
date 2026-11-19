#!/usr/bin/env node

import { Command } from 'commander';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import { runInit } from './commands/init.js';
import { runUpdate } from './commands/update.js';
import { runWatch } from './commands/watch.js';
import {
  installPostCommitHook,
  uninstallPostCommitHook,
} from './commands/hook.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('readme-agent')
    .description('Update a project README from its Git changes.')
    .showHelpAfterError()
    .showSuggestionAfterError()
    .exitOverride()
    .addHelpText(
      'after',
      '\nExamples:\n  $ readme-agent init\n  $ readme-agent update\n',
    );

  program
    .command('init')
    .description('Initialize readme-agent from inside the current Git repository.')
    .action(async () => runInit(process.cwd()));

  program
    .command('update')
    .description('Preview README changes from Git diffs before applying them.')
    .option(
      '--commit <ref>',
      'Preview changes from a specific commit (used by the post-commit hook)',
    )
    .action(async (options: { commit?: string }) =>
      runUpdate(process.cwd(), { commitRef: options.commit }),
    );

  program
    .command('watch')
    .description('Watch eligible project files and offer README updates.')
    .action(async () => runWatch(process.cwd()));

  const hook = program
    .command('hook')
    .description('Manage the optional local post-commit hook.');

  hook
    .command('install')
    .description('Install the local post-commit README update hook.')
    .action(async () => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('Hook installation requires an interactive terminal.');
      }
      const approved = await confirm({
        message:
          'Install a local post-commit hook? It will preview README updates and never commit or push.',
        default: false,
      });
      if (!approved) {
        console.log('Hook installation cancelled.');
        return;
      }
      const hookPath = await installPostCommitHook(process.cwd());
      console.log(`Installed local post-commit hook at "${hookPath}".`);
    });

  hook
    .command('uninstall')
    .description('Remove only the readme-agent-managed local post-commit hook.')
    .action(async () => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('Hook removal requires an interactive terminal.');
      }
      const approved = await confirm({
        message: 'Remove the readme-agent-managed local post-commit hook?',
        default: false,
      });
      if (!approved) {
        console.log('Hook removal cancelled.');
        return;
      }
      const removed = await uninstallPostCommitHook(process.cwd());
      console.log(
        removed ? 'Removed the local post-commit hook.' : 'No readme-agent hook was installed.',
      );
    });

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    const exitCode = getCommandExitCode(error);
    if (exitCode !== undefined) {
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
      return;
    }

    console.error(`Error: ${getErrorMessage(error)}`);
    process.exitCode = 1;
  }
}

function getCommandExitCode(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'exitCode' in error &&
    typeof error.exitCode === 'number'
  ) {
    return error.exitCode;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  void main();
}