README AGENT BUILD PROMPTS - PERSON 1
====================================

Role
----
Person 1 owns the shared starter setup, CLI wiring, configuration, Git
integration, and final integration after Person 2 is done.

The product is a Node.js/TypeScript terminal CLI, not a website or a VS Code
extension. Use the three existing requirement files as the product
specification:

- README-AUTO-UPDATE-IDEA.txt
- README-AGENT-WORKFLOW-AND-STACK.txt
- README-AGENT-FILE-STRUCTURE.txt

How to work safely with Person 2
---------------------------------
Run Prompt 0 once, then commit the shared baseline. Person 2 should start
from that commit in a separate Git worktree or branch. Do not have both
people edit the same working directory. Follow the file ownership below.
No plan can guarantee zero bugs; the separate ownership and tests reduce
conflicts and help find defects.

PROMPT 0: COMPLETE THE SHARED PLACEHOLDERS
==========================================
Send this prompt to Person 1 first:

Read all three requirement files:
README-AUTO-UPDATE-IDEA.txt,
README-AGENT-WORKFLOW-AND-STACK.txt, and
README-AGENT-FILE-STRUCTURE.txt.

The empty source/test structure and placeholder files have already been
created at the repository root. Do not recreate, move, or delete them. Fill
only the shared setup placeholders: package.json, tsconfig.json, .gitignore,
and src/contracts.ts. Do not implement the application features yet.

Set up package scripts for build, test, and development using TypeScript,
tsup, and Vitest. Declare the planned packages: commander, simple-git,
ignore, @inquirer/prompts, diff, and the OpenAI Node SDK as an optional AI
integration. Do not add chokidar until optional watch mode is implemented.
Generate package-lock.json by running npm install after package.json is
ready; do not create an empty lockfile by hand.

In src/contracts.ts define and export AgentConfig (README path,
include/exclude paths, managed-section markers, and optional AI model
settings; no secrets), ChangeSet (changed file paths and a Git diff), and
UpdateContext (repository root, README text, selected file contents, and
diff). Also export these function types:

  findRepoRoot(cwd: string): Promise<string>
  getChangeSet(root: string): Promise<ChangeSet>
  createDefaultConfig(root: string): Promise<AgentConfig>
  loadConfig(root: string): Promise<AgentConfig>
  runInit(cwd: string): Promise<void>
  runUpdate(cwd: string): Promise<void>

Keep the contracts small and document their shapes. Implementations belong
in the files assigned below; do not make placeholder implementations or
silently return empty results on errors. Do not create any additional source
or test files. Run npm install, then the baseline build and tests. If the
empty test folder prevents the test command from running, configure the
baseline test script to pass when no tests exist yet. Report the files
changed, exact contracts, and actual command results. Do not edit the three
requirement files.

PERSON 1 FILE OWNERSHIP
=======================
- src/config.ts
- src/git/repository.ts
- src/commands/init.ts
- src/cli.ts
- test/init.test.ts
- test/repository.test.ts
- package.json, package-lock.json, tsconfig.json, and .gitignore

