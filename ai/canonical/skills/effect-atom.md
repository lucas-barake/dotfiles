---
name: effect-atom
description: Effect Atom patterns for React state management. Use when working with @effect/atom, atoms, registry, useAtomValue, useAtom, Atom.family, runtime.atom, derived atoms, persistent storage. Triggers on Atom.make, Atom.writable, Atom.kvs, useAtomSuspense, Result, BrowserKeyValueStore.
---

# Effect Atom for React

Practical patterns for Effect Atom state management.

## Core Atom Creation

### `Atom.make` - Basic atoms

```ts
// Signature (simplified):
make<A>(initialValue: A): Writable<A>
make<A>(create: (get: Context) => A): Atom<A>
make<A, E>(effect: Effect<A, E>): Atom<Result<A, E>>
make<A, E>(stream: Stream<A, E>): Atom<Result<A, E>>
```

```ts
// Simple state atom (writable)
const counter = Atom.make(0)

// Derived atom (read-only, recomputes when dependencies change)
const doubled = Atom.make((get) => get(counter) * 2)

// Effect atom → returns Result<A, E> (handles loading/error states)
const user = Atom.make(Effect.promise(() => fetch("/api/user").then(r => r.json())))

// With initial value (shown while loading)
const data = Atom.make(fetchData, { initialValue: [] })
```

**Behavior**: Effect/Stream atoms return `Result<A, E>` which has states: `Initial`, `Success`, `Failure`. The `waiting` field indicates async activity.

**Effect atoms**: `waiting = true` while the Effect is running, `waiting = false` when complete.

**Stream atoms**:
- `waiting = true` + `Success` → stream is still producing values
- `waiting = false` + `Success` → stream completed (nothing more to emit)
- `Failure` with `NoSuchElementException` → stream completed without emitting any items

**`Result.builder`** - Fluent API for rendering Result states:

```ts
Result.builder(result)
  .onInitial(() => <p>Loading...</p>)
  .onSuccess((value, { waiting }) => (
    <div>
      <p>{value.name}</p>
      {waiting && <Spinner />}
    </div>
  ))
  .onFailure((cause) => <p>Error: {Cause.pretty(cause)}</p>)
  .render()
```

Methods:
- `onInitial(f)` → handle `Initial` state
- `onSuccess((value, result) => ...)` → handle `Success`, second arg has `waiting` flag
- `onFailure((cause, result) => ...)` → handle `Failure`
- `onWaiting(f)` → handle any state where `waiting = true`
- `onInitialOrWaiting(f)` → handle `Initial` OR `waiting = true`
- `onErrorTag(tag, f)` → narrow error by `_tag` (e.g., `onErrorTag("NoSuchElementException", f)`)
- `onErrorIf(predicate, f)` → narrow error by predicate
- `render()` → finalize (returns `null` for unhandled, throws on unhandled `Failure`)
- `orNull()` → finalize (returns `null` for unhandled, including `Failure`)
- `orElse(() => fallback)` → finalize with fallback for unhandled

---

### `Atom.family` - Parameterized atoms

```ts
// Signature:
family<Arg, T extends object>(f: (arg: Arg) => T): (arg: Arg) => T
```

```ts
// Basic usage
const countByKey = Atom.family((key: string) => Atom.make(0))
countByKey("a") // Atom for key "a"
countByKey("a") // Same atom instance (cached)

// With Effect
const userById = Atom.family((id: string) =>
  Atom.make(Effect.promise(() => fetch(`/api/users/${id}`).then(r => r.json())))
)
```

**Compound keys with `Data.Class`** - For deep equality:

```ts
import * as Data from "effect/Data"

class UserQuery extends Data.Class<{
  id: string
  includeProfile: boolean
}> {}

const userAtom = Atom.family((query: UserQuery) =>
  Atom.make(fetchUser(query.id, query.includeProfile))
)

// Same atom instance for equal queries (deep comparison)
userAtom(new UserQuery({ id: "1", includeProfile: true }))
userAtom(new UserQuery({ id: "1", includeProfile: true })) // Same atom
```

**Behavior**: Uses `MutableHashMap` internally. With `Data.Class`, keys are compared by value (implements `Equal` and `Hash`), not reference.

---

### `runtime.atom` & `runtime.fn` - Atoms with Effect services

