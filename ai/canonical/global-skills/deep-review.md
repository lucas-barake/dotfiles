---
name: deep-review
description: Deep code review using parallel subagents with optional sharding and source verification.
---

## Execution

Follow these steps in order.

### Step 1: Gather context

Determine the review target from the user's request. The user decides how the review should be scoped.

Supported review targets include:

- a PR-style diff against a base branch
- staged changes
- unstaged/uncommitted changes
- an explicit list of files or directories
- another concrete scope the user provides

If the user has not provided enough scope to know what to review, ask for the review target. Do not guess.

For a PR-style branch review, collect:

```bash
BASE_BRANCH="<what the user said>"
git diff --name-only "$BASE_BRANCH"...HEAD
git diff --stat "$BASE_BRANCH"...HEAD
```

For staged or unstaged changes, use the matching `git diff --cached` or `git diff` commands. For explicit files or directories, treat that list as the changed surface and gather enough surrounding context to review only that requested scope.

Also collect:

```bash
if command -v gh &>/dev/null; then
  gh pr view --json title,body --jq '"\(.title)\n\n\(.body)"' 2>/dev/null
fi

find . -name "CLAUDE.md" -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec echo "--- {} ---" \; -exec cat {} \; 2>/dev/null
```

If the requested scope is empty, tell the user and stop.

Note any feedback, suggestions, or concerns the user provided alongside their review request. The user often has context that the diff alone does not reveal. Capture and refine this for later steps.

Treat the user's requested review target as the boundary. In PR-style reviews, changed files and changed hunks are the source of truth. In file-list reviews, the requested files/directories are the source of truth. Do not silently expand the review into unrelated areas.

Strict scope rules:

1. Review only the requested target.
2. Do not investigate or report unrelated code, background branch changes, pre-existing issues, or files outside the requested scope unless scoped code directly causes a break there.
3. If the requested target does not touch an area, do not review that area.
4. Public API or "could affect consumers" claims require actual in-repo consumers or concrete evidence that the requested target changes a real contract.
5. Findings outside the requested target's causal scope are discarded even if they are true.

### Step 2: Assess scope and decide whether to shard

Look at the requested files and review size. Decide: review as a single unit, or shard into focused sub-reviews?

**Shard when ANY of these apply:**

- The review target spans 3+ distinct domains (e.g., frontend components + API routes + database layer + infrastructure)
- The review target is large (roughly 500+ changed lines across 10+ files, or a similarly broad explicit file set) AND the files serve clearly different concerns
- A single reviewer would need unrelated context to parse different parts of the target (e.g., React component changes mixed with CLI argument parsing mixed with SQL migrations)

**Do NOT shard when:**

- The review target is cohesive. A large target that touches many files in one domain (e.g., a refactor across a single module) should stay together because reviewers need the full picture to spot inconsistencies.
- The review target is small. Sharding adds overhead. Below ~300 lines or ~8 files in 2 or fewer domains, keep it as one unit.

**How to shard:**

Group changed files by domain/concern. Each shard gets:

- A short label (e.g., "frontend", "api", "database", "cli", "infra")
- Its subset of changed files
- Its subset of the review target (only hunks for those files when diff-based)

Shards should be self-contained but can overlap if a file is relevant to multiple domains. When in doubt about where a file belongs, include it in the shard where a reviewer is most likely to catch real issues.

Proceed to Step 3 with either a single unit or multiple shards.

### Step 3: Select relevant reviewers

For each unit (the whole target if not sharding, or each shard if sharding), analyze the requested scope to determine which review agents are relevant. Not every review needs all reviewers.

The available reviewers and when to include them:

1. **Logic & Control Flow** — off-by-one errors, wrong boolean logic, incorrect conditions, wrong variable used, copy-paste errors, unreachable code, conditions always true/false, missing early returns, incorrect loop bounds, switch/case fallthrough, ternary precedence mistakes.
   **Include when:** the reviewed scope contains any non-trivial logic (conditionals, loops, arithmetic, state transitions). Skip for pure markup/style/config/copy changes.

