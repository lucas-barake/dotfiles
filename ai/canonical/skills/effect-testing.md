---
name: effect-testing
description: Effect testing patterns with @effect/vitest and testcontainers. Use when writing tests for Effect code, using TestClock, property-based testing, database integration tests, or mocking services that shell out. Triggers on @effect/vitest, it.effect, it.scoped, TestClock, layer(), testcontainers, CommandExecutor, mock shell commands.
---

# Effect Testing

This document covers testing patterns using `@effect/vitest` and testcontainers.

> **See also**: Load the `effect-layers` skill for deep dive on layer memoization semantics.

## Testing with @effect/vitest

Import from `@effect/vitest` for Effect-aware testing:

```typescript
import { describe, expect, it, layer } from "@effect/vitest";
import { Effect, TestClock, Fiber, Duration } from "effect";
```

## Test Variants

| Method          | TestServices | Scope | Use Case                              |
| --------------- | ------------ | ----- | ------------------------------------- |
| `it.effect`     | TestClock    | No    | Most tests - deterministic time       |
| `it.live`       | Real clock   | No    | Tests needing real time/IO            |
| `it.scoped`     | TestClock    | Yes   | Tests with resources (acquireRelease) |
| `it.scopedLive` | Real clock   | Yes   | Real time + resources                 |

### it.effect - Use for Most Tests (with TestClock)

```typescript
it.effect("processes after delay", () =>
  Effect.gen(function* () {
    // Fork the effect that uses time
    const fiber = yield* Effect.fork(
      Effect.sleep(Duration.minutes(5)).pipe(Effect.map(() => "done")),
    );

    // Advance the TestClock - no real waiting!
    yield* TestClock.adjust(Duration.minutes(5));

    // Now the fiber completes instantly
    const result = yield* Fiber.join(fiber);
    expect(result).toBe("done");
  }),
);
```

### it.live - Use When You Need Real Time/External IO

```typescript
it.live("calls external API", () =>
  Effect.gen(function* () {
    // This actually waits 100ms
    yield* Effect.sleep(Duration.millis(100));
    // Real HTTP calls, file system, etc.
  }),
);
```

### TestClock Patterns

```typescript
// Always fork effects that sleep, then adjust clock
it.effect("timeout test", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(
      Effect.sleep(Duration.seconds(30)).pipe(
        Effect.timeout(Duration.seconds(10)),
      ),
    );
    // Advance past timeout
    yield* TestClock.adjust(Duration.seconds(10));
    const result = yield* Fiber.join(fiber);
    expect(result._tag).toBe("None"); // Timed out
  }),
);
```

## Sharing Layers Between Tests

```typescript
import { layer } from "@effect/vitest";

layer(AccountServiceLive)("AccountService", (it) => {
  it.effect("finds account by id", () =>
    Effect.gen(function* () {
      const service = yield* AccountService;
      const account = yield* service.findById(testAccountId);
      expect(account.name).toBe("Test");
    }),
  );

  // Nested layers
  it.layer(AuditServiceLive)("with audit", (it) => {
    it.effect("logs actions", () =>
      Effect.gen(function* () {
        const accounts = yield* AccountService;
        const audit = yield* AuditService;
        // Both services available
      }),
    );
  });
});

// Use real clock even with layer
layer(MyService.Live, { excludeTestServices: true })("live tests", (it) => {
  it.effect("uses real time", () =>
    Effect.gen(function* () {
      yield* Effect.sleep(Duration.millis(10)); // Actually waits
    }),
  );
});
```

## Property-Based Testing with @effect/vitest

### Core Concepts

- **`effect/FastCheck`**: Re-exports the `fast-check` library
- **`effect/Arbitrary`**: Provides `Arbitrary.make(schema)` to create FastCheck arbitraries from Effect Schemas
- **`it.prop` / `it.effect.prop`**: @effect/vitest helpers that accept Schema types directly (auto-converts via `Arbitrary.make`)

### Schema → Arbitrary Mapping