Person 2 owns src/readme/*, src/ai/provider.ts, src/commands/update.ts, and
their tests. Person 1 must not edit those files while Person 2 is working.
Both people must use src/contracts.ts. Only coordinate and change that
shared file if both agree it is needed.

The directories and empty source/test placeholders listed below already
exist. Implement them in place; do not create duplicate files or folders.

PERSON 1 TASK PROMPTS
=====================

P1. Implement project configuration
-----------------------------------
Implement src/config.ts using the shared contracts. Add functions to create
and load .readme-agent.json in the Git repository root. Validate the README
path, include/exclude paths, and managed-section markers. Do not store API
keys. Make initialization safe to run more than once: do not overwrite
existing settings without explicit approval. Report malformed JSON and
invalid settings clearly. Do not edit files owned by Person 2.

P2. Implement repository discovery
----------------------------------
Implement findRepoRoot(cwd) in src/git/repository.ts using simple-git.
Return the actual Git root. If the current folder is not in a Git repository,
throw a clear, actionable error; do not use the current folder as a fallback.

P3. Implement safe change collection
------------------------------------
Implement getChangeSet(root) in src/git/repository.ts. Clearly define which
staged and unstaged changes it includes. Return changed relative paths and
their diff. Handle no changes explicitly. Do not read outside the repository
or expose secrets in logs/errors. Focus on manual update mode; post-commit
diff support can come later.

P4. Test config behavior
-----------------------
Create test/init.test.ts tests for config creation/loading, malformed config,
and re-running init without overwriting existing settings. Use temporary
folders, not the real repository.

P5. Test Git behavior
---------------------
Create test/repository.test.ts using temporary Git repositories. Verify
repository-root discovery, a clear error for a non-Git folder, and the
documented staged/unstaged diff behavior. Keep the tests isolated.

P6. Implement init
------------------
Implement runInit(cwd) in src/commands/init.ts. Find the Git root, check for
existing config, ask before replacing/changing it, and create default config
when appropriate. If README.md is missing, ask before creating it and explain
what will be written. Do not install a Git hook automatically in the MVP.

P7. Wire up the CLI
-------------------
Implement src/cli.ts with Commander. Register "readme-agent init" and
"readme-agent update", routing to runInit and Person 2's runUpdate. Do not
duplicate update logic in the CLI. Provide useful help and non-zero exit
status for errors.

P8. Verify package configuration
---------------------------------
Check package.json, package-lock.json, tsconfig.json, and .gitignore.
Ensure the bin entry exposes "readme-agent", build/test scripts work, and
dist/, node_modules/, and local secret files are ignored. Keep dependencies
limited to the agreed stack. Do not edit Person 2's files.

P9. Improve command help
------------------------
In files you own, explain that init runs inside a Git repository and update
previews README changes before applying them. Do not claim optional watch
or hook features are implemented.

P10. Review security boundaries
-------------------------------
Review only your files. Confirm paths are resolved relative to the Git
root, config does not store secrets, and errors do not print secret values.
Fix problems only in your files. Report issues in Person 2's files to them.

P11. Run Person 1 checks
-----------------------
Run config/init/Git tests and the CLI build. Fix failures only in files you
own. Report exact commands and results; do not make unrelated changes.

P12. Prepare your branch
-----------------------
Review your branch diff. Confirm every changed file is within your
ownership, remove temporary test files, and summarize functions,
implementation, tests, and known limitations. Do not merge Person 2's
branch or edit their files.

INTEGRATION PROMPTS
===================
Run these after Person 2 has finished. Person 1 is the sole integrator.

I1. Merge both branches
-----------------------
Merge Person 1 and Person 2 branches into an integration branch. Keep
src/contracts.ts as the agreed API. Resolve only real conflicts; confirm
function signatures and imports match. If a contract must change, update
both implementations and their tests deliberately.

I2. Run the full build and tests
-------------------------------
Install from the merged package-lock.json. Run the full Vitest suite,
TypeScript check, and production build. Fix only integration issues. Do not
report success unless each command exits successfully.

I3. Test in a disposable project
--------------------------------
Create a temporary Git repository with a small README and source file.
Install/link the CLI locally, run "readme-agent init", change the sample
source, then run "readme-agent update". Verify the preview is accurate,
approval changes only the managed README section, declining leaves the file
unchanged, and no commit or push occurs. Clean up only the temporary repo.

I4. Review the final change set
-------------------------------
Check for unrelated files, secrets, generated dependency folders, unsafe
paths, accidental README replacement, and undocumented dependencies. Ensure
the three requirement files were not changed. Report issues and test results.

I5. Add automation only after the MVP passes
--------------------------------------------
Only after init/update and integration tests pass, consider opt-in watch mode
or a post-commit hook as a separate task. Explain how to disable it, avoid
watching README/build/dependency files, leave README changes uncommitted, and
add tests for the selected automation.

Rules
-----
- Preserve unrelated user changes.
- Keep code TypeScript-safe and use the shared contracts.
- Do not add website or VS Code extension features.
- Never commit secrets, auto-commit, or auto-push.
- Do not overwrite user-written README sections.
- Report actual test results, including failures.
- If Person 2's file must change, coordinate instead of editing it.