2. **Security & Input Validation** — injection (SQL, XSS, command, SSRF, path traversal), missing auth checks, hardcoded secrets, insecure deserialization, open redirects, prototype pollution, unsafe regex (ReDoS), missing input validation, error messages leaking internals.
   **Include when:** the reviewed scope touches user input handling, API endpoints, auth, database queries, HTML rendering, redirects, file paths, or environment variables. Skip for internal-only logic with no external input surface.

3. **Data Integrity & Error Handling** — silent data loss, incorrect type coercion, truncation without warning, race conditions in writes, missing transaction boundaries, catch blocks that swallow errors, missing error propagation, resource leaks, partial failure leaving inconsistent state, null/undefined dereference.
   **Include when:** the reviewed scope touches data persistence, error handling, type conversions, database operations, or file I/O. Skip for pure UI/presentation changes.

4. **Behavioral & Contract** — functions whose behavior silently changes in ways callers don't expect, return type/shape changes, default values masking errors, API contract violations, breaking changes to public interfaces, side effects that changed, functions whose name no longer matches what they do. Must grep for all callers of changed functions.
   **Include when:** the reviewed scope modifies existing function signatures, return values, public APIs, or shared utilities. Skip for new code with no existing callers, or UI-only changes.

5. **Concurrency & Resources** — race conditions, deadlocks, lock ordering issues, missing atomicity on read-modify-write, goroutine/thread leaks, missing cancellation propagation, TOCTOU bugs, infinite loops, accidentally quadratic at production scale, memory leaks, event listener leaks, missing cleanup on unmount/dispose. Only actual bugs, NOT optimization suggestions.
   **Include when:** the reviewed scope involves shared mutable state, async operations with ordering concerns, workers/threads, subscriptions, event listeners, or resource lifecycle management. Skip for synchronous, single-threaded code paths and pure UI rendering.

6. **Performance & Scalability** — algorithmic complexity regressions, excessive allocation or GC pressure, memory leaks that affect capacity, UI responsiveness and rendering problems, layout thrashing, oversized DOM work, ignored I/O backpressure, N+1 calls, expensive database or network access, unbounded concurrency, retry overload, and cache mistakes. Only concrete reachable performance defects, not generic optimization advice.
   **Include when:** the reviewed scope touches hot paths, large data, loops, sorting, parsing, serialization, UI rendering, images/assets, input handlers, I/O, database queries, network calls, queues, workers, retries, batching, caching, streaming, allocation heavy paths, or user flows where latency and memory matter.

7. **Project Rules & Integration** — rule violations (must quote the exact rule from project rules — do not invent rules), missing migration steps, version mismatches, changes that break files not in the diff, missing config updates, dependency conflicts, import errors.
   **Include when:** project rules (CLAUDE.md) exist, or the reviewed scope touches dependencies, config files, migrations, or public interfaces consumed elsewhere.

8. **Effect Correctness** — validates Effect and Effect ecosystem code against installed package metadata and version matched official source/tests under `~/src/oss/.versions/`. Finds API misuse, wrong assumptions about runtime behavior, resource lifecycle mistakes, concurrency/fiber/finalizer issues, Schema misunderstandings, and other Effect-specific correctness bugs.
   **Include when:** the reviewed scope imports, configures, tests, or meaningfully interacts with `effect`, `@effect/*`, or other Effect ecosystem packages. This applies to all Effect code.

9. **Testing & Coverage** — missing tests for new/changed code, superfluous tests that don't catch real regressions, tests that assert implementation details instead of behavior, tests that duplicate each other, existing tests invalidated by the changes. Must examine the project's existing test patterns (frameworks, conventions, file locations) before making recommendations. Returns concrete test descriptions: what to test, which file to put it in, what assertions to make.
   **Always included.** Every review target needs test coverage review.

**Always include Logic & Control Flow**. Always include Effect Correctness when the unit touches Effect or an Effect ecosystem package.

