---
name: ship
description: Autonomous end-to-end implementation mode. Investigates the system, maintains a comprehensive task ledger, implements the work, reviews it, commits it, and opens a draft PR. Triggers on "ship", "implement end to end", "take it from task to PR", "do it all".
---

# Ship Mode

You own the task end to end. Investigate, plan, implement, review, verify, and ship. Do not stop after producing a plan. Do not ask the user for intermediate direction once execution starts.

Only interrupt if one of these is true:

- A secret, credential, account identifier, or environment specific value is required and cannot be inferred
- Tooling or the platform requires an approval gate that cannot be satisfied autonomously
- The next action is destructive or irreversible in a way the user's request did not already imply

## Core Rules

- Investigate before deciding
- Use agents for structural exploration and factual lookup
- Verify library and framework APIs against source code, tests, and exact signatures. Never trust memory
- For non-trivial work, gather external references from reputable sources and clone the best open source examples into `~/src/oss/`
- Prefer mature open source application code and official library sources over low trust tutorials or generated snippets
- Treat the ledger as an execution artifact, not a brainstorm
- Use TDD Red Green Refactor for bug fixes and validated reviewer findings. Other work adds its planned tests with the implementation
- Run quality gates continuously, not only at the end
- Reviewer findings are hypotheses until you validate them yourself
- Keep one source of truth for the task in `LEDGER.md` at the worktree root

## Task Ledger

`LEDGER.md` at the worktree root is the single source of truth for the task. There are no separate plan or research files. Keep it locally git ignored per the base rules and never commit it.

The ledger must be comprehensive. Another agent picking it up cold, or your own context after compaction, must be able to rebuild the full picture from the ledger alone: the goal, what is true about the system, what was decided and why, what is done, and what remains. Every claim in the ledger must carry its source. Use exact file paths with line references, exact URLs, and exact commands.

Maintain these top level sections:

1. `# Current State`
   - always the first section
   - what is done, what is in progress, and the exact next action
   - base branch, execution branch, and any blocking issues
2. `# Task`
   - normalized task statement
   - inferred acceptance criteria
3. `# Checklist`
   - ordered execution checklist as markdown checkboxes
   - every item has exact file paths and symbols
   - check items off the moment they complete and add new items as new work appears
4. `# Source Notes`
   - current system behavior with exact file paths and key constraints
   - reusable code, nearby patterns, and missing capabilities
   - library APIs verified from version matched source, with the checkout paths under `~/src/oss/.versions/`
   - external references with URLs, clone paths, and extracted principles
   - direct pointers to the docs, rule files, and skills relevant to this work
5. `# Decisions`
   - requirements, invariants, and constraints
   - chosen approach and rejected alternatives with reasons
6. `# Test Plan`
   - test files and named test cases with purpose
   - deterministic setup strategy and exact verification commands
7. `# Review Log`
   - plan and implementation review findings
   - validation results, accepted corrections, and rejected false positives

Adapt the sections to the task when it clearly warrants it, but keep `# Current State` first and keep checkpoints, invariants, decisions, and exact commands recorded somewhere in the ledger. Update the ledger continuously so it never drifts from reality. If starting new unrelated work in the same worktree, clear the ledger and start it over.

## Execution

Follow these steps in order.

Investigation is the highest leverage phase. You work through pattern recognition, and the quality of your patterns is set by the quality of the sources you studied. Deep reading of real library source, mature open source systems, and rigorous references is what produces correct invariants and first principles reasoning. Shallow investigation produces plausible code built on wrong assumptions. Spend the effort here.

### Step 1: Establish baseline and scope

Before spawning agents:

1. Infer the base branch from the current branch's upstream merge base when possible
2. If no upstream answer exists, prefer the remote default branch, then `main`, `master`, `develop`, `development`
3. Run branch state and diff checks to understand what already exists
4. Search for partial implementations, experiments, and existing fixes already on the branch
5. Create `LEDGER.md` at the worktree root, ensure it is locally git ignored per the base rules, and write the `# Current State` and `# Task` sections plus a preliminary `# Checklist`. If the ledger already holds unrelated prior work, clear it first

If investigation shows the task is already complete, or no code changes are necessary, stop and report that.

### Step 2: Map the system with agents

Do not perform broad structural exploration in the main context. Delegate it.

1. Spawn agents in parallel for each affected surface and for the important consumers and providers of that surface
2. Use `quick-dive` to map module purpose and immediate neighbors
3. Use `deep-dive` when you need a subsystem trace, cross file flow, or convention inventory
4. Use `fast-lookup` for exact definitions, signatures, exports, and return shapes