| Schema Type            | Arbitrary Behavior                                            |
| ---------------------- | ------------------------------------------------------------- |
| `Schema.Literal(x)`    | Always generates `x` via `fc.constant(x)`                     |
| `Schema.Option(T)`     | `fc.oneof()` between `Some(T)` and `None` (equal probability) |
| `Schema.Union(A, B)`   | `fc.oneof()` randomly selects any member                      |
| `Schema.Struct({...})` | Generates objects with all fields populated recursively       |
| `Schema.Array(T)`      | Random length arrays with elements of type `T`                |

### Usage Patterns

```typescript
import { it } from "@effect/vitest";
import { Arbitrary, Effect, FastCheck, Schema } from "effect";

// Array syntax - pass Schema or FastCheck.Arbitrary directly
it.prop("test name", [Schema.String, FastCheck.integer()], ([str, num]) => {
  return typeof str === "string" && Number.isInteger(num);
});

// Object syntax
it.prop("test name", { a: Schema.Number, b: Schema.Boolean }, ({ a, b }) => {
  return typeof a === "number" && typeof b === "boolean";
});

// Effectful property test
it.effect.prop("async test", [Schema.String], ([str]) =>
  Effect.gen(function* () {
    yield* Effect.void;
    return str.length >= 0;
  }),
);

// With FastCheck options
it.prop("with options", [Schema.Number], ([n]) => true, {
  fastCheck: { numRuns: 200 },
});

// Manual arbitrary creation (when needed outside it.prop)
const myArb = Arbitrary.make(MySchema);
FastCheck.assert(FastCheck.property(myArb, (value) => /* ... */));
```

### Constraints

- **`Schema.declare()` requires `arbitrary` annotation** - custom types must provide their own arbitrary
- **Recursive schemas**: Default `maxDepth: 2` prevents stack overflow
- **`Schema.Never`**: Cannot generate values (throws)

Override arbitrary for any schema:

```typescript
Schema.String.annotations({
  arbitrary: () => (fc) => fc.constant("fixed-value"),
});
```

## Testing Database-Dependent Code with Testcontainers

Use `@testcontainers/postgresql` to run integration tests against a real PostgreSQL database. Wrap the container in an Effect layer for proper lifecycle management.

### Container Layer Setup

```typescript
// test/utils.ts - Container layer setup
import { PgClient } from "@effect/sql-pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Data, Effect, Layer, Redacted } from "effect";

// Error type for container failures
export class ContainerError extends Data.TaggedError("ContainerError")<{
  cause: unknown;
}> {}

// Container as Effect.Service with scoped lifecycle
export class PgContainer extends Effect.Service<PgContainer>()(
  "test/PgContainer",
  {
    scoped: Effect.acquireRelease(
      Effect.tryPromise({
        try: () => new PostgreSqlContainer("postgres:alpine").start(),
        catch: (cause) => new ContainerError({ cause }),
      }),
      (container) => Effect.promise(() => container.stop()),
    ),
  },
) {
  // Layer that provides PgClient from the container
  static ClientLive = Layer.unwrapEffect(
    Effect.gen(function* () {
      const container = yield* PgContainer;
      return PgClient.layer({
        url: Redacted.make(container.getConnectionUri()),
      });
    }),
  ).pipe(Layer.provide(this.Default));
}
```

### Using the Container in Tests

```typescript
// test/Repository.test.ts - Using the container in tests
import { it, expect } from "@effect/vitest";
import { PgClient } from "@effect/sql-pg";
import { Effect } from "effect";
import { PgContainer } from "./utils.ts";

// Use it.layer with 30s timeout (container startup is slow)
it.layer(PgContainer.ClientLive, { timeout: "30 seconds" })(
  "AccountRepository",
  (it) => {
    it.effect("creates and retrieves account", () =>
      Effect.gen(function* () {
        const sql = yield* PgClient.PgClient;

        // Create table
        yield* sql`CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL)`;

        // Insert
        yield* sql`INSERT INTO accounts (id, name) VALUES ('acc_1', 'Cash')`;

        // Query
        const rows = yield* sql`SELECT * FROM accounts WHERE id = 'acc_1'`;
        expect(rows[0].name).toBe("Cash");
      }),
    );

    it.effect("handles transactions", () =>
      Effect.gen(function* () {
        const sql = yield* PgClient.PgClient;

        // Transaction that rolls back on error
        const result = yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`INSERT INTO accounts (id, name) VALUES ('acc_2', 'Bank')`;
            return yield* sql`SELECT * FROM accounts WHERE id = 'acc_2'`;
          }),
        );
        expect(result).toHaveLength(1);
      }),
    );
  },
);
```