When sharding, different shards will typically need different reviewer sets. A frontend shard rarely needs the concurrency reviewer. A database shard rarely needs security review for XSS. Select per shard.

### Step 4: Launch reviewers in parallel

Spawn all reviewers across all shards in a **single turn**. Each reviewer has its own dedicated agent:

| Reviewer | Agent |
|---|---|
| Logic & Control Flow | `reviewer-logic` |
| Security & Input Validation | `reviewer-security` |
| Data Integrity & Error Handling | `reviewer-data-integrity` |
| Behavioral & Contract | `reviewer-behavioral` |
| Concurrency & Resources | `reviewer-concurrency` |
| Performance & Scalability | `reviewer-performance` |
| Project Rules & Integration | `reviewer-rules` |
| Effect Correctness | `effect-reviewer` |
| Testing & Coverage | `test-reviewer` |

**Do NOT paste the diff into agent prompts.** Agents have full tool access. They will read the files and run git commands themselves. Pasting large diffs wastes context and slows down agent spawning.

After spawning reviewers, do not perform your own local review while they run. Do not inspect scoped code for findings, trace callers, run speculative tests, or investigate potential bugs independently before reviewer results are back. Your only work before reviewers finish is coordination: wait for agents, collect their outputs, handle failed/stalled agents, and preserve the review scope. The specialist reviewers do the first-pass investigation; you validate, deduplicate, and investigate only after all selected reviewers have returned.

Each agent prompt MUST include:

```
Shard: <shard label, or "full diff" if not sharding>

Review target:
<base branch + diff command, staged changes, unstaged changes, explicit files/directories, or the concrete scope the user requested>

PR/context:
<Only the PR title/body details or user-provided context that are directly relevant to this reviewer and shard. Omit unrelated history, unrelated reviewer concerns, and other agents' missions.>

Project rules:
<CLAUDE.md contents if found>

User feedback:
<user feedback refined into clear, actionable guidance for this reviewer, or "None" if no feedback is relevant to this reviewer>

Scoped files:
<file list for this shard>

Scope summary:
<diff stat for diff-based reviews, or concise summary of the explicit file/directory scope>

Start by inspecting the requested review target. For PR-style reviews, run the provided diff command for these files. For staged/unstaged reviews, run the matching `git diff` command. For explicit file reviews, read the scoped files directly. Read full scoped files for context. Read files outside the requested scope only when needed to verify a direct consumer, caller, guard, lifecycle owner, test, or project rule causally connected to the scoped code.

Strict review scope:
- Your findings must be directly caused by code in this shard's requested scope.
- Do not report pre-existing issues, unrelated branch issues, or problems in areas the requested scope does not touch.
- If the bug is in an unscoped file, report it only if scoped code now makes that unscoped code fail.
- If a claim depends on public API breakage, verify actual in-repo consumers or concrete contract evidence.

Regression validation:
- First identify candidate findings in your specialty.
- For each candidate, write the smallest regression test that should fail because of the suspected bug. Prefer an existing nearby test file and existing test conventions.
- Before writing a regression test that depends on a third party library or framework, inspect installed package metadata for the official repository URL, package directory, exports, and version. Then inspect version matched official source and tests through the shared version cache under `~/src/oss/.versions/`, and follow its test harness, composition, setup, and assertion patterns. This applies to any library. For Effect code, inspect the relevant Effect and Effect ecosystem package directory first.
- Run the narrowest relevant test command and ensure the test fails for the suspected reason before changing production code.
- If the regression test is valid, apply the smallest production fix in place in your reviewer workspace, then rerun the same command and ensure the test passes.
- If the fixed code still fails because the test or harness is wrong, revert the production fix, fix the test or harness, rerun the test against the unfixed production code, ensure it fails for the suspected reason again, reapply the fix, and rerun until the test passes. If the test is valid and the fix is wrong, keep iterating on the fix until the test passes.
- Try multiple reasonable test placements or harness approaches before giving up.
- If the test confirms a real issue and the fix passes, leave the regression test and fix edits in your reviewer workspace and return a patch handoff for the main agent. Report the changed test file path, exact test code, failing command output before the fix, passing command output after the fix, the fix you applied, and a unified diff or exact patch that includes both the regression test and production fix. Your workspace may be private, so do not assume your edits are visible in the main PR worktree. If the candidate is not reproduced or the harness is blocked, remove any probe test and fix edits before returning and report the exact code/commands tried.
- Report confirmed fixed issues separately from unconfirmed candidates.
- If you cannot get the test harness to run after multiple tries and you still believe the candidate may be real, include the exact verbatim test code you wrote, the commands you tried, and mark the candidate `UNCONFIRMED - HARNESS BLOCKED`.
- If the test runs but does not reproduce the bug, mark the candidate `NOT REPRODUCED` and explain what disproved it.
```

