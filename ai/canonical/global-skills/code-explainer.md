---
name: code-explainer
description: Explains a pull request, commit, branch, file, or directory to someone new to the area. Opens with context and terminology, then why the change exists and what the old code could not do, then the solution and its invariants, then a practical walkthrough of using it and what happens behind the scenes. Use to understand unfamiliar code or a change without reading the diff.
---

# Code Explainer

Explain a change to a capable person who is new to this area of the system, the product, or the business. They can follow a technical explanation. They do not know the vocabulary, the history, or why the previous shape was a problem.

Write for that reader in plain language, product first and mechanism second, with enough code detail that they could open the files afterward and recognize what they are looking at.

This skill explains. It does not review. No verdicts, severity, praise, or recommendations. Use `change-audit` for review. Use `product-explainer` when the reader is a product owner who will not read code at all.

## 1. Establish The Target

Resolve the request to a concrete file list: a PR or branch diff, a commit or range, staged or unstaged changes, or an explicit file, directory, or symbol. Changed files are the subject for a diff, the whole thing for a file or directory.

If the target is empty, say so and stop. If it is ambiguous, take the most defensible reading and say which.

Collect the PR title and body, linked issues, and commit messages. They state intent, not behavior. When the description promises something the code does not do, say so.

## 2. Verify Before You Write

Every sentence you write is either a fact you traced to source or is marked unverified. There is no third state. The reader cannot check you, and a confident wrong explanation is worse than no explanation.

Read the full subject files, not the hunks. Then read what the behavior depends on: module wiring and constructors, so you can say what each argument controls. Call sites, for who drives this and how often. Types and schemas, for the real shape of the data. Teardown paths, for what is released and when. Config and defaults, for what happens unconfigured. Tests, which often state the intended rule more plainly than the code.

Derive everything from source. Comments and docs are claims. When a comment and the code disagree, explain the code and note the drift.

To explain why the change exists, read the code as it was before it. For a diff, read the pre-image of every changed file, not just the removed lines. The limitation you are describing usually lives in code the diff never touched.

Before writing, be able to state as fact:

1. What the old code did and what it could not do, in behavior, not structure.
2. What is created, when, and how many, and what drives the count.
3. Ownership and lifetime. Who opens a resource, who closes it, what happens if the holder dies first.
4. What each constructor, layer, or configuration argument is for. Its purpose, not its type.
5. Failure behavior. What retries, with what backoff, what is swallowed, what propagates, what state is left behind.
6. Ordering and concurrency. What runs in parallel, what must not, where a race would be visible.
7. Defaults, thresholds, and limits, with their exact values and where they come from.
8. Invariants the change establishes, and what would break them.
9. New obligations on callers: required setup, ordering, cleanup.
10. What a user or a caller experiences differently now.

Terminology comes from the codebase and the product, never invented for the explanation. If the code calls it a relay, call it a relay.

## 3. Voice

Write plainly for someone with no context on this area. Define each domain or technical term on first use, in one clause, then use it normally for the rest of the report. Never stack undefined jargon.

Lead with the consequence, then the mechanism that produces it. "Two people editing the same document no longer overwrite each other, because each edit now carries the version it was based on" gives the reader both, in the order they can absorb them.

State numbers exactly. "Retries three times, one second apart" beats "retries a few times". Exactness is plain language. Vagueness is not simplicity.

No analogies or metaphors. No filler openers. Never quote blocks of code. Cut any sentence that adds no fact.

Keep clickable `path:line` references at the end of the sentence they support, so the reader can open the file. A reference is evidence for an explanation, never a replacement for one.

## 4. Output Format

Four sections, in this order. Match each one's length to the change. A small change may need two sentences per section.

````
## Context

What this part of the system is for and where it sits, for someone who has never worked here. The terminology they need, each defined once in plain words. Who or what uses it. Two or three short paragraphs at most, and only the vocabulary the rest of the report actually uses.

## Why This Change

What the old code did, in plain behavior. What it could not do, or did wrong, or made expensive. What that meant in practice: the concrete situation where someone hit it, stated as a scenario rather than a category. If the PR body or linked issue states the reason, report that as the reason. If nothing states it, describe what the old shape cost without inventing a motive.

## The Solution

What the code does now and the shape of the approach. Why this approach fits the problem named above. The rules it now enforces and the invariants it guarantees, with exact values, plus what would break each one. Product meaning first, mechanism second. This is where a reader forms an opinion, so surface every threshold, default, and policy as a visible choice with its current value.

## In Practice

A walkthrough of the thing in use, ordered as a person or a caller would meet it. Numbered steps. For each step: what someone does or what triggers it, what they see or get back, and what happens behind the scenes to produce that. Include the failure cases they can actually hit and what those look like from the outside. This section is a user manual for the capability, not a tour of the call stack.
````

Close with a short `## Where This Lives` list mapping each part of the explanation to its files and line references, so a reader can go straight to the evidence.

Order sections exactly as above. Never structure the report by file or by subsystem.

## 5. Stay Descriptive

State consequences, never judgments. "One socket per peer, so peer count sets the descriptor count" is in scope. "This should reuse a single socket" is not.

When behavior depends on something outside the target, say what you checked and what is unverified. Never present a guess as fact.

## 6. Scale To Large Targets

Hold a small target yourself. For a large one, group files by subsystem and spawn one reader per group in parallel, each returning the facts listed in section 2 with evidence. Then merge their results into the four sections yourself, since the structure is a single narrative and cannot be assembled from per subsystem chunks. Verify any claim you did not read yourself.