```ts
// Create runtime from Layer
const appRuntime = Atom.runtime(HttpClient.layer)

// Atoms that use services
const users = appRuntime.atom(
  Effect.gen(function*() {
    const http = yield* HttpClient.HttpClient
    return yield* http.get("/api/users").pipe(HttpClientResponse.json)
  })
)

// Function atoms with services
const createUser = appRuntime.fn<{ name: string }>()(
  Effect.fn(function*(input, get) {
    const http = yield* HttpClient.HttpClient
    return yield* http.post("/api/users", { body: input })
  })
)
```

**Behavior**: `runtime.atom` waits for the runtime to be ready. If the Layer fails, all dependent atoms get the error.

---

### `Atom.fn` - Function atoms (callable)

```ts
// Signature:
fn<Arg, A, E>(
  fn: (arg: Arg, get: FnContext) => Effect<A, E>,
  options?: { initialValue?: A; concurrent?: boolean }
): AtomResultFn<Arg, A, E>
```

```ts
const increment = Atom.fn((n: number, get) =>
  Effect.succeed(get(counter) + n)
)

// Call it by setting a value
registry.set(increment, 5) // Executes with arg=5

// In React
const run = useAtomSet(increment)
run(5) // Returns void by default

// With mode="promise" to await result
const run = useAtomSet(increment, { mode: "promise" })
const result = await run(5) // Returns the success value
```

**Behavior**: Each `set` triggers the function. With `concurrent: false` (default), new calls interrupt in-progress ones. With `concurrent: true`, they run in parallel.

---

### `Atom.pull` - Stream-based pagination / infinite scroll

```ts
// Signature:
pull<A, E>(
  create: Stream<A, E> | ((get: Context) => Stream<A, E>),
  options?: { disableAccumulation?: boolean; initialValue?: ReadonlyArray<A> }
): Writable<PullResult<A, E>, void>

// PullResult<A, E> = Result<{ done: boolean; items: NonEmptyArray<A> }, E | NoSuchElementException>
```

```ts
// Basic usage - each set() pulls next chunk
const itemsAtom = Atom.pull(Stream.make(1, 2, 3, 4, 5))

// In React
const [result, pull] = useAtom(itemsAtom)

Result.builder(result)
  .onInitial(() => <p>Loading...</p>)
  .onFailure((cause) => <p>Error: {Cause.pretty(cause)}</p>)
  .onSuccess(({ items, done }, { waiting }) => (
    <div>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
      {!done && <button onClick={() => pull()}>Load more</button>}
      {waiting && <p>Loading...</p>}
    </div>
  ))
  .render()
```

**Pagination with `Stream.unfoldEffect`**:

```ts
type Page<T> = { items: Array<T>; nextCursor: string | null }

const paginatedTodos = runtime.pull((get) => {
  const query = get(searchInput$)

  return Stream.unfoldEffect(null as string | null, (cursor) =>
    Effect.gen(function*() {
      const api = yield* Api
      const page: Page<Todo> = yield* api.getTodos({ query, cursor })

      if (page.nextCursor === null) {
        // No more pages - emit final items and end stream
        return Option.some([page.items, null] as const)
      }
      // Emit items, continue with next cursor
      return Option.some([page.items, page.nextCursor] as const)
    }).pipe(
      Effect.map(Option.filter(([items]) => items.length > 0))
    )
  ).pipe(Stream.flattenIterables)
})
```

**How it works**:
1. First mount → pulls first chunk, `result.waiting` is true
2. `pull()` (set with void) → pulls next chunk, items accumulate
3. `result.value.done === true` → stream exhausted, no more pages
4. `registry.refresh(atom)` → restarts stream from beginning
5. `Failure` with `NoSuchElementException` → stream produced no items (empty first page)

**Options**:
- `disableAccumulation: true` → only show current chunk, don't accumulate
- `initialValue` → shown before first pull completes

---

### `Atom.kvs` - Persistent atom with KeyValueStore

```ts
// Signature:
kvs<A>(options: {
  readonly runtime: AtomRuntime<KeyValueStore.KeyValueStore, any>
  readonly key: string
  readonly schema: Schema.Schema<A, any>
  readonly defaultValue: LazyArg<A>
}): Writable<A>
```

