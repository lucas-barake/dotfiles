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

Deep-dive agents automatically persist their findings to `.context/deep-dives/`. Before spawning, check that directory for existing investigations that might already cover what you need.

Spawn deep-dive agents IN PARALLEL to map out the structure — not just the layer you're working on. Give each agent a specific structural question, NOT an open-ended problem to solve:

- If it's a frontend task: spawn one deep-dive on the frontend code AND one on the backend/API code simultaneously
- If it's a backend task: spawn one deep-dive on the backend AND one on the frontend consumers simultaneously
- If it touches a library: spawn a deep-dive on `~/src/oss/<lib>` (or clone it first if not there)

The goal is to map: how data flows end-to-end, what the existing code structure is, what conventions exist. The agents report back structure — YOU synthesize meaning and make decisions.

### Step 3: DRY & Reuse Audit

ONLY after Step 2 agents return, spawn a new deep-dive agent to find what already exists that you can reuse. The goal is NOT to mimic the project's conventions blindly. Most projects accumulate bad patterns, dead abstractions, and inconsistent conventions over time. Following those is cargo-culting, not engineering.

**What the agent MUST find:**

- Existing utilities, helpers, modules, components that overlap with what you're about to build
- Shared infrastructure (error handling, validation, HTTP clients, DB access patterns) that the plan should use instead of reinventing
- Code that can be extended or composed with rather than duplicated

