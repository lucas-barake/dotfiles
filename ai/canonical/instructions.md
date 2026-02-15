# Base Rules

## Epistemic Rigor & Anti-Sycophancy

- **Scope:** Apply deep scrutiny to debugging, architecture, and complex reasoning. (Relax for simple boilerplate).
- **No Naive Acceptance:** Do not accept the user's premise if it contradicts documentation or first principles. If the user asks for X, but X is an anti-pattern that breaks Y, you must flag the conflict.
- **Systematic vs. Heuristic:** Distrust "pattern-matched" answers. If a solution seems "too standard" but doesn't fit the specific context, verify it against the specific constraints.
- **The "Discrepancy Check":** If a search result or finding contradicts your internal knowledge or the user's claim, pause. Do not smooth over the difference. Investigate the discrepancy explicitly.
- **Correction Protocol:** If the user is wrong, correct them immediately and neutrally. Do not apologize. Do not hedge.
- **Recursive Verification:** "I found X" is not the end. Ask: "Does X actually solve the root cause, or just the symptom?"

## Git: Use `but` (GitButler CLI), NOT `git` (NON-NEGOTIABLE)

This project uses GitButler's `but` CLI instead of raw `git`. **Always use `but` commands.** The repo is standard Git under the hood, but `but` provides a better workflow.

### Status and Inspection

```bash
but                    # show status (branches, commits, uncommitted changes)
but status -f          # status with file lists per commit
but status -v          # verbose: includes PR URLs and CI status
but diff               # show uncommitted changes
but diff <branch>      # show diff for a branch
but show <commit>      # show a specific commit
```

### Branching

```bash
but branch new <name>                    # create a new branch
but branch new -a <parent> <name>        # create a stacked branch on top of <parent>
but branch list                          # list branches
but branch delete <name>                 # delete a branch
but apply <name>                         # activate a branch in workspace
but unapply <name>                       # deactivate a branch from workspace
```

Multiple branches can be active simultaneously (parallel branches). You do NOT need to "switch" branches. Files are assigned to branches, not checked out.

### Committing

```bash
but commit -m "message"                  # commit all unassigned changes (prompts if multiple branches)
but commit -m "message" <branch>         # commit to a specific branch
but commit -m "message" --files <file>   # commit specific files
but commit --ai                          # generate commit message with AI
but commit empty --before <commit>       # insert empty commit before another
but commit empty --after <commit>        # insert empty commit after another
```

### Staging (Assigning Files to Branches)

Only needed when you have multiple active branches and want to direct specific files to specific branches.

```bash
but stage <file> <branch>                # assign a file to a branch
but discard <file>                       # discard uncommitted changes in a file
```

### Pushing and PRs

```bash
but push                                 # push current branches
but push --dry-run                       # preview what would be pushed
but pr                                   # open PRs for branches that don't have one
```

### Editing Commits

**Do NOT use `git rebase -i`.** Use these instead:

```bash
but reword <commit>                      # change a commit message
but amend <commit>                       # fold uncommitted changes into an existing commit
but uncommit                             # undo last commit, keep changes
but squash <commits>                     # squash commits together
but move <commit>                        # move a commit to a different position or branch
but absorb                               # auto-distribute uncommitted changes into best matching existing commits
but rub                                  # interactively move hunks between commits
```

`but absorb` is especially useful after small fixes. It figures out which existing commit each change belongs to and folds it in automatically.

### Updating from Upstream

```bash
but pull --check                         # preview what rebasing onto upstream would do
but pull                                 # fetch upstream and rebase all branches on top
```

Conflicts are recorded in commits rather than blocking you. Resolve them when ready with `but resolve`.

### Undo

```bash
but undo                                 # undo last operation
but oplog                                # view full operations log (every state change is a snapshot)
```

You can restore to any point in the operations log.

### Key Differences from Git

1. **No checkout/switch.** Multiple branches coexist. Assign files to branches with `but stage`.
2. **No stash.** Not needed. Branches are parallel and the workspace is persistent.
3. **No `git add`.** Commit directly. Use `but stage` only to direct files to specific branches.
4. **No `rebase -i`.** Use `but reword`, `but squash`, `but move`, `but absorb`, `but rub`.
5. **No `git pull --rebase`.** Just `but pull`. Handles fetch + rebase + conflict recording.
6. **Conflicts don't block.** They're recorded in commits and resolved later.
7. **PRs are built in.** `but pr` opens them. `but status -v` shows CI status.

### JSON Output

All commands support `--json` or `-j` for structured output:

