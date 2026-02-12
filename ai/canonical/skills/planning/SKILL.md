---
name: planning
description: Planning mode for investigating and producing implementation plans. Use when the user wants to plan a feature, investigate before implementing, or create a plans document. Triggers on "plan", "investigate", "design", planning mode.
---

# Planning Mode

You are in planning mode. You do NOT write implementation code. You do NOT start working on the task. You investigate, understand, and produce an exhaustive plan document that someone else — with zero prior context — can follow to implement the feature.

**CRITICAL:** When the user gives you a task, do NOT begin implementing it. Follow the planning steps below strictly. Your ONLY output is a plan document.

The only code you may write is temporary verification code (e.g. confirming a library method behaves as expected). Delete temp files immediately after.

Do NOT use Claude Code's built-in plan mode (EnterPlanMode/ExitPlanMode). You are already in planning mode via this profile — using the built-in one will conflict. Just investigate and write the plan document directly.

## Output

Write the plan to `./.context/plans/<feature-name>.md` (infer feature name from the user's prompt). The `.context/plans/` directory is gitignored.

## Deep-Dive Agent Boundaries (NON-NEGOTIABLE)

Deep-dive agents excel at **structural exploration** — understanding how code is organized, how libraries work, what patterns exist. They do NOT have your conversation context or access to sub-agents, so they get stuck on open-ended problem-solving.

**USE deep-dive agents for:**

- How does library X implement feature Y? (structural)
- What's the API surface / data flow of module Z? (structural)
- What patterns does this codebase follow for X? (structural)
- Find all consumers of X and how they use it (structural)
- How does this library expect you to test modules that use it? (structural)

**DO NOT delegate to deep-dive agents:**

- "Investigate why X doesn't work" — you have the full context, they don't
- "Figure out the root cause of this issue" — requires iterative debugging with context
- "Determine if approach A or B is correct" — requires weighing trade-offs you understand
- Any problem-solving that requires running code, testing hypotheses, or iterative exploration

**When you hit a problem during planning:** investigate it yourself. You have the full conversation context, can run code, and can spawn targeted fast-lookup/deep-dive agents for specific factual questions ("what does method X return?", "how is Y structured?") — but the synthesis and problem-solving stays with you.

## Planning Steps (follow in order)

### Step 1: Establish Current State

Before spawning any agents:

1. Run `git diff main...HEAD` (or appropriate base branch) to understand what work already exists on this branch
2. Search for partial implementations that may already address the task
3. Identify what's done vs what's missing

### Step 2: E2E Structural Investigation (parallelize agents)

Spawn deep-dive agents IN PARALLEL to map out the structure — not just the layer you're working on. Give each agent a specific structural question, NOT an open-ended problem to solve:

- If it's a frontend task: spawn one deep-dive on the frontend code AND one on the backend/API code simultaneously
- If it's a backend task: spawn one deep-dive on the backend AND one on the frontend consumers simultaneously
- If it touches a library: spawn a deep-dive on `.context/oss/<lib>` (or clone it first if not there)

The goal is to map: how data flows end-to-end, what the existing code structure is, what conventions exist. The agents report back structure — YOU synthesize meaning and make decisions.

### Step 3: Convention & Duplication Check

ONLY after Step 2 agents return, spawn a new deep-dive agent to:

- Search for existing utilities, helpers, patterns, components that could be reused
- Identify the conventions the codebase follows (naming, file structure, error handling patterns, etc.)
- Find similar features already implemented that this should mirror
- Check for code that can be extended rather than duplicated

This step MUST wait for Step 2 to complete — you need the full picture before you can search for reusable code intelligently.

### Step 4: Library Investigation

If the task involves third-party libraries:

- Spawn deep-dive agents on `.context/oss/<lib>` to understand the library internals
- Use fast-lookup agents to get exact API signatures, types, return values
- If unsure about behavior: write a temporary test file, run it, confirm, delete the file
- NEVER guess library behavior — verify it

### Step 5: Clarify with User

If the implementation requires decisions that aren't clear from the codebase or the user's prompt:

- Ask the user specific questions (not vague ones)
- Present options with trade-offs when relevant
- Do NOT proceed with assumptions on ambiguous requirements

### Step 6: Write the Plan

Once you have ALL information, write the plan document to `./.context/plans/<feature-name>.md`.

## Plan Document Structure

The plan must be comprehensive enough for someone with NO context to implement it directly.

### 1. Skills

List the skills the implementer MUST load (via the Skill tool) before writing any code. Refer to the skill trigger table in the global instructions to determine which skills apply based on the domains this plan touches.

### 2. Summary

One sentence describing what's being implemented and why.

### 3. Current State

What already exists — branch state, partial implementations, relevant existing code.

### 4. Implementation Checklist

Ordered, actionable tasks. Each task is a checkbox:

- [ ] **Task description** — `full/file/path.ts:line` — specific action
  - Verbatim code to write (copy-paste ready)
  - Exact import statements
  - Full type signatures copied from the codebase

**Zero ambiguity — NON-NEGOTIABLE:**

- BAD: "Check if the method already exists or if we need to add it"
- BAD: "Update the handler (or create one if needed)"
- BAD: "Maybe use X if it supports Y"
- GOOD: "Add method `processItem` to `ItemService` at `src/services/item.ts:45` — method does not exist"
- GOOD: "Create `src/handlers/submit.ts` (file does not exist)"

**Conceptual code, not copy-paste code:**

The implementing agent will write the actual code. Your job is to describe WHAT to implement with enough precision that there's only one correct interpretation. Include:

- Exact function/method names, parameter names and types, return types
- Which existing functions/utilities to call (with their paths)
- The logic flow — what happens step by step
- What CAN'T work and why (if you discovered this during investigation)
- What WILL work and why (backed by your investigation)

You do NOT need to write final implementation code. Write conceptual code that conveys the intent unambiguously — the implementing agent turns it into real code. The key is: every decision is already made. The implementer executes, they don't decide.

### 5. Test Plan

Every file/module created MUST have tests. No exceptions.

**How to figure out testing approach:**

1. Look at the project's existing tests first — match the patterns, frameworks, and conventions already in use
2. If working with an external library: spawn a deep-dive agent on it asking how to properly test modules that use it (mocking strategies, test utilities the lib provides, etc.)

**Test types by scope:**

- **Integration tests** (preferred when possible): test real interactions between modules/services. These protect most against regressions. Use for anything domain-scoped (repositories, services, handlers, API routes)
- **Unit tests** (required for scoped utilities): regexes, parsing, transformations, data mappers, validators — anything that is self-contained and not domain-scoped
- **Frontend tests**: assert that X is rendered when Y happens. Protect against UX regressions. Tests must reflect actual product use-cases, not implementation details
- **When integration tests aren't feasible** (third-party APIs, external services): mock at the boundary and test the logic around it

**Non-negotiable test quality:**

- No superfluous tests — don't test the same behavior twice with trivial variations
- No testing implementation details — test behavior and outcomes
- Every test must be actually useful: if it can't catch a real regression, don't write it
- Cover realistic edge cases: empty inputs, null values, error paths that users can trigger

For each file being created/modified:

- Whether a test file already exists
- Which test cases need updating or creating
- Expected behavior for each test case
- Conceptual test code describing what to assert and how

### 6. Verification

How to verify the implementation works — test commands, expected behavior, manual checks.

### 7. References

A numbered list (nested, no tables) of investigation findings that may be useful if the implementer hits issues. These are NOT a substitute for a comprehensive plan — the plan itself must be self-sufficient. References are a safety net for edge cases.

**Verbatim code is NON-NEGOTIABLE for references.** When referencing external code (library internals, upstream APIs, existing patterns to follow), always include the actual verbatim code snippet — not a paraphrase or summary of what it does. The implementer needs to see the real code to understand the exact signatures, patterns, and behavior they're working with.

Format:

```
1. <Topic>
   - Path: `full/file/path.ts:line`
   - Code:
     ```ts
     // exact verbatim snippet from the source file
     ```
   - Why it matters: when the implementer would need this and what it tells them
```

Only include references that address realistic failure modes — not a dump of everything you found.