### Key Points (Per-Block Containers)

- Container starts once per `it.layer` block, shared across all tests in that block
- Container stops automatically when tests complete (acquireRelease cleanup)
- Use `{ timeout: "30 seconds" }` because container startup takes time
- Each test gets the same database - use transactions or cleanup between tests
- `Layer.unwrapEffect` defers layer creation until container is running

## Shared Database Container (Global Setup)

**Problem**: Using `PgContainer.ClientLive` directly in tests creates a new container for each `it.layer()` block. This is slow and wasteful when tests could share a single container.

**Solution**: Use vitest's `globalSetup` to start ONE container before all tests and share it.

### Step 1: Create Global Setup File

```typescript
// vitest.global-setup.ts
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer;

export async function setup({
  provide,
}: {
  provide: (key: string, value: unknown) => void;
}) {
  console.log("Starting shared PostgreSQL container...");

  container = await new PostgreSqlContainer("postgres:alpine").start();

  // Make connection URL available to tests via inject()
  provide("dbUrl", container.getConnectionUri());

  console.log(`PostgreSQL ready at ${container.getConnectionUri()}`);
}

export async function teardown() {
  console.log("Stopping shared PostgreSQL container...");
  await container?.stop();
}
```

### Step 2: Update Vitest Config

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globalSetup: ["./vitest.global-setup.ts"],
    hookTimeout: 120000,
    // ... rest of config
  },
});
```

### Step 3: Update Test Utils to Use Injected URL

```typescript
// packages/persistence/test/Utils.ts
import { PgClient } from "@effect/sql-pg";
import { Layer, Redacted } from "effect";
import { inject } from "vitest";

/**
 * PgClient layer that uses the shared container from globalSetup.
 *
 * The container URL is injected via vitest's inject() mechanism,
 * which reads from the globalSetup's provide() calls.
 */
export const SharedPgClientLive = Layer.effect(
  PgClient.PgClient,
  Effect.gen(function* () {
    const url = inject("dbUrl") as string;
    return yield* PgClient.make({ url: Redacted.make(url) });
  }),
);
```

### Step 4: Update Tests to Use Shared Layer

```typescript
// Before (per-block container - SLOW)
const TestLayer = RepositoriesLayer.pipe(
  Layer.provideMerge(MigrationLayer),
  Layer.provideMerge(PgContainer.ClientLive), // Creates new container!
);

// After (shared container - FAST)
const TestLayer = RepositoriesLayer.pipe(
  Layer.provideMerge(MigrationLayer),
  Layer.provideMerge(SharedPgClientLive), // Uses global container
);
```

### Key Benefits

- **Single container** for entire test suite (not per `it.layer` block)
- **Faster tests** - container starts once before any test, stops after all tests
- **Same isolation** - each test group still gets its own layer instances
- **Migrations run per-block** - schema is set up fresh for each `it.layer` block

## Layer.fresh: When to Use and When Not to Use

### When Layer.fresh IS Needed

**Scenario 1: Module-level constant layers with different configurations per test**

When a layer like `AuthServiceLive` is defined as a module-level constant, it gets memoized by identity. If different tests provide different configs, the first test's config gets cached and reused:

```typescript
// packages/persistence/src/Layers/AuthServiceLive.ts
export const AuthServiceLive = Layer.effect(AuthService, make); // Module-level constant!

// packages/persistence/test/AuthService.test.ts
const createTestLayer = (options: { autoProvisionUsers?: boolean }) => {
  const AuthConfigLayer = Layer.effect(
    AuthServiceConfig,
    Effect.succeed({
      autoProvisionUsers: options.autoProvisionUsers ?? true,
      // ...
    }),
  );

  // WRONG: AuthServiceLive is memoized - first test's config wins!
  return AuthServiceLive.pipe(
    Layer.provideMerge(AuthConfigLayer),
    // ...
  );
};

