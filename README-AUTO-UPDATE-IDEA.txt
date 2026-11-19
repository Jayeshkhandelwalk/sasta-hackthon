README AGENT: A TERMINAL TOOL FOR GIT REPOSITORIES
==================================================

The idea
--------
Build a command-line tool that you install once and run from a project's
terminal. It is not a website or a VS Code extension. It works in the
repository where you initialize it, in a way that feels familiar to Git.

Example:

  cd my-project
  readme-agent init
  readme-agent update

The init command sets up the current repository. The update command checks
the project's code changes, prepares a README.md update, and shows what it
plans to change. The user can approve the update before it writes the file.

How it should work
------------------
1. Install the readme-agent command-line program.
2. Run "readme-agent init" inside a Git repository.
3. The tool creates a small configuration file and sets up the README area
   it is allowed to manage.
4. Run "readme-agent update" when you want to refresh the README.
5. The tool reads the Git diff and selected project files, then creates a
   focused update based on those changes.
6. It displays a preview. After approval, it updates README.md and leaves
   the change for the developer to review and commit.

Ways to make updates automatic
------------------------------
- Manual command: run "readme-agent update" whenever you want.
- Git hook: optionally install a local post-commit hook during init. After a
  commit, it updates README.md from the newly committed changes. The README
  update remains uncommitted for review.
- Watch mode: optionally run "readme-agent watch" in a terminal. It watches
  relevant project files and offers an update when changes are saved.

Start with the manual command. Add hooks or watch mode only after the basic
update is reliable. A Git hook runs only when its matching Git event happens;
watch mode is what can react to file saves before a commit.

Suggested commands
------------------
  readme-agent init       Set up the current repository
  readme-agent update     Preview and apply a README update
  readme-agent update --yes
                          Apply without asking (optional; use cautiously)
  readme-agent watch      Watch for changes and offer updates (optional)
  readme-agent status     Show setup and pending changes

Suggested project structure for building the tool
--------------------------------------------------
readme-agent/
|-- src/
|   |-- cli.ts             Parse commands and options
|   |-- commands/
|   |   |-- init.ts        Initialize a target repository
|   |   |-- update.ts      Create and apply a README update
|   |   `-- watch.ts       Optional file-watching mode
|   |-- git/
|   |   `-- changes.ts     Read changed files and Git diffs
|   |-- readme/
|   |   |-- context.ts     Select safe, relevant project context
|   |   `-- update.ts      Generate and apply a focused update
|   `-- config.ts          Read and validate project configuration
|-- test/
|   |-- init.test.ts
|   |-- changes.test.ts
|   `-- update.test.ts
|-- package.json           Package metadata and terminal command name
|-- tsconfig.json
`-- README.md              Instructions for developers of the tool

Files created in a project by "readme-agent init"
-------------------------------------------------
my-project/
|-- .readme-agent.json     Settings for this repository
|-- README.md              Existing README, with an optional managed section
`-- .git/
    `-- hooks/             Optional local Git hook; not shared by Git itself

The tool's own source code and the files it creates in a user's project are
separate. Users install the tool; they do not copy its src/ folder into every
project. The init command creates only the configuration and optional setup
needed for the repository.

Recommended implementation
--------------------------
- Use Node.js and TypeScript to build the command-line application.
- Define a terminal executable named "readme-agent" in package.json.
- Use a command-line argument parser for commands and options.
- Use Git to inspect the repository and collect changed-file information.
- Keep project-specific settings in .readme-agent.json, such as which files
  may be read, which README section may be updated, and whether a hook is
  enabled.
- For generated text, use a configured language model or start with
  deterministic templates for facts such as scripts and dependencies.
- Update only a clearly marked section of README.md, or present a patch for
  the user to apply. Preserve the rest of the README.

Possible generated section markers:

  <!-- README-AGENT:START -->
  Generated project information goes here.
  <!-- README-AGENT:END -->

Build and try it
----------------
1. Install Node.js.
2. Create the tool project and implement the "readme-agent init" command.
3. Implement "readme-agent update" to read a Git diff and show a preview.
4. Add safe README editing that changes only the managed section.
5. Test it in a separate sample Git repository before using it on important
   projects.
6. Package and publish the command-line program to npm, or install it from
   its local project folder while developing it.
7. In a project, install the tool and run "readme-agent init".

Safety and reliability
----------------------
- Do not scan the whole computer; operate only inside the initialized repo.
- Exclude secrets, environment files, dependencies, and build output.
- Send only relevant code and diffs to a language model.
- Show a preview and ask before editing by default.
- Do not commit or push README changes automatically.
- Handle a missing Git repository, missing README, empty diff, and model
  errors clearly.
- Make init safe to run more than once; do not overwrite user settings.
- A Git hook is local to a clone unless the project uses a separate shared
  hook setup. Explain how to remove or disable any hook the tool installs.

Recommended first milestone
---------------------------
Build a Node.js/TypeScript CLI with two working commands:

  readme-agent init
  readme-agent update

Make init create .readme-agent.json. Make update inspect a Git diff, propose a
small README change, show a preview, and write it only after approval. Once
that works, add optional post-commit hook support or watch mode for automatic
updates.
