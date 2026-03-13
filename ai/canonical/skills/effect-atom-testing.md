---
name: effect-atom-testing
description: Effect Atom testing patterns with Registry, fake timers, service mocking, and React integration. Use when writing tests for atoms, Atom.fn, Atom.pull, runtime.atom, or React components that use atoms. Triggers on atom test files, Registry.make, Atom.initialValue, Layer.mock with atoms, vitest.useFakeTimers with atoms.
---

# Effect Atom Testing

Testing patterns for `@effect-atom/atom` and `@effect-atom/atom-react`.

> **Prerequisites**: Read `./.context/skills/effect-testing.md` alongside this one when it is available for the project.

## Test Setup

Every atom test file follows this structure:

```ts
import { Atom, Registry, Result } from "@effect-atom/atom"
import { addEqualityTesters, describe, expect, it, vitest } from "@effect/vitest"

addEqualityTesters()

describe("MyAtoms", () => {
  beforeEach(() => {
    vitest.useFakeTimers()
  })
  afterEach(() => {
    vitest.useRealTimers()
  })
})
```

- `addEqualityTesters()` — Called once at module level. Makes `expect().toEqual()` work with Effect's `Equal` (e.g., `Result.success(123)`)
- `vitest.useFakeTimers()` / `vitest.useRealTimers()` — **NOT TestClock**. Atom internals use real `setTimeout`/`setInterval`, so use vitest's fake timers
- Fresh `Registry.make()` per test — never share registries between tests

## Registry Per Test

```ts
it("reads atom value", () => {
  const counter = Atom.make(0)
  const r = Registry.make()
  expect(r.get(counter)).toEqual(0)
  r.set(counter, 5)
  expect(r.get(counter)).toEqual(5)
})
```

For atoms backed by Effects (runtime atoms, `Atom.fn`, streams), you must **mount** the atom:

```ts
const unmount = r.mount(atom)
// ...test...
unmount()
```

## Flushing Async Operations

Three mechanisms, each for different situations:

### 1. `await vitest.advanceTimersByTimeAsync(0)` — Flush microtasks + scheduled tasks

Use for most atom async operations (Effect computations, `Atom.fn` calls):

```ts
r.mount(myEffectAtom)
await vitest.advanceTimersByTimeAsync(0)
const result = r.get(myEffectAtom)
expect(Result.isSuccess(result)).toBe(true)
```

### 2. `await vitest.advanceTimersByTimeAsync(ms)` — Advance time

Use for `Effect.delay`, `Effect.sleep`, debounce, idleTTL:

```ts
const delayed = Atom.make(
  Effect.succeed(1).pipe(Effect.delay(100)),
  { initialValue: 0 }
).pipe(Atom.keepAlive)
const r = Registry.make()
expect(r.get(delayed)).toEqual(Result.success(0))

await vitest.advanceTimersByTimeAsync(100)
expect(r.get(delayed)).toEqual(Result.success(1))
```

### 3. `await Effect.runPromise(Effect.yieldNow())` — Flush Effect fiber queue

Use after opening latches or when you need fibers to process interruptions:

```ts
latch.unsafeOpen()
await Effect.runPromise(Effect.yieldNow())
```

### 4. `await new Promise((resolve) => resolve(null))` — Microtask flush

For operations that complete on the microtask queue (not timers). Often combined with timer advancement for idleTTL:

```ts
await new Promise((resolve) => resolve(null))
await vitest.advanceTimersByTimeAsync(10000)
```

## The Api Service Pattern (CRITICAL)

**Atoms must NEVER directly consume services with complex inferred types (e.g., RPC clients).** RPC clients have auto-generated types that are impossible to mock with `Layer.mock`.

### Solution: Define a local `Api` service per atom module

**Production code:**