// CORRECT: Layer.fresh escapes memoization per test layer build
const createTestLayer = (options: { autoProvisionUsers?: boolean }) => {
  // ...
  return Layer.fresh(AuthServiceLive).pipe(
    // <- REQUIRED!
    Layer.provideMerge(AuthConfigLayer),
    // ...
  );
};
```

**Scenario 2: Same layer reference twice in a composition**

When the same layer reference appears multiple times and you need separate instances:

```typescript
const sharedLayer = makeLayer();
const needsBothInstances = Layer.merge(
  sharedLayer, // First instance
  Layer.fresh(sharedLayer), // Force second instance
);
```

### When Layer.fresh is NOT Needed

**Factory functions returning new compositions** - factory functions already return new objects:

```typescript
// WRONG: Layer.fresh is unnecessary here!
const createTestLayer = () => {
  // This creates a NEW Layer.mergeAll object each call - no memoization across calls
  return Layer.fresh(
    // <- REMOVE THIS, unnecessary
    Layer.mergeAll(RepoA, RepoB).pipe(Layer.provideMerge(SharedPgClientLive)),
  );
};
```

**Why it's unnecessary**: Factory functions return NEW layer objects on each call. Memoization is identity-based, so different calls never share.

See the `effect-layers` skill for complete details.

## Migration Instructions: Shared Container Setup

To switch from per-block containers to a shared container:

1. **Create `vitest.global-setup.ts`** at project root (see template above)
2. **Create `vitest.d.ts`** for TypeScript types - declare module "vitest" { export interface ProvidedContext { dbUrl: string } }
3. **Update `vitest.config.ts`** to add `globalSetup: ["./vitest.global-setup.ts"]`
4. **Create `SharedPgClientLive`** layer in test utils that uses `inject("dbUrl")`
5. **Update all test layers** to use `SharedPgClientLive` instead of `PgContainer.ClientLive`
6. **Use `Layer.fresh`** for module-level constant layers (like `AuthServiceLive`) when tests need different configs
7. **Keep `MigrationLayer`** in test layer compositions - migrations will run once per `it.layer` block (idempotent)
8. **Make test data unique** - use `Date.now()` and `Math.random()` for IDs/emails since all tests share one database

### Before and After

```typescript
// BEFORE: packages/persistence/test/AuthService.test.ts
const RepositoriesLayer = Layer.mergeAll(
  UserRepositoryLive,
  IdentityRepositoryLive,
  SessionRepositoryLive
).pipe(
  Layer.provideMerge(MigrationLayer),
  Layer.provideMerge(PgContainer.ClientLive)  // <- New container per block!
)

const createTestLayer = (options = {}) => {
  // ...
  return Layer.fresh(SomeComposedLayer.pipe(...))  // <- Unnecessary for composed layers!
}

// AFTER
const RepositoriesLayer = Layer.mergeAll(
  UserRepositoryLive,
  IdentityRepositoryLive,
  SessionRepositoryLive
).pipe(
  Layer.provideMerge(MigrationLayer),
  Layer.provideMerge(SharedPgClientLive)  // <- Uses global container
)

const createTestLayer = (options = {}) => {
  // ...
  // Layer.fresh IS needed for module-level constant layers with different configs!
  return Layer.fresh(AuthServiceLive).pipe(
    Layer.provideMerge(AuthConfigLayer),  // Different configs per test
    // ...
  )
}
```

## DefaultWithoutDependencies for Effect.Service Tests

When testing `Effect.Service` classes, **always use `DefaultWithoutDependencies`** instead of `Default`.

### Why?

`Effect.Service` classes have a `dependencies` array that gets bundled into `Default`:

```typescript
export class MyService extends Effect.Service<MyService>()("MyService", {
  dependencies: [PgLive, EnvVars, SomeOtherService], // Production dependencies
  effect: Effect.gen(function* () {
    // ...
  }),
}) {}
```

- `MyService.Default` includes all production dependencies (PgLive, EnvVars, etc.)
- `MyService.DefaultWithoutDependencies` only includes the service itself

### The Problem

Using `Default` in tests will:

1. Try to read production environment variables (fails in CI)
2. Connect to production databases
3. Initialize production services you don't want in tests

```typescript
// WRONG - will fail in CI because PgLive reads DATABASE_URL from env
const TestLive = MyService.Default.pipe(
  Layer.provideMerge(PgTest), // PgTest has no effect - Default already provides PgLive internally
);