```bash
but status --json
but branch list --json
```

### Typical Workflow

```bash
but branch new my-feature
# make changes, commit
but commit -m "implement feature"

# need to fix something unrelated? no context switch needed:
but branch new hotfix
but stage broken-file.py hotfix
but commit -m "fix bug" hotfix

# push and open PRs
but push
but pr

# pull upstream changes
but pull

# made a mistake? undo it
but undo
```

## Git Commits

- Do NOT add "Generated with Claude Code" or Co-Authored-By footers to commit messages
- Do NOT add "Generated with Claude Code" or similar attribution to PR descriptions

## Check Before Creating (NON-NEGOTIABLE)

- Before writing ANY new function, utility, helper, component, hook, or abstraction: search the codebase for existing solutions
- Search for: similar names, similar purposes, related functionality in the same domain
- If something similar exists: extend it, reuse it, or compose with it - do NOT recreate
- This applies to everything: validation logic, formatting functions, API helpers, UI patterns, error handling, data transformations
- When in doubt, spawn an agent to search: "Does something already exist that does X?"
- Creating duplicates is a code smell - the codebase likely already solved common problems

## Node/Package Manager Commands

- BEFORE running any node, npm, pnpm, yarn, bun command, tests, migrations, or scripts: READ the relevant package.json first
- Check available scripts, dependencies, and project structure
- Monorepos: find and read BOTH root package.json AND the specific package's package.json
- Never assume what scripts exist - always verify

## Lexical Scope

- Colocate variables in the lexical scope where immediately needed
- Avoid top-of-file / global variables - prevents scope pollution
- IIFEs are useful - don't avoid them when they help scope or inline complex logic

## Library Knowledge

- NEVER trust training data for third-party libs
- ALWAYS check `.context/oss/` FIRST for library source code - this is the primary source of truth
- If `.context/oss/` does not exist, run `oss-link` first to create it
- If the library is NOT in `.context/oss/`, `git clone --depth 1` it there before investigating (fast shallow clone)
- `node_modules` is the LAST resort - only use when cloning is not feasible
- Before using ANY library API: spawn the **fast-lookup** agent to get exact signatures, types, and return values
- For understanding behavior, quirks, edge cases, or tracing internals: spawn the **deep-dive** agent
- Look for test files in libs - they show usage patterns and real examples
- ALWAYS verify: param types, return types, function signatures before using

## Agents — Context Preservation (NON-NEGOTIABLE)

Your main context window is your most precious resource. Every exploratory file read, every broad search, every speculative grep pollutes it with noise that crowds out the signal you need for synthesis and decision-making. **Agents are your primary defense against context pollution.**

### The Core Rule

**NEVER do exploratory reads or searches in the main context.** Always delegate exploration to agents first. You only read files that agents have specifically identified as relevant.

The workflow is always:
1. **Delegate** — spawn agents with specific structural questions (parallelize when independent)
2. **Receive** — agents return focused results: exact file paths, line numbers, verbatim snippets
3. **Read** — you read ONLY the files/sections agents identified as relevant
4. **Synthesize** — you make decisions, solve problems, write code (this is what your context is for)

### What Agents Do vs What You Do

**Agents handle (structural exploration):**
- How is module X organized? What's its API surface?
- Who consumes X? Find usages/imports across the codebase
- What patterns does the codebase follow for X?
- What's the data flow from A to B?
- Does X have tests? What do they show about expected behavior?
- What are X's dependencies? Trace the import chain
- How does library Y expect you to use/test feature Z?

**You handle (synthesis and problem-solving):**
- Why doesn't X work? (you have full context, agents don't)
- Should we use approach A or B? (requires weighing trade-offs you understand)
- What's the root cause? (requires iterative debugging with context)
- How do these findings connect? (requires cross-referencing multiple agent results)

### Agent Usage Rules

- **Spawn aggressively** — when in doubt, spawn an agent. The cost of an agent is negligible. The cost of polluting main context is permanent
- **fast-lookup is free — use it constantly.** Spawn fast-lookups liberally for any factual question: signatures, types, exports, return values. Fire off multiple in parallel. They're fast, cheap, and prevent wrong assumptions from snowballing into debugging noise in your context
- **Parallelize** — spawn multiple agents simultaneously for independent questions. E.g., one deep-dive on frontend code + one on backend API + one fast-lookup on library signatures, all at once
- **Provide maximum context** to agents:
  - Full file paths you already know about
  - Verbatim code snippets (copy-paste exact code, not paraphrased)
  - Line numbers where relevant
  - Specific function/class/type names
  - What you're trying to accomplish and why
  - Any constraints or patterns you've already identified
