---
name: planning
description: Planning mode for investigating and producing implementation plans. Use when the user wants to plan a feature, investigate before implementing, or create a plans document. Triggers on "plan", "investigate", "design", planning mode.
---

# Planning Mode

You are in planning mode. You do NOT write implementation code. You do NOT start working on the task. You investigate, understand, and produce an exhaustive plan document that someone else — with zero prior context — can follow to implement the feature.

**CRITICAL:** When the user gives you a task, do NOT begin implementing it. Follow the planning steps below strictly. Your primary output is a plan document.

The only code you may write is:

- temporary verification code (e.g. confirming a library method behaves as expected). Delete temp files immediately after
- for bug-fix tasks only, the regression test that reproduces the bug. This is the only durable repo code the planning skill may write

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

1. Determine the true base branch. Prefer the current branch's upstream merge base, then the remote default branch, then `main`, `master`, `develop`, or `development`
2. Run `git diff <base-branch>...HEAD` and inspect the current branch state to understand what work already exists
3. Search for partial implementations that may already address the task
4. Identify what's done, what's missing, and what constraints the existing branch state already introduces

### Step 2: E2E Structural Investigation (parallelize agents)

Deep-dive agents automatically persist their findings under `.context/deep-dives/<current-branch>/`, but planning must investigate fresh for the current task. Do not treat prior investigations as a source of truth and do not skip new investigation because a similarly named artifact already exists.

Spawn agents IN PARALLEL to map out the structure, not just the layer you're working on. Give each agent a specific structural question, NOT an open-ended problem to solve:

- Every prompt must be highly specific and self contained. Include the exact paths, directories, symbols, or libraries to inspect, the exact structural question to answer, why it matters for the plan, any exclusions, and the exact response format you want back
- Prefer multiple narrow prompts over one broad prompt. Each agent should answer one tightly scoped question well

- Use `quick-dive` for affected modules and adjacent consumers or providers
- Use `deep-dive` for subsystem traces, end-to-end flow, cross-file conventions, and library-adjacent structural questions
- Use `fast-lookup` for exact definitions, exports, signatures, and return shapes
- If it's a frontend task: spawn one investigation on the frontend code AND one on the backend or API code simultaneously
- If it's a backend task: spawn one investigation on the backend AND one on the frontend or CLI consumers simultaneously
- If it's a CLI, worker, job, or game loop task: spawn one investigation on the entry surface AND one on the downstream systems it coordinates with
- If it touches a library: spawn an investigation on `~/src/oss/<lib>` or clone it first if not there

The goal is to map how data flows end to end, what the existing code structure is, what conventions exist, and where the real integration boundaries live. The agents report structure. YOU synthesize meaning and make decisions.

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

1. **Read the real manifests first.** Read `package.json`, workspace manifests, or the relevant dependency manifests before planning commands or imports. Know the real versions and scripts.
2. **Get the source.** Ensure `~/src/oss/<lib>` exists (clone it if not). This is your source of truth, not training data.
3. **Understand the API surface.** Spawn fast-lookup agents for exact signatures, types, return values of every API the plan will use. Do not guess a single parameter type or return value.
4. **Find idiomatic usage from source code.** Spawn a deep-dive agent on the library source. Prioritize source code and test files over documentation. Docs go stale. Source code is the truth. Ask:
   - How does the library's own test suite exercise this feature? (test files are the best usage examples)
   - How does the library's internal code use this feature? (internal usage patterns)
   - What setup, initialization, or composition patterns do the tests use?
   - Are there any anti-patterns, deprecations, or "don't do this" that the source reveals?
   - Only check docs/READMEs as a secondary source if the tests and source don't give a clear enough picture
5. **Capture what the implementer needs.** Every finding flows into References (Section 7):
   - Verbatim code showing the idiomatic usage pattern
   - API signatures with exact types
   - Anti-patterns to avoid (with explanation of what goes wrong)
   - Any required setup, configuration, or initialization the library expects
6. **Verify when uncertain.** If behavior is ambiguous even after investigation: write a temporary test file, run it, confirm, delete the file. NEVER leave uncertainty in the plan.

### Step 5: External Reference Investigation

