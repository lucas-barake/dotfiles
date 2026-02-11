---
name: effect
description: Core Effect library patterns, data types, services, concurrency, and module reference. Use when working with Effect code, imports, services, concurrency primitives, data modeling, or any core effect/ module. Triggers on Effect.fn, Effect.gen, Effect.Service, Context.Tag, Data.Class, Deferred, Ref, Semaphore, Latch, Queue, Cause, Exit, Schema, Stream, pipe, flow.
---

# Effect Core Reference

## Immutability (NON-NEGOTIABLE)

- `readonly` on ALL properties by default
- `Readonly<T>`, `ReadonlyArray<T>`, `ReadonlyMap<K, V>`, `ReadonlySet<T>` everywhere
- Mutable only when there is a proven, critical performance reason

## Imports

Namespace imports from submodules (tree-shaking):

```ts
import * as Effect from "effect/Effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import { pipe, flow } from "effect/Function";
```

Never: `import { Effect } from "effect"`

## Piping

```ts
Effect.succeed(1).pipe(Effect.map((n) => n + 1));
pipe(arr, Arr.map(fn), Arr.filter(pred));
const transform = flow(Arr.map(fn), Arr.filter(pred));
```

## Effect.fn

Function wrapper returning an Effect. Works with generators or regular functions.

```ts
const myFn = Effect.fn(function* (arg1: string, arg2: number) {
  const result = yield* someEffect(arg1)
  return result + arg2
}, Effect.map(n => n * 2))

const myFn = Effect.fn("spanName")(function* (arg1: string) {
  // ...
}, Effect.map(...))

const myFn = Effect.fn(function* (id: string) {
  // ...
}, (self, id) => self.pipe(Effect.tap(() => log(id))))
```

Returns a function — second arg onwards acts as pipe operators.

## Effect.gen

Generator-based syntax. `yield*` unwraps effects:

```ts
const program = Effect.gen(function* () {
  const user = yield* getUser(id);
  const posts = yield* getPosts(user.id);
  return { user, posts };
});
```

## Services

### Context.Tag (simple tag, no accessors)

```ts
const make = Effect.gen(function* () {...})

class UserRepo extends Context.Tag("UserRepo")<
  UserRepo,
  Effect.Effect.Success<typeof make>
>() {}
```

### Effect.Service (tag + layer in one)

```ts
class Logger extends Effect.Service<Logger>()("Logger", {
  dependencies: [Prefix.Default],
  effect: Effect.gen(function* () {
    const prefix = yield* Prefix;
    return { info: (msg: string) => Effect.log(`[${prefix}] ${msg}`) };
  }),
}) {}

Effect.provide(Logger.Default); // Logger.DefaultWithoutDependencies
```

Supports `effect`, `scoped`, `sync`, `succeed`. With `dependencies`: exposes `.Default` (deps provided) and `.DefaultWithoutDependencies`.

### Context.Reference (tag with default value)

```ts
class Config extends Context.Reference<Config>()("Config", {
  defaultValue: () => ({ port: 3000 }),
}) {}
```

No need to provide — falls back to `defaultValue`.

### Preference

ALWAYS use Context.Tag OR Context.Reference.

## Error Handling

Prefer `catchTag`/`catchTags` over `catchAll` for narrow, explicit error handling.

## Null Handling with Option

- `T | null` for nullable values
- `Option.Option<T | null>` for omit-or-set semantics:
  - `None` = not provided (omit)
  - `Some(null)` = explicitly null
  - `Some(value)` = set to value

## Data Types with Structural Equality

```ts
class Person extends Data.Class<{ readonly name: string }> {}
Equal.equals(new Person({ name: "A" }), new Person({ name: "A" })); // true

class HttpError extends Data.TaggedClass("HttpError")<{
  readonly status: number;
}> {}
httpError._tag; // "HttpError"

type Result = Data.TaggedEnum<{
  Ok: { value: number };
  Err: { message: string };
}>;
const { Ok, Err, $match } = Data.taggedEnum<Result>();

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}

Schema.Data;
```

`Data.Class`/`Data.TaggedClass` — value types with structural equality via `Equal`/`Hash`.
`Data.TaggedEnum` — discriminated union with constructors and `$match`.
`Data.TaggedError` — error class extending `YieldableError` with structural equality.

## Equal & Hash

`Equal.equals(a, b)` — structural equality when both implement `Equal` trait. Reference equality fallback.
`Hash.hash(value)` — produces hash code. Combined via `Hash.combine`.
All `Data.*` types implement both automatically.

## Brand

```ts
const UserId = Schema.UUID.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;
```

## Cause\<E\>

Lossless error model: `Empty | Fail<E> | Die | Interrupt | Sequential | Parallel`.

- `Cause.fail(error)` — typed error
- `Cause.die(defect)` — unexpected/unrecoverable
- `Cause.interrupt(fiberId)` — fiber interruption
- `Cause.sequential(left, right)` / `Cause.parallel(left, right)` — composed causes
- `Cause.pretty(cause)` — human-readable with stack traces
- Access via `Effect.catchAllCause` or `Exit.Failure`