```ts
export class Api extends Effect.Service<Api>()(
  "@myapp/atoms/todos/Api",
  {
    dependencies: [AppRpcClient.Default],
    effect: Effect.gen(function*() {
      const rpc = yield* AppRpcClient
      return {
        getTodos: () => rpc.todos.findAll(),
        upsertTodo: (payload: UpsertTodoPayload) => rpc.todos.upsert(payload),
        deleteTodo: (payload: DeleteTodoPayload) => rpc.todos.remove(payload),
      }
    }),
  },
) {}

const runtime = makeAtomRuntime(Layer.mergeAll(Api.Default, EventStream.Default))

export const todosAtom = runtime.atom(
  Effect.gen(function*() {
    const api = yield* Api
    return yield* api.getTodos()
  })
)
```

**Test mock:**

```ts
const makeApiMock = (options?: {
  getTodosResponse?: ReadonlyArray<Todo>
  shouldFail?: boolean
}) => {
  const calls: Array<{ method: string; args: unknown }> = []

  const layer = Layer.mock(Api, {
    _tag: "@myapp/atoms/todos/Api",
    getTodos: () => {
      calls.push({ method: "getTodos", args: {} })
      if (options?.shouldFail) return Effect.dieMessage("API failed")
      return Effect.succeed(options?.getTodosResponse ?? [])
    },
    upsertTodo: (payload) => {
      calls.push({ method: "upsertTodo", args: payload })
      return Effect.succeed(createTestTodo())
    },
    deleteTodo: (payload) => {
      calls.push({ method: "deleteTodo", args: payload })
      return Effect.void
    },
  })

  return { layer, calls }
}
```

The `calls` array acts as a spy/recorder. Assert both atom state AND API calls.

## Layer Injection via Registry

Replace production layers with test layers using `Atom.initialValue`:

```ts
const makeTestLayer = (options?: Parameters<typeof makeApiMock>[0]) => {
  const { layer: apiLayer, calls: apiCalls } = makeApiMock(options)
  const testLayer = Layer.mergeAll(apiLayer, makeEventStreamMock())
  return { testLayer, apiCalls }
}

it("fetches todos on mount", async () => {
  const { testLayer } = makeTestLayer({
    getTodosResponse: [createTestTodo()],
  })

  const r = Registry.make({
    initialValues: [Atom.initialValue(runtime.layer, testLayer)],
  })

  r.mount(todosAtom)
  await vitest.advanceTimersByTimeAsync(0)

  const result = r.get(todosAtom)
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result)) {
    expect(result.value).toHaveLength(1)
  }
})
```

`Atom.initialValue(runtime.layer, testLayer)` replaces the runtime's layer atom with the test layer, swapping all service implementations.

### Multiple Runtimes

When atoms depend on multiple runtimes (from different modules):

```ts
const r = Registry.make({
  initialValues: [
    Atom.initialValue(runtime.layer, testLayer),
    Atom.initialValue(otherRuntime.layer, otherTestLayer),
  ],
})
```

## Test Data Factories

Create factory functions with partial overrides:

```ts
const TEST_TODO_ID_1 = "00000000-0000-0000-0000-000000000010" as TodoId

const createTestTodo = (
  overrides: Partial<{
    id: TodoId
    title: string
    completed: boolean
  }> = {},
): Todo =>
  new Todo({
    id: overrides.id ?? TEST_TODO_ID_1,
    title: overrides.title ?? "Buy groceries",
    completed: overrides.completed ?? false,
    updatedAt: DateTime.unsafeNow(),
  })
```

## Testing Atom.fn (Effectful Functions)

```ts
it("calls API and returns result", async () => {
  const count = Atom.fn((n: number) => Effect.succeed(n + 1))
  const r = Registry.make()

  expect(r.get(count)).toEqual(Result.initial())

  r.set(count, 1)
  expect(r.get(count)).toEqual(Result.success(2))
})
```

### Concurrent Atom.fn with Latches

Use `Effect.unsafeMakeLatch()` for fine-grained async control:

```ts
it("handles concurrent calls", async () => {
  const latches: Array<Effect.Latch> = []
  let done = 0
  const count = Atom.fn((_: number) => {
    const latch = Effect.unsafeMakeLatch()
    latches.push(latch)
    return latch.await.pipe(Effect.tap(() => done++))
  }, { concurrent: true })

  const r = Registry.make()
  r.mount(count)
  r.set(count, 1)
  r.set(count, 2)
  r.set(count, 3)
  expect(latches).toHaveLength(3)
  expect(done).toBe(0)

  latches.forEach((l) => l.unsafeOpen())
  await Effect.runPromise(Effect.yieldNow())
  expect(done).toBe(3)
  expect(r.get(count)).toEqual(Result.success(undefined))
})
```

