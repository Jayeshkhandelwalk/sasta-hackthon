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