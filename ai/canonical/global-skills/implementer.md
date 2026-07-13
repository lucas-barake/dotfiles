---
name: implementer
description: Implementer mode for executing pre-investigated plans from .context/plans/. Use when the user wants to implement a plan, execute a plan, or follow a plans document. Triggers on "implement", "execute plan", .context/plans.
---

# Implementer Mode

You are implementing a pre-investigated plan. The user will tell you which plan to read under `./.context/plans/`.

## Process

### Step 1: Read the plan

Read the plan file thoroughly. Understand the full scope before touching any code.

### Step 2: Read skills

The plan's **Skills** section lists which project skill files to read. Read ALL of them from `./.context/skills/` before writing any code. This is non-negotiable.

### Step 3: Load all context

Before writing a single line of code, you MUST read every file and reference mentioned in the plan. This is non-negotiable.

Also read the relevant manifest files before running commands. At minimum, read the root `package.json` and any package-level manifest the plan touches. If the plan relies on library behavior and the reference may be stale or incomplete, inspect installed package metadata and lockfiles, then verify version matched official source and tests through `~/src/oss/.versions/` before coding. Reuse an existing shared version checkout, and create one only if missing.

Extract every file path from:

- **Implementation Checklist** — every `path/to/file.ts:line` reference. Read each file to understand the current state of the code you're about to modify or extend.
- **References** — every path listed in the references section. These contain verbatim code snippets the plan author verified during investigation. Read the actual files to confirm they still match (the codebase may have changed since the plan was written).
- **Test Plan** — every test file mentioned. Read existing test files to understand patterns, helpers, and setup conventions before writing new tests.
- **Current State** — any files or branches mentioned. Check `git status` and `git log` to understand where you're starting from.

Read these files in parallel where possible. If any file referenced in the plan no longer exists or has changed significantly, do NOT blindly continue. Investigate the drift, update the plan if the correction is mechanical, and only stop to tell the user if the drift changes scope materially or invalidates the plan's goal.

Before changing code, be able to state the intent, inputs, outputs, invariants, error cases, domain expectations, and caller contracts for every implementation surface you will touch. If you cannot, read more surrounding code, relevant callers and callees, types or schemas, configuration, and existing tests before continuing.

If you need more context during implementation, use agents for narrow factual follow-ups. Use `fast-lookup` for exact definitions and signatures. Use `quick-dive` for local structure. Use `deep-dive` only for targeted subsystem or library questions.

### Step 4: Implement

Work through the implementation checklist in order. Each checkbox is a discrete task — complete it fully before moving to the next.

**TDD vs Additive items:** Checklist items are marked `[TDD]` or `[Additive]`. For `[TDD]` items, the test checkbox appears before the implementation checkbox. Follow Red Green Refactor strictly:

1. Red: write the test, run it, and confirm it fails for the expected behavioral reason. This is non-negotiable. The test must fail because observable behavior is absent or wrong, not because it expects a private implementation detail. If it passes before implementation, the test is wrong or the behavior already exists. Investigate before proceeding.
2. Green: only after Red, write the implementation code, rerun the same test, and confirm it passes.
3. If the test stays Red because the test or harness is wrong, revert the implementation, fix the test or harness, prove Red again, reapply the implementation, and rerun until Green.
4. If the test stays Red because the implementation is wrong, keep the test and adjust the implementation until Green.
5. Refactor: once Green, simplify only when behavior is preserved, then rerun the relevant checks.

For `[Additive]` items, implement first, then write tests. The tests must assert observable behavior or public contracts. Do not add tests that merely restate the implementation, mirror private control flow, or duplicate the code's logic in the assertion.

**Lint and typecheck continuously.** After writing or modifying any file (implementation or test), run the project's linter and typechecker before doing anything else. Check `package.json` for available `lint`, `typecheck`, `check`, or `tsc` scripts. Fix all errors before moving on. Do NOT defer lint/typecheck fixes to the end.

**After completing each checkbox item**, immediately update the plan file to check it off: change `- [ ]` to `- [x]`. This tracks progress in the plan itself so that if the session is interrupted, anyone can see exactly what's done and what remains.

Use the references section if you hit unexpected behavior. If the plan's references do not resolve the uncertainty, verify the real library or framework source and tests before guessing. Confirm the exact inputs, outputs, errors, and lifecycle expectations you are relying on. If reality contradicts the plan, update the plan first, then continue. Do not silently diverge from it.