```ts
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import * as Schema from "effect/Schema"

// Basic persisted atom (localStorage)
const themeAtom = Atom.kvs({
  runtime: Atom.runtime(BrowserKeyValueStore.layerLocalStorage),
  key: "@myapp/theme",
  schema: Schema.Literal("light", "dark"),
  defaultValue: () => "light" as const,
})

// With complex schema
const settingsAtom = Atom.kvs({
  runtime: Atom.runtime(BrowserKeyValueStore.layerLocalStorage),
  key: "@myapp/settings",
  schema: Schema.Struct({
    notifications: Schema.Boolean,
    language: Schema.String,
  }),
  defaultValue: () => ({ notifications: true, language: "en" }),
})

// Family pattern - unique key per instance
const selectedModelFamily = Atom.family((chatId: string) =>
  Atom.kvs({
    runtime: Atom.runtime(BrowserKeyValueStore.layerLocalStorage),
    key: `@myapp/chat/${chatId}/model`,
    schema: ModelFamily,
    defaultValue: () => "sonnet-4.5" as const,
  })
)
```

**Behavior**:
- Creates a `Writable<A>` atom backed by a KeyValueStore (typically localStorage)
- Automatically serializes/deserializes using the provided Schema
- Returns `defaultValue()` if key doesn't exist or fails to parse
- Writes are persisted immediately on `set`
- Value survives page reloads and browser sessions

**Options**:
- `runtime` → AtomRuntime with KeyValueStore service (use `BrowserKeyValueStore.layerLocalStorage` for browser localStorage)
- `key` → Unique storage key (convention: prefix with `@appname/`)
- `schema` → Effect Schema for serialization/validation
- `defaultValue` → Lazy function returning default value

---

## Derived Atoms

### `Atom.writable` - Derived with custom setter

```ts
// Signature:
writable<R, W>(
  read: (get: Context) => R,
  write: (ctx: WriteContext<R>, value: W) => void,
  refresh?: (f: <A>(atom: Atom<A>) => void) => void
): Writable<R, W>
```

**IIFE pattern** - Keeps internal atoms private:

```ts
const userAtom = (() => {
  const remote = runtime.atom(fetchUser)

  return Atom.writable(
    (get) => get(remote),
    (ctx, update: UserUpdate) => {
      // Handle writes
      ctx.set(remote, update)
    },
    (refresh) => refresh(remote) // What to refresh on refetch
  )
})()
```

**With `Data.TaggedEnum` for write actions**:

```ts
import * as Data from "effect/Data"

type CacheAction = Data.TaggedEnum<{
  Set: { value: User }
  Optimistic: { value: User }
  Invalidate: {}
}>
const CacheAction = Data.taggedEnum<CacheAction>()

const userAtom = (() => {
  const remote = runtime.atom(fetchUser)

  return Atom.writable(
    (get) => get(remote),
    (ctx, action: CacheAction) => {
      switch (action._tag) {
        case "Set":
          ctx.setSelf(Result.success(action.value))
          break
        case "Invalidate":
          ctx.refresh(remote)
          break
      }
    },
    (refresh) => refresh(remote)
  )
})()

// Usage
registry.set(userAtom, CacheAction.Set({ value: newUser }))
registry.set(userAtom, CacheAction.Invalidate())
```

---

### `Atom.readable` - Read-only derived

```ts
// Signature:
readable<A>(
  read: (get: Context) => A,
  refresh?: (f: <A>(atom: Atom<A>) => void) => void
): Atom<A>
```

```ts
const fullName = Atom.readable((get) => {
  const user = get(userAtom)
  return `${user.firstName} ${user.lastName}`
})
```

---

## Context: `get()` vs `get.result()`

### `get(atom)` - Reactive subscription

```ts
const derived = Atom.make((get) => {
  const value = get(baseAtom) // SUBSCRIBES to baseAtom
  return value * 2
})
```

**Behavior**: The derived atom re-runs whenever `baseAtom` changes. This is the reactive model.

---

### `get.result(atom, options)` - One-shot Effect read

```ts
// Signature:
result<A, E>(
  atom: Atom<Result<A, E>>,
  options?: { suspendOnWaiting?: boolean }
): Effect<A, E>
```

```ts
const outer = Atom.fn(
  Effect.fn(function*(_, get) {
    // Does NOT subscribe - just reads current value as Effect
    const user = yield* get.result(userAtom)

    // With suspendOnWaiting: waits for loading to complete
    const data = yield* get.result(dataAtom, { suspendOnWaiting: true })

    return { user, data }
  })
)
```

**Behavior**:
- `get.result(atom)` → Returns Effect that resolves to current value. Does NOT create subscription.
- `{ suspendOnWaiting: true }` → Effect suspends (waits) if `result.waiting === true`. Without it, you get whatever value is there (possibly stale).

**When to use**:
- `get()` → For reactive dependencies (re-run when value changes)
- `get.result()` → For one-shot reads in Effects, especially when chaining multiple async operations