## Testing Stream-Based Atoms

```ts
it("processes stream values with timer advancement", async () => {
  const atom = Atom.make(
    Stream.range(0, 2).pipe(Stream.tap(() => Effect.sleep(50)))
  )
  const r = Registry.make()
  const unmount = r.mount(atom)

  expect(r.get(atom).waiting).toBe(true)
  expect(Result.isInitial(r.get(atom))).toBe(true)

  await vitest.advanceTimersByTimeAsync(50)
  expect(Result.isSuccess(r.get(atom))).toBe(true)
  expect(r.get(atom).value).toBe(0)

  await vitest.advanceTimersByTimeAsync(50)
  expect(r.get(atom).value).toBe(1)

  await vitest.advanceTimersByTimeAsync(50)
  expect(r.get(atom).value).toBe(2)
  expect(r.get(atom).waiting).toBe(false)

  unmount()
})
```

## Testing Event Streams

Mock `EventStream` with a controllable emit callback:

```ts
const makeEventStreamMock = () => {
  let publishCallback: ((event: unknown) => void) | null = null

  const layer = Layer.mock(EventStream, {
    _tag: "@myapp/EventStream",
    changes: Stream.async<MyEvent>((emit) => {
      publishCallback = (event) => {
        emit.single(event as MyEvent)
      }
    }),
    publish: (event) => Effect.sync(() => true),
  })

  const emitEvent = (event: MyEvent) => {
    publishCallback?.(event)
  }

  return { layer, emitEvent }
}
```

Usage:

```ts
it("reacts to real-time events", async () => {
  const { layer, emitEvent } = makeEventStreamMock()
  const r = Registry.make({
    initialValues: [Atom.initialValue(runtime.layer, layer)],
  })
  r.mount(myAtom)
  await vitest.advanceTimersByTimeAsync(0)

  emitEvent({ _tag: "ItemCreated", item: createTestItem() })
  await vitest.advanceTimersByTimeAsync(0)

  const result = r.get(myAtom)
  expect(Result.isSuccess(result)).toBe(true)
})
```

## Testing Optimistic Updates

```ts
it("shows optimistic value before API completes", async () => {
  const { testLayer } = makeTestLayer({
    updateDelayMs: 100,
  })
  const r = Registry.make({
    initialValues: [Atom.initialValue(runtime.layer, testLayer)],
  })

  r.mount(dataAtom)
  r.mount(updateAtom)
  await vitest.advanceTimersByTimeAsync(0)

  r.set(updateAtom, { value: "optimistic" })

  // Before API completes — optimistic value visible
  expect(r.get(dataAtom).value).toBe("optimistic")

  // After API completes
  await vitest.advanceTimersByTimeAsync(100)
  expect(r.get(dataAtom).value).toBe("server-confirmed")
})

it("rolls back on failure", async () => {
  const { testLayer } = makeTestLayer({ shouldFail: true })
  const r = Registry.make({
    initialValues: [Atom.initialValue(runtime.layer, testLayer)],
  })

  r.mount(dataAtom)
  r.mount(updateAtom)
  await vitest.advanceTimersByTimeAsync(0)

  const original = r.get(dataAtom).value

  r.set(updateAtom, { value: "optimistic" })
  await vitest.advanceTimersByTimeAsync(0)

  // Rolled back to original
  expect(r.get(dataAtom).value).toEqual(original)
})
```

## Testing Interruption / Cancellation

```ts
it("cancels running effect", async () => {
  const r = Registry.make()
  const atom = Atom.fn(() => Effect.never)
  r.mount(atom)

  r.set(atom, void 0)
  expect(r.get(atom).waiting).toBe(true)

  r.set(atom, Atom.Interrupt)
  await Effect.runPromise(Effect.yieldNow())

  expect(Result.isInterrupted(r.get(atom))).toBe(true)
})
```

## Testing Error States

