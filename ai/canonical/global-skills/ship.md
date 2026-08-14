---
name: ship
description: Autonomous end-to-end implementation mode. Investigates the system, maintains a comprehensive task ledger, opens a draft PR up front, implements the work commit by commit, reviews it, and finalizes the PR. Triggers on "ship", "implement end to end", "take it from task to PR", "do it all".
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
- Plan review confirms direction. Implementation review confirms behavior. Never spend plan rounds on what only running code can answer
- Keep one source of truth for the task in `LEDGER.md` at the worktree root
- Open the draft PR before the first line of code and commit each checklist item as you finish it. The history is a review artifact, not a delivery formality

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

Delegate exploration, not the work itself. Agents map what you do not yet know. They do not write, redesign, or restructure content whose shape you have already decided, and they are not worth spawning for a surface you have already read or can read directly from known paths.

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

### Step 8: Confirm the plan is directionally sound

This gate answers one question: would an implementer following this ledger hit a wall that forces the whole approach to be scratched? Nothing else is in scope.

No code exists yet, so nothing here can be proven the way a finding is proven after implementation. There is no red test, no runtime evidence, and no diff to read. Any claim about how the finished code will behave is a hypothesis for Step 11 and Step 12, not a plan defect. Plan review is cheap insurance against a wrong direction, not a quality bar for the plan document.

Default reviewer set, spawned once in parallel:

1. `plan-reviewer-references`: do the cited APIs, versions, and reference implementations actually support this approach
2. `plan-reviewer-logic`: is the sequencing possible, are the prerequisites present, does the plan contradict the source it cites

Add a reviewer from `plan-reviewer-behavioral`, `plan-reviewer-rules`, `plan-test-reviewer`, `plan-reviewer-data-integrity`, `plan-reviewer-security`, or `plan-reviewer-concurrency` only when a wrong invariant in that domain would invalidate the design rather than produce a defect that is fixable during implementation. Adding none is the normal case. Record the selection and every omission in `# Review Log`.

Spawn them with the ledger path, the task goal from `# Task`, the relevant rule files, and the reference and library roots they need. Each prompt must state that no code has been written yet, that the reviewer must report only defects that would force a change of approach, and that missing detail, unstated edge cases, style, and requests for the plan to say more are out of scope.

Wait for the reviewers before reviewing the same areas yourself.

Triage every returned finding into exactly one of two buckets. Act now only when the finding is one of these:

- a cited fact is wrong: the API, signature, export, or documented behavior does not exist as the ledger describes it
- the ordering is impossible or a prerequisite the plan never obtains is required
- an invariant or constraint in `# Decisions` is false
- the approach cannot produce the acceptance criteria in `# Task` even when executed perfectly

Everything else becomes a `# Checklist` item or a `# Review Log` note to settle during implementation. Do not revise the plan for it. A finding that can only be settled by running code is not a plan defect. Record it as a hypothesis together with the exact test that will settle it in Step 11.

Validate every act-now finding yourself against the repo, the libraries, and the references before changing the ledger.

Converge hard:

- one round of plan review, one revision, then proceed
- run a second round only when a validated finding changed the approach itself, and only for the reviewers whose domain the new approach touches
- never respawn the full set and never run a third round. If something is still contested, write the open question and the fallback into `# Decisions` and settle it with code in Step 11
- never revise the ledger to satisfy a reviewer's preference for more detail. The plan is done when it is executable, not when it is exhaustive

Proceed to code once the direction is feasible and the cited facts hold. Missing detail is not a blocker. Implementation resolves it.

### Step 9: Prepare the branch and open the draft PR

Before editing code, get the branch and the pull request in place. Opening the PR here is mandatory. It gives the user a live view of the work from the first commit instead of one large diff at the end.

1. If the current branch is protected or shared, create a feature branch from the current HEAD using `ship/<task-slug>`
2. If the current branch is already dedicated to the task, keep it
3. If the branch has no commits of its own yet, create the starting commit with `git commit --allow-empty -m "<task title>"`. GitHub refuses a pull request with no commits between base and head, so this empty commit is what lets the draft PR exist before any code does
4. Push with `git push -u origin <branch>`
5. Open the draft PR with `gh pr create --draft`. Title it from the task, prefixed with the related issue id when one clearly applies. The body states the goal and the planned approach from the ledger's `# Task` and `# Decisions`, and says the work is in progress
6. Record the branch, the PR number, and the PR URL in the ledger's `# Current State`

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

Commit and push item by item, as you go. The commit and the push are part of finishing a checklist item, not a phase that happens afterward. Batching the commits at the end is the same failure as one commit at the end: the user sees nothing until the work is over, and a broken step is no longer isolated to the commit that introduced it.

- the moment a checklist item's narrow gates pass, commit it and push it, before starting the next item. One logical change per commit
- an item is not done until its commit is on the remote. Do not carry finished work in the working tree while you start the next item
- write the message for a reviewer reading the branch commit by commit. Say why the change exists, not which files moved
- for Red Green items, commit the regression test together with the fix. Never push a commit that is knowingly broken
- never push a commit whose narrow lint, typecheck, or test gates are failing. Fix it first or leave it uncommitted
- do not amend, squash, or rebase commits you already pushed. Correct them with a follow up commit
- never stage `LEDGER.md` or anything else the global git excludes ignore
- when the implementation moves materially away from what the draft PR body describes, update the body