When sharding, each agent only receives the file list for its shard. The agent inspects only its requested scope and reads only the directly connected context needed to validate scope-caused behavior.

**User feedback routing is mandatory and must be scoped.** Refine the user's input into clear, actionable guidance tailored to each reviewer's focus area. Route feedback only to reviewers whose mission can act on it. Do not include irrelevant feedback "just in case"; it poisons the reviewer's goal. Agents that receive user feedback should treat it as a high-priority area to investigate, not just as a hint.

### Step 5: Deduplicate

After all agents return, check if any two findings point to the same underlying problem (same file, overlapping lines, same root cause). When sharding, also check for cross-shard duplicates where different reviewers on different shards flagged the same underlying issue (e.g., a behavioral reviewer in the API shard and a data-integrity reviewer in the database shard both flagging the same missing validation). Merge duplicates, keeping the richer description and better suggested fix.

### Step 6: Validate each finding

For each reviewer result, first classify it as a confirmed fixed issue, unconfirmed candidate, not reproduced candidate, or test coverage finding. Then validate it yourself. A bug finding is only valid when you can tie it concretely to the requested review scope, confirm it is reachable and relevant, and verify the reviewer provided a valid regression test, fix, and patch handoff.

For each result, read the relevant scoped files and any diff when available, then check:

1. Is this directly caused by code in the requested review scope?
2. Is the flagged code actually reachable?
3. Are there guards, error handling, or tests elsewhere that already cover this?
4. Is it intentional behavior (comments, PR description, project conventions)?
5. For rule violations: does the quoted rule actually exist and apply here?
6. Would this cause an observable failure in practice?
7. Did the reviewer provide a regression test that failed for the suspected reason before the fix and passes after the fix?
8. Did the reviewer provide a unified diff or exact patch containing both the valid regression test and the fix?
9. If the claim is about consumers or public API behavior, are there actual in-repo consumers or concrete contract evidence?

Discard the result if it is:

- out of scope
- a false positive
- not reproducible
- not tied to the requested review scope
- speculative
- based on insufficient evidence
- based only on hypothetical external consumers
- missing a valid regression test, missing the applied fix, or missing a patch handoff

For every confirmed fixed issue that survives validation, apply the reviewer patch to the main PR worktree yourself. Review the patch before applying it. If multiple reviewers returned patches, apply only the deduplicated valid set and resolve overlaps deliberately. After applying each valid patch or patch group, rerun the exact regression command in the main PR worktree and confirm it still fails before the fix when practical and passes after the applied fix. If you cannot reproduce the reviewer evidence in the main PR worktree, do not count the issue as fixed.

Assign confidence 0-100:

- 90-100: Definitely real, clear evidence, a regression test that fails before the fix and passes after the fix, the reviewer provided a complete patch handoff, and the main agent applied and validated the patch in the main PR worktree
- 75-89: Strong code evidence but regression harness blocked after multiple real attempts
- 60-74: Possible, some uncertainty or no successful regression test
- Below 60: Probably false positive

Drop anything below 75. Findings at 90+ are kept as validated high-confidence findings. Findings between 75-89 proceed to Step 7 for source verification or additional reproduction work, and must be reported as harness-blocked rather than high confidence unless you reproduce them. Unconfirmed candidates from reviewers do not become final findings unless you independently validate them.