Built-in exceptions: `RuntimeException`, `TimeoutException`, `NoSuchElementException`, `IllegalArgumentException`, `UnknownException`.

## Exit\<A, E\>

Result of running an Effect: `Success<A> | Failure<Cause<E>>`. Extends `Effect<A, E>`.

```ts
const exit = yield* Effect.exit(someEffect)
Exit.match(exit, {
  onSuccess: (a) => ...,
  onFailure: (cause) => ...
})
Exit.isSuccess(exit)
Exit.isFailure(exit)
```

Returned by `Effect.runSyncExit`, `Fiber.await`, `Effect.exit`.

## Match (Pattern Matching)

```ts
const result = Match.value(input).pipe(
  Match.when(Match.number, (n) => `number: ${n}`),
  Match.when(Match.string, (s) => `string: ${s}`),
  Match.exhaustive,
);

Match.type<MyUnion>().pipe(
  Match.tagsExhaustive({
    A: (a) => a.value,
    B: (b) => b.other,
  }),
);
```

Finalizers: `exhaustive` (compile-time check), `orElse(f)`, `option`, `either`.

## Concurrency Primitives

### Deferred\<A, E\> — one-shot async value

```ts
const deferred = yield * Deferred.make<string, Error>();
yield * Deferred.succeed(deferred, "done");
const value = yield * Deferred.await(deferred);
```

Also: `fail`, `failCause`, `complete`, `completeWith`, `isDone`, `poll`, `Latch`, `Semaphore`.

## Effect Combinators

### all — combine effects

```ts
yield * Effect.all([effectA, effectB, effectC], { concurrency: 3 });
yield * Effect.all({ a: effectA, b: effectB }); // returns { a, b }
```

Options: `concurrency` (`number | "unbounded" | "inherit"`), `mode` (`"default" | "validate" | "either"`), `discard`.

### forEach — effectful iteration

```ts
yield *
  Effect.forEach(items, (item, i) => processItem(item), {
    concurrency: "unbounded",
  });
```

### zip / zipWith

```ts
yield * Effect.zip(effectA, effectB, { concurrent: true }); // [A, B]
yield * Effect.zipWith(effectA, effectB, (a, b) => a + b);
```

Note: uses `concurrent?: boolean` not `concurrency: Concurrency`.

### race / raceAll

```ts
yield * Effect.race(effectA, effectB); // first success wins, loser interrupted
yield * Effect.raceAll([e1, e2, e3]);
```

### timeout

```ts
yield * someEffect.pipe(Effect.timeout("5 seconds")); // fails with TimeoutException
yield * someEffect.pipe(Effect.timeoutOption("5 seconds")); // Option<A>, no error
```

## Fiber Operations

```ts
const fiber = yield * Effect.fork(longRunning);
const result = yield * Fiber.join(fiber);
yield * Fiber.interrupt(fiber);

yield * Effect.forkDaemon(background); // independent of parent
yield * Effect.forkScoped(task); // tied to Scope
```

ALWAYS PREFR `Effect.forkScoped`.

### FiberHandle — single managed fiber

```ts
const handle = yield * FiberHandle.make();
yield * FiberHandle.run(handle, task); // replaces previous fiber
```

### FiberMap\<K\> — keyed fiber management

```ts
const map = yield * FiberMap.make<string>();
yield * FiberMap.run(map, "user-123", task); // replaces previous at key
```

### FiberSet — unkeyed fiber pool

```ts
const set = yield * FiberSet.make();
yield * FiberSet.run(set, task); // auto-removed on completion
```

All three: scope closure interrupts all managed fibers.

### FiberRef\<A\> — fiber-local state

```ts
const ref = yield * FiberRef.make("default", { fork: () => "child-default" });
yield * FiberRef.locally(ref, "override")(myEffect);
```

Propagates to child fibers via `fork` semantics.

## Resource Management

```ts
const resource = Effect.acquireRelease(acquire, (res, exit) => cleanup(res));
yield * Effect.scoped(resource.pipe(Effect.flatMap(use)));

yield * Effect.addFinalizer((exit) => cleanup);
yield * Effect.ensuring(effect, finalizer);
yield * Effect.onExit(effect, (exit) => cleanup);
```

### Pool\<A, E\> — resource pool

```ts
yield * Pool.make({ acquire: createConn, size: 10 });
yield * Pool.makeWithTTL({ acquire, min: 2, max: 10, timeToLive: "5 minutes" });
```

### RcMap\<K, A\> — reference-counted keyed resources

Resources stay alive while consumers hold references. `idleTimeToLive` delays cleanup.

### RcRef\<A\> — reference-counted single resource

Like `RcMap` for one resource. Lazily acquired, shared across consumers.

## Schedule

```ts
Schedule.spaced("1 second");
Schedule.exponential("100 millis");
Schedule.fixed("5 seconds");
Schedule.recurs(5);
Schedule.cron("0 */5 * * *");
```

