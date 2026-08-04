---
name: code-explainer
description: Explains a pull request, commit, branch, file, or directory in natural language, structured by file with line references, at the altitude of behavior and architecture rather than syntax. Use to review a change fast or to understand unfamiliar code without reading it.
---

# Code Explainer

Render code as natural language so a human can judge the design without reading syntax. Give them the decisions and their consequences, keyed to lines they can open.

This skill explains. It does not review. No verdicts, severity, praise, or recommendations.

## 1. Establish The Target

Resolve the request to a concrete file list: a PR or branch diff, a commit or range, staged or unstaged changes, or an explicit file, directory, or symbol. Changed files are the subject for a diff, the whole thing for a file or directory.

If the target is empty, say so and stop. If it is ambiguous, take the most defensible reading and say which.

## 2. Read For Behavior

The reader will not check your claims. That is the premise of the skill, and it makes the standard absolute: every entry states what you read, never what a name, a comment, or a diff hunk led you to expect. A wrong explanation is worse than none, because it gets acted on.

Read the full subject files, not the hunks. A hunk shows an edit. Behavior lives in what the edit lands in.

Then chase each claim until it is fact:

1. Constructors and module wiring, until you can say what each argument controls and what actually gets instantiated at runtime. When wiring is indirect, through injection, registration, or configuration, resolve it. The interface is not the behavior. The bound implementation is.
2. Call sites, transitively, until you can say who drives this, how often, with what arguments, and on which paths. A function that looks per-request may be called once at startup. The call graph decides, not the shape.
3. Types and schemas, for the real shape of the data, including what is optional, what is nullable, and what is validated where.
4. Lifecycle, both directions. What creates and what tears down, in what order, and what happens when teardown never runs.
5. Config, environment, defaults, and feature flags, until you can say what runs with nothing overridden and which deployments diverge.
6. Error paths as far as they propagate. A swallowed error three frames up changes what a failure here means.
7. Tests, when a contract is written down nowhere else, and to check that what you believe is what the suite enforces.
8. Concurrent access. Who else touches this state, from what thread, task, or process, and what interleaving is possible.

When behavior flows through a third party library, verify it per the base library rules against the installed version's source, not from memory. What a call does, what it throws, and what it defaults to are claims about that version.

Stop only when one of two things is true for every entry you will write: you read the lines that make it fact, or you mark it unverified. There is no third state. Comments, docstrings, PR bodies, and commit messages are claims about the code. When they disagree with the source, explain the source and note the drift.

## 3. Choose The Altitude

Include what a reader could hold an opinion about:

1. What is created, when, and how many. One socket for all peers or one per peer. Say the count and what drives it.
2. Ownership and lifetime. Who opens a resource, who closes it, what happens if the holder dies first.
3. What each constructor or layer argument is for. Its purpose, not its type.
4. Failure behavior. What retries, with what backoff, what is swallowed, what propagates, what state is left behind.
5. Ordering and concurrency. What runs in parallel, what must not, where a race would be visible.
6. Boundaries crossed and what is sent across them.
7. Defaults and their consequences.
8. Behavior a caller or user experiences differently now.
9. New obligations on callers: required setup, ordering, cleanup.

Omit syntax, idioms, imports, formatting, type annotations that restate the name, trivial passthroughs, and boilerplate carrying no decision. Compress a mechanically changed file to one line.

The test: could a competent reader want this done differently, or do they need it to judge something else they might want done differently. If neither, cut it.

## 4. Voice

Short sentences. State the behavior, then what it costs or implies. One idea per entry.

Use the real technical terms and do not define them. The reader knows what a socket, a layer, and backpressure are. Do not stack jargon either, and do not narrate mechanics that carry no decision.

No analogies, metaphors, or comparisons to anything outside the code. No filler openers. Never quote code. Cut any sentence that adds no fact.

## 5. Output Format

Three invariants, whatever the structure:

1. Every claim about specific code carries a clickable `[Lstart-Lend](path:start)` reference.
2. Open with a short statement of what the change does at the level of the system, then the decisions a reader is most likely to challenge, each with its consequence as fact.
3. Order for understanding. Entry points and shape defining files before what they call, entries in execution order or reading order. Never alphabetical.

Beyond that, choose the structure the target deserves. A section per file suits a change small enough to walk. A large change reads better grouped by subsystem or by flow, with files as subsections, mechanical files compressed to a line each, and depth spent only where the decisions are. A single file or symbol may need no file headers at all. Do not stretch a small target to fill a template or force a 20,000 line change through a flat per file walk.

The register of an entry, at any scale:

````
[L34-41](src/relay.ts:34) Opens one socket per peer, keyed by peer id. Peer count sets the open socket count for the relay's lifetime.

[L52-60](src/relay.ts:52) Sends use that peer's socket. On failure the peer is marked dead and the message is dropped. No retry.
````

A file holding one decision gets one entry.

## 6. Stay Descriptive

State consequences, never judgments. "One socket per peer, so peer count sets the descriptor count" is in scope. "This should reuse a single socket" is not.

When behavior depends on something outside the target, say what you checked and what is unverified. Never present a guess as fact.

## 7. Scale To Large Targets

Hold a small target yourself. For a large one, group files by subsystem, spawn one reader per group in parallel returning entries in the format above, then order the groups, write the two lead sections, and cut duplicated explanation. Verify any claim you did not read yourself.
