---
name: change-audit
description: Evidence driven code review with a small relevance selected reviewer set and validated fixes.
---

# Change Audit

Review one concrete change set with the smallest relevant set of specialist agents. Keep the full target visible to every selected reviewer. Validate findings with executable evidence, apply confirmed fixes, and repeat only the reviewer domains affected by those fixes.

## 1. Establish The Target

Determine the exact review target from the user's request:

1. A branch or pull request diff against a base branch.
2. Staged changes.
3. Unstaged changes.
4. An explicit file or directory set.
5. Another concrete scope supplied by the user.

If the target is ambiguous, ask. If it is empty, report that and stop.

Collect the full diff, changed file list, branch context, PR title and body when available, applicable repository rules, and relevant user feedback. Read the full changed files and directly connected callers, callees, types, schemas, tests, configuration, and lifecycle wiring needed to understand the change.

The target is one review unit. Do not shard it. Every reviewer receives the full modified file list and full diff context so cross file behavior and interactions remain visible.

## 2. Preserve Causal Scope

Changed hunks are the review surface. Surrounding code is context, not permission to report unrelated defects.

A finding is in scope only when:

1. A changed hunk contains the defect.
2. A changed hunk alters inputs, outputs, ordering, ownership, lifecycle, configuration, or a contract and directly makes connected code fail.
3. The change creates an obligation that is absent from the diff, such as a caller update, registration, migration, cleanup path, cancellation path, rollback path, or configuration update.

Discard preexisting issues and speculative risks that are not caused by the target.

## 3. Select Reviewers

Choose only reviewers whose domain is materially implicated by the current target:

1. `reviewer-concurrency` for production logic, behavioral contracts, async work, state transitions, resources, or lifecycle. This is the primary correctness reviewer.
2. `reviewer-rules` when repository rules apply or the change touches imports, exports, registration, configuration, dependencies, migrations, generated artifacts, rollout, or integration wiring.
3. `reviewer-security` for trust boundaries, authentication, authorization, tenant isolation, secrets, untrusted inputs, injection surfaces, serialization, file or network access, dependency supply chain changes, or sensitive data flow.
4. `reviewer-data-integrity` for stored or derived data, error handling, transactions, retries, partial failure, resource ownership, access policy state, legitimate user access, lifecycle transitions, or consistency across direct, list, cached, and background paths.
5. `reviewer-performance` only for hot paths, large data, rendering, I/O, database or network work, queues, workers, caching, retries, batching, backpressure, allocation heavy code, or changed time or space complexity.
6. `code-simplifier` when the change adds or modifies helpers, wrappers, schemas, validators, adapters, abstractions, dependencies, composition, state ownership, or duplicated behavior.
7. `test-reviewer` only when existing tests are part of the target or their quality is directly affected by the change. It evaluates existing test value only. It does not seek missing tests.
8. `ux-reviewer` when the target changes anything a user sees, reads, or operates: interface, copy, labels, presented figures, states, flows, notifications, generated documents, or an API response a person reads. It runs the surface rather than reading it, so select it only when the surface can actually be reached, and say so when it cannot.

`reviewer-security` and `reviewer-data-integrity` split one boundary by direction. Security owns over permission, meaning what an attacker or unauthorized principal can reach. Integrity owns over denial and state corruption, meaning what a valid principal wrongly loses. Select both only when the target can fail in both directions, and never route the same suspicion to both.

Do not select a reviewer merely because it exists. Record why each selected reviewer is relevant and why each omitted reviewer is not.

`ux-reviewer` owns what the user concludes and can do. `reviewer-performance` owns rendering cost and responsiveness. A slow interaction belongs to performance; an interaction that is fast but misleading, unreachable, or unexplained belongs to UX. Route a suspicion to one of them, not both.

For documentation only or configuration only targets, it is valid to select only `reviewer-rules`. For a narrow pure logic change, it is valid to select only `reviewer-concurrency`. Security and performance are never automatic, but they must be selected whenever the target materially enters their domains. `ux-reviewer` is never automatic either, but a change that alters a user-visible surface without it has not been reviewed for the only thing the user will notice.

## 4. Launch One Focused Batch

Spawn all selected reviewers in parallel. Give each reviewer:

1. The exact target and full modified file list.
2. The complete diff context.
3. The task goal and only the user feedback relevant to that reviewer's domain.
4. Applicable rules and known verification commands.
5. Concrete invariants relevant to that domain.
6. Permission to inspect directly connected code and to validate findings with real execution.

Keep each mission pure. Do not send performance suspicions to the rules reviewer or missing test ideas to the test reviewer.

After launching the batch, wait for every selected reviewer. Do not duplicate their review while they run.

## 5. Validate Findings

Deduplicate findings by root cause. Then validate each one in the main worktree.

A correctness or rules finding is confirmed only when:

1. It is causally tied to the target.
2. The reviewer supplied a valid test or executable check against the real production composition.
3. Red fails for the suspected behavioral reason before the fix.
4. Green passes with the smallest fix.
5. Relevant third party claims were checked against installed metadata and exact version matched official source and tests under `~/src/oss/.versions/`.

If a test is wrong, revert the production fix, repair the harness, prove Red again on unfixed code, then reapply the fix. Remove invalid probe edits. Do not turn an unconfirmed candidate into a final finding.

For simplification findings, require the isolated baseline and candidate snapshot proof specified by `code-simplifier`. For test quality findings, require evidence about an existing test and never convert the result into a missing test recommendation.

Apply only confirmed fixes and verified simplifications. Run the narrow checks after each accepted patch group.

## 6. Converge And Stop

Follow up batches exist to catch defects your own fixes introduced. They are not a second audit of the target, and they are not a search for a perfect change set.

Budget: three batches at most, and no reviewer runs more than twice. Most audits end after one batch.

Only a fix that changes production behavior, a contract, state, or integration wiring reopens a domain. These never trigger another batch on their own:

1. Accepted simplifications.
2. Test only edits, including regression tests added during validation.
3. Comment, naming, formatting, and type only changes.

Patches you applied during the audit are not new review surface. Section 2 scopes findings to the user's target, not to your own fix hunks. Verify a fix with the narrow checks and the originating reviewer, and do not let it expand the audit.

After each qualifying patch group:

1. List the files and behavior changed by the fixes.
2. Recompute which reviewer domains are materially affected.
3. Rerun the reviewer that found the issue.
4. Add another reviewer only when the fix enters or changes that reviewer's domain.
5. Skip unaffected reviewers. A logic fix that does not change algorithms, workloads, I/O, allocation, caching, queues, or backpressure does not rerun `reviewer-performance`.
6. A fix that does not change a trust boundary, permission, input path, secret, sensitive data flow, file or network capability, or dependency risk does not rerun `reviewer-security`.
7. A fix that does not change persisted or derived state, error handling, partial failure, ownership, lifecycle, access policy outcomes, or legitimate resource access does not rerun `reviewer-data-integrity`.
8. Rerun `reviewer-rules` only when the fix changes files or integration obligations governed by rules not already exhaustively checked for the new state.
9. Rerun `test-reviewer` only when existing tests were changed, deleted, consolidated, or their production composition changed.
10. Rerun `ux-reviewer` only when the fix changes what a user sees, reads, or operates, and rerun it against the running surface rather than the diff. A fix that only moves code, renames a symbol, or adjusts a test does not.
10. `code-simplifier` runs once for the audit. A simplification it proposes never opens another batch.

Stop at the first of these:

1. The latest batch confirmed no new defect caused by your fixes.
2. Three batches have run.
3. A reviewer has run twice.
4. The only remaining candidates are preferences, style, or unreproduced suspicions.

Stopping is not failure. Report anything left over as an open candidate with the evidence you have and what would settle it. An unresolved candidate in the report is worth more than another hour of batches, and the human reviewing the change decides what to do with it.

Record each batch, selected domains, omissions, findings, fixes, and verification results.

## 7. Report

Present:

1. Confirmed findings first, ordered by severity, with file and line references.
2. The regression evidence and fix for each confirmed issue.
3. Existing test quality findings separately.
4. Verified simplifications separately.
5. Discarded candidates with a short reason.
6. Open candidates the budget ended before settling, each with the evidence so far and what would settle it.
7. Review batches and why each reviewer was selected or skipped.
7. Commands run and any verification that could not be completed.

If no issues are confirmed, say so clearly. Do not pad the report with generic advice.
