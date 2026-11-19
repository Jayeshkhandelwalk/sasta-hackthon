# readme-agent

`readme-agent` is a Node.js CLI that previews updates to a managed section of
a project's README. It only writes after approval and never commits or pushes.


## Commands

Run commands from inside an initialized Git repository:

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
optional OpenAI drafting reads `OPENAI_API_KEY` from the environment.

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

### 2. Build and link the CLI

Run these commands in the readme-agent source folder, not in the project
whose README you plan to update:

```powershell
cd "C:\Users\ASUS\OneDrive\Desktop\sasta hackthon"
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

`init` creates `.readme-agent.json` in the Git repository. If a README
already exists, add the markers below where generated text is allowed. The
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
readme-agent update
```

The CLI collects relevant Git changes, displays a preview, and asks before
writing. Review the result with:

```powershell
git status
git diff -- README.md
```

The CLI does not commit or push. To commit the README change yourself:

```powershell
git add README.md
git commit -m "docs: update README"
```

By default, the generated section summarizes changed files and Git diff
headers. It may not identify exact function names or version changes.

### 5. Optional AI drafting

To enable OpenAI drafting, open the target project's config:

```powershell
notepad .readme-agent.json
```

Add this property inside the JSON object. Add a comma after the preceding
property if needed:

```json
"ai": {
  "enabled": true,
  "provider": "openai",
  "model": "gpt-4o-mini"
}
```

Set the API key only in the current PowerShell session, not in the config:

```powershell
$key = Read-Host "OpenAI API key" -AsSecureString
$env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new("", $key).Password
readme-agent update
```

Close that PowerShell window to clear its environment variable. AI output is
a proposal; review and approve it before it is written.

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

If `readme-agent` is not recognized, run `npm link` from the readme-agent
source folder, not from the target project's folder:

```powershell
cd "C:\Users\ASUS\OneDrive\Desktop\sasta hackthon"
npm pkg get name bin
npm run build
npm link
Get-Command readme-agent
readme-agent --help
```

The package name should be `readme-agent` and its `bin` entry should point
to `./dist/cli.js`. If the command is still unavailable, close and reopen
PowerShell and try `Get-Command readme-agent` again.

### 9. Optional unlink

To remove the local npm link without deleting the source folder:

```powershell
npm unlink --global readme-agent
```