### Step 12: Audit the implementation

After implementation and planned tests are complete, review the full change as one connected unit.

1. Select only materially relevant reviewers from `reviewer-concurrency`, `reviewer-rules`, `reviewer-security`, `reviewer-data-integrity`, `reviewer-performance`, `code-simplifier`, and `test-reviewer`.
2. Use `reviewer-concurrency` for production logic, behavior, state, async work, or resources. Use `reviewer-rules` for applicable repository rules and integration obligations. Use `reviewer-security` for trust boundaries, permissions, tenant isolation, secrets, untrusted inputs, injection surfaces, file or network access, dependency risk, or sensitive data. Use `reviewer-data-integrity` for data, error handling, transactions, partial failure, ownership, lifecycle, access policy state, or legitimate resource access. Use `reviewer-performance` only when the change affects realistic workload, I/O, rendering, allocation, caching, queues, backpressure, or complexity. Use `code-simplifier` when abstractions, helpers, dependencies, composition, ownership, or duplication changed. Use `test-reviewer` only to assess the value of existing tests that are in scope or directly affected.
3. Record why every selected reviewer is relevant and why every omitted reviewer is not. `reviewer-security` and `reviewer-data-integrity` split one boundary by direction. Security owns over permission and integrity owns over denial and state corruption. Select both only when the change can fail in both directions, and never route the same suspicion to both.
4. Spawn the selected reviewers in parallel with the complete diff and full modified file list. Do not shard the change.
5. Wait for the reviewers before reviewing the same domains yourself. Deduplicate findings and validate every candidate in the main worktree.
6. Require Red Green Refactor for correctness and rules findings. Before tests that depend on third party behavior, inspect installed metadata and exact version matched official source and tests under `~/src/oss/.versions/`.
7. Apply only reproduced fixes and executable simplifications. Remove invalid probe edits and rerun the narrow quality gates.
8. After accepted fixes, recompute affected domains. Rerun the originating reviewer and only reviewers whose domain the fixes materially changed. Skip performance when the fixes do not change workload, algorithms, I/O, allocation, caching, queues, or backpressure. Skip security when they do not change trust boundaries, permissions, inputs, secrets, sensitive data, file or network capabilities, or dependency risk. Skip data integrity when they do not change stored or derived state, error handling, ownership, lifecycle, access policy outcomes, or legitimate resource access.
9. Only a fix that changes production behavior, a contract, state, or integration wiring opens another batch. Accepted simplifications, test only edits, and comment, naming, formatting, or type only changes do not. `code-simplifier` runs once for the task.
10. Commit each accepted fix on its own once its gates pass, with a message naming the defect it resolves, and push after the batch settles
11. Budget three batches at most, and no reviewer runs more than twice. Stop at the first of these: the latest batch confirmed no new defect caused by your fixes, the budget is spent, or the only remaining candidates are preferences, style, or unreproduced suspicions. Follow up batches exist to catch defects your own fixes introduced, not to re-audit the change until it is perfect.
12. Record anything left unsettled in `# Review Log` and in the PR body as an open candidate with the evidence so far and what would settle it. Shipping with a documented open candidate beats another review cycle.
13. Write every batch, reviewer selection, omission, finding, fix, and verification result to the ledger's `# Review Log`.

### Step 13: Final verification

Before finalizing the pull request:

1. Run the full relevant test suite
2. Run lint, typecheck, and build commands where they exist
3. Perform any manual verification steps listed in the ledger
4. Ensure every checklist item is checked off and the ledger reflects the final truth, with `# Current State` marking the work complete

If anything fails, fix it before moving on.

### Step 14: Finalize the pull request

The work is already committed and pushed. This step closes it out.

1. Review `git status` and the full branch diff against the base branch
2. Commit and push anything still uncommitted, as its own logical commit. Never sweep leftovers into a catch all commit
3. Confirm the branch contains no commit that fails its own gates, and that no ignored artifact was committed
4. Rewrite the PR title and body to describe the finished change, not the plan it started as:
   - a short, direct title
   - the related issue id as the title prefix when one clearly applies
   - a body that explains the PR goal, important behavior changes, and non obvious design decisions for engineers without prior context in this part of the codebase
   - a small code snippet or concrete usage example when the PR adds a new abstraction, important pattern, or non obvious integration
   - important risks, follow ups, links, or references that materially shaped the implementation
   - open candidates the review budget did not settle
   - no boilerplate body headers like `Summary` or `Test Plan`
   - no routine test, lint, build, or CI result restatement unless verification was manual, unusual, or important for understanding risk
5. Leave the PR in draft and do not merge. Human review remains the final gate

Your final user response should include the branch name, the commit range, the PR URL, verification results, and any important residual risks or follow ups.
