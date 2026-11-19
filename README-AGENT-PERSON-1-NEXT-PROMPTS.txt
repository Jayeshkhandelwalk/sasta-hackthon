README AGENT - PERSON 1 CONTINUATION PROMPTS
============================================

Purpose
-------
These prompts continue the work assigned only to Person 1. Use the original
three requirement files and README-AGENT-PERSON-1-PROMPTS.txt as the
specification. Do not implement or edit Person 2's files.

Current code status
-------------------
Person 1's baseline and owned implementation are substantially present:

- package.json, package-lock.json, tsconfig.json, and .gitignore are configured.
- src/contracts.ts is present.
- src/config.ts implements default config creation, loading, validation, and
  safe replacement.
- src/git/repository.ts implements repository discovery and staged, unstaged,
  and untracked change collection.
- src/commands/init.ts implements init behavior and README/config prompts.
- src/cli.ts wires init and update and includes init/update help text.
- test/init.test.ts and test/repository.test.ts are present.
- npm test currently passes: 7 test files and 7 tests passed.

Not yet complete:

- The Person 2 owned README and update pipeline placeholders are empty.
- src/commands/update.ts does not export runUpdate.
- npm run typecheck and npm run build currently fail because src/cli.ts cannot
  import runUpdate from the Person 2 module.
- There are no completed Person 2 preview, provider, context, README-editor,
  or update-command implementations or tests to integrate yet.
- Optional watch mode and Git hooks are not implemented. Do not describe them
  as available features.

P1-N1. Finish the Person 1 branch review
----------------------------------------
Review only files owned by Person 1 and the shared baseline files:

- src/config.ts
- src/git/repository.ts
- src/commands/init.ts
- src/cli.ts
- test/init.test.ts
- test/repository.test.ts
- package.json
- package-lock.json
- tsconfig.json
- .gitignore

Confirm no Person 2 files were changed. Confirm init:

- runs only inside or below a Git repository;
- refuses to fall back to the current folder outside Git;
- does not overwrite an existing config or README without approval;
- keeps API keys out of configuration;
- reports malformed JSON and invalid paths clearly;
- does not install a hook or watch feature.

Fix only defects found in Person 1-owned files. Run:

  npm test
  npm run typecheck
  npm run build

For the typecheck/build failure, do not create a fake runUpdate implementation
in Person 1's files. Keep the current failure visible and report it as blocked
by the unfinished Person 2 module.

P1-N2. Prepare a clean branch handoff
-------------------------------------
Review the Git diff and changed-file list. Remove only temporary files created
by this work. Do not remove Person 2 placeholders or unrelated user changes.
Do not merge any branch or edit Person 2's files.

Create a commit for the completed Person 1 work only if requested. Include
the existing changes and no generated dist/, node_modules/, local secret,
temporary test repository, or requirement-file changes. Report:

- exact files changed;
- exact functions implemented;
- exact test results;
- the current integration blocker;
- which Person 2 prompts remain incomplete.

P1-N3. Wait for the Person 2 handoff
------------------------------------
Do not begin integration until Person 2 reports completion of P2-1 through
P2-12 and has committed only Person 2-owned files.

Before merging, confirm Person 2 has completed at minimum:

- src/readme/collectContext.ts;
- src/readme/updateReadme.ts;
- src/readme/preview.ts;
- src/ai/provider.ts;
- src/commands/update.ts;
- all Person 2 tests.

Do not assume optional AI is enabled just because provider code exists.

P1-N4. Merge and integrate
--------------------------
When Person 2 is complete, create an integration branch. Merge Person 1 and
Person 2 branches. Keep src/contracts.ts as the agreed API. Resolve only real
conflicts. If a contract must change, change it deliberately and update both
implementations and their tests. Do not silently alter a contract to hide an
integration mismatch.

P1-N5. Run full integration validation
--------------------------------------
After the merge, install from the merged package-lock.json and run:

  npm install
  npm test
  npm run typecheck
  npm run build

Do not report success unless all commands exit successfully.

P1-N6. Test in a disposable Git project
---------------------------------------
Create a temporary Git repository outside the tool repository. Add README.md
and a small source file, then link or install the CLI locally.

Verify:

- readme-agent init detects the repository and creates or preserves setup;
- init explains the proposed README creation before writing;
- readme-agent update previews README changes before applying them;
- approval changes only the marker-delimited README section;
- decline leaves the README unchanged;
- no relevant update occurs without explicit approval;
- no commit or push is created;
- no secret, watch setup, or hook is created or claimed.

Clean up only the named disposable repository.

P1-N7. Review the final change set
----------------------------------
Check for:

- unrelated files;
- generated dist/ or dependency folders;
- secrets or secret-like values;
- accidental README replacement;
- unsafe paths;
- undocumented dependencies;
- changes to the three requirement files;
- implementations or claims for watch mode/hooks that are not requested MVP
  features.

Report exact commands and actual results, including every failure.

P1-N8. Optional automation, only after MVP success
-------------------------------------------------
If and only if init/update, all tests, build, and the disposable-project test
pass, consider watch mode or post-commit hooks as a separate future task.
Do not include or implement either feature in this MVP continuation.
