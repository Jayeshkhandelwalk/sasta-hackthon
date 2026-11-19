# readme-agent

`readme-agent` is a Node.js CLI that previews updates to a managed section of
a project's README. It only writes after approval and never commits or pushes.


## Commands

Run `init`, `update`, `watch`, and `hook` commands from inside the Git
repository whose README you want to maintain. Run `init` before the other
commands.

```text
readme-agent init
readme-agent update
readme-agent watch
readme-agent hook install
readme-agent hook uninstall
```

`init` creates `.readme-agent.json` and can offer to create a README with the
managed markers. `update` collects relevant Git changes, previews the proposed
section, and asks before applying. API keys are never stored in project config;
optional Gemini drafting reads `GEMINI_API_KEY` from the environment and can
write a full project guide with setup instructions and a getting-started
tutorial. During interactive initialization, you can opt in to Gemini; selected
README text, project files, and Git diffs are sent to Google Gemini when
drafting is enabled. It uses repository manifests and selected source files as
evidence.

## Optional automation

`watch` stays running and watches eligible project files. It debounces file
events, excludes the configured README, `.gitignore` paths, secrets, and
generated/dependency directories, then runs the same preview-and-approval
flow. Stop it with Ctrl+C.

`hook install` asks for confirmation before installing a local `post-commit`
hook. It refuses to overwrite an existing hook. After a commit, the hook
previews changes from that commit; an approved README update remains
uncommitted for review. Remove it with `hook uninstall`, which removes only a
readme-agent-managed hook. Git hooks are local to the clone and are not shared
with collaborators.

Both optional modes still require approval to modify the README. In a
non-interactive terminal, the update is refused rather than applied silently.

## Development

```text
npm install
npm test
npm run typecheck
npm run build
```

## Step-by-step tutorial

These commands use Windows PowerShell. Replace `C:\path\to\your\project`
with the folder of the Git repository whose README you want to update.

### 1. Check prerequisites

```powershell
node --version
git --version
```

The CLI currently requires Node.js 24.15.0 or later and Git.

### 2. Install the CLI

If you are a regular user, install the published package globally:

```powershell
npm view @jayu_k/readme-agent version
npm install --global @jayu_k/readme-agent
Get-Command readme-agent
readme-agent --help
```

The published npm package is named `@jayu_k/readme-agent`; its installed
command is still `readme-agent`. `npm view` prints the published version,
and `Get-Command` confirms that PowerShell can locate the command.

If you are forking the repo and using it locally than follow these commands:

```powershell
cd "C:\Users\your\path
npm install
npm run build
npm link
readme-agent --help
```

`npm install` installs dependencies, `npm run build` compiles the CLI, and
`npm link` makes the local `readme-agent` command available. The help command
checks that PowerShell can find it.

### 3. Initialize the target project

Open a second PowerShell window and run:

```powershell
cd "C:\path\to\your\project"
git status
readme-agent init
```

Replace the example path with your project folder. If `git status` says the
folder is not a Git repository, initialize Git there first:

```powershell
git init
```

`readme-agent init` creates `.readme-agent.json` in the Git repository. If
your README already exists, open it:

```powershell
notepad README.md
```

Add the markers where generated text is allowed, then save the README. The
CLI edits only the text between them:

```markdown
<!-- README-AGENT:START -->
Generated documentation goes here.
<!-- README-AGENT:END -->
```

If the README is missing, `init` can offer to create one with the markers.

### 4. Preview and apply an update

Make a code or configuration change, then run:

```powershell
git status --short
readme-agent update
```

The CLI collects relevant Git changes, displays a preview, and asks before
writing. Enter `y` to apply the preview or `n` to leave the README unchanged.
Review the result with:

```powershell
git status
git diff -- README.md
```

The CLI does not commit or push. To commit the README change yourself:

```powershell
git add README.md
git commit -m "docs: update README"
```

Without AI, the generated section is a short English summary of affected
source and configuration files. To generate a fuller project guide with an
overview, setup instructions, and a tutorial, enable Gemini drafting and set
`GEMINI_API_KEY` as described below.

### 5. Optional Gemini AI drafting

The default model is Google's `gemini-3.5-flash-lite`. Gemini API access has a
limited free tier, subject to Google's current model availability, quotas, and
terms. Create an API key in
[Google AI Studio](https://aistudio.google.com/apikey), then open the target
project's `.readme-agent.json` file in the root of the target Git repository
(the same folder where you run `readme-agent update`). Run `readme-agent init`
there first if the file does not exist. This setting belongs in that
configuration file, not in `package.json` or `README.md`:

```powershell
notepad .readme-agent.json
```

Add or replace the top-level `ai` object inside `.readme-agent.json`. It must
be at the same level as `readmePath`, `include`, and `updateMode` in the outer
JSON object, not nested inside one of those properties. Keep the other
configuration values. Add a comma after the preceding top-level property if
needed:

```json
{
  "readmePath": "README.md",
  "include": ["**/*"],
  "exclude": [
    ".git/**",
    "node_modules/**",
    "dist/**",
    "build/**",
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    "**/*.pem",
    "**/*.key"
  ],
  "startMarker": "<!-- README-AGENT:START -->",
  "endMarker": "<!-- README-AGENT:END -->",
  "updateMode": "manual",
  "ai": {
    "enabled": true,
    "provider": "gemini",
    "model": "gemini-3.5-flash-lite"
  }
}
```

For a project whose README is named `Readme.md`, set `"readmePath": "Readme.md"`
instead of `"README.md"` in this same file.

Set the API key only in the current PowerShell session, not in the config:
Run the first command and wait for the `Gemini API key:` prompt. Paste the key
at that prompt; do not put the key inside the command or its quotation marks.
PowerShell will hide the pasted input.

```powershell
$key = Read-Host "Gemini API key" -AsSecureString
$env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new("", $key).Password
readme-agent update
```

Close that PowerShell window to clear its environment variable. AI output is
a proposal; review and approve it before it is written. On Google's free tier,
submitted content may be used to improve Google products; do not use it for
confidential source code, and review Google's current terms and data-use
policies before sending project context.

### 6. Optional watch mode

From the target project folder:

```powershell
readme-agent watch
```

Watch mode monitors eligible files, debounces events, and offers the same
preview-and-approval flow. Press Ctrl+C to stop it.

### 7. Optional post-commit hook

Install the local hook from the target project folder:

```powershell
readme-agent hook install
```

Confirm the prompt. After a commit, the hook offers an update based on that
commit. Any README change remains uncommitted for review. The hook is local
to the clone and is not shared with collaborators.

Remove it with:

```powershell
readme-agent hook uninstall
```

The CLI refuses to overwrite an existing hook.

### 8. Troubleshoot a command that PowerShell cannot find

If `readme-agent` is not recognized after a global npm install, reinstall
the published package:

```powershell
npm install --global @jayu_k/readme-agent
Get-Command readme-agent
readme-agent --help
```

If you are developing the CLI from source instead, run `npm link` from its
source folder (never from the target project's folder). The package name is
`@jayu_k/readme-agent`, and its `bin` entry exposes `readme-agent`. If the
command is still unavailable, close and reopen PowerShell and check again
with `Get-Command readme-agent`.

### 9. Optional uninstall or unlink

To uninstall the published CLI:

```powershell
npm uninstall --global @jayu_k/readme-agent
```

For local development, remove the npm link without deleting the source folder:

```powershell
npm unlink --global readme-agent
```