For anything beyond a tiny local change, investigate how strong external codebases solve the same class of problem. This is especially important for product behavior, interaction patterns, concurrency, caching, uploads, editors, feeds, background jobs, synchronization, recovery flows, and other non-trivial engineering problems.

1. Use the `web-search` agent to find high trust references
2. Prioritize official docs, mature open source libraries, mature open source application code, and engineering writeups from established teams
3. Reject weak references. Do not base a plan on thin tutorials, low trust blogs, or obviously low quality repositories
4. Clone the strongest open source references into `~/src/oss/` if they are not already present
5. Spawn agents on the cloned repositories to study:
   - how they structure the feature end to end
   - what tests they use
   - what architectural constraints they chose
   - what tradeoffs or failure modes they account for
6. Extract principles, not cargo cult code. The point is to translate sound patterns into the target repository and stack
7. Record accepted references, rejected references, and why each decision was made

### Step 6: Capture the bug with a failing regression test

This step is REQUIRED for bug-fix tasks. It is the only exception to the rule against writing implementation code.

1. Write the regression test that demonstrates the current bug in the real test suite, following the repository's existing test patterns
2. Run the narrowest relevant test command and confirm the test FAILS for the expected reason
3. If the test passes immediately, do NOT force a fake failure. Investigate whether:
   - the bug is already fixed
   - the test does not actually reproduce the bug
   - the wrong test layer or scenario was chosen
4. If you cannot produce a failing regression test after investigation, say so explicitly in the plan and explain why
5. Record the test file path, test case name, failing command, and observed failure in Current State and Test Plan

Do NOT implement the fix. Stop after the regression is reproduced and documented.

### Step 7: Clarify with User

If the implementation requires decisions that aren't clear from the codebase or the user's prompt:

- Ask the user specific questions (not vague ones)
- Present options with trade-offs when relevant
- Do NOT proceed with assumptions on ambiguous requirements

### Step 8: Classify Items as TDD or Additive

Before writing the plan, classify each planned change:

- **Modifying existing code** (changing behavior, refactoring, fixing bugs): these items MUST follow TDD. The checklist must order the test BEFORE the implementation. Write the failing test first, then make it pass.
- **Additive code** (new files, new functions, new modules with no existing behavior to preserve): no TDD required. Tests come after implementation as normal.

This classification drives the ordering within the Implementation Checklist.

### Step 9: Confirm Approach with User

Before writing the full plan document, present a brief overview to the user for approval. This prevents wasted effort on a plan the user would reject or redirect.

The overview must cover:

- **Approach:** the implementation strategy and how it fits into the existing architecture
- **Key decisions:** any non-obvious choices you made during investigation
- **Scope:** files that will be created or modified
- **Open questions:** anything you're unsure about (if none, say so)

Wait for the user to approve, adjust, or redirect before proceeding. If the user wants changes, loop back to whichever earlier step is needed. Do NOT write the plan until the user confirms.

### Step 10: Write the Plan

Once you have ALL information and user confirmation, write the plan document to `./.context/plans/<feature-name>.md`.

## Plan Document Structure

The plan must be comprehensive enough for someone with NO context to implement it directly.

### 1. Skills

List the project skill files the implementer MUST read before writing any code. Refer to the managed skills table in `./AGENTS.md` and cite the exact `./.context/skills/<name>.md` paths that apply to the plan.

### 2. Summary

One sentence describing what's being implemented and why.

### 3. Current State

What already exists, including branch state, partial implementations, relevant existing code, affected surfaces, any important constraints discovered during investigation, and for bug-fix tasks the status of the regression test you wrote during planning.

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

For bug-fix tasks, the regression test written during planning becomes the first test artifact in the plan. The implementer must use it as the starting point for the fix unless the plan explicitly documents why it could not be made to fail.

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

**Non-negotiable test principles:**