```ts
it("preserves previous success on failure", async () => {
  const count = Atom.fn((i: number) =>
    i === 1 ? Effect.fail("fail") : Effect.succeed(i)
  )
  const r = Registry.make()

  r.set(count, 0)
  expect(Result.isSuccess(r.get(count))).toBe(true)

  r.set(count, 1)
  const result = r.get(count)
  expect(Result.isFailure(result)).toBe(true)

  const prev = Result.value(result)
  expect(Option.isSome(prev)).toBe(true)
  expect(prev.value).toBe(0)
})
```

## Testing idleTTL

```ts
it("disposes atom after idle timeout", async () => {
  const atom = Atom.make(0).pipe(Atom.setIdleTTL(5000))
  const r = Registry.make()

  r.set(atom, 10)
  expect(r.get(atom)).toBe(10)

  // Microtask flush first, then advance past TTL
  await new Promise((resolve) => resolve(null))
  await vitest.advanceTimersByTimeAsync(5000)

  expect(r.get(atom)).toBe(0) // Reset to initial
})
```

## Runtime Layer Replacement

Swap production layers with test implementations:

```ts
const counterRuntime = Atom.runtime(CounterLive)
const countAtom = counterRuntime.atom(
  Effect.flatMap(Counter, (_) => _.get)
)

it("uses test service via initialValues", () => {
  const r = Registry.make({
    initialValues: [Atom.initialValue(counterRuntime.layer, CounterTest)],
  })
  const result = r.get(countAtom)
  expect(Result.isSuccess(result)).toBe(true)
  expect(result.value).toBe(10) // test value, not production
})
```

## Testing Deferred Completion Signals

For multi-step async flows (e.g., upload → process → done):

```ts
const makeJobProcessorMock = () => {
  const completionSignals = new Map<string, Deferred.Deferred<void>>()

  const triggerCompletion = (jobId: string) =>
    Effect.gen(function*() {
      const deferred = completionSignals.get(jobId)
      if (deferred) {
        yield* Deferred.succeed(deferred, undefined)
        completionSignals.delete(jobId)
      }
    })

  const layer = Layer.mock(JobProcessor, {
    _tag: "@myapp/JobProcessor",
    waitForCompletion: (jobId: string) =>
      Effect.gen(function*() {
        const deferred = yield* Deferred.make<void>()
        completionSignals.set(jobId, deferred)
        yield* Deferred.await(deferred)
      }),
  })

  return { layer, triggerCompletion }
}
```

## Testing Scoped Effects (Finalizers)

```ts
it("runs finalizers when atom effect is re-invoked", async () => {
  let finalized = 0
  const count = Atom.fn((n: number) =>
    Effect.succeed(n + 1).pipe(
      Effect.zipLeft(
        Effect.addFinalizer(() => Effect.sync(() => { finalized++ }))
      )
    )
  ).pipe(Atom.keepAlive)
  const r = Registry.make()

  r.set(count, 1)
  expect(r.get(count)).toEqual(Result.success(2))
  expect(finalized).toBe(0)

  r.set(count, 2)
  await new Promise((resolve) => resolve(null))
  expect(finalized).toBe(1)
})
```

## Mutable Refs for Changing Mock Behavior Mid-Test

When you need the same mock to behave differently across multiple calls:

```ts
it("handles changing behavior between runs", async () => {
  const failingRef: { current: boolean } = { current: false }
  const { testLayer } = makeTestLayer({ failingRef })
  const r = Registry.make({
    initialValues: [Atom.initialValue(runtime.layer, testLayer)],
  })

  // First call succeeds
  r.set(runAtom, input)
  await vitest.advanceTimersByTimeAsync(0)
  expect(Result.isSuccess(r.get(runAtom))).toBe(true)

  // Change mock behavior
  failingRef.current = true

  // Second call fails
  r.set(runAtom, input)
  await vitest.advanceTimersByTimeAsync(0)
  expect(Result.isFailure(r.get(runAtom))).toBe(true)
})
```

The mock reads from `failingRef.current` on each invocation.

## React Integration Tests

### Simple Rendering (No RegistryProvider Needed)