---

### `get.refresh(atom)` - Force refetch

```ts
const refreshable = Atom.make((get) => {
  get.refresh(remoteAtom) // Triggers refetch of remoteAtom
  return get(remoteAtom)
})
```

---

## Atom Lifecycle

### `Atom.keepAlive` - Prevent disposal

```ts
const counter = Atom.make(0).pipe(Atom.keepAlive)
```

**Behavior**: Normally atoms reset to initial value when all subscribers disconnect. `keepAlive` prevents this - atom retains value forever.

---

### `Atom.setIdleTTL` - Time-to-live

```ts
const cached = Atom.make(fetchExpensiveData).pipe(
  Atom.setIdleTTL("30 seconds")
)
```

**Behavior**: Atom disposed N time after last subscriber disconnects. Good for caching.

---

### `Atom.debounce` - Debounce value changes

```ts
// Signature:
debounce(duration: DurationInput): <A extends Atom<any>>(self: A) => A
debounce<A extends Atom<any>>(self: A, duration: DurationInput): A
```

```ts
const searchInput = Atom.make("")
const debouncedSearch = searchInput.pipe(Atom.debounce("300 millis"))

// In React
const [search, setSearch] = useAtom(searchInput)
const debouncedValue = useAtomValue(debouncedSearch)

// debouncedValue updates 300ms after last setSearch call
```

**Behavior**: Delays propagating value changes until no new changes for the specified duration.

**Reactive fetching pattern** - Debounce + derived Effect atom:

```ts
// 1. Input atom - user types here
const searchInput = Atom.make("")

// 2. Debounced version - only updates after 300ms of no typing
const searchInput$ = searchInput.pipe(Atom.debounce("300 millis"))

// 3. Fetcher atom - reacts to debounced input, refetches automatically
const todosAtom = runtime.atom((get) => {
  const query = get(searchInput$).trim()
  if (query.length <= 3) return Effect.succeed([])

  return Effect.gen(function*() {
    const api = yield* Api
    return yield* api.searchTodos(query)
  })
})
```

**How it works**:
1. User types → `searchInput` updates immediately (responsive UI)
2. `searchInput$` only updates after 300ms of no typing
3. When `searchInput$` changes → `todosAtom` re-runs its Effect
4. Automatic reactive refetching with no manual triggers

---

### `Atom.Interrupt` & `Atom.Reset` - Control function atoms

```ts
// Interrupt ongoing Effect
registry.set(longRunningFn, Atom.Interrupt)

// Reset to initial state
registry.set(fnAtom, Atom.Reset)
```

---

## React Hooks

### `useAtomValue` - Read only

```ts
// Signature:
useAtomValue<A>(atom: Atom<A>): A
useAtomValue<A, B>(atom: Atom<A>, f: (a: A) => B): B
```

```ts
function Counter() {
  const count = useAtomValue(counter)

  // With selector (creates derived atom internally)
  const doubled = useAtomValue(counter, (n) => n * 2)

  return <div>{count}</div>
}
```

---

### `useAtom` - Read + write

```ts
// Signature:
useAtom<R, W>(atom: Writable<R, W>): readonly [R, (value: W) => void]
useAtom<R, W>(atom: Writable<R, W>, { mode: "promise" }): readonly [R, (value: W) => Promise<R>]
```

```ts
function Counter() {
  const [count, setCount] = useAtom(counter)

  return (
    <button onClick={() => setCount((n) => n + 1)}>
      {count}
    </button>
  )
}
```

---

### `useAtomSet` - Write only

```ts
// Signature:
useAtomSet<R, W>(atom: Writable<R, W>): (value: W) => void
useAtomSet<R, W>(atom: Writable<R, W>, { mode: "promise" }): (value: W) => Promise<R>
useAtomSet<R, W>(atom: Writable<R, W>, { mode: "promiseExit" }): (value: W) => Promise<Exit<R, E>>
```

```ts
function CreateButton() {
  const create = useAtomSet(createUserFn, { mode: "promise" })

  const handleClick = async () => {
    const user = await create({ name: "John" })
    console.log("Created:", user)
  }

  return <button onClick={handleClick}>Create</button>
}
```

**Behavior**:
- `mode: "value"` (default) → Returns void, fire-and-forget
- `mode: "promise"` → Returns promise resolving to success value
- `mode: "promiseExit"` → Returns promise resolving to `Exit<A, E>` (includes errors)

---

### `useAtomMount` - Just mount, no value