// CORRECT - excludes production dependencies, provide test versions
const TestLive = MyService.DefaultWithoutDependencies.pipe(
  Layer.provideMerge(PgTest), // Provides test database
);
```

### Pattern

```typescript
import { PgTest, withTransactionRollback } from "@/db/pg-test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { MyService } from "./my-service.js";

// Use DefaultWithoutDependencies and provide test dependencies
const TestLive = MyService.DefaultWithoutDependencies.pipe(
  Layer.provideMerge(SomeTestMock),
  Layer.provideMerge(PgTest),
);

it.layer(TestLive)("MyService", (it) => {
  it.effect(
    "does something",
    Effect.fn(function* () {
      const service = yield* MyService;
      // test...
    }, withTransactionRollback),
  );
});
```

### Key Rule

**In tests, NEVER use `ServiceName.Default` for Effect.Service classes with dependencies. Always use `ServiceName.DefaultWithoutDependencies` and explicitly provide test versions of dependencies.**

## Mocking CommandExecutor (Shell Commands)

For services that shell out (git, gh, npm, etc.), mock `@effect/platform`'s `CommandExecutor`:

```typescript
import { Command, CommandExecutor } from "@effect/platform";
import { Effect, Layer } from "effect";

type MockHandlers = {
  readonly string?: (args: ReadonlyArray<string>) => string;
  readonly exitCode?: (args: ReadonlyArray<string>) => number;
};

const makeMockCommandExecutor = (handlers: MockHandlers) => {
  const extractArgs = (cmd: Command.Command): ReadonlyArray<string> => {
    const flattened = Command.flatten(cmd);
    return flattened.flatMap((c) => [c.command, ...c.args]);
  };

  return Layer.succeed(CommandExecutor.CommandExecutor, {
    string: (cmd) => Effect.succeed(handlers.string?.(extractArgs(cmd)) ?? ""),
    exitCode: (cmd) => Effect.succeed(handlers.exitCode?.(extractArgs(cmd)) ?? 0),
    lines: (cmd) =>
      Effect.succeed((handlers.string?.(extractArgs(cmd)) ?? "").split("\n")),
    stream: () => {
      throw new Error("stream not implemented");
    },
    streamLines: () => {
      throw new Error("streamLines not implemented");
    },
    start: () => {
      throw new Error("start not implemented");
    },
  } as CommandExecutor.CommandExecutor);
};
```

### Usage Example

```typescript
import { it } from "@effect/vitest";
import { GitClient } from "./GitClient.js";

const TestExecutor = makeMockCommandExecutor({
  string: (args) => {
    if (args.includes("diff") && args.includes("--staged")) {
      return "+ added line\n- removed line";
    }
    if (args.includes("log")) {
      return "abc123\nabc\ncommit subject\n\nauthor\n2024-01-01\n---COMMIT-END---";
    }
    return "";
  },
  exitCode: (args) => (args.includes("commit") ? 0 : 0),
});

it.effect("getStagedDiff returns diff", () =>
  Effect.gen(function* () {
    const git = yield* GitClient;
    const diff = yield* git.getStagedDiff;
    expect(diff).toContain("added line");
  }).pipe(
    Effect.provide(GitClient.DefaultWithoutDependencies),
    Effect.provide(TestExecutor),
    Effect.provide(cliOptionLayer("contextLines", Option.none())),
  ),
);
```

### Pattern: Match by Command Args

```typescript
const TestExecutor = makeMockCommandExecutor({
  string: (args) => {
    const argsStr = args.join(" ");

    if (argsStr.includes("gh repo view")) {
      return JSON.stringify({ nameWithOwner: "owner/repo" });
    }
    if (argsStr.includes("gh pr list")) {
      return JSON.stringify([{ number: 1, title: "PR", author: { login: "user" } }]);
    }
    if (argsStr.includes("gh pr diff")) {
      return "diff content";
    }

    return "";
  },
});
```

## Mocking AI/LLM Services

Use the `TestUtils.withLanguageModel` helper for mocking AI responses:

```typescript
import * as TestUtils from "@/lib/ai/test-utilities.js";

// Static response
TestUtils.withLanguageModel({
  generateText: [{ type: "text", text: '{"result": "ok"}' }],
});

