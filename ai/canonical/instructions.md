# Base Rules

## Project Rules

- Read `RULES.md` if it exists in the project root before starting substantial work.
- Also read adjacent rule files that are clearly task specific or directory specific when you enter that area of the codebase.
- Treat project rule files as higher priority than your defaults.

## Code Intent

- Before changing code, understand the intent, inputs, outputs, error cases, invariants, and caller expectations of the code you are touching.
- Read the surrounding implementation, relevant callers and callees, types or schemas, configuration, and existing tests for the domain behavior before deciding what to change.
- For unfamiliar or cross cutting areas, spawn narrow investigation agents first. Ask them to map the relevant files, flows, contracts, test expectations, and edge cases with exact references.
- Do not make blind edits based only on a symbol name, a failing line, or an isolated diff hunk. If intent is unclear, investigate until you can state the expected behavior and why the change preserves or corrects it.
- When changing tests, understand the production behavior they protect and the harness they use before adding, deleting, or rewriting assertions.

## External Libraries

- Distrust your built in knowledge for external libraries, frameworks, and tools.
- Before using, modifying, reviewing, or integrating code that depends on a third party library, inspect installed package metadata and lockfiles for the official repository URL, package directory, exports, and installed version. Then inspect source code and tests under `~/src/oss/` from the matching upstream tag, release branch, or commit.
- If the official repository does not exist under `~/src/oss/`, shallow clone it there with `git clone --depth 1`.
- If the shared repo checkout under `~/src/oss/` is on a different version, do not change it and do not create duplicate per-agent checkouts. First look for an existing reusable version checkout under a shared cache such as `~/src/oss/.versions/<repo>/<version>/`. Create a new isolated worktree or clone there only if that exact version is missing.
- If no matching upstream ref exists, use the installed package source from `node_modules` as the version source of truth, then use the official repository only as supplemental context. Report that the upstream source could not be version matched.
- Prefer library source and tests over docs. Use docs only when source and tests are not enough.
- Verify the exact behavior and API shape you plan to rely on. Check signatures, parameter types, return types, errors, thrown defects, edge cases, lifecycle requirements, setup patterns, and test usage.
- Do not write or change code against a library until you can state the exact behavior, expected inputs and outputs, failure modes, and constraints from source or tests.
- Use `node_modules` only for installed metadata, distribution behavior, or as a fallback when no version matched source is available under `~/src/oss/`.

## Agents

- Preserve main context. Delegate broad exploration and structural investigation to agents first.
- Spawn agents aggressively and in parallel when the questions are independent.
- After spawning investigation or review agents, wait for them to finish before doing your own investigation or review in that same scope. Do not duplicate agent work in the background. Your job while they run is coordination only. Validate, deduplicate, and continue after their results return.
- Agent prompts must be highly specific and self contained. Do not send vague prompts like "investigate this" or "look into the bug".
- Every agent prompt should include the exact paths, directories, symbols, or URLs to inspect, the exact question to answer, why that question matters, any constraints or exclusions, and the exact shape of the response you want back.
- Self contained does not mean broad. Include only context that is necessary for that agent's specific mission. Do not paste unrelated task history, other agents' prompts or findings, or concerns meant for a different reviewer type.
- Keep each agent's mission pure. A logic reviewer should not receive security suspicions unless they affect logic. A test reviewer should not receive implementation theories unless needed to assess coverage. An Effect reviewer should receive Effect-specific context, imports, and expected behavior, not unrelated product or style concerns.
- When routing user feedback to agents, rewrite it into the narrow form relevant to that agent. If feedback is not relevant to that agent's purpose, omit it. Do not include ambiguous "just in case" context that can poison the agent's goal.
- Prefer several narrow agents with precise missions over one broad agent with an open ended mission.
- Use `fast-lookup` for unknown signatures, exports, return shapes, and exact API questions.
- Do not use `fast-lookup` when you already know the exact file path or name and can read the file directly.
- Use `quick-dive` for nearby structure and immediate codebase context.
- Use `deep-dive` for subsystem traces, cross cutting patterns, and behavior that spans multiple files or repos.
- Use `effect-reviewer` for every review of code that imports or uses Effect or Effect ecosystem packages. It must validate behavior against installed package metadata and version matched official Effect or ecosystem source and tests under `~/src/oss/`.
- Use `web-search` for web lookups.
- Tell agents whether you need structural mapping, exact signatures, behavioral verification, test patterns, or external references. Do not make them infer the investigation mode.
- Ask for exact file paths, line numbers, verbatim snippets, and concise evidence. For web work, ask for exact URLs and quotes.
- Verify agent evidence yourself by reading the cited files.
- `deep-dive` agents write findings under `.context/deep-dives/<current-branch>/`. Treat each branch directory as task local investigation history.
- Investigate fresh for the current task. Do not rely on prior deep dive artifacts as a substitute for a new `deep-dive`.
- Resume prior agents when useful.
- Do not specify the model when spawning agents.

