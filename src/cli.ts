#!/usr/bin/env node

import { Command } from 'commander';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { runInit } from './commands/init.js';
import { runUpdate } from './commands/update.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('readme-agent')
    .description('Update a project README from its Git changes.')
    .showHelpAfterError()
    .showSuggestionAfterError()
    .exitOverride();

  program
    .command('init')
    .description('Initialize readme-agent in the current Git repository.')
    .action(async () => runInit(process.cwd()));

  program
    .command('update')
    .description('Preview and apply a README update from current Git changes.')
    .action(async () => runUpdate(process.cwd()));

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