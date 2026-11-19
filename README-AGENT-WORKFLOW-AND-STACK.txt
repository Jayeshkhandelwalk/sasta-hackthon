README AGENT: HOW IT WORKS AND WHAT STACK TO USE
================================================

Purpose
-------
This guide explains a terminal program named "readme-agent". You install
the program, open a Git project in a terminal, initialize it, and ask the
tool to update that project's README based on code changes.

It is a command-line tool, not a website or a VS Code extension.

The recommended stack
---------------------
- Node.js: runs the program on Windows, macOS, and Linux.
- TypeScript: makes the program easier to maintain and catches many coding
  mistakes before it runs.
- Commander: reads terminal commands and options such as "init", "update",
  and "watch".
- simple-git: helps the program find the Git repository and read its status
  and diffs.
- Node.js fs/promises: reads project files and safely writes README.md.
- ignore: helps skip files and folders listed in .gitignore.
- Google GenAI Node SDK (optional): sends selected code context to a Gemini
  model to draft documentation.
- @inquirer/prompts: asks for confirmation in the terminal.
- diff: creates a readable before/after preview.
- chokidar (optional): watches files for changes in "watch" mode.
- Vitest: tests the command and README-update behavior.
- tsup: builds TypeScript into JavaScript for publishing the CLI.

How a request moves through the tool
------------------------------------

STEP 1: Install and launch the command
--------------------------------------
The developer types a command such as:

  readme-agent init
  readme-agent update

Stack used:
- npm installs the CLI package.
- The "bin" entry in package.json exposes the program as the
  "readme-agent" terminal command.

- Node.js runs the compiled JavaScript.
- Commander parses the command and its options.

During development, use "npm link" to try the command locally. Once the tool
is ready, it can be published to npm or installed from a package file.

STEP 2: Initialize a project
----------------------------
The developer runs "readme-agent init" inside the project's Git repository.
The program finds the repository root, checks that it is safe to initialize,
and creates a configuration file such as:

  .readme-agent.json

That file could specify the README path, files or directories to include,
paths to ignore, and whether automatic mode is enabled. Init should be safe
to run again: it must not overwrite existing user settings without asking.

Stack used:
- simple-git checks that the current folder belongs to a Git repository and
  finds the repository root.
- fs/promises creates the config file.
- @inquirer/prompts asks before replacing or changing existing settings.

STEP 3: Find relevant code changes
----------------------------------
When the developer runs "readme-agent update", the tool checks Git for
changed files and reads the relevant diff. It should include staged and
unstaged changes according to the command's documented behavior. A later
post-commit hook mode needs to explicitly inspect the commit that just
finished, because the ordinary working-tree diff may then be empty.

Stack used:
- simple-git reads Git status and diffs.
- ignore and the project's .gitignore help exclude dependencies and build
  output.
- Additional built-in exclusions should skip secrets such as .env files.

STEP 4: Collect a small amount of project context
-------------------------------------------------
The tool reads README.md, relevant changed source files, and useful
configuration such as package.json. It should limit the number and size of
files it reads. It should not scan outside the initialized repository.

Stack used:
- fs/promises reads selected text files.
- ignore applies configured and .gitignore exclusions.
- Configuration in .readme-agent.json controls which paths are eligible.

STEP 5: Draft a documentation update
------------------------------------
The first version can generate straightforward facts from configuration
files, such as project scripts. For natural-language explanations, an
optional AI provider can draft a small change using the README and selected
code context.

Stack used:
- The Google GenAI Node SDK connects to the Gemini API.
- Keep provider-specific code behind a small module so Git and file-handling
  code remain independent of the model API.
- Store API keys in an environment variable or an operating-system secret
  store. Never write them to the repository or .readme-agent.json.

The model should return a proposed update, not directly edit files. If the
code does not clearly support a claim, the tool should leave that detail out
or ask the developer.

STEP 6: Preview and update README.md
------------------------------------
The safest first version edits only a marked section of README.md:

  <!-- README-AGENT:START -->
  Generated documentation goes here.
  <!-- README-AGENT:END -->

The tool displays a diff, asks the developer to approve it, and then writes
the approved content. It should preserve all text outside the managed
section.

Stack used:
- diff formats the proposed before/after change.
- @inquirer/prompts asks whether to apply it.
- fs/promises writes the approved result. A temporary file followed by a
  rename can reduce the risk of leaving a partially written README.

STEP 7: Optional automatic updates
----------------------------------
Start with the explicit "readme-agent update" command. Later, add either:

- "readme-agent watch": chokidar watches selected files, waits briefly after
  edits stop, then generates a preview or asks to apply it.
- A Git hook: runs the updater after a commit and leaves README.md changed
  but uncommitted for review.

Automatic mode should not create commits or push to a remote by default.
Watch mode should ignore README.md itself and generated/build folders to
avoid repeated updates.

Stack used:
- chokidar plus a short debounce timer for watch mode.
- Git's hook mechanism for optional commit-triggered updates.
- The same diff, approval, and file-writing code used by manual mode.

STEP 8: Test and package the CLI
--------------------------------
Tests should verify that init preserves existing settings, ignored files are
not sent as context, and updates change only the managed README section.
Use temporary Git repositories in tests so they do not alter real projects.

Stack used:
- Vitest runs unit and integration tests.
- tsup builds TypeScript into JavaScript.
- npm packages and distributes the command-line program.

Possible source layout
----------------------
readme-agent/
|-- src/
|   |-- cli.ts
|   |-- commands/
|   |   |-- init.ts
|   |   |-- update.ts
|   |   `-- watch.ts
|   |-- git/
|   |   `-- changes.ts
|   |-- ai/
|   |   `-- provider.ts
|   |-- readme/
|   |   |-- context.ts
|   |   `-- applyUpdate.ts
|   `-- config.ts
|-- test/
|-- package.json
|-- tsconfig.json
`-- README.md

Files created in a project after initialization are separate from the tool's
source code. A project normally gets .readme-agent.json and its own README.md;
it does not get a copy of the tool's src/ folder.

Recommended build order
-----------------------
1. Make "readme-agent init" create and validate .readme-agent.json.
2. Make "readme-agent update" read a Git diff and print it.
3. Add a deterministic README updater for a marked section.
4. Add a preview and approval prompt.
5. Add AI drafting only after the non-AI flow works.
6. Add tests, then consider optional watch mode or Git hooks.

This order keeps the first version small and lets the Git and README behavior
be tested before adding an AI provider.