**What you MUST evaluate (this is YOUR job, not the agent's):**

- Is the existing code actually good? Does it follow sound principles, or is it legacy cruft?
- If existing code is poorly structured: plan to use it where necessary but do NOT propagate its patterns into new code
- If existing code is well-structured: reuse it and follow its patterns
- What utilities or abstractions are MISSING that this plan will need to create?
- What existing code will the plan need to refactor or extend to support the new feature?

The agent reports what exists. You decide what's worth reusing, what's worth extending, and what should be ignored or replaced. Do NOT default to "follow existing conventions." Default to "follow sound engineering, reuse what's good, ignore what's bad."

### Step 4: Library Investigation

If the task involves third-party libraries, you MUST investigate them before planning any code that uses them. LLMs default to training data patterns. If those patterns are outdated or wrong for the specific library version, the implementer will write bad code. Your job is to give the implementer the real patterns from the actual source.

1. **Get the source.** Ensure `~/src/oss/<lib>` exists (clone it if not). This is your source of truth, not training data.
2. **Understand the API surface.** Spawn fast-lookup agents for exact signatures, types, return values of every API the plan will use. Do not guess a single parameter type or return value.
3. **Find idiomatic usage from source code.** Spawn a deep-dive agent on the library source. Prioritize source code and test files over documentation. Docs go stale. Source code is the truth. Ask:
   - How does the library's own test suite exercise this feature? (test files are the best usage examples)
   - How does the library's internal code use this feature? (internal usage patterns)
   - What setup, initialization, or composition patterns do the tests use?
   - Are there any anti-patterns, deprecations, or "don't do this" that the source reveals?
   - Only check docs/READMEs as a secondary source if the tests and source don't give a clear enough picture
4. **Capture what the implementer needs.** Every finding flows into References (Section 7):
   - Verbatim code showing the idiomatic usage pattern
   - API signatures with exact types
   - Anti-patterns to avoid (with explanation of what goes wrong)
   - Any required setup, configuration, or initialization the library expects
5. **Verify when uncertain.** If behavior is ambiguous even after investigation: write a temporary test file, run it, confirm, delete the file. NEVER leave uncertainty in the plan.

### Step 5: Clarify with User

If the implementation requires decisions that aren't clear from the codebase or the user's prompt:

- Ask the user specific questions (not vague ones)
- Present options with trade-offs when relevant
- Do NOT proceed with assumptions on ambiguous requirements

### Step 6: Classify Items as TDD or Additive

Before writing the plan, classify each planned change:

- **Modifying existing code** (changing behavior, refactoring, fixing bugs): these items MUST follow TDD. The checklist must order the test BEFORE the implementation. Write the failing test first, then make it pass.
- **Additive code** (new files, new functions, new modules with no existing behavior to preserve): no TDD required. Tests come after implementation as normal.

This classification drives the ordering within the Implementation Checklist.

### Step 7: Confirm Approach with User

Before writing the full plan document, present a brief overview to the user for approval. This prevents wasted effort on a plan the user would reject or redirect.

The overview must cover:

- **Approach:** the implementation strategy and how it fits into the existing architecture
- **Key decisions:** any non-obvious choices you made during investigation
- **Scope:** files that will be created or modified
- **Open questions:** anything you're unsure about (if none, say so)

Wait for the user to approve, adjust, or redirect before proceeding. If the user wants changes, loop back to whichever earlier step is needed. Do NOT write the plan until the user confirms.

### Step 8: Write the Plan

Once you have ALL information and user confirmation, write the plan document to `./.context/plans/<feature-name>.md`.

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

**TDD vs Additive ordering:**

A single plan will often contain both kinds of items. For each item, determine which applies:

- **Modifying existing code** (changing behavior, refactoring, fixing bugs) → TDD. The test checkbox comes BEFORE the implementation checkbox. The implementer writes the failing test first, then makes it pass. Mark these items with `[TDD]`.
- **Additive code** (new files, new functions, no existing behavior affected) → tests after implementation as normal. Mark these items with `[Additive]`.

Both can coexist in the same checklist. The markers tell the implementer which workflow to follow for each group.

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
- **Reference links**: for any non-trivial library usage, point to the specific reference: "follow the pattern in Reference #N." The implementer should not have to guess which reference applies to which task

You do NOT need to write final implementation code. Write conceptual code that conveys the intent unambiguously — the implementing agent turns it into real code. The key is: every decision is already made. The implementer executes, they don't decide.

### 5. Test Plan

Every file/module created MUST have tests. No exceptions.

**Test source investigation (NON-NEGOTIABLE):**

Before writing ANY test plan, you MUST understand how to test the code you're planning. This means investigating the source of whatever the tests depend on.

1. **Check for an available testing skill first.** If a skill exists for testing library X (e.g., `effect-testing`, `effect-ai-testing`, `effect-rpc-testing`), check whether it covers the specific use case the plan requires. If it does, use it. If it doesn't cover the particular scenario, proceed to step 2.
2. **No skill or insufficient skill coverage? Investigate the library source.** Spawn a deep-dive agent on `~/src/oss/<lib>` (clone it first if not there). Prioritize source code and test files over documentation. Docs go stale. The library's own test suite is the canonical reference for how to test code that uses it. Ask:
   - Find the library's test files for the specific feature/module you're using. How do THEY test it?
   - What test utilities, mocks, fakes, or helpers does the library provide for consumers? (look at their test infrastructure, not just their docs)
   - What setup/teardown patterns do their tests use? (Layer composition, test harnesses, mock providers, etc.)
   - What assertions and verification patterns do their tests demonstrate?
3. **Capture everything the implementer needs.** The deep-dive findings MUST flow into the plan:
   - Exact test utility imports and their file paths in the library source
   - Verbatim code snippets showing how the library tests the relevant feature
   - The testing pattern the implementer should follow, with concrete references
   - Any gotchas, required setup, or non-obvious configuration

The implementer agent has no context beyond the plan document. If you don't include the test patterns, references, and utility signatures, the implementer will guess and get it wrong. Every test-related reference belongs in the References section (Section 7) with verbatim code from the library source.

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
- **Source references**: which library test patterns to follow, with paths to the relevant examples in `~/src/oss/`

### 6. Verification

How to verify the implementation works — test commands, expected behavior, manual checks.

### 7. References

A numbered list (nested, no tables) of investigation findings. References are the implementer's primary source of truth for writing correct code. The implementer agent pattern-matches on whatever examples it has. If you give it good examples from actual library source, it writes good code. If you give it nothing, it falls back to training data patterns that may be outdated or wrong.

**What MUST be in references:**

- **Idiomatic usage patterns**: verbatim code from the library's test files and source code showing the correct way to use the APIs the plan requires. This is the most important category. It overrides the implementer's training data biases. Prioritize test files as examples over docs
- **API signatures and types**: exact function signatures, parameter types, return types from the actual source (not from memory)
- **Anti-patterns**: what NOT to do, with explanation of what goes wrong. LLMs reach for common patterns by default. If the common pattern is wrong here, say so explicitly
- **Test patterns**: how the library tests the feature (covered in Section 5, but the verbatim code lives here)
- **Edge case handling**: realistic failure modes and how to handle them

**What does NOT belong in references:**

- Everything you found during investigation. Only include what the implementer will actually need
- Paraphrases or summaries. Verbatim code or nothing
- References that no checklist item points to. Every reference should be linked from at least one checklist item

**Verbatim code is NON-NEGOTIABLE.** When referencing external code (library internals, upstream APIs, existing patterns to follow), always include the actual verbatim code snippet. The implementer needs to see the real code to understand the exact signatures, patterns, and behavior they're working with.

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
