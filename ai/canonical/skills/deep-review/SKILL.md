---
name: deep-review
description: Deep code review using parallel subagents.
---

## Execution

Follow these steps in order.

### Step 1: Gather context

Ask the user which branch to diff against if they haven't already said. Do not guess. Wait for their answer.

Once you have it:

```bash
BASE_BRANCH="<what the user said>"
DIFF=$(git diff "$BASE_BRANCH"...HEAD)
CHANGED_FILES=$(git diff --name-only "$BASE_BRANCH"...HEAD)
```

Also collect:

```bash
if command -v gh &>/dev/null; then
  gh pr view --json title,body --jq '"\(.title)\n\n\(.body)"' 2>/dev/null
fi

find . -name "CLAUDE.md" -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec echo "--- {} ---" \; -exec cat {} \; 2>/dev/null
```

If the diff is empty, tell the user and stop.

Note any feedback, suggestions, or concerns the user provided alongside their review request. The user often has context that the diff alone does not reveal. Capture and refine this for Step 3.

### Step 2: Select relevant reviewers

Analyze the diff and changed files to determine which review agents are actually relevant. Not every diff needs all reviewers.

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

**Always include Logic & Control Flow and Testing & Coverage** — they apply to every diff.

### Step 3: Launch selected reviewers in parallel

Spawn all selected reviewers in a **single turn**. Each reviewer has its own dedicated agent:

| Reviewer | Agent |
|---|---|
| Logic & Control Flow | `reviewer-logic` |
| Security & Input Validation | `reviewer-security` |
| Data Integrity & Error Handling | `reviewer-data-integrity` |
| Behavioral & Contract | `reviewer-behavioral` |
| Concurrency & Resources | `reviewer-concurrency` |
| Project Rules & Integration | `reviewer-rules` |
| Testing & Coverage | `test-reviewer` |

Each agent prompt MUST include:

```
PR context:
<PR title/body if available>

Project rules:
<CLAUDE.md contents if found>

User feedback:
<user feedback refined into clear, actionable guidance for this reviewer, or "None" if the user didn't provide any>

Changed files:
<file list>

Diff:
<full diff>
```

**User feedback is not optional.** Refine the user's input into clear, actionable guidance tailored to each reviewer's focus area. Route the feedback to every reviewer it could be relevant to. When in doubt, include it. Agents that receive user feedback should treat it as a high-priority area to investigate, not just as a hint.

### Step 4: Deduplicate

After all agents return, check if any two findings point to the same underlying problem (same file, overlapping lines, same root cause). Merge duplicates, keeping the richer description and better suggested fix.

### Step 5: Validate each finding

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

Drop anything below 70.

### Step 6: Present results

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
Test coverage: PASS
```
