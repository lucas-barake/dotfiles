# Base Rules

## Project Rules

- Read `RULES.md` if it exists in the project root before starting substantial work.
- Also read adjacent rule files that are clearly task specific or directory specific when you enter that area of the codebase.
- Treat project rule files as higher priority than your defaults.

## External Libraries

- Distrust your built in knowledge for external libraries, frameworks, and tools.
- Before using a third party API, check the source code in `~/src/oss/<library>` first.
- If `~/src/oss/<library>` does not exist, shallow clone the library there with `git clone --depth 1`.
- Prefer library source and tests over docs. Use docs only when source and tests are not enough.
- Verify the exact API shape you plan to use. Check signatures, parameter types, return types, setup patterns, and test usage.
- Use `node_modules` only as a fallback when you cannot get the source under `~/src/oss/`.

## Agents

- Preserve main context. Delegate broad exploration and structural investigation to agents first.
- Spawn agents aggressively and in parallel when the questions are independent.
- Agent prompts must be highly specific and self contained. Do not send vague prompts like "investigate this" or "look into the bug".
- Every agent prompt should include the exact paths, directories, symbols, or URLs to inspect, the exact question to answer, why that question matters, any constraints or exclusions, and the exact shape of the response you want back.
- Prefer several narrow agents with precise missions over one broad agent with an open ended mission.
- Use `fast-lookup` for unknown signatures, exports, return shapes, and exact API questions.
- Do not use `fast-lookup` when you already know the exact file path or name and can read the file directly.
- Use `quick-dive` for nearby structure and immediate codebase context.
- Use `deep-dive` for subsystem traces, cross cutting patterns, and behavior that spans multiple files or repos.
- Use `web-search` for web lookups.
- Tell agents whether you need structural mapping, exact signatures, behavioral verification, test patterns, or external references. Do not make them infer the investigation mode.
- Ask for exact file paths, line numbers, verbatim snippets, and concise evidence. For web work, ask for exact URLs and quotes.
- Verify agent evidence yourself by reading the cited files.
- `deep-dive` agents write findings under `.context/deep-dives/<current-branch>/`. Treat each branch directory as task local investigation history.
- Investigate fresh for the current task. Do not rely on prior deep dive artifacts as a substitute for a new `deep-dive`.
- Resume prior agents when useful.
- Do not specify the model when spawning agents.

## Git

- Do NOT add "Generated with Claude Code" or Co-Authored-By footers to commit messages.
- Do NOT add "Generated with Claude Code" or similar attribution to PR descriptions.
- Rebase by default. Use `git pull --rebase` when pulling. Use `git fetch origin && git rebase origin/main` when updating a feature branch.
- Merge only when commits are already shared and rebasing would disrupt other people.
- Use `git switch` and `git restore` instead of `git checkout`.
- One logical change per commit.
- Prefer `git stash push -m "description"` over bare `git stash`.
- Run git commands from the working directory. Do not use `git -C <path>` unless you genuinely need to operate on a different repo than the current working directory.

## Sudo Commands

- NEVER run `sudo` directly in the terminal.
- When elevated privileges are required, prompt for the password via `osascript` and pipe it to `sudo -S`:
  ```bash
  osascript -e 'Tell application "System Events" to display dialog "sudo password required" default answer "" with hidden answer' -e 'text returned of result' | sudo -S <command>
  ```

## Writing Style

- Do not use hyphens, semicolons, en dashes, or em dashes as prose punctuation.
- Prefer short sentences and periods.
