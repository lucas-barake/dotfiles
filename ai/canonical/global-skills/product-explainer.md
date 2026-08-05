---
name: product-explainer
description: Explains a pull request, commit, branch, or feature area for product owners and managers. Investigates the code thoroughly, then reports what changed for users and the business in plain words, with the decision behind each behavior and what it means in practice. Use when a non-engineer needs to understand what a change actually does.
---

# Product Explainer

Translate a change into what it means for the product. The reader manages the product and knows the domain, but will not read code. They need to know what users can now do or no longer do, what rules the system enforces, which of those rules are choices someone made, and what those choices cost.

This skill explains. It does not review. No verdicts, praise, or recommendations.

## 1. Establish The Target

Resolve the request to a concrete file list: a PR or branch diff, a commit or range, staged or unstaged changes, or a named feature area. If the target is empty, say so and stop. If it is ambiguous, take the most defensible reading and say which.

Collect the PR title and body, linked issues, and commit messages. Treat them as claims about intent, not as facts about behavior. When the description promises something the code does not do, report the gap.

## 2. Investigate Thoroughly

The reader cannot check anything you say. That makes the standard absolute: every sentence in the report is either a fact you traced to source or is listed as unverified. There is no third state. A wrong report is worse than none, because it becomes the basis for a product decision.

Read the full changed files, then everything the product behavior depends on. Do not explain from the diff alone. The product meaning of a change lives in what it connects to, and the connections are where diff level reading gets it wrong.

Investigation is the whole job. The writing is minutes; the reading is the work. Some rules for how far to go:

1. Follow every flow end to end, from the surface the user touches through every layer to storage and back. A rule enforced in the interface but not at the API is a different product fact than a rule enforced at both, and only reading both layers reveals which one ships.
2. Resolve what actually runs. Feature flags, environment config, injection, and registration decide behavior per deployment. The code path you read is a candidate until the wiring says it is the one users get.
3. Walk error paths to where they land. What the user is finally shown, what is logged, what is retried, and what work survives are all decided frames away from where the failure starts.
4. Read the data layer. Schemas, migrations, and what happens to records that predate the change. A new rule over old data is a product event on its own.
5. When behavior flows through a third party library or service, verify it per the base library rules against the installed version's source, not from memory. Defaults, limits, and failure behavior are claims about that version.
6. Read the tests. They state the intended rule more plainly than the code, and they reveal when the intended rule and the shipped rule differ.
7. Check the boundaries of the change. What the diff touches is not the whole behavior. Search for the other places the same rule, limit, or permission is enforced, duplicated, or missed.

Chase each of these until you can state it as fact:

1. User visible flows. Every screen, endpoint, command, notification, email, or export whose behavior changes. What the user sees before and after.
2. Rules and limits. Validations, quotas, rate limits, size caps, timeouts, expiry windows, retry counts. For each, the exact number or condition and where it comes from.
3. Permissions and visibility. Who can do the new thing, who cannot, what data becomes visible or hidden to which role or tenant.
4. Invariants. What the system now guarantees is always true, and what breaks the guarantee. What happens to existing data that predates the rule.
5. Policies encoded in code. Defaults chosen for the user, orderings, tie breaks, rounding, what wins on conflict, what is kept and what is discarded.
6. Failure behavior as the user experiences it. What they see when it fails, whether work is lost, whether the system retries silently, whether anyone is notified.
7. Irreversibility. What cannot be undone once done: deletions, sends, charges, published states, schema migrations on existing records.
8. Money, data, and obligations. Anything touching billing, personal data handling, retention, audit trails, or external parties.
9. Rollout shape. Feature flags, migrations, backfills, staged enablement. Whether the behavior is live on merge or gated.

For each, read the implementation, the schemas, the configuration, and the tests. Tests often state the intended rule more plainly than the code. Say what you verified and what you could not.

## 3. Explain Decisions, Not Mechanics

Every behavior in the report answers three questions: what the system does, why it plausibly does it that way, and what that means for someone using or selling the product.

The why must be grounded. When the code, tests, PR body, or linked issue state the reason, report it as the reason. When they do not, you may state what the choice trades off, as fact, without inventing a motive. "Uploads over 50 MB are rejected. The limit is fixed in the software with no per customer setting, so raising it for one customer requires shipping an update for everyone" is grounded. "They chose 50 MB to keep costs down" is a guess unless something says so.

Say what is a decision versus what is incidental. A hardcoded three retry limit is a decision someone can revisit. The reader's job is to spot the decisions they disagree with. Surface every threshold, default, and rule as a visible, changeable choice with its current value.

## 4. Voice

Write for someone who runs the product, not someone who builds it. They know what an API, a login, and a database are. They do not know what a cache, a queue, a webhook, a token, a schema, or a race condition is, and the report never asks them to.

The rule that governs every sentence: describe the consequence, not the mechanism. Machinery may only appear translated into what it does to the user or the business.

- Not "the session token is cached for 15 minutes". Instead "after someone's permissions change, the system can keep honoring the old permissions for up to 15 minutes".
- Not "deletes are processed through a queue". Instead "deleting does not happen instantly. The item disappears from view right away, but is actually removed a short time later, and a failure in between can leave it existing but invisible".
- Not "the endpoint is idempotent". Instead "submitting the same order twice, for example after a page refresh, creates one order, not two".

The test for every sentence: could it go in a release note, or be said to a customer, unchanged. If it needs a developer to interpret it, translate it or cut it.

Name features, roles, and flows the way the product does, not the way the code does. No analogies or metaphors. No filler. Never show code, function names, or file paths in the body. State numbers exactly: "locked out for 15 minutes after 5 failed attempts", never "temporarily locked out after too many attempts". Exactness is plain language. Vagueness is not simplicity.

## 5. Output Format

Deliver the whole report inside one fenced markdown code block so it can be pasted elsewhere intact.

Four invariants, whatever the structure:

1. Structure by product behavior, never by file or subsystem.
2. Open with what a user or the business gets, in the words of a release note, then the decisions most likely to matter to a product owner: limits and their values, defaults, who is excluded, what is irreversible, what is silently dropped or retried. One line each, consequence included.
3. When stated intent and observed behavior differ, say so explicitly. When something could not be confirmed from source, list it plainly.
4. No code, function names, or file paths in the body. Keep an appendix after the code block mapping each behavior to its files and lines, so an engineer can be pointed at the evidence.

Beyond that, shape the report to the target. A focused change reads as a handful of behavior sections, each walking what happens from the user's side and then the rules underneath with their exact values. A large release reads better grouped by product area, with behaviors nested inside, rollout and failure handling per area when they differ, or gathered once when they do not. A single policy change may need no sections at all. Do not stretch a small change to fill a template or flatten a 20,000 line release into one undifferentiated list.

## 6. Scale To Large Targets

Hold a small target yourself. For a large one, spawn one reader per subsystem in parallel, each returning behaviors, rules, and evidence. Merge them by product behavior, not by subsystem, write the lead sections yourself, and verify any claim you did not read yourself.
