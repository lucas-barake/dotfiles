---
name: deep-review
description: Deep code review using parallel subagents with optional sharding and source verification.
---

## Execution

Follow these steps in order.

### Step 1: Gather context

Ask the user which branch to diff against if they haven't already said. Do not guess. Wait for their answer.

Once you have it:

```bash
BASE_BRANCH="<what the user said>"
git diff --name-only "$BASE_BRANCH"...HEAD
git diff --stat "$BASE_BRANCH"...HEAD
```

Also collect:

```bash
if command -v gh &>/dev/null; then
  gh pr view --json title,body --jq '"\(.title)\n\n\(.body)"' 2>/dev/null
fi

find . -name "CLAUDE.md" -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec echo "--- {} ---" \; -exec cat {} \; 2>/dev/null
```

If no files changed, tell the user and stop.

Note any feedback, suggestions, or concerns the user provided alongside their review request. The user often has context that the diff alone does not reveal. Capture and refine this for later steps.

### Step 2: Assess scope and decide whether to shard

Look at the changed files and diff size. Decide: review as a single unit, or shard into focused sub-reviews?

**Shard when ANY of these apply:**

- The diff spans 3+ distinct domains (e.g., frontend components + API routes + database layer + infrastructure)
- The diff is large (roughly 500+ lines across 10+ files) AND the files serve clearly different concerns
- A single reviewer would need unrelated context to parse different parts of the diff (e.g., React component changes mixed with CLI argument parsing mixed with SQL migrations)

**Do NOT shard when:**

- The diff is cohesive. A large diff that touches many files in one domain (e.g., a refactor across a single module) should stay together because reviewers need the full picture to spot inconsistencies.
- The diff is small. Sharding adds overhead. Below ~300 lines or ~8 files in 2 or fewer domains, keep it as one unit.

**How to shard:**

Group changed files by domain/concern. Each shard gets:

- A short label (e.g., "frontend", "api", "database", "cli", "infra")
- Its subset of changed files
- Its subset of the diff (only hunks for those files)

Shards should be self-contained but can overlap if a file is relevant to multiple domains. When in doubt about where a file belongs, include it in the shard where a reviewer is most likely to catch real issues.

Proceed to Step 3 with either a single unit or multiple shards.

### Step 3: Select relevant reviewers

For each unit (the whole diff if not sharding, or each shard if sharding), analyze the diff and changed files to determine which review agents are relevant. Not every diff needs all reviewers.

The available reviewers and when to include them:

1. **Logic & Control Flow** — off-by-one errors, wrong boolean logic, incorrect conditions, wrong variable used, copy-paste errors, unreachable code, conditions always true/false, missing early returns, incorrect loop bounds, switch/case fallthrough, ternary precedence mistakes.
   **Include when:** the diff contains any non-trivial logic (conditionals, loops, arithmetic, state transitions). Skip for pure markup/style/config/copy changes.

2. **Security & Input Validation** — injection (SQL, XSS, command, SSRF, path traversal), missing auth checks, hardcoded secrets, insecure deserialization, open redirects, prototype pollution, unsafe regex (ReDoS), missing input validation, error messages leaking internals.
   **Include when:** the diff touches user input handling, API endpoints, auth, database queries, HTML rendering, redirects, file paths, or environment variables. Skip for internal-only logic with no external input surface.

3. **Data Integrity & Error Handling** — silent data loss, incorrect type coercion, truncation without warning, race conditions in writes, missing transaction boundaries, catch blocks that swallow errors, missing error propagation, resource leaks, partial failure leaving inconsistent state, null/undefined dereference.
   **Include when:** the diff touches data persistence, error handling, type conversions, database operations, or file I/O. Skip for pure UI/presentation changes.

4. **Behavioral & Contract** — functions whose behavior silently changes in ways callers don't expect, return type/shape changes, default values masking errors, API contract violations, breaking changes to public interfaces, side effects that changed, functions whose name no longer matches what they do. Must grep for all callers of changed functions.
   **Include when:** the diff modifies existing function signatures, return values, public APIs, or shared utilities. Skip for new code with no existing callers, or UI-only changes.

5. **Concurrency & Resources** — race conditions, deadlocks, lock ordering issues, missing atomicity on read-modify-write, goroutine/thread leaks, missing cancellation propagation, TOCTOU bugs, infinite loops, accidentally quadratic at production scale, memory leaks, event listener leaks, missing cleanup on unmount/dispose. Only actual bugs, NOT optimization suggestions.
   **Include when:** the diff involves shared mutable state, async operations with ordering concerns, workers/threads, subscriptions, event listeners, or resource lifecycle management. Skip for synchronous, single-threaded code paths and pure UI rendering.