- **Test against real code.** Tests run the actual production modules. No reconstructing component trees, service graphs, or pipelines in the test file. Import the real thing, provide its real dependencies, and assert on its real behavior
- **Mock only at boundaries.** The only things that get mocked are services that interact with something you cannot run in a test: external HTTP APIs, third-party SaaS, hardware. Everything else uses the real implementation. If a library provides a test harness or in-memory implementation (e.g., test databases, fake clocks), use that instead of mocking
- **Do not test the framework.** If a library or framework guarantees behavior X, do not write a test asserting X. Test YOUR code's behavior that depends on X. Example: don't test that Effect.catchTag catches a tagged error. Test that your service returns the right fallback when the error occurs
- **No superfluous or redundant tests.** Each test must protect against a distinct regression. If two tests would fail for the same bug, keep only the more meaningful one. Trivial variations of the same scenario are noise
- **Exhaustive coverage of YOUR logic.** Every branch, edge case, and error path in the code the plan introduces or modifies MUST have a test. Happy path alone is never sufficient. Cover: empty inputs, boundary values, error paths users can trigger, concurrent access (if applicable), and state transitions
- **No testing implementation details.** Assert on observable behavior and outcomes, not on internal method calls, internal state, or execution order (unless order IS the behavior being tested)

**Exact test cases — NON-NEGOTIABLE:**

The plan must specify every test case. The implementer should not have to invent test cases. For each file being created or modified, list:

- Test file path (whether it already exists or needs creating)
- Each test case by name: `it("should <expected behavior> when <condition>")`
- What the test does: setup, action, assertion (conceptual, not copy-paste code)
- Which production module/function it exercises
- What regression it protects against (why this test exists)
- **Source references**: which library test patterns to follow, with paths to the relevant examples in `~/src/oss/`

The implementer writes the test code. Your job is to decide exactly WHICH tests exist and WHAT each one asserts. Every decision about test coverage is made in the plan, not left to the implementer.

### 6. Verification

How to verify the implementation works — test commands, expected behavior, manual checks.

### 7. References

A numbered list (nested, no tables) of investigation findings. References are the implementer's primary source of truth for writing correct code. The implementer agent pattern-matches on whatever examples it has. If you give it good examples from actual library source, it writes good code. If you give it nothing, it falls back to training data patterns that may be outdated or wrong.

**What MUST be in references:**

- **Idiomatic usage patterns**: verbatim code from the library's test files and source code showing the correct way to use the APIs the plan requires. This is the most important category. It overrides the implementer's training data biases. Prioritize test files as examples over docs
- **API signatures and types**: exact function signatures, parameter types, return types from the actual source (not from memory)
- **External product patterns**: verbatim code or exact source excerpts from cloned high-trust open source applications or libraries when the task depends on product behavior or architecture, not just local API usage
- **Anti-patterns**: what NOT to do, with explanation of what goes wrong. LLMs reach for common patterns by default. If the common pattern is wrong here, say so explicitly
- **Test patterns**: how the library tests the feature (covered in Section 5, but the verbatim code lives here)
- **Edge case handling**: realistic failure modes and how to handle them

**What does NOT belong in references:**

- Everything you found during investigation. Only include what the implementer will actually need
- Paraphrases or summaries. Verbatim code or nothing
- References that no checklist item points to. Every reference should be linked from at least one checklist item
- Weak or low-trust references that do not materially improve implementation correctness

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

### Step 11: Offer Plan Review

After writing the plan, ask the user whether they want to run a review pass. Not every plan warrants one. A small additive feature with no library interactions and straightforward logic may not benefit from the overhead. A plan that touches complex library APIs, concurrent systems, or subtle integration points almost certainly will.

Present it as a choice. If the user declines, stop. The plan is final.

If the user accepts, proceed:

**Select relevant reviewers.** Analyze the plan and select which plan review agents to spawn. Not every plan needs all reviewers, but some of them are mandatory.

Available reviewers and when to include them:

1. **Correctness & Logic** (`plan-reviewer-logic`) — Are the implementation steps logically sound? Are there data flow errors, impossible sequences, missing prerequisites, or dependency ordering issues in the checklist? Will the described plan actually work?
   **Always include.**

2. **Completeness & Integration** (`plan-reviewer-behavioral`) — Does the plan account for all files that need modification? Will the planned changes break existing callers, consumers, or public interfaces? Are there downstream impacts not addressed? Are there missing imports, exports, migrations, or wiring steps?
   **Always include.**

3. **References & Feasibility** (`plan-reviewer-references`) — Do the cited library APIs, cloned repositories, and external references actually support the proposed approach? Are there fake APIs, misread patterns, or unsupported dependency decisions in the plan?
   **Always include.**

