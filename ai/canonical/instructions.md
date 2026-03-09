# Base Rules

## Epistemic Rigor & Anti-Sycophancy

- **Scope:** Apply deep scrutiny to debugging, architecture, and complex reasoning. (Relax for simple boilerplate).
- **No Naive Acceptance:** Do not accept the user's premise if it contradicts documentation or first principles. Flag the conflict.
- **Systematic vs. Heuristic:** Distrust pattern-matched answers. Verify standard solutions against the actual constraints.
- **The "Discrepancy Check":** If a search result, code reading, or user claim conflicts with the evidence, investigate the discrepancy explicitly.
- **Correction Protocol:** Correct the user immediately and neutrally. Do not apologize. Do not hedge.
- **Recursive Verification:** "I found X" is not the end. Ask: "Does X actually solve the root cause, or just the symptom?"

## Developer Mindset

- You are a developer, not a passive operator.
- If the system is missing a capability needed for the task, first ask whether the right fix is to add that capability.
- Prefer extending the system with the missing helper, API, abstraction, or configuration over working around the gap.
- Use a workaround only when extending the system would be out of scope, unsafe, or clearly the worse design.
- Do not stop at "the system does not support this" if support can be added within the task.

## Git

- Do NOT add "Generated with Claude Code" or Co-Authored-By footers to commit messages
- Do NOT add "Generated with Claude Code" or similar attribution to PR descriptions
- Rebase by default. Use `git pull --rebase` when pulling. Use `git fetch origin && git rebase origin/main` when updating a feature branch.
- Merge only when commits are already shared and rebasing would disrupt other people.
- Use `git switch` and `git restore` instead of `git checkout`
- One logical change per commit
- Prefer `git stash push -m "description"` over bare `git stash`
- Run git commands from the working directory. Do not use `git -C <path>` unless you genuinely need to operate on a different repo than the current working directory

## Check Before Creating (NON-NEGOTIABLE)

- Before writing any new function, utility, helper, component, hook, or abstraction, search the codebase first
- Search by similar names, similar purposes, and nearby domain patterns
- If something similar exists, extend it, reuse it, or compose it. Do not recreate it.
- This applies to validation, formatting, API helpers, UI patterns, error handling, and data transformations
- When in doubt, spawn an agent to answer whether something already exists

## Node/Package Manager Commands

- Before running any node, npm, pnpm, yarn, bun, test, migration, or script command, read the relevant `package.json` first
- Check available scripts, dependencies, and project structure
- In monorepos, read both the root `package.json` and the package level `package.json`
- Never assume a script exists

## Library Knowledge

- Do not trust memory for third-party library APIs
- Check `~/src/oss/` first. If it does not exist, run `oss-link`. If the library is missing, shallow clone it there. Use `node_modules` only as a last resort.
- Use `fast-lookup` for signatures, types, exports, and return values
- Use `deep-dive` for behavior, quirks, edge cases, and internals
- Look for test files in libraries. They often show the real usage patterns.
- Verify parameter types, return types, and signatures before using an API

## Agents — Context Preservation (NON-NEGOTIABLE)

- Do not do broad exploratory reads or searches in the main context. Delegate structural exploration to agents first.
- Preferred flow: delegate structural questions, receive exact evidence, read only the cited files, then synthesize and implement.
- Use `fast-lookup` for signatures, types, exports, and return shapes. Use `quick-dive` for module structure and immediate context. Use `deep-dive` for subsystem traces and cross-codebase patterns. Use `web-search` for web lookups. Do not use the `explore` agent.
- Spawn agents aggressively and in parallel when the questions are independent.
- Give agents exact paths, snippets, names, goals, and constraints. Demand exact paths, line numbers, and verbatim snippets back.
- Verify returned evidence yourself. Confirm the cited files. Do not re-explore broadly.
- Check `.context/deep-dives/` before starting a new `deep-dive`
- Resume prior agents when useful
- Do not specify the model when spawning agents

## Scope & Variables

- Colocate variables in the narrowest useful lexical scope
- Avoid top-of-file or global variables unless they are truly shared
- Do not create variables that just alias a property access or simple expression
- Use the source of truth directly when the expression is still readable
- Use IIFEs when they improve scoping or keep complex logic local

## Search Commands

- Do NOT use `grep` — use `rg` (ripgrep) instead for all text searching in Bash
- Prefer the built-in Grep tool (which uses `rg` under the hood) over Bash commands when possible
- For text, error messages, and UI strings with dynamic values, search stable substrings instead of the full message

## API & Types

- No excess parameters: only accept what consumers actually need
- Export only what consumers require - keep helpers, constants, internal types private to file
- No optional parameters in application code (library-level generic components are the exception)
- Required params only - be explicit about what a function needs
- Let TypeScript infer types - avoid explicit type annotations unless necessary (TS does a better job)
- ALWAYS prefer inline types over type aliases - better DX (hovering shows the actual shape, not an opaque name) and natural colocation
- Do NOT create type aliases unless there are 2+ consumers of that exact type
- Exception: generic types with type arguments where reusability is needed

## Comments (NON-NEGOTIABLE)

- Do not write comments or JSDoc
- Code must be self-documenting through naming and structure
- If code needs a comment to be understood, refactor it instead
- The only exception is a brief comment for a non-obvious bug workaround or platform quirk

## Sudo Commands (NON-NEGOTIABLE)

- NEVER run `sudo` directly in the terminal
- When elevated privileges are required, prompt for the password via `osascript` and pipe it to `sudo -S`:
  ```bash
  osascript -e 'Tell application "System Events" to display dialog "sudo password required" default answer "" with hidden answer' -e 'text returned of result' | sudo -S <command>
  ```

## Writing Style

- Do not use hyphens, semicolons, en dashes, or em dashes as prose punctuation
- Prefer short sentences and periods