```ts
function App() {
  useAtomMount(backgroundSyncAtom) // Keeps atom alive while mounted
  return <Children />
}
```

---

### `useAtomSubscribe` - Side effects on value changes

```ts
// Signature:
useAtomSubscribe<A>(
  atom: Atom<A>,
  f: (value: A) => void,
  options?: { readonly immediate?: boolean }
): void
```

```ts
function Logger() {
  useAtomSubscribe(
    userAtom,
    (user) => console.log("User changed:", user),
    { immediate: true } // Also fires for current value immediately
  )
  return null
}

// Without immediate: only fires on subsequent changes
useAtomSubscribe(countAtom, (count) => {
  analytics.track("count_changed", { count })
})
```

**Behavior**:
- Default → Callback only fires on future changes
- `{ immediate: true }` → Also fires immediately with current value

---

### `useAtomSuspense` - Suspense integration

```ts
// Signature:
useAtomSuspense<A, E>(
  atom: Atom<Result<A, E>>,
  options?: {
    suspendOnWaiting?: boolean
    includeFailure?: boolean
  }
): Result.Success<A, E>
```

```ts
function UserProfile() {
  // Suspends until Result is not Initial
  const result = useAtomSuspense(userAtom)
  return <div>{result.value.name}</div>
}

function UserProfileStrict() {
  // Suspends until Result is not Initial AND not waiting
  const result = useAtomSuspense(userAtom, { suspendOnWaiting: true })
  return <div>{result.value.name}</div>
}

// Usage with Suspense boundary
<Suspense fallback={<Loading />}>
  <UserProfile />
</Suspense>
```

**Behavior**:
- Default → Suspends only on `Initial` state
- `{ suspendOnWaiting: true }` → Also suspends while `waiting === true` (refetching)
- Throws on `Failure` unless `includeFailure: true`

---

## Registry

### Setup

```ts
import { RegistryProvider } from "@effect/atom-react"

function App() {
  return (
    <RegistryProvider defaultIdleTTL={5000}>
      <YourApp />
    </RegistryProvider>
  )
}
```

### Direct registry usage

```ts
const registry = Registry.make()

// Read
const value = registry.get(atom)

// Write
registry.set(writableAtom, newValue)

// Mount (keep alive until unmount called)
const unmount = registry.mount(atom)
// later: unmount()

// Refresh
registry.refresh(atom)
```

---

## Optimistic Updates

### `Atom.optimistic` - Wrap an atom for optimistic updates

```ts
const todos = Atom.make(fetchTodos)
const optimisticTodos = todos.pipe(Atom.optimistic)

// Create optimistic mutation
const addTodo = optimisticTodos.pipe(
  Atom.optimisticFn({
    reducer: (current, newTodo: Todo) => [...current, newTodo],
    fn: Atom.fn(Effect.fn(function*(todo) {
      yield* saveTodo(todo) // API call
    }))
  })
)
```

**Behavior**:
1. **Optimistic phase**: `reducer` applies immediately, UI updates
2. **Commit phase**: When Effect completes, source atom refreshes
3. **Rollback**: On error, optimistic value discarded, source value shown

---

## Common Patterns

### Remote data with local cache control

```ts
const userAtom = (() => {
  const remote = runtime.atom(
    Effect.gen(function*() {
      const api = yield* Api
      return yield* api.getUser()
    })
  )

  return Atom.writable(
    (get) => get(remote),
    (ctx, action: Data.TaggedEnum<{
      UpdateName: { name: string }
      Clear: {}
    }>) => {
      switch (action._tag) {
        case "UpdateName":
          // Optimistically update cached value
          const current = ctx.get(remote)
          if (current._tag === "Success") {
            ctx.setSelf(Result.success({ ...current.value, name: action.name }))
          }
          break
        case "Clear":
          ctx.setSelf(Result.initial())
          break
      }
    },
    (refresh) => refresh(remote) // registry.refresh(userAtom) refreshes remote
  )
})()

// Refresh from outside - third arg handles it
registry.refresh(userAtom)

// Mutate cache directly
registry.set(userAtom, CacheAction.UpdateName({ name: "New Name" }))
```

### Compound family key

```ts
class ListParams extends Data.Class<{
  page: number
  pageSize: number
  filters: Record<string, string>
}> {}

const listAtom = Atom.family((params: ListParams) =>
  runtime.atom(fetchList(params))
)

// Equal params = same atom
listAtom(new ListParams({ page: 1, pageSize: 10, filters: {} }))
```