### Step 7: Verify uncertain findings against source code

This step targets findings in the 75-89 confidence range that make claims about library behavior, framework semantics, or external API contracts. The goal is to eliminate "maybes" by checking the actual source code.

**Identify which findings need verification.** A finding needs source verification if it:

- Claims a library function behaves a certain way (e.g., "this doesn't handle null", "this returns undefined on failure")
- Assumes framework semantics (e.g., "React batches updates here", "Effect interrupts fibers on scope close")
- References external API contracts (e.g., "this endpoint returns 404 not 400")
- Disputes whether existing code is correct based on how a dependency works

Findings that are purely about the project's own logic (wrong condition, missing early return, unreachable code) do NOT need source verification. Your own file reads in Step 6 are sufficient for those.

**For each finding that needs verification:**

1. Identify the library/framework in question
2. Ensure source code is available:
   - Check installed package metadata and lockfiles to resolve the installed version and official repository
   - Check for an existing reusable version checkout under `~/src/oss/.versions/<repo>/<version>/`
   - If not present, create one shared git worktree for the matching upstream tag, release branch, or commit. Use a separate clone only when a worktree cannot be created from the shared repository. Do not create duplicate per-agent checkouts
   - Fall back to `node_modules` only if no version matched upstream source is available or you must confirm installed distribution behavior
3. Spawn a `deep-dive` agent targeting the library source with a specific question:

```
Investigate in <path to library source>:

<The specific behavioral claim the finding makes, stated as a verifiable question>

For example:
- "Does SqlClient.execute propagate errors or swallow them when the connection is lost?"
- "Does Effect.retry re-execute the entire effect or resume from the failure point?"
- "What does React.useSyncExternalStore do when the snapshot changes during render?"

Return: the exact source code that answers this, with file paths and line numbers.
```

Spawn all verification deep-dives in a **single turn** (parallel). Different findings may target different libraries. Clone all needed libraries first, then spawn all deep-dives together.

**After deep-dives return:**

- If the source code confirms the finding's claim: upgrade confidence to 90+
- If the source code contradicts the finding's claim: drop the finding entirely
- If the source code is ambiguous or the deep-dive couldn't determine the answer: keep the finding at its current confidence but annotate it with what was checked and what remains uncertain

### Step 8: Present results

Separate validated findings from discarded reviewer findings. Only validated findings are final PR findings.

**Validated fixed bug findings** — sort by severity (critical first), then confidence. Only findings with a failing-before and passing-after regression test are high confidence:

```
### [SEVERITY] Title
**File:** `path/to/file` lines X-Y
**Confidence:** XX/100
**Regression test:** failed before fix and passed after fix | harness blocked after multiple attempts

Why this is a bug.

**Evidence:**
<the relevant code>

**Regression test evidence:**
<test code, failing command/result before fix, and passing command/result after fix, or exact test snippet if the harness was blocked>

**Fix applied:**
<corrected code and file paths>
```

For findings that were verified against library source in Step 7, include the verification evidence:

```
**Verified against:** `<library>` installed version `<version>` at `<version-matched-source-path>:lines`
<brief summary of what the source code confirmed>
```

**Test coverage** — present the test-reviewer's verdict and findings separately:

```
### Test Coverage: PASS | FAIL

<reason>

<list of missing tests to add, superfluous tests to remove, etc. — each with concrete recommendations>
```

**Discarded reviewer findings** — briefly list every discarded bug candidate and why it was discarded:

```
### Discarded Findings
- <reviewer/title>: discarded as <out of scope | false positive | not reproducible | not tied to requested scope | insufficient evidence>. <one short reason>
```

If the user asked to post to the PR, use `gh pr comment` or `gh api` for inline review comments.

If no bug findings survived and test coverage passed:

```
No high-confidence issues found.
Reviewed N files across M changed lines.
K specialist reviewers checked for: <list the focus areas of the reviewers that were selected>.
<If sharded: "Diff was sharded into S domains: <list shard labels>.">
Test coverage: PASS
```
