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

Also read the relevant manifest files before running commands. At minimum, read the root `package.json` and any package-level manifest the plan touches. If the plan relies on library behavior and the reference may be stale or incomplete, verify the source under `~/src/oss/` before coding.

Extract every file path from:

- **Implementation Checklist** — every `path/to/file.ts:line` reference. Read each file to understand the current state of the code you're about to modify or extend.
- **References** — every path listed in the references section. These contain verbatim code snippets the plan author verified during investigation. Read the actual files to confirm they still match (the codebase may have changed since the plan was written).
- **Test Plan** — every test file mentioned. Read existing test files to understand patterns, helpers, and setup conventions before writing new tests.
- **Current State** — any files or branches mentioned. Check `git status` and `git log` to understand where you're starting from.

Read these files in parallel where possible. If any file referenced in the plan no longer exists or has changed significantly, do NOT blindly continue. Investigate the drift, update the plan if the correction is mechanical, and only stop to tell the user if the drift changes scope materially or invalidates the plan's goal.

If you need more context during implementation, use agents for narrow factual follow-ups. Use `fast-lookup` for exact definitions and signatures. Use `quick-dive` for local structure. Use `deep-dive` only for targeted subsystem or library questions.

### Step 4: Implement

Work through the implementation checklist in order. Each checkbox is a discrete task — complete it fully before moving to the next.

**TDD vs Additive items:** Checklist items are marked `[TDD]` or `[Additive]`. For `[TDD]` items, the test checkbox appears before the implementation checkbox. Follow this sequence strictly:

1. Write the test
2. **Run the test and confirm it FAILS.** This is non-negotiable. If the test passes before you wrote the implementation, the test is wrong or the behavior already exists. Investigate before proceeding.
3. Only after seeing the test fail, write the implementation code
4. Run the test again and confirm it passes

For `[Additive]` items, implement first, then write tests.

**Lint and typecheck continuously.** After writing or modifying any file (implementation or test), run the project's linter and typechecker before doing anything else. Check `package.json` for available `lint`, `typecheck`, `check`, or `tsc` scripts. Fix all errors before moving on. Do NOT defer lint/typecheck fixes to the end.

**After completing each checkbox item**, immediately update the plan file to check it off: change `- [ ]` to `- [x]`. This tracks progress in the plan itself so that if the session is interrupted, anyone can see exactly what's done and what remains.

Use the references section if you hit unexpected behavior. If the plan's references do not resolve the uncertainty, verify the real library or framework source before guessing. If reality contradicts the plan, update the plan first, then continue. Do not silently diverge from it.

### Step 5: Test

Write any remaining tests described in the test plan that weren't already covered by TDD items. Run the full relevant test set to confirm they pass.

### Step 6: Deep review pass

After implementation and planned tests are complete, review the actual code before you simplify it.

1. Select the relevant code reviewers directly. Always include `reviewer-logic` and `test-reviewer`. Include `reviewer-behavioral` for existing contracts or shared utilities, `reviewer-data-integrity` for persistence or failure paths, `reviewer-security` for untrusted input or sensitive boundaries, `reviewer-concurrency` for async ordering or lifecycle concerns, and `reviewer-rules` for config, migrations, dependencies, or explicit repository rules
2. Spawn the reviewers in parallel with the full list of modified files and note that the work is an uncommitted implementation from a plan
3. Tell each reviewer that the modified files/current diff are the review boundary. They may inspect outside files only to validate direct callers, guards, tests, rules, or integration points causally connected to the modified code
4. Require each bug reviewer to write the smallest regression test for every candidate finding and run the narrowest relevant command to prove it fails for the suspected reason. If the test confirms a real issue, reviewers must leave the regression test edits in the worktree and report the changed test file path, exact test code, command, and failing output. If the candidate is not reproduced or the harness is blocked after multiple real attempts, reviewers must remove any probe test edits before returning and report the exact test code and commands tried as an unconfirmed candidate
5. Validate each finding yourself before changing code
6. Treat high-confidence findings as only those reproduced by a failing regression test. If the regression test is correct and does not fail, treat the finding as a false positive and move on
7. Fix valid findings and rerun the relevant checks
8. Update the plan if any validated finding changes the implementation path or test plan materially

### Step 7: Simplification pass

After all implementation and tests are complete, spawn two agents **in parallel** with the full list of files you created or modified during implementation:

1. **`code-simplifier`** — finds within-file simplifications: redundant variables, verbose control flow, unnecessary async/types, dead indirection, nested Pipeable calls, overengineered patterns, overly defensive code
2. **`reuse-reviewer`** — finds cross-file issues: reimplemented utilities, duplicate helpers across files, pass-through wrappers, dead private helpers, redundant normalization layers

**Each agent prompt must include:**

- The complete list of files created or modified (full paths)
- A note that these files were just implemented from a plan

**When results come back**, validate each suggestion yourself:

1. Read the code each agent flagged
2. For each suggestion, verify that the change genuinely preserves behavior. Check callers, tests, and contracts
3. Apply changes that are clearly correct and beneficial
4. Skip suggestions that would remove intentional guarantees, reduce clarity, or break contracts
5. If you apply any changes, re-run linter, typechecker, and tests to confirm nothing broke

Do not blindly apply all suggestions. Both agents maximize recall. Your job is precision.

In addition to `code-simplifier` and `reuse-reviewer`, include a domain-specific reviewer when the stack clearly warrants it.

### Step 8: Verify

Follow the verification section to confirm the implementation works end-to-end.
