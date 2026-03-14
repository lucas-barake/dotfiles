---
name: effect-cli-testing
description: Testing patterns for @effect/cli commands, prompts, and interactive UX. Use when testing CLI commands, Prompt.select, Prompt.confirm, terminal interactions, or wizard mode. Triggers on @effect/cli tests, MockTerminal, MockConsole, Prompt testing.
---

# Effect CLI Testing

This document covers testing patterns for `@effect/cli` using MockTerminal and MockConsole services.

> **See also**:
> - Load `effect-testing` for general Effect testing patterns (TestClock, it.effect, property-based testing)
> - Load `effect-testing` for **CommandExecutor mocking** when testing services that shell out (git, gh, npm, etc.)

## IMPORTANT: MockTerminal/MockConsole Are NOT Exported

**These test utilities are internal to @effect/cli and not publicly exported.** You must copy them into your test directory from:
- `~/src/oss/effect/packages/cli/test/services/MockTerminal.ts`
- `~/src/oss/effect/packages/cli/test/services/MockConsole.ts`

Or use the implementations below.

## Core Test Services

### MockTerminal - Simulating User Input

The MockTerminal service uses a `Mailbox` to queue simulated key presses for interactive prompts.

```typescript
import * as Terminal from "@effect/platform/Terminal";
import { Context, Effect, Layer, Mailbox, Option } from "effect";

interface MockTerminal extends Terminal.Terminal {
  readonly inputText: (text: string) => Effect.Effect<void>;
  readonly inputKey: (
    key: string,
    modifiers?: Partial<{ ctrl: boolean; meta: boolean; shift: boolean }>
  ) => Effect.Effect<void>;
}

const MockTerminal = Context.GenericTag<Terminal.Terminal, MockTerminal>(
  "@effect/platform/Terminal"
);

const make = Effect.gen(function* () {
  const queue = yield* Effect.acquireRelease(
    Mailbox.make<Terminal.UserInput>(),
    (_) => _.shutdown
  );

  const inputText: MockTerminal["inputText"] = (text: string) => {
    const inputs = text.split("").map((key) => toUserInput(key));
    return queue.offerAll(inputs).pipe(Effect.asVoid);
  };

  const inputKey: MockTerminal["inputKey"] = (key, modifiers = {}) => {
    const input = toUserInput(key, modifiers);
    return input.key.ctrl && (input.key.name === "c" || input.key.name === "d")
      ? queue.end
      : queue.offer(input).pipe(Effect.asVoid);
  };

  return MockTerminal.of({
    columns: Effect.succeed(80),
    rows: Effect.succeed(24),
    isTTY: Effect.succeed(true),
    display: (input) => Console.log(input),
    readInput: Effect.succeed(queue),
    readLine: Effect.succeed(""),
    inputKey,
    inputText,
  });
});

const layer = Layer.scoped(MockTerminal, make);

const toUserInput = (
  key: string,
  modifiers: Partial<{ ctrl: boolean; meta: boolean; shift: boolean }> = {}
): Terminal.UserInput => ({
  input: Option.some(key),
  key: { name: key, ctrl: modifiers.ctrl ?? false, meta: modifiers.meta ?? false, shift: modifiers.shift ?? false },
});
```

### MockConsole - Capturing Output

```typescript
import { Console, Context, Effect, Ref } from "effect";

interface MockConsole extends Console.Console {
  readonly getLines: (params?: { stripAnsi?: boolean }) => Effect.Effect<ReadonlyArray<string>>;
}

const MockConsole = Context.GenericTag<Console.Console, MockConsole>("effect/Console");

const stripAnsiPattern = /[\u001B\u009B][[()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PRZcf-ntqry=><~])/g;

const make = Effect.gen(function* () {
  const lines = yield* Ref.make<Array<string>>([]);

  return MockConsole.of({
    [Console.TypeId]: Console.TypeId,
    getLines: (params = {}) =>
      Ref.get(lines).pipe(
        Effect.map((l) => (params.stripAnsi ? l.map((s) => s.replace(stripAnsiPattern, "")) : l))
      ),
    log: (...args) => Ref.update(lines, (l) => [...l, ...args]),
    unsafe: globalThis.console,
    assert: () => Effect.void,
    clear: Effect.void,
    count: () => Effect.void,
    countReset: () => Effect.void,
    debug: () => Effect.void,
    dir: () => Effect.void,
    dirxml: () => Effect.void,
    error: () => Effect.void,
    group: () => Effect.void,
    groupEnd: Effect.void,
    info: () => Effect.void,
    table: () => Effect.void,
    time: () => Effect.void,
    timeEnd: () => Effect.void,
    timeLog: () => Effect.void,
    trace: () => Effect.void,
    warn: () => Effect.void,
  });
});
```

## Test Layer Setup