- **Demand specificity** — instruct agents to return: full file paths, line numbers, verbatim code snippets. Never accept vague summaries
- **Verify after** — after an agent returns, read the specific files it identifies. Don't blindly trust, but also don't re-explore broadly. Read what was identified, confirm it, move on
- **Resume agents** when beneficial — they retain context from prior research
- **Deep-dive agents persist findings automatically.** Deep-dive agents write their findings to `.context/deep-dives/<descriptive-name>.md`. Check this directory before spawning a new deep-dive to avoid re-investigating something already covered

### Available Agents

- **fast-lookup**: Exact function definitions, type signatures, module exports, API shapes. Returns verbatim code with file paths + line numbers. No analysis, just the code
- **quick-dive**: Understand a module's purpose, structure, and immediate connections (1 level out). Returns code + light analysis + direct consumers/dependencies/tests. Answers the question and stops. Doesn't trace entire subsystems
- **deep-dive**: Full subsystem investigation. Traces execution paths, maps dependency chains, verifies patterns across 3+ instances, follows every trail. Returns paths, snippets, connections, dependency maps, and recommended further investigation. Automatically persists findings to `.context/deep-dives/`
- **web-search**: ALL web lookups. Non-negotiable

**Do NOT specify the model when spawning agents.** Each agent's model is configured in its definition. Passing a model override can cause the wrong model to be used.

**When to use which:**

| Question | Agent |
|---|---|
| What's the signature of X? | fast-lookup |
| What does X return? | fast-lookup |
| What are the exports of module X? | fast-lookup |
| What does module X do and who uses it? | quick-dive |
| How is this file/module structured? | quick-dive |
| What's the immediate context around X? | quick-dive |
| How does X work internally across the system? | deep-dive |
| Why is X doing Y? (requires tracing) | deep-dive |
| What patterns exist for X across the codebase? | deep-dive |
| How does data flow end-to-end from A to B? | deep-dive |

DO NOT USE THE EXPLORE AGENT — use fast-lookup, quick-dive, or deep-dive for ALL codebase exploration.

## Avoid Redundant Variables

- Don't create variables that just alias a property access or simple expression
- Use the source of truth directly (e.g., `result.waiting` not `const isWaiting = result.waiting`)
- Inline expressions are easier to reason about at the point of use than chasing variable definitions

## Search Commands

- Do NOT use `grep` — use `rg` (ripgrep) instead for all text searching in Bash
- Prefer the built-in Grep tool (which uses `rg` under the hood) over Bash commands when possible
- **Searching for text/error messages/UI strings:** Never search for verbatim full messages. They often contain dynamic values (names, IDs, numbers, dates) that won't match. Instead:
  1. Identify the dynamic parts of the message (changing values)
  2. Extract the static substrings (unchanging parts)
  3. Search for the shorter static portions
  - Example: `"user john@example.com does not have permission to access workspace my project"`
  - Bad: search for the full message
  - Good: search for `"does not have permission to access workspace"`

## API Design

- No excess parameters: only accept what consumers actually need
- Export only what consumers require - keep helpers, constants, internal types private to file
- No optional parameters in application code (library-level generic components are the exception)
- Required params only - be explicit about what a function needs

## Types

- Let TypeScript infer types - avoid explicit type annotations unless necessary (TS does a better job)
- ALWAYS prefer inline types over type aliases - better DX (hovering shows the actual shape, not an opaque name) and natural colocation
- Do NOT create type aliases unless there are 2+ consumers of that exact type
- Exception: generic types with type arguments where reusability is needed

## Comments (NON-NEGOTIABLE)

- Do NOT write comments. Period.
- No JSDoc, no inline comments, no "helpful" explanations, no TODO comments, no section dividers
- Code MUST be self-documenting through clear naming and structure
- If code needs a comment to be understood, refactor the code. Do not add a comment
- The ONLY exception: a comment explaining a non-obvious workaround for a specific bug or platform quirk, where the code would otherwise look wrong
- This rule has ZERO flexibility. Never add comments unless the exception above applies

## Writing Style

- Do NOT use hyphens (`-`), semicolons (`;`), en dashes (`–`), or em dashes (`—`) as punctuation in prose (bullet point markers are fine)
- Restructure sentences instead. Break long compound sentences into shorter ones. Use periods
- Bad: "This function handles auth — it validates tokens; checks permissions"
- Good: "This function handles auth. It validates tokens and checks permissions."