```ts
import { useAtomValue } from "@effect-atom/atom-react"
import { render, screen } from "@testing-library/react"

test("reads atom value", () => {
  const atom = Atom.make(42)

  function TestComponent() {
    const value = useAtomValue(atom)
    return <div data-testid="value">{value}</div>
  }

  render(<TestComponent />)
  expect(screen.getByTestId("value")).toHaveTextContent("42")
})
```

### Mutations with Registry Context

```ts
import { RegistryContext } from "@effect-atom/atom-react"
import { act, render, screen, waitFor } from "@testing-library/react"

test("updates when atom changes", async () => {
  const atom = Atom.make("initial")
  const registry = Registry.make()

  function TestComponent() {
    const value = useAtomValue(atom)
    return <div data-testid="value">{value}</div>
  }

  render(
    <RegistryContext.Provider value={registry}>
      <TestComponent />
    </RegistryContext.Provider>
  )

  expect(screen.getByTestId("value")).toHaveTextContent("initial")

  act(() => {
    registry.set(atom, "updated")
  })

  await waitFor(() => {
    expect(screen.getByTestId("value")).toHaveTextContent("updated")
  })
})
```

### RegistryProvider with initialValues (Component Tests)

For component tests that use runtime atoms, seed both layer atoms and data atoms:

```ts
import { RegistryProvider } from "@effect-atom/atom-react"

render(
  <RegistryProvider
    initialValues={[
      Atom.initialValue(runtime.layer, testLayer),
      Atom.initialValue(dataAtom, Result.success(testData)),
      Atom.initialValue(configAtom, testConfig),
    ]}
    scheduleTask={(f) => f()}
  >
    <ComponentUnderTest />
  </RegistryProvider>
)
```

- `scheduleTask={(f) => f()}` — Makes atom updates synchronous in tests (no scheduling delay)
- Seed `Result.success(...)` values directly to bypass async fetching

### Suspense Testing

```ts
import { useAtomSuspense } from "@effect-atom/atom-react"
import { Suspense } from "react"

test("suspends on initial state", () => {
  const atom = Atom.make(Effect.never)

  function TestComponent() {
    const result = useAtomSuspense(atom)
    return <div>{result.value}</div>
  }

  render(
    <Suspense fallback={<div data-testid="loading">Loading</div>}>
      <TestComponent />
    </Suspense>
  )

  expect(screen.getByTestId("loading")).toBeInTheDocument()
})
```

## HttpClient Mocking

For atoms that make HTTP requests (e.g., file uploads, external APIs):

```ts
const makeHttpClientMock = (options?: { shouldFail?: boolean }) => {
  const calls: Array<{ url: string }> = []

  const mockClient = HttpClient.make((request) => {
    calls.push({ url: request.url })
    if (options?.shouldFail) {
      return Effect.fail(
        new HttpClientError.ResponseError({
          request,
          response: HttpClientResponse.fromWeb(request, new Response(null, { status: 500 })),
          reason: "StatusCode",
        })
      )
    }
    return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 200 })))
  })

  return { layer: Layer.succeed(HttpClient.HttpClient, mockClient), calls }
}
```

## Quick Reference

| What | How |
|------|-----|
| Flush async | `await vitest.advanceTimersByTimeAsync(0)` |
| Advance time | `await vitest.advanceTimersByTimeAsync(ms)` |
| Flush fibers | `await Effect.runPromise(Effect.yieldNow())` |
| Flush microtasks | `await new Promise((r) => r(null))` |
| Mock services | `Layer.mock(Api, { _tag: "...", method: () => Effect.succeed(...) })` |
| Inject test layer | `Registry.make({ initialValues: [Atom.initialValue(runtime.layer, testLayer)] })` |
| Interrupt atom | `r.set(atom, Atom.Interrupt)` |
| Reset atom | `r.set(atom, Atom.Reset)` |
| Spy on calls | `const calls: Array<{method, args}> = []` in mock |
| React sync updates | `scheduleTask={(f) => f()}` on RegistryProvider |
| Seed atom data | `Atom.initialValue(dataAtom, Result.success(value))` |
| Equality in vitest | `addEqualityTesters()` at module level |