Investigate fresh for the current task. Do not rely on prior deep-dive artifacts or older plans as a substitute for new investigation.

Every spawned agent prompt must be highly specific and self contained. Include the exact paths, directories, symbols, or libraries to inspect, the exact question to answer, why it matters for the current task, any exclusions, and the exact response format you want back. Keep the prompt scoped to that agent's mission. Do not include unrelated task history, other agents' missions, or concerns that belong to another agent type. Prefer multiple narrow prompts over one broad prompt.

After spawning investigation agents, wait for them to finish before doing your own investigation in the same scope. Do not duplicate their work while they run. Use that time only for coordination, handling failed agents, and preserving the task scope. Synthesize and validate once their results return.

The goal is to understand how the system is actually built, not just where the requested change appears. Before designing code, be able to state the intent, inputs, outputs, invariants, error cases, domain expectations, and caller contracts of the code you will touch. Read surrounding implementation, relevant callers and callees, types or schemas, configuration, and existing domain tests. Capture the result in the ledger's `# Source Notes` with exact file paths and key constraints.

### Step 3: Audit reuse, gaps, and refactor needs

Only after the structural agents return:

1. Spawn a targeted agent to find existing utilities, components, services, handlers, validators, pipelines, and helpers that overlap with the requested work
2. Separate reusable code from legacy or accidental patterns
3. Identify what capability the current system is missing
4. Decide whether the right move is to extend the system with that capability instead of working around the gap
5. If a refactor is required, bound it tightly and record the safety constraints

Write the result to the ledger's `# Source Notes`.

### Step 4: Investigate libraries and frameworks from source

If the task touches any library or framework behavior, investigate it before designing code that uses it. This is mandatory. Do not write or change code against a library until you understand the exact behavior, inputs, outputs, errors, edge cases, lifecycle rules, and setup requirements from source or tests.

1. Read the relevant manifest files first so you know the actual dependencies, scripts, and versions
2. Inspect installed package metadata and lockfiles for each relevant library or framework. Use `repository.url`, `repository.directory`, exports, and installed version to find the official repository and package directory, then inspect the matching upstream tag, release branch, or commit through `~/src/oss/.versions/<repo>/<version>/`
3. Do not inspect `~/src/oss/<repo>` directly for project-specific library behavior. Treat it only as the shared repository used to create versioned checkouts. First look for an existing reusable version checkout under `~/src/oss/.versions/<repo>/<version>/`. Create one shared git worktree only if that exact version is missing. Use a separate clone only when a worktree cannot be created from the shared repository. If no matching upstream ref exists, use the installed package source as the version source of truth and record the mismatch
4. Use `fast-lookup` for exact signatures, parameter types, return values, and exported helpers
5. Use `deep-dive` on the version matched library source and tests to find idiomatic usage, setup patterns, and test strategies
6. Prefer source code and test files over docs. Use docs only as a secondary source
7. If behavior remains uncertain, write temporary verification code, run it, record the answer, and delete the temporary artifact immediately

Record the exact findings in the ledger's `# Source Notes`. Include the real APIs you will rely on, expected inputs and outputs, errors and edge cases, lifecycle or setup constraints, the real testing pattern, and anything that will not work.

### Step 5: Investigate external references

Default to doing this for any task that is not obviously tiny and local.

1. Use the `web-search` agent to find high trust references
2. Be rigorous about source quality. Accept academic papers, specifications and standards, official documentation, maintained open source libraries, mature open source application code, engineering writeups from established teams, and posts from identifiable engineers with a real track record in the domain
3. Filter out low value content aggressively. Reject SEO blog posts, content farms, listicles, thin tutorials, unattributed posts, and examples that are not clearly battle tested. A source with no identifiable author or no evidence behind its claims does not enter the ledger
4. Clone the strongest open source references into `~/src/oss/` if they are not already present
5. Spawn agents on the cloned repositories to study how they solve the relevant capability, how they test it, what architecture they use, and what tradeoffs they chose
6. Extract principles, not cargo cult code. The goal is to translate sound patterns into the existing system and stack

The ledger's `# Source Notes` must capture:

- the selected URLs
- the cloned repository paths
- why each reference is trustworthy
- the engineering principles that should carry into the implementation
- which references were rejected and why

### Step 6: Make architecture and dependency decisions

Based on the internal and external research, decide what approach is actually correct.

1. Choose whether to reuse existing code, add a new dependency, port a narrow slice of external code, or refactor the current architecture
2. If adding a dependency, verify maintenance, license, transitive weight, API surface, and whether it is proportionate to the need
3. If a dependency is overkill for a narrow requirement, prefer porting only the required behavior when the license allows it
4. Prefer smaller safe refactors first. If none produce a correct and maintainable result, plan the larger refactor with tests guarding behavior
5. Never conclude that the task is impossible merely because the most obvious module does not support it. Investigate alternate modules, different library entry points, or a better architecture first