```typescript
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { CliApp } from "@effect/cli";

const MainLive = Effect.gen(function* () {
  const console = yield* MockConsole.make;
  return Layer.mergeAll(
    Console.setConsole(console),
    NodeFileSystem.layer,
    MockTerminal.layer,
    NodePath.layer
  );
}).pipe(Layer.unwrapEffect);

const runEffect = <E, A>(
  self: Effect.Effect<A, E, CliApp.CliApp.Environment>
): Promise<A> => Effect.provide(self, MainLive).pipe(Effect.runPromise);
```

## Testing Interactive Prompts (Fork + Join Pattern)

**Critical pattern**: Interactive prompts block waiting for input. You must:
1. `Effect.fork(prompt)` - start prompt in background fiber
2. `MockTerminal.inputKey(...)` - push input to the queue
3. `Fiber.join(fiber)` - wait for prompt to complete

### Testing Prompt.select

```typescript
import { Prompt } from "@effect/cli";
import { Effect, Fiber } from "effect";

it.effect("selects second option", () =>
  Effect.gen(function* () {
    const prompt = Prompt.select({
      message: "Select AI model",
      choices: [
        { title: "Option 1", value: "opt-1" },
        { title: "Option 2", value: "opt-2" },
        { title: "Option 3", value: "opt-3" },
      ],
    });

    const fiber = yield* Effect.fork(prompt);
    yield* MockTerminal.inputKey("down");
    yield* MockTerminal.inputKey("enter");
    const result = yield* Fiber.join(fiber);

    expect(result).toBe("opt-2");
  }).pipe(runEffect)
);
```

### Testing Prompt.confirm

**Key mappings for confirm prompts:**
- `y` or `t` - Submit with `true` (immediate, no enter needed)
- `n` or `f` - Submit with `false` (immediate, no enter needed)
- `enter` - Submit with initial/default value

```typescript
it.effect("confirms with Y key", () =>
  Effect.gen(function* () {
    const prompt = Prompt.confirm({ message: "Proceed?", initial: false });

    const fiber = yield* Effect.fork(prompt);
    yield* MockTerminal.inputKey("y");  // Immediately submits true
    const result = yield* Fiber.join(fiber);

    expect(result).toBe(true);
  }).pipe(runEffect)
);

it.effect("denies with N key", () =>
  Effect.gen(function* () {
    const prompt = Prompt.confirm({ message: "Proceed?", initial: true });

    const fiber = yield* Effect.fork(prompt);
    yield* MockTerminal.inputKey("n");  // Immediately submits false
    const result = yield* Fiber.join(fiber);

    expect(result).toBe(false);
  }).pipe(runEffect)
);

it.effect("uses default when pressing enter", () =>
  Effect.gen(function* () {
    const prompt = Prompt.confirm({ message: "Proceed?", initial: true });

    const fiber = yield* Effect.fork(prompt);
    yield* MockTerminal.inputKey("enter");  // Submits initial value
    const result = yield* Fiber.join(fiber);

    expect(result).toBe(true);
  }).pipe(runEffect)
);
```

### Testing Prompt.text

```typescript
it.effect("accepts text input", () =>
  Effect.gen(function* () {
    const prompt = Prompt.text({ message: "Enter name" });

    const fiber = yield* Effect.fork(prompt);
    yield* MockTerminal.inputText("hello");
    yield* MockTerminal.inputKey("enter");
    const result = yield* Fiber.join(fiber);

    expect(result).toBe("hello");
  }).pipe(runEffect)
);
```

### Testing Prompt.multiSelect

```typescript
it.effect("selects multiple options", () =>
  Effect.gen(function* () {
    const prompt = Prompt.multiSelect({
      message: "Select features",
      choices: [
        { title: "A", value: "a" },
        { title: "B", value: "b" },
        { title: "C", value: "c" },
      ],
    });

    const fiber = yield* Effect.fork(prompt);
    yield* MockTerminal.inputKey("down");
    yield* MockTerminal.inputKey("down");
    yield* MockTerminal.inputKey("space");
    yield* MockTerminal.inputKey("down");
    yield* MockTerminal.inputKey("space");
    yield* MockTerminal.inputKey("enter");
    const result = yield* Fiber.join(fiber);

    expect(result).toEqual(["a", "b"]);
  }).pipe(runEffect)
);
```

## Testing CTRL+C Quit Behavior

```typescript
it.effect("quits on CTRL+C", () =>
  Effect.gen(function* () {
    const cli = Command.make("foo", { message: Options.text("message") }).pipe(
      Command.run({ name: "Test", version: "1.0.0" })
    );
    const args = ["node", "test", "--wizard"];

    const fiber = yield* Effect.fork(cli(args));
    yield* MockTerminal.inputKey("c", { ctrl: true });
    yield* Fiber.join(fiber);

    const lines = yield* MockConsole.getLines({ stripAnsi: true });
    expect(lines.some((line) => line.includes("Quitting wizard mode..."))).toBe(true);
  }).pipe(runEffect)
);
```

## Testing Console Output

