README-AGENT - HACKATHON PRESENTATION CONTENT
================================================

Use this as the content outline for a six-slide presentation. The slide
sequence follows the format shown in the reference video. Replace the
bracketed team details before presenting.


SLIDE 01 - INTRODUCTION
----------------------
Product: readme-agent
Tagline: Keep your project README in sync with Git changes.
Team: [Team name]
Team members: [Name 1], [Name 2], [Add all team members]

One-line introduction:
readme-agent is a Node.js command-line tool that prepares a reviewable update
to the managed section of a project's README based on its Git changes.

Visual suggestion:
Show the product name, team name, member names, and a terminal window with
the command `readme-agent update`.

Speaker note:
The tool helps teams keep project documentation current without silently
rewriting the whole README.


SLIDE 02 - PROBLEM
------------------
Problem:
Project code and configuration change frequently, while README files are
often left out of date.

Why this matters:
- Users may follow outdated setup or usage instructions.
- Developers must manually inspect changes and remember to update docs.
- Automatically replacing a whole README can damage hand-written content.

Keep this explanation to this single slide.

Visual suggestion:
Show code changes on one side and an outdated README on the other, with a
visible documentation gap between them.

Speaker note:
The challenge is not just generating text; it is keeping documentation useful
while preserving developer control over what gets changed.


SLIDE 03 - SOLUTION OVERVIEW
----------------------------
Solution:
readme-agent collects relevant Git changes, prepares a proposed README
section, shows a diff preview, and writes only after approval.

Core workflow:
1. Run `readme-agent init` inside a Git repository.
2. Configure the README path and managed-section markers.
3. Run `readme-agent update` after making project changes.
4. Review the proposed diff and approve or decline it.

The tool updates only the text between the configured start/end markers.
It does not commit or push changes.

Visual suggestion:
Use a simple flow:
Git changes -> Relevant context -> README proposal -> Diff preview -> Approval
                                                        |                 |
                                                        +-- decline: no write
                                                                          |
                                                       approve: update managed section

Speaker note:
The preview-and-approval step is the key safeguard: users see the exact
documentation change before it is applied.


SLIDE 04 - SOLUTION: USER FEATURES
----------------------------------
Useful commands:
- `readme-agent init` - creates the project configuration and can offer to
  create a README with managed-section markers.
- `readme-agent update` - drafts and previews an update from Git changes.
- `readme-agent watch` - optionally watches eligible project files and offers
  the same approval-based update flow.
- `readme-agent hook install` - optionally installs a local post-commit hook
  that previews changes from that commit.

Optional AI drafting:
- Gemini drafting can be enabled in the project configuration.
- The default model is `gemini-3.5-flash-lite`.
- The API key is read from `GEMINI_API_KEY`; it is not stored in the config.
- AI output is still only a proposal and requires approval.

Visual suggestion:
Show a terminal demo of `init`, followed by `update`, the previewed diff, and
the approval prompt. Keep the demo focused on the normal manual workflow.

Speaker note:
Watch mode and the Git hook are optional. Both retain the same approval
requirement, and the hook never commits or pushes.


SLIDE 05 - SOLUTION: TECHNICAL ARCHITECTURE
-------------------------------------------
Architecture / workflow:

Developer
   |
   v
readme-agent CLI
   |
   +--> Git repository: changed paths and diffs
   |
   +--> Context collector: include/exclude rules, .gitignore, secret filtering
   |
   +--> Drafting: local summary by default; optional Gemini provider
   |
   +--> Managed-section builder: replace text between README markers
   |
   +--> Diff preview and user approval
             | approved              | declined
             v                       v
       Update README            Leave README unchanged

Safety and reliability details:
- Only relevant source/config files are selected; ignored/build paths and
  secret-like paths are excluded.
- Context is bounded: at most 50 selected files, with a per-file size limit.
- README paths must remain inside the Git repository.
- Writes use a temporary file and atomic replacement.
- Non-interactive updates do not silently write.

Visual requirement from the reference video:
Include at least one architecture diagram, workflow diagram, or other
relevant visual representation across slides 3-5. The diagram above can be
redrawn as boxes and arrows.

Speaker note:
The CLI uses Git as its source of change information. The optional AI provider
only drafts text from bounded project context; the user remains in control of
the final README update.


SLIDE 06 - OPTIMIZATION AND RESOURCE EFFICIENCY
-----------------------------------------------
Explain how the solution avoids unnecessary work and resources.

Resource report:
- API usage: No external AI API is used by default. Optional Gemini drafting
  makes a request only when enabled and an update is run. The default
  `gemini-3.5-flash-lite` model has a limited free tier; quotas and terms apply.
- Compute: Runs locally as a Node.js CLI. Context collection is limited to
  relevant changed files; at most 50 files are selected, with a 256 KB
  per-file context limit.
- Infrastructure: No hosted service or project database is required for the
  standard workflow. The tool operates on the local Git repository and README.
- Maintenance cost: No service subscription is required by the CLI itself.
  Keep the Node.js runtime and package dependencies updated; optional API
  charges may apply if usage exceeds the free tier or free access is unavailable.
- At scale: Include measurements from your own test repository rather than
  claiming unsupported performance or savings. Record changed-file count,
  update duration, optional API model/token usage, and any provider charges.

Suggested resource-report table:
Metric                         Default workflow              Optional AI
API calls                      0                              Gemini request per draft
Compute                        Local Node.js process          Local plus provider request
Hosted infrastructure          None required                  None required by CLI
Cost                           No CLI service fee             Free tier subject to limits

Speaker note:
The standard workflow is local-first. The most important optimization is
limiting the context to relevant changes; AI use is optional and its cost
should be measured for the chosen model and project.


PROJECT FACTS FOR THE PRESENTER
-------------------------------
- Published npm package: @jayu_k/readme-agent
- Command name: readme-agent
- Current package version: 0.1.0
- Runtime requirement: Node.js 24.15.0 or later
- Installation: `npm install --global @jayu_k/readme-agent`
- Repository: https://github.com/Jayeshkhandelwalk/sasta-hackthon
- Optional AI provider: Gemini API with `gemini-3.5-flash-lite` by default.
- Gemini free-tier content may be used to improve Google's products. Do not
  send confidential project content; review Google's current terms first.
- Default drafting is local and summarizes changed files/diff headers. It does
  not guarantee detection of every changed function name or version.
- Do not add made-up benchmark numbers, savings, team names, or impact claims.
  Replace placeholders and add measured results from your own demo if needed.