Write the decisions, constraints, invariants, and rejected alternatives to the ledger's `# Decisions` section.

### Step 7: Write the executable plan

Finalize the ledger's `# Checklist` and `# Test Plan` sections only after the research is complete.

Requirements for the `# Checklist`:

- every checklist item is explicit and unambiguous
- every item has exact file paths and exact functions, modules, commands, or symbols to touch
- every non-trivial step points to a concrete reference in `# Source Notes`
- the checklist is ordered so the implementation can proceed without making new design decisions

Requirements for the `# Test Plan`:

- specify every test file that will be created or updated
- specify every test case by name and purpose
- every planned test must assert externally observable behavior or a public contract, not restate implementation, private control flow, helper calls, or code logic
- use production composition and only replace true external boundaries
- do not hand-wire a fake composition in tests. Use production entrypoints, app factories, routers, service layers, module builders, pipelines, component trees, or a harness shared with production wiring
- prefer regression tests, user path tests, business logic tests, and contract tests
- cover all introduced or modified logic meaningfully
- keep tests deterministic. No arbitrary sleeps, timing races, or uncontrolled external state
- coverage is a floor, not a goal. Do not add low value tests just to increase a number. A test that only mirrors the implementation provides zero confidence
- do not test what the language, compiler, or framework already proves unless the repository adds meaningful logic on top
- do not test third party behavior unless the repository adds meaningful integration logic above it
- for bug fixes and behavior-changing findings, add regression tests that fail before the fix and pass after it

### Step 8: Review the ledger plan with plan-specific reviewers

Do not trust the first draft of the plan.

Always include these reviewers:

1. `plan-reviewer-logic`
2. `plan-reviewer-behavioral`
3. `plan-reviewer-references`
4. `plan-reviewer-rules`
5. `plan-test-reviewer`

Conditionally include these reviewers when the task warrants them:

1. `plan-reviewer-data-integrity`
2. `plan-reviewer-security`
3. `plan-reviewer-concurrency`

Spawn them in parallel with:

- the ledger path
- the task goal from the ledger's `# Task` section
- the relevant rule files
- the cloned reference roots and library roots they may need

Do not use generic reviewer prompts. Tell each reviewer exactly what artifact to read, what sources to verify against, what class of defect to hunt for, and what evidence format to return.

After spawning reviewers, wait for them to finish before doing your own review in the same scope. Do not inspect the same plan areas for findings while they run. Validate, deduplicate, and revise only after their results return.

After they return:

1. Deduplicate overlapping findings
2. Validate every finding yourself against the repo, the libraries, and the references
3. For uncertain claims, spawn narrow follow up agents against the specific source of truth
4. Revise the ledger until no valid gaps remain
5. Write the full review log to the ledger's `# Review Log`

Do not proceed to code until the plan is coherent, feasible, and fully sourced.

### Step 9: Prepare the execution branch

Before editing code, ensure you are not working on a protected or shared branch.

1. If the current branch is protected or shared, create a feature branch from the current HEAD using `ship/<task-slug>`
2. If the current branch is already dedicated to the task, keep it
3. Record the chosen branch in the ledger's `# Current State`

### Step 10: Load execution context

Before writing a single line of production or test code:

1. Read every skill referenced in the ledger's `# Source Notes` from `./.context/skills/`
2. Read every file referenced in the ledger's `# Checklist`, `# Test Plan`, and `# Source Notes`
3. Recheck the current repo state. If the referenced files have drifted materially since planning, update the ledger first

### Step 11: Implement the plan

Work through the ledger's `# Checklist` in order.

For bug fixes and validated reviewer findings, follow Red Green Refactor:

1. Red: write the test first, run it, and confirm it fails for the expected behavioral reason. The test must fail because the observable behavior is absent or wrong, not because it expects a private implementation detail
2. Green: only after Red, implement the production change, rerun the same test, and confirm it passes
3. If the test stays Red because the test or harness is wrong, revert the implementation, fix the test or harness, prove Red again, reapply the implementation, and rerun until Green
4. If the test stays Red because the implementation is wrong, keep the test and adjust the implementation until Green
5. Refactor: once Green, simplify only when behavior is preserved and rerun the relevant checks

For everything else:

1. Implement first
2. Then add the planned tests

For all items:

- after every meaningful file change, run the smallest relevant lint, typecheck, test, or build command before moving on
- check each checklist item off in the ledger as soon as it is done and add new items as new work appears
- keep the ledger's `# Current State` and other sections updated if reality changes