Compose: `Schedule.intersect(a, b)` (both), `Schedule.union(a, b)` (either), `Schedule.andThen(a, b)` (sequential).
Use with: `Effect.retry(effect, { schedule })`, `Effect.repeat(effect, { schedule })`.

## Duration

```ts
Duration.millis(100);
Duration.seconds(5);
Duration.minutes(10);
("5 seconds"); // string format works as DurationInput
```

## Stream

Pull-based, backpressured, lazy. `Stream<A, E, R>`.

```ts
Stream.fromIterable([1, 2, 3]);
Stream.fromEffect(myEffect);
stream.pipe(Stream.map(f), Stream.filter(pred), Stream.take(10));
yield * Stream.runCollect(stream); // Chunk<A>
yield * Stream.runForEach(stream, (a) => process(a));
```

## Cache

```ts
const cache =
  yield *
  Cache.make({
    capacity: 100,
    timeToLive: "5 minutes",
    lookup: (key: string) => fetchData(key),
  });
const value = yield * cache.get("key");
yield * cache.invalidate("key");
```

Concurrent lookups for same key are deduplicated.

## Config

```ts
const dbConfig = Config.all({
  host: Config.string("DB_HOST"),
  port: Config.number("DB_PORT").pipe(Config.withDefault(5432)),
  password: Config.redacted("DB_PASSWORD"),
});
```

`Config<A>` extends `Effect<A, ConfigError>`. Use in Layers for configuration.

## Collections Quick Reference

| Module                    | Use for                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `Array`                   | General array manipulation, `isNonEmptyArray`, `dedupe`, `groupBy`   |
| `Chunk`                   | O(1) append/concat, Stream's collection type                         |
| `HashMap` / `HashSet`     | Structural equality keys via `Equal`/`Hash`                          |
| `SortedMap` / `SortedSet` | Sorted iteration, requires `Order`                                   |
| `Option`                  | Typed absence, `fromNullable`, `map`/`flatMap`, `gen`                |
| `Either`                  | Sync typed errors, `Either<A, E>` (success first)                    |
| `Order`                   | Composable ordering: `mapInput`, `combine`, `struct`                 |
| `Equivalence`             | Composable equality: `mapInput`, `struct`, `tuple`                   |
| `Predicate`               | Type guards: `isString`, `isTagged`, combinators: `and`, `or`, `not` |
| `Struct`                  | `pick`, `omit`, `evolve`, typed `keys`/`entries`                     |
| `Record`                  | `map`, `filter`, `fromEntries`, `get` (returns Option)               |
| `Iterable`                | Lazy sequences, `range`, `unfold`, no intermediate allocations       |
| `Trie`                    | Prefix search on string keys, `keysWithPrefix`, `longestPrefixOf`    |
| `List`                    | Immutable singly-linked, O(1) prepend                                |
| `Redacted`                | Wraps sensitive values, `toString()`/`toJSON()` show `"<redacted>"`  |

## Other Modules

| Module                      | One-liner                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `Schema`                    | Bidirectional validation/parsing/encoding, `Struct`, `Union`, `Class`, `filter`, `brand` |
| `Scope`                     | Resource lifetime manager, collects finalizers                                           |
| `Runtime`                   | Execution engine, `runFork`/`runSync`/`runPromise`                                       |
| `Fiber`                     | Green thread, `join`, `await`, `interrupt`                                               |
| `Logger`                    | Structured logging, `prettyLogger`, `jsonLogger`, Layer-based                            |
| `Metric`                    | Counter, Gauge, Histogram, Summary, Frequency                                            |
| `Tracer`                    | Distributed tracing spans, `Effect.withSpan`                                             |
| `Random`                    | Effectful `next`, `nextInt`, `nextRange`, `shuffle`                                      |
| `Encoding`                  | Base64, hex, URI encoding/decoding, returns `Either`                                     |
| `DateTime`                  | Timezone-aware dates, `Utc`/`Zoned`, arithmetic                                          |
| `Cron`                      | Parse cron expressions, `next`, `sequence`                                               |
| `PrimaryKey`                | Trait: `[PrimaryKey.symbol](): string` for entity identity                               |
| `GlobalValue`               | `globalValue(id, compute)` — singleton surviving module reloads                          |
| `Resource`                  | Scoped value with auto/manual refresh on Schedule                                        |
| `Reloadable`                | Hot-swappable service Layer, reload on demand                                            |
| `ScopedCache`               | Cache for scoped resources, finalized on eviction                                        |
| `Request`/`RequestResolver` | Batched, deduplicated data fetching (N+1 solution)                                       |
| `LayerMap`                  | Dynamically keyed Layer instances (multi-tenant)                                         |
| `Graph`                     | Directed/undirected graph, DFS, BFS, topological sort                                    |

## Verifying Behavior

When unsure about complex combinators/operators, verify by running

1. Running actual code:
   a. Create a test file in the lib's working directory
   b. Write assertions
   c. Run tests
2. Looking at the source code and tests.

Don't guess behavior — confirm it.