```typescript
it.effect("displays help text", () =>
  Effect.gen(function* () {
    const cli = Command.run(Command.make("foo"), {
      name: "Test",
      version: "1.0.0",
    });

    yield* cli([]);
    const lines = yield* MockConsole.getLines();
    const output = lines.join("\n");

    expect(output).toContain("--help");
    expect(output).toContain("--version");
  }).pipe(runEffect)
);
```

## Testing Commands (Non-Interactive)

For commands without interactive prompts, use a simpler Messages service pattern:

```typescript
interface Messages {
  readonly log: (message: string) => Effect.Effect<void>;
  readonly messages: Effect.Effect<ReadonlyArray<string>>;
}
const Messages = Context.GenericTag<Messages>("Messages");

const MessagesLive = Layer.sync(Messages, () => {
  const messages: Array<string> = [];
  return Messages.of({
    log: (message) => Effect.sync(() => messages.push(message)),
    messages: Effect.sync(() => messages),
  });
});

const EnvLive = Layer.mergeAll(MessagesLive, NodeContext.layer);

it("executes command", () =>
  Effect.gen(function* () {
    const messages = yield* Messages;
    yield* run(["node", "git.js", "add", "file"]);
    expect(yield* messages.messages).toEqual(["shared", "Adding"]);
  }).pipe(Effect.provide(EnvLive), Effect.runPromise)
);
```

## Testing with ConfigProvider

```typescript
it("reads config from environment", () =>
  Effect.gen(function* () {
    const messages = yield* Messages;
    yield* run(["node", "git.js", "clone", "repo"]);
    expect(yield* messages.messages).toContain("Cloning repo");
  }).pipe(
    Effect.withConfigProvider(ConfigProvider.fromMap(
      new Map([["VERBOSE", "true"], ["REPOSITORY", "repo"]])
    )),
    Effect.provide(EnvLive),
    Effect.runPromise
  )
);
```

## Testing CliConfig Options

```typescript
import { CliConfig } from "@effect/cli";

it("hides built-in options when configured", () => {
  const CliConfigLive = CliConfig.layer({ showBuiltIns: false });

  return Effect.gen(function* () {
    const cli = Command.run(Command.make("foo"), {
      name: "Test",
      version: "1.0.0",
    });
    yield* cli([]);
    const lines = yield* MockConsole.getLines();
    const output = lines.join("\n");

    expect(output).not.toContain("--wizard");
    expect(output).not.toContain("--completions");
  }).pipe(
    Effect.provide(Layer.mergeAll(MainLive, CliConfigLive)),
    Effect.runPromise
  );
});
```

## Testing Options Validation

```typescript
import { Options, CliConfig } from "@effect/cli";
import { ValidationError } from "@effect/cli/ValidationError";

const process = <A>(
  options: Options.Options<A>,
  args: ReadonlyArray<string>,
  config: CliConfig.CliConfig
): Effect.Effect<[ReadonlyArray<string>, A], ValidationError.ValidationError> =>
  Options.processCommandLine(options, args, config).pipe(
    Effect.flatMap(([err, rest, a]) =>
      Option.match(err, {
        onNone: () => Effect.succeed([rest, a]),
        onSome: Effect.fail,
      })
    )
  );

it.effect("validates boolean option", () =>
  Effect.gen(function* () {
    const verbose = Options.boolean("verbose");
    const [rest, result] = yield* process(verbose, ["--verbose"], CliConfig.defaultConfig);
    expect(result).toBe(true);
    expect(rest).toEqual([]);
  }).pipe(runEffect)
);

it.effect("fails on invalid option", () =>
  Effect.gen(function* () {
    const age = Options.integer("age");
    const error = yield* Effect.flip(process(age, ["--ag", "20"], CliConfig.defaultConfig));
    expect(error._tag).toBe("MissingValue");
  }).pipe(runEffect)
);
```

## Key Testing Patterns Summary

| Pattern | Use Case |
|---------|----------|
| `Effect.fork(prompt) + inputKey + Fiber.join` | Interactive prompts (select, confirm, text) |
| `MockConsole.getLines({ stripAnsi: true })` | Assert console output without ANSI codes |
| `Effect.flip(effect)` | Test error cases |
| `Layer.unwrapEffect` | Create layers that need effectful setup |
| `inputKey("c", { ctrl: true })` | Simulate CTRL+C quit |
| `inputText("hello")` | Simulate typing text character by character |
| `ConfigProvider.fromMap` | Mock environment variables for options |

## Common Key Names

| Key | Behavior |
|-----|----------|
| `"enter"` | Submit/confirm (uses default for confirm prompts) |
| `"space"` | Toggle selection (multiSelect) |
| `"up"` / `"down"` | Navigate options |
| `"y"` / `"t"` | Confirm prompt: submit `true` immediately |
| `"n"` / `"f"` | Confirm prompt: submit `false` immediately |
| `"c"` with `{ ctrl: true }` | Quit (CTRL+C) |
| `"d"` with `{ ctrl: true }` | EOF/Quit (CTRL+D) |
| `"tab"` | Accept default / advance |
