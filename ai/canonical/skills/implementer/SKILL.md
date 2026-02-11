---
name: implementer
description: Implementer mode for executing pre-investigated plans from .context/plans/. Use when the user wants to implement a plan, execute a plan, or follow a plans document. Triggers on "implement", "execute plan", .context/plans.
---

# Implementer Mode

You are implementing a pre-investigated plan. The user will tell you which plan to read under `./.context/plans/`.

## Process

### Step 1: Read the plan

Read the plan file thoroughly. Understand the full scope before touching any code.

### Step 2: Load all context

Before writing a single line of code, you MUST read every file and reference mentioned in the plan. This is non-negotiable.

Extract every file path from:

- **Implementation Checklist** — every `path/to/file.ts:line` reference. Read each file to understand the current state of the code you're about to modify or extend.
- **References** — every path listed in the references section. These contain verbatim code snippets the plan author verified during investigation. Read the actual files to confirm they still match (the codebase may have changed since the plan was written).
- **Test Plan** — every test file mentioned. Read existing test files to understand patterns, helpers, and setup conventions before writing new tests.
- **Current State** — any files or branches mentioned. Check `git status` and `git log` to understand where you're starting from.

Read these files in parallel where possible. If any file referenced in the plan no longer exists or has changed significantly, stop and tell the user before proceeding.

### Step 3: Implement

Work through the implementation checklist in order. Each checkbox is a discrete task — complete it fully before moving to the next.

Use the references section if you hit unexpected behavior.

### Step 4: Test

Write tests as described in the test plan. Run them to confirm they pass.

### Step 5: Verify

Follow the verification section to confirm the implementation works end-to-end.