// Dynamic response based on prompt
TestUtils.withLanguageModel({
  generateText: (opts) => {
    const promptText = extractPromptText(opts.prompt);
    if (promptText.includes("fact-check")) {
      return [{ type: "text", text: JSON.stringify({ errors: [] }) }];
    }
    return [{ type: "text", text: JSON.stringify({ result: "default" }) }];
  },
});

// Stream mocking
TestUtils.withLanguageModel({
  streamText: () =>
    Stream.fromIterable([
      { type: "text-delta", id: "1", delta: '{"title":"Hello"}' },
      {
        type: "finish",
        reason: "stop",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      },
    ]),
});

// Usage - pipe after Effect.provide
Effect.gen(function* () {
  /* test */
}).pipe(
  Effect.provide(TestLayer),
  TestUtils.withLanguageModel({ generateText: mockResponse }),
  withTransactionRollback,
);
```

## Layer.mock for Partial Service Mocking

```typescript
// Only implement methods you need - others throw "not implemented"
const MockEventStreamHub = Layer.mock(EventStreamHub, {
  _tag: "EventStreamHub", // MUST match service tag
  notifyOrg: () => Effect.void,
});

// With side-effect tracking
let calls: Array<unknown> = [];
const MockRepo = Layer.mock(MyRepo, {
  _tag: "MyRepo",
  save: (item) =>
    Effect.sync(() => {
      calls.push(item);
    }),
});

// Dynamic mock needing Effect (e.g., DateTime)
const DynamicMock = Layer.unwrapEffect(
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    return Layer.mock(MyService, {
      _tag: "MyService",
      getTimestamp: () => Effect.succeed(now),
    });
  }),
);
```

## LayerMap for Multi-Tenant/Keyed Services

```typescript
import * as LayerMap from "effect/LayerMap";

const mockClientLayer = Layer.succeed(KlaviyoClient, {
  getTemplates: () => Stream.fromIterable(templates),
  render: () => Effect.dieMessage("noop"), // Not needed in this test
});

const KlaviyoClientMapTest = Layer.scoped(
  KlaviyoClientMap,
  LayerMap.make(() => mockClientLayer),
);
```

## Mailbox for Async Event Collection

```typescript
const drainMailbox = <A, E>(mailbox: Mailbox.Mailbox<A, E>) =>
  Effect.gen(function* () {
    const collected: Array<A> = [];
    while (true) {
      const [messages, done] = yield* mailbox.takeAll;
      collected.push(...Chunk.toReadonlyArray(messages));
      if (done) break;
    }
    return collected;
  });

// In test
const mailbox = yield * Mailbox.make<MyEvent>();
const drainFiber = yield * drainMailbox(mailbox).pipe(Effect.fork);

yield * myService.run().pipe(Effect.provideService(MyMailbox, mailbox));

yield * mailbox.end;
const events = yield * Fiber.join(drainFiber);
```

## Listener/Background Job Test Setup

```typescript
const makeTestSetup = Effect.gen(function* () {
  const eventsRef = yield* Ref.make<ReadonlyArray<MyEvent>>([]);
  const eventDeferred = yield* Deferred.make<MyEvent>();

  const testLayer = MyListener.DefaultWithoutDependencies.pipe(
    Layer.provide(
      Layer.mock(EventStreamHub, {
        _tag: "EventStreamHub",
        notify: (event) =>
          Effect.gen(function* () {
            yield* Ref.update(eventsRef, (es) => [...es, event]);
            yield* Deferred.succeed(eventDeferred, event);
          }),
      }),
    ),
  );

  yield* Layer.build(testLayer); // Start listener

  return { eventsRef, eventDeferred };
});
```

## PgListener Race Conditions in Tests

**Problem**: `PgListener` starts asynchronously via `Effect.forkScoped`. Database triggers that fire `pg_notify` immediately after INSERT/UPDATE may send notifications before the listener is ready, causing lost events and test timeouts.

**Solution**: Add `yield* Effect.sleep("200 millis")` after `Layer.build(testLayer)` and before any database operations that trigger notifications. This ensures the listener fiber has time to call `sql.listen()` and start receiving events.

```typescript
yield * Layer.build(testLayer); // Start listener in background fiber
yield * Effect.sleep("200 millis"); // Wait for listener to initialize
// Now safe to trigger database events
```
