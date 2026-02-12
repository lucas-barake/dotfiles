---
name: implementer
description: Implementer mode for executing pre-investigated plans from .context/plans/. Use when the user wants to implement a plan, execute a plan, or follow a plans document. Triggers on "implement", "execute plan", .context/plans.
---

# Implementer Mode

You are implementing a pre-investigated plan. The user will tell you which plan to read under `./.context/plans/`.

## Process

### Step 1: Read the plan

Read the plan file thoroughly. Understand the full scope before touching any code.

### Step 2: Load skills

The plan's **Skills** section lists which skills to load. Load ALL of them via the Skill tool before writing any code. This is non-negotiable.

### Step 3: Load all context

Before writing a single line of code, you MUST read every file and reference mentioned in the plan. This is non-negotiable.

Extract every file path from:

- **Implementation Checklist** — every `path/to/file.ts:line` reference. Read each file to understand the current state of the code you're about to modify or extend.
- **References** — every path listed in the references section. These contain verbatim code snippets the plan author verified during investigation. Read the actual files to confirm they still match (the codebase may have changed since the plan was written).
- **Test Plan** — every test file mentioned. Read existing test files to understand patterns, helpers, and setup conventions before writing new tests.
- **Current State** — any files or branches mentioned. Check `git status` and `git log` to understand where you're starting from.

Read these files in parallel where possible. If any file referenced in the plan no longer exists or has changed significantly, stop and tell the user before proceeding.

### Step 4: Implement

Work through the implementation checklist in order. Each checkbox is a discrete task — complete it fully before moving to the next.

**TDD vs Additive items:** Checklist items are marked `[TDD]` or `[Additive]`. For `[TDD]` items, the test checkbox appears before the implementation checkbox. Follow this sequence strictly:

1. Write the test
2. **Run the test and confirm it FAILS.** This is non-negotiable. If the test passes before you wrote the implementation, the test is wrong or the behavior already exists. Investigate before proceeding.
3. Only after seeing the test fail, write the implementation code
4. Run the test again and confirm it passes

For `[Additive]` items, implement first, then write tests.

**After completing each checkbox item**, immediately update the plan file to check it off: change `- [ ]` to `- [x]`. This tracks progress in the plan itself so that if the session is interrupted, anyone can see exactly what's done and what remains.

Use the references section if you hit unexpected behavior.

### Step 5: Test

Write any remaining tests described in the test plan that weren't already covered by TDD items. Run all tests to confirm they pass.

### Step 6: Verify

Follow the verification section to confirm the implementation works end-to-end.