### Step 5: Test

Write any remaining tests described in the test plan that weren't already covered by TDD items. Run the full relevant test set to confirm they pass.

### Step 6: Deep review pass

After implementation and planned tests are complete, review the actual code before you simplify it.

1. Select the relevant code reviewers directly. Always include `reviewer-logic` and `test-reviewer`. Include `effect-reviewer` for any implementation that imports, configures, tests, or meaningfully interacts with Effect or Effect ecosystem packages. Include `reviewer-behavioral` for existing contracts or shared utilities, `reviewer-data-integrity` for persistence or failure paths, `reviewer-security` for untrusted input or sensitive boundaries, `reviewer-concurrency` for async ordering or lifecycle concerns, `reviewer-performance` for hot paths, large data, UI rendering, responsiveness, I/O, database or network access, queues, workers, caching, retries, batching, backpressure, allocation heavy paths, or time complexity, and `reviewer-rules` for config, migrations, dependencies, or explicit repository rules
2. Spawn the reviewers in parallel with the full list of modified files and note that the work is an uncommitted implementation from a plan
3. Tell each reviewer that the modified files/current diff are the review boundary. They may inspect outside files only to validate direct callers, guards, tests, rules, or integration points causally connected to the modified code
4. Require each bug reviewer to use Red Green Refactor for every candidate finding. They must inspect installed package metadata and version matched official library source and tests through `~/src/oss/.versions/` before writing any regression test that depends on third party library or framework behavior and using those tests for harness, composition, setup, and assertion patterns. This applies to any library, including Effect and Effect ecosystem packages. They must use metadata fields such as `repository.url`, `repository.directory`, exports, and version to find monorepo package directories. Red: write the smallest regression test and prove it fails for the suspected reason before changing production code. Green: apply the smallest fix in place and prove the same test passes. If Green is still Red because the test or harness is wrong, they must revert the production fix, fix the test or harness, rerun it against the unfixed production code, prove Red again, reapply the fix, and rerun until Green. If Green is still Red because the fix is wrong, they must keep the test and adjust the fix until Green. Refactor: once Green, simplify only when behavior is preserved and rerun the relevant checks. Confirmed reviewers must leave the valid regression test and fix in the worktree and report the test path, exact test code, Red output before the fix, Green output after the fix, and the fix they applied. If the candidate is not reproduced or the harness is blocked after multiple real attempts, reviewers must remove any probe test and fix edits before returning and report the exact code and commands tried as an unconfirmed candidate
5. Wait for the reviewers to finish before doing your own review in the same scope
6. Validate each finding yourself before changing code
7. Treat high-confidence findings as only those reproduced by a failing regression test. If the regression test is correct and does not fail, treat the finding as a false positive and move on
8. Fix valid findings and rerun the relevant checks
9. Update the plan if any validated finding changes the implementation path or test plan materially

### Step 7: Simplification pass

After all implementation and tests are complete, spawn these agents **in parallel** with the full list of files you created or modified during implementation:

1. **`code-simplifier`**: finds verified reductions in total complexity across directly connected architecture, installed library capabilities, module boundaries, data flow, and local code. It proves every candidate in isolated executable repository snapshots before reporting it
2. **`reuse-reviewer`** — finds cross-file issues: reimplemented utilities, duplicate helpers across files, pass-through wrappers, dead private helpers, redundant normalization layers
3. A domain-specific reviewer when the stack clearly warrants it

**Each agent prompt must include:**

- The complete list of files created or modified (full paths)
- A note that these files were just implemented from a plan
- The task goal and plan path so the agent can recover the intended behavioral contract

Wait for the agents to finish before doing your own simplification or reuse pass in the same scope.

**When results come back**, validate each finding yourself:

1. Read the code each agent flagged
2. For each finding, verify that the change genuinely preserves behavior. Check callers, tests, and contracts
3. Apply changes that are clearly correct and beneficial
4. Skip suggestions that would remove intentional guarantees, reduce clarity, or break contracts
5. If you apply any changes, re-run linter, typechecker, and tests to confirm nothing broke

Do not blindly apply findings. Validate the reported proof against the current worktree before applying it. Your job is final precision.

### Step 8: Verify

Follow the verification section to confirm the implementation works end-to-end.