6. **Project Rules & Integration** — rule violations (must quote the exact rule from project rules — do not invent rules), missing migration steps, version mismatches, changes that break files not in the diff, missing config updates, dependency conflicts, import errors.
   **Include when:** project rules (CLAUDE.md) exist, or the diff touches dependencies, config files, migrations, or public interfaces consumed elsewhere.

7. **Testing & Coverage** — missing tests for new/changed code, superfluous tests that don't catch real regressions, tests that assert implementation details instead of behavior, tests that duplicate each other, existing tests invalidated by the changes. Must examine the project's existing test patterns (frameworks, conventions, file locations) before making recommendations. Returns concrete test descriptions: what to test, which file to put it in, what assertions to make.
   **Always included.** Every diff needs test coverage review.

**Always include Logic & Control Flow and Testing & Coverage** — they apply to every unit.

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
| Project Rules & Integration | `reviewer-rules` |
| Testing & Coverage | `test-reviewer` |

**Do NOT paste the diff into agent prompts.** Agents have full tool access (Read, Glob, Grep, Bash). They will read the files and run git commands themselves. Pasting large diffs wastes context and slows down agent spawning.

Each agent prompt MUST include:

```
Shard: <shard label, or "full diff" if not sharding>

Base branch: <base branch name>

PR context:
<PR title/body if available>

Project rules:
<CLAUDE.md contents if found>

User feedback:
<user feedback refined into clear, actionable guidance for this reviewer, or "None" if the user didn't provide any>

Changed files:
<file list for this shard>

Diff stat:
<output of git diff --stat for this shard's files>

Start by running `git diff <base branch>...HEAD -- <files>` to see what changed, then read the full files and investigate freely.
```

When sharding, each agent only receives the file list for its shard. The agent runs its own git diff on those files and reads whatever else it needs.

**User feedback is not optional.** Refine the user's input into clear, actionable guidance tailored to each reviewer's focus area. Route the feedback to every reviewer it could be relevant to. When in doubt, include it. Agents that receive user feedback should treat it as a high-priority area to investigate, not just as a hint.

### Step 5: Deduplicate

After all agents return, check if any two findings point to the same underlying problem (same file, overlapping lines, same root cause). When sharding, also check for cross-shard duplicates where different reviewers on different shards flagged the same underlying issue (e.g., a behavioral reviewer in the API shard and a data-integrity reviewer in the database shard both flagging the same missing validation). Merge duplicates, keeping the richer description and better suggested fix.

### Step 6: Validate each finding

For each finding, read the relevant file yourself and check:

1. Is the flagged code actually reachable?
2. Are there guards, error handling, or tests elsewhere that already cover this?
3. Is it intentional behavior (comments, PR description, project conventions)?
4. For rule violations: does the quoted rule actually exist and apply here?
5. Would this cause an observable failure in practice?

Assign confidence 0-100:

- 90-100: Definitely real, clear evidence
- 75-89: Very likely real, strong evidence
- 60-74: Possible, some uncertainty
- Below 60: Probably false positive

Drop anything below 60 (these go straight to the bin). Findings at 90+ are kept as-is. Findings between 60-89 proceed to Step 7 for source verification.

### Step 7: Verify uncertain findings against source code

This step targets findings in the 60-89 confidence range that make claims about library behavior, framework semantics, or external API contracts. The goal is to eliminate "maybes" by checking the actual source code.

**Identify which findings need verification.** A finding needs source verification if it:

- Claims a library function behaves a certain way (e.g., "this doesn't handle null", "this returns undefined on failure")
- Assumes framework semantics (e.g., "React batches updates here", "Effect interrupts fibers on scope close")
- References external API contracts (e.g., "this endpoint returns 404 not 400")
- Disputes whether existing code is correct based on how a dependency works

Findings that are purely about the project's own logic (wrong condition, missing early return, unreachable code) do NOT need source verification. Your own file reads in Step 6 are sufficient for those.

**For each finding that needs verification:**

1. Identify the library/framework in question
2. Ensure source code is available:
   - Check `~/src/oss/<lib-name>` first
   - If not present, clone it: `git clone --depth 1 <repo-url> ~/src/oss/<lib-name>`
   - Fall back to `node_modules` only if cloning is not feasible
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

**Bug findings** — sort by severity (critical first), then confidence:

```
### [SEVERITY] Title
**File:** `path/to/file` lines X-Y
**Confidence:** XX/100

Why this is a bug.

**Evidence:**
<the relevant code>

**Suggested fix:**
<corrected code>
```

For findings that were verified against library source in Step 7, include the verification evidence:

```
**Verified against:** `<library>` at `~/src/oss/<lib>/path/to/file.ts:lines`
<brief summary of what the source code confirmed>
```

**Test coverage** — present the test-reviewer's verdict and findings separately:

```
### Test Coverage: PASS | FAIL

<reason>

<list of missing tests to add, superfluous tests to remove, etc. — each with concrete recommendations>
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