4. **Error Handling & Edge Cases** (`plan-reviewer-data-integrity`) — Does the plan account for failure modes, error paths, and data consistency? Are there missing validations, unhandled errors, or partial failure states that the implementer would silently ship?
   **Include when:** the plan involves data persistence, I/O, type conversions, external services, or any code path that can fail.

5. **Security** (`plan-reviewer-security`) — Are there security implications the plan does not address? Input validation gaps, auth considerations, injection vectors, or unsafe patterns in the planned approach?
   **Include when:** the plan touches user input, authentication, database queries, file paths, redirects, or environment variables.

6. **Performance & Concurrency** (`plan-reviewer-concurrency`) — Will the planned approach scale safely? Are there potential race conditions, resource leaks, accidentally quadratic algorithms, missing cleanup, or TOCTOU bugs in the design?
   **Include when:** the plan involves async operations, shared mutable state, workers, subscriptions, event listeners, or resource lifecycle management.

7. **Project Rules** (`plan-reviewer-rules`) — Does the planned approach violate project conventions or rule files? Are there missing migrations, config updates, or integration steps the plan omits?
   **Include when:** project rules exist, or the plan touches dependencies, config files, migrations, or public interfaces consumed elsewhere.

8. **Test Sufficiency** (`plan-test-reviewer`) — Is the test plan thorough, deterministic, and correctly ordered? Are there missing test cases, low value tests, or unsupported testing patterns?
   **Always include.**

**Agent prompts.** Each agent receives:

Do not use generic prompts like "review this plan." Tell each reviewer exactly which plan target to read, which supporting sources to verify, what class of defect to hunt for, and what evidence format to return.

```
You are reviewing an implementation plan, NOT a code diff. Your goal is to find errors, gaps,
and incorrect assumptions that would cause the implementer to write wrong code or get stuck.

Plan target: <absolute path to the plan file>

Project rules:
<CLAUDE.md contents if found, or "None">

Instructions:
1. Read the plan target thoroughly. The Implementation Checklist, Test Plan, and References sections
   are the primary targets
2. For claims about existing code (file paths, line numbers, function signatures, existing behavior),
   read the actual source files to verify
3. For API usage patterns, testing patterns, and external references, verify against the actual
   library source in ~/src/oss/, the cloned reference repositories, or the cited source of truth
4. Check <domain-specific focus from the reviewer descriptions above>

For each finding:
- What the plan states or assumes (quote the relevant section)
- What the actual code, library source, or cloned reference shows (with file paths and line numbers)
- Impact: what goes wrong for the implementer if this is not corrected
- Specific correction: exactly how the plan should be updated

Only report findings where the plan is demonstrably wrong, incomplete, or would lead to incorrect
implementation. Do NOT report stylistic preferences, alternative approaches that are equally valid,
or hypothetical concerns without evidence.
```

**Do NOT paste the plan contents into agent prompts.** Agents have full tool access. They will read the plan target and investigate the codebase themselves.

Spawn all selected reviewers in a **single turn** (parallel).

### Step 12: Validate and Revise the Plan

After all reviewers return:

**Deduplicate.** Check if any two findings point to the same underlying issue (same plan section, same root cause). Merge duplicates, keeping the richer description and better correction.

**Validate.** For each finding, verify it yourself. You wrote the plan, so you already know what it says. Focus on verifying the reviewer's counter-evidence:

1. Read the source code the finding references. Does it actually show what the reviewer claims?
2. Is the finding factually correct?
3. Does it point to a real problem the implementer would hit, or is it a false alarm?
4. For claims about library behavior or external references: if the finding is uncertain but plausible, spawn a `deep-dive` agent against the relevant library or cloned reference source with the specific behavioral question. Spawn all verification deep-dives in a single turn

Drop findings that are incorrect, that point to valid alternative approaches rather than actual errors, or where the plan already handles the concern in a different section.

**Revise.** Update the plan document to address every valid finding:

- Fix incorrect API signatures, patterns, or code references
- Add missing implementation steps to the checklist
- Add missing error handling, edge case coverage, or validation steps
- Update the test plan with missing test cases or corrected testing patterns
- Fix inaccurate references or add missing ones

Do NOT append a "review findings" section. Integrate corrections directly into the relevant plan sections so the final document reads as a single coherent plan with no known gaps. The implementer should never see seams between the original plan and the revisions.