### Step 12: Run a post-implementation deep review

After the implementation and planned tests are complete, review the actual code with the existing code reviewers.

1. Decide whether to review the full implementation as one unit or to shard it by domain. Shard when the modified files span clearly different concerns or the diff is large enough that one reviewer would need unrelated context
2. Always include `reviewer-logic` and `test-reviewer`. Include `effect-reviewer` for any implementation that imports, configures, tests, or meaningfully interacts with Effect or Effect ecosystem packages. Include `reviewer-behavioral`, `reviewer-data-integrity`, `reviewer-security`, `reviewer-concurrency`, and `reviewer-rules` when the implementation warrants them. Include `reviewer-performance` when the implementation touches hot paths, large data, UI rendering, responsiveness, I/O, database or network access, queues, workers, caching, retries, batching, backpressure, allocation heavy paths, or time complexity
3. Spawn the selected reviewers in parallel with the modified file list, branch context, project rules, and a note that this is freshly implemented code. Tell them the modified files/current diff are the review boundary; they may inspect outside files only to validate direct callers, guards, tests, rules, or integration points causally connected to the modified code
4. Wait for the reviewers to finish before doing your own review in the same scope
5. Deduplicate overlapping findings and keep the best supported version of each root issue
6. Require each bug reviewer to use Red Green Refactor for every candidate finding. They must inspect installed package metadata and version matched official library source and tests through `~/src/oss/.versions/` before writing any regression test that depends on third party library or framework behavior, reusing an existing shared version checkout and using those tests for harness, composition, setup, and assertion patterns. This applies to any library, including Effect and Effect ecosystem packages. They must use metadata fields such as `repository.url`, `repository.directory`, exports, and version to find monorepo package directories. Red: write the smallest regression test and prove it fails for the suspected reason before changing production code. Green: apply the smallest fix in place and prove the same test passes. If Green is still Red because the test or harness is wrong, they must revert the production fix, fix the test or harness, rerun it against the unfixed production code, prove Red again, reapply the fix, and rerun until Green. If Green is still Red because the fix is wrong, they must keep the test and adjust the fix until Green. Refactor: once Green, simplify only when behavior is preserved and rerun the relevant checks. Confirmed reviewers must leave the valid regression test and fix in the worktree and report the test path, exact test code, Red output before the fix, Green output after the fix, and the fix they applied. If the candidate is not reproduced or the harness is blocked after multiple real attempts, reviewers must remove any probe test and fix edits before returning and report the exact code and commands tried as an unconfirmed candidate
7. Validate every finding yourself before acting on it
8. Treat high-confidence findings as only those reproduced by a failing regression test. If the regression test is correct and does not fail, treat the finding as a false positive and move on
9. Fix valid findings and rerun the relevant checks

Write the full result to the ledger's `# Review Log`.

### Step 13: Run simplification and reuse passes

Once the code is functionally correct:

1. Spawn `code-simplifier` and `reuse-reviewer` in parallel with the task goal, current diff boundary, complete modified file list, and the ledger path
2. Add any domain specific reviewer agent that materially matches the stack under review
3. Wait for the agents to finish before doing your own simplification or reuse pass in the same scope
4. Validate each finding and its reported snapshot proof yourself against the actual code and contracts
5. Apply only changes that clearly preserve or improve behavior and clarity
6. Rerun the relevant quality gates after any accepted simplification

### Step 14: Final verification

Before committing:

1. Run the full relevant test suite
2. Run lint, typecheck, and build commands where they exist
3. Perform any manual verification steps listed in the ledger
4. Ensure every checklist item is checked off and the ledger reflects the final truth, with `# Current State` marking the work complete

If anything fails, fix it before moving on.

### Step 15: Commit and open a draft PR

When the task is complete:

1. Review `git status` and the final diff
2. Stage only the relevant files
3. Create a single logical commit with a message that explains why the change exists
4. Push the branch with upstream tracking if needed
5. Open a draft PR with:
   - a short, direct title
   - the related issue id as the title prefix when one clearly applies
   - a body that explains the PR goal, important behavior changes, and non obvious design decisions for engineers without prior context in this part of the codebase
   - a small code snippet or concrete usage example when the PR adds a new abstraction, important pattern, or non obvious integration
   - important risks, follow ups, links, or references that materially shaped the implementation
   - no boilerplate body headers like `Summary` or `Test Plan`
   - no routine test, lint, build, or CI result restatement unless verification was manual, unusual, or important for understanding risk
6. Do not merge. Human review remains the final gate

Your final user response should include the branch name, commit hash, PR URL, verification results, and any important residual risks or follow ups.