## Work Trackers

- Do not modify PRs, GitHub issues, Linear issues, Jira tickets, or similar tracker items unless the user explicitly asks you to. This includes comments, labels, assignees, statuses, titles, descriptions, links, and metadata. Keep investigation and implementation notes in the conversation or local artifacts until the user asks you to update the tracker.

## TDD Fix Workflow

- When fixing a bug or validated reviewer finding with a regression test, write the regression test first and run the narrowest relevant command to prove it fails for the expected reason before changing production code.
- Before writing a regression test that depends on a third party library, framework, runtime, or integration, inspect the installed package metadata for its official repository URL, package directory, exports, and version. Then inspect version matched official source and tests under `~/src/oss/`, reusing an existing shared version checkout when the main checkout is on a different version. Use the library's own tests to learn the correct harness, composition, setup, and assertions. This applies to any library. For Effect code, inspect the relevant Effect and Effect ecosystem package directory in the official Effect repo first.
- Apply the smallest fix, then rerun the same command and prove the test passes.
- If the test fails after the fix because the test or harness is wrong, revert the production fix, correct the test or harness, rerun it against the unfixed production code, prove it fails for the expected reason again, reapply the fix, and rerun until it passes.
- If the test is valid but the fix is wrong, keep iterating on the fix until the test passes.
- Leave the valid regression test and the fix in place. Do not delete them after proving the fix. Report the regression test, failing result, passing result, and fix for validation.

## Test Harnesses

- Tests must exercise the real production composition of the code, modules, services, component tree, routes, layers, pipelines, and dependency wiring. Do not recreate a parallel fake composition in the test.
- When tests involve a third party library or framework, guide the harness from the version matched official repository and package directory in `~/src/oss/`, not memory, tutorials, or generated examples. Use installed package metadata to find monorepo package directories. Reuse an existing shared version checkout if the main checkout is on a different version, and create one only if missing.
- Replace only true external boundaries that cannot run in tests, such as third party services, network APIs, hardware, or time. Everything else should use the same production modules and wiring the application uses.
- If the production composition is hard to use in a test, extract or expose a real test harness from the production composition rather than hand wiring a mimic. A test harness that drifts from production is invalid, even if the assertions are useful.
- Prefer existing production entrypoints, app factories, routers, service layers, module builders, or documented test harnesses that are shared with production wiring.

## Git

- Do NOT add "Generated with Claude Code" or Co-Authored-By footers to commit messages.
- Do NOT add "Generated with Claude Code" or similar attribution to PR descriptions.
- When opening a PR, prefix the title with the related issue id when one clearly applies.
- Keep PR titles short, direct, and specific to the change.
- Write PR descriptions for engineers who do not know this part of the codebase yet. Explain the goal, the important behavior changes, and the reasoning behind non obvious choices.
- If the change adds a new abstraction, important pattern, or non obvious integration, include a small code snippet or concrete example that shows how it is meant to be used.
- Do not use boilerplate PR body headers like `Summary` or `Test Plan`. Bullets are fine when they improve scanning.
- Do not restate routine tests, lint, build, or CI results in PR descriptions. CI/CD already reports standard checks. Mention verification only when it is manual, unusual, or explains an important risk.
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
