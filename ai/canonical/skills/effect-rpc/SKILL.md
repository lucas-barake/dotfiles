---
name: effect-rpc
description: Effect RPC patterns for defining procedures, groups, handlers, clients, middleware, streaming, and transports. Use when working with @effect/rpc, Rpc.make, RpcGroup, RpcServer, RpcClient, RpcMiddleware, or RpcSerialization. Triggers on @effect/rpc, Rpc.make, RpcGroup.make, RpcServer, RpcClient, RpcMiddleware, RpcSchema.Stream.
---

# Effect RPC

Everything lives in the single `@effect/rpc` package. Source modules: `Rpc`, `RpcGroup`, `RpcClient`, `RpcServer`, `RpcMiddleware`, `RpcSchema`, `RpcSerialization`, `RpcMessage`, `RpcClientError`, `RpcTest`.

## Defining RPCs

### `Rpc.make`

```typescript
import { Rpc, RpcGroup, RpcSchema } from "@effect/rpc"
import { Schema } from "effect"

class GetUser extends Rpc.make("GetUser", {
  success: User,
  payload: { id: Schema.String }
}) {}

Rpc.make("SimpleVoid")

Rpc.make("WithError", {
  success: Schema.String,
  error: MyError,
  payload: { id: Schema.String }
})

Rpc.make("MyStream", {
  success: User,
  error: Schema.Never,
  stream: true,
  payload: { id: Schema.String }
})
```

`Rpc.make(tag, options?)` is the primary constructor:
- `payload` accepts raw `Schema.Struct.Fields` (auto-wrapped into `Schema.Struct`)
- `success` defaults to `Schema.Void`, `error` defaults to `Schema.Never`
- `stream: true` wraps success/error into `RpcSchema.Stream` internally
- The `class ... extends Rpc.make(...)` pattern gives a class constructor for the payload
- Dotted tags create client namespaces: `Rpc.make("nested.test")` becomes `client.nested.test()`

### `Rpc.fromTaggedRequest`

For `Schema.TaggedRequest` classes (especially streaming):

```typescript
class StreamUsers extends Schema.TaggedRequest<StreamUsers>()("StreamUsers", {
  success: RpcSchema.Stream({
    success: User,
    failure: Schema.Never
  }),
  failure: Schema.Never,
  payload: { id: Schema.String }
}) {}

Rpc.fromTaggedRequest(StreamUsers)
```

### Rpc fluent methods

```typescript
Rpc.make("TimedMethod", { payload: { shouldFail: Schema.Boolean }, success: Schema.Number })
  .middleware(TimingMiddleware)
```

Available: `.setSuccess()`, `.setError()`, `.setPayload()`, `.middleware()`, `.prefix()`, `.annotate()`, `.annotateContext()`.

## RPC Groups

```typescript
export const UserRpcs = RpcGroup.make(
  GetUser,
  Rpc.make("GetUserOption", {
    success: Schema.Option(User),
    payload: { id: Schema.String }
  }),
  Rpc.fromTaggedRequest(StreamUsers),
  Rpc.make("GetInterrupts", { success: Schema.Number }),
  Rpc.make("ProduceDefect"),
  Rpc.make("nested.test"),
  Rpc.make("TimedMethod", {
    payload: { shouldFail: Schema.Boolean },
    success: Schema.Number
  }).middleware(TimingMiddleware)
).middleware(AuthMiddleware)
```

`.middleware(M)` on a group applies to ALL RPCs added before the call. Order matters.

Group methods: `.add()`, `.merge()`, `.middleware()`, `.prefix()`, `.annotate()`, `.annotateRpcs()`.

## Implementing Handlers

### `group.toLayer`

```typescript
const UsersLive = UserRpcs.toLayer(Effect.gen(function*() {
  let interrupts = 0
  return UserRpcs.of({
    GetUser: (_) => CurrentUser.pipe(Rpc.fork),
    GetUserOption: Effect.fnUntraced(function*(req) {
      return Option.some(new User({ id: req.id, name: "John" }))
    }),
    StreamUsers: Effect.fnUntraced(function*(req, _) {
      const mailbox = yield* Mailbox.make<User>(0)
      yield* Effect.addFinalizer(() => Effect.sync(() => { interrupts++ }))
      yield* mailbox.offer(new User({ id: req.id, name: "John" })).pipe(
        Effect.tap(() => { emits++ }),
        Effect.delay(100),
        Effect.forever,
        Effect.forkScoped
      )
      return mailbox
    }),
    GetInterrupts: () => Effect.sync(() => interrupts),
    ProduceDefect: () => Effect.die("boom"),
    "nested.test": () => Effect.void
  })
}))
```

`build` argument can be a plain handler object OR an `Effect` that produces one (for stateful setup).

### Handler function signature

```typescript
type ToHandlerFn<Current, R> = (
  payload: Payload<Current>,
  options: { readonly clientId: number; readonly headers: Headers }
) => ResultFrom<Current, R> | Wrapper<ResultFrom<Current, R>>
```

Return types:
- Non-stream: `Effect<Success, Error, R>`
- Stream: `Stream<A, E, R>` or `Effect<ReadonlyMailbox<A, E>, ..., R>`
- Wrapped: `Rpc.fork(effect)` (skip concurrency semaphore) or `Rpc.uninterruptible(effect)`

### Single handler

```typescript
const TwoHandler = TestGroup.toLayerHandler("two", () => Effect.succeed("two"))
const handler = yield* TestGroup.accessHandler("two").pipe(Effect.provide(TwoHandler))
const result = yield* handler(void 0, Headers.empty)
```

## Client Creation

### `RpcClient.make`

```typescript
RpcClient.make(group, options?) => Effect<RpcClient<Rpcs, RpcClientError>, never, Protocol | MiddlewareClient | Scope>
```

Requires `RpcClient.Protocol` in context (provided by transport layers).

### Client type shape

Non-stream methods:
```typescript
client.GetUser({ id: "1" }) => Effect<User, Unauthorized | RpcClientError>
client.GetUser({ id: "1" }, { headers: { ... }, discard: true }) => Effect<void, ...>
```

Stream methods:
```typescript
client.StreamUsers({ id: "1" }) => Stream<User, Never | RpcClientError>
client.StreamUsers({ id: "1" }, { asMailbox: true }) => Effect<ReadonlyMailbox<User, Never>, never, Scope>
```

### Flat client variant

`RpcClient.make(group, { flatten: true })` produces `(tag, payload, options?) => Effect` instead of object with methods.

### Service tag pattern (recommended)

```typescript
export class UsersClient extends Context.Tag("UsersClient")<
  UsersClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof UserRpcs>, RpcClientError>
>() {
  static layer = Layer.scoped(UsersClient, RpcClient.make(UserRpcs)).pipe(
    Layer.provide(AuthClient)
  )
  static layerTest = Layer.scoped(UsersClient, RpcTest.makeClient(UserRpcs)).pipe(
    Layer.provide([UsersLive, AuthLive, TimingLive, AuthClient])
  )
}
```

### Headers

```typescript
RpcClient.withHeaders({ userId: "123" })

yield* client.GetUser({ id: "1" }).pipe(
  RpcClient.withHeaders({ userId: "123" })
)

client.GetUser({ id: "1" }, { headers: { userId: "123" } })
```

`withHeaders` uses a FiberRef to propagate headers. Per-call headers also supported via options.

## Middleware

### Defining middleware

```typescript
import { RpcMiddleware } from "@effect/rpc"

class AuthMiddleware extends RpcMiddleware.Tag<AuthMiddleware>()("AuthMiddleware", {
  provides: CurrentUser,
  failure: Unauthorized,
  requiredForClient: true
}) {}

class TimingMiddleware extends RpcMiddleware.Tag<TimingMiddleware>()("TimingMiddleware", {
  wrap: true
}) {}
```

Options:
- `provides`: Context.Tag the middleware provides to handlers
- `failure`: Schema for errors this middleware can produce (added to error union of all RPCs using it)
- `optional`: If true, middleware failure is ignored (falls through)
- `wrap`: If true, middleware wraps the handler and receives `options.next`
- `requiredForClient`: If true, client middleware layer is required

### Three kinds

**Provider middleware** (provides a service to handlers):
```typescript
const AuthLive = Layer.succeed(
  AuthMiddleware,
  AuthMiddleware.of((options) =>
    Effect.succeed(
      new User({ id: options.headers.userid ?? "1", name: options.headers.name ?? "Fallback" })
    )
  )
)
```

**Wrap middleware** (wraps handler, gets `next`):
```typescript
const TimingLive = Layer.succeed(
  TimingMiddleware,
  TimingMiddleware.of((options) =>
    options.next.pipe(
      Effect.tap(Metric.increment(rpcSuccesses)),
      Effect.tapDefect(() => Metric.increment(rpcDefects)),
      Effect.ensuring(Metric.increment(rpcCount))
    )
  )
)
```

**Guard middleware** (optional, can reject):
```typescript
class OptionalAuth extends RpcMiddleware.Tag<OptionalAuth>()("OptionalAuth", {
  provides: CurrentUser,
  optional: true
}) {}
```

### Applying middleware

Per-RPC: `Rpc.make("TimedMethod", { ... }).middleware(TimingMiddleware)`
Per-group: `RpcGroup.make(...rpcs).middleware(AuthMiddleware)`

### Client middleware

```typescript
const AuthClient = RpcMiddleware.layerClient(AuthMiddleware, ({ request }) =>
  Effect.succeed({
    ...request,
    headers: Headers.set(request.headers, "name", "Logged in user")
  })
)
```

Client middleware transforms outgoing requests (add headers, tokens). Required when `requiredForClient: true`.

## Streaming RPCs

### Two definition approaches

**`Rpc.make` with `stream: true`:**
```typescript
Rpc.make("MyStream", { success: User, error: Schema.Never, stream: true })
```

**`Schema.TaggedRequest` with `RpcSchema.Stream`:**
```typescript
class StreamUsers extends Schema.TaggedRequest<StreamUsers>()("StreamUsers", {
  success: RpcSchema.Stream({ success: User, failure: Schema.Never }),
  failure: Schema.Never,
  payload: { id: Schema.String }
}) {}
```

### Handler returns Mailbox (preferred) or Stream

The recommended pattern is Mailbox. Create the mailbox, fork a scoped processor that offers items to it, and return the mailbox. The forked effect runs in the handler's scope (not the request scope), so use `Effect.forkScoped`. Always signal completion with `mailbox.end` and propagate errors with `mailbox.failCause`.

```typescript
StreamUsers: Effect.fnUntraced(function*(req) {
  const mailbox = yield* Mailbox.make<User>(0)

  yield* processUsers(req).pipe(
    Effect.tap((user) => mailbox.offer(user)),
    Effect.onError((cause) => mailbox.failCause(cause)),
    Effect.ensuring(mailbox.end),
    Effect.forkScoped
  )

  return mailbox
})
```

`mailbox.end` signals the stream is complete (returns `false` if already done). `mailbox.failCause(cause)` fails the stream with a cause (returns `false` if already done).

**Error type constraint:** `failCause` expects `Cause<E>` where `E` matches the stream's failure schema. If your processing effect has typed errors beyond what the RPC declares, erase them before `failCause`:

```typescript
yield* processUsers(req).pipe(
  Effect.tap((user) => mailbox.offer(user)),
  Effect.catchTags({
    InternalError: (e) => Effect.die(e),
    TransientError: (e) => Effect.die(e)
  }),
  Effect.onError((cause) => mailbox.failCause(cause)),
  Effect.ensuring(mailbox.end),
  Effect.forkScoped
)
```

This ensures the `Cause` only contains errors matching the RPC's declared failure type. Errors you `die` with become defects instead.

Mailbox provides backpressure when the protocol supports acks (WebSocket, TCP). HTTP does not support acks.

### Client consumption

```typescript
yield* client.StreamUsers({ id: "1" }).pipe(
  Stream.take(5),
  Stream.runForEach((user) => Effect.sync(() => { users.push(user) }))
)
```

## Serialization

```typescript
import { RpcSerialization } from "@effect/rpc"
```

| Layer | Content Type | Framing | Notes |
|---|---|---|---|
| `RpcSerialization.layerJson` | `application/json` | No | Use when protocol handles framing (WebSocket) |
| `RpcSerialization.layerNdjson` | `application/ndjson` | Yes | Newline-delimited JSON. For HTTP/TCP |
| `RpcSerialization.layerMsgPack` | `application/msgpack` | Yes | Binary. Uses `msgpackr`. Most compact |
| `RpcSerialization.layerJsonRpc()` | `application/json` | No | JSON-RPC 2.0 wire format |
| `RpcSerialization.layerNdJsonRpc()` | `application/json-rpc` | Yes | JSON-RPC 2.0 with newline framing |

All data goes through `Schema.encode`/`Schema.decode`. Payloads encoded on client, decoded on server. Success/exit schemas follow the reverse path.

## Protocols / Transports

### Server protocol layers

| Function | Transport | Requirements |
|---|---|---|
| `RpcServer.layerProtocolHttp({ path })` | HTTP POST | `RpcSerialization`, uses `HttpRouter.Default` |
| `RpcServer.layerProtocolWebsocket({ path })` | WebSocket | `RpcSerialization`, uses `HttpRouter.Default` |
| `RpcServer.layerProtocolSocketServer` | Raw TCP | `SocketServer`, `RpcSerialization` |
| `RpcServer.layerProtocolWorkerRunner` | Worker | `WorkerRunner.PlatformRunner` |
| `RpcServer.layerProtocolStdio(options)` | Stdin/stdout | `RpcSerialization` |
| `RpcServer.layerHttpRouter({ group, path })` | HTTP or WS (default WS) | `HttpLayerRouter`, `RpcSerialization` |

### Client protocol layers

| Function | Transport | Requirements |
|---|---|---|
| `RpcClient.layerProtocolHttp({ url })` | HTTP POST | `HttpClient`, `RpcSerialization` |
| `RpcClient.layerProtocolSocket()` | WebSocket/TCP | `Socket.Socket`, `RpcSerialization` |
| `RpcClient.layerProtocolWorker({ size })` | Worker pool | `Worker.PlatformWorker`, `Worker.Spawner` |

### `RpcServer.layer` (most common entry point)

```typescript
const RpcLive = RpcServer.layer(UserRpcs).pipe(
  Layer.provide([UsersLive, AuthLive, TimingLive])
)
```

Produces `Layer<never>`. Fully self-contained.

### `RpcServer.layerHttpRouter` (one-line HTTP setup)

```typescript
RpcServer.layerHttpRouter({
  group: UserRpcs,
  path: "/rpc",
  protocol: "websocket",
  concurrency: "unbounded"
})
```

### `RpcServer.toWebHandler` (native Request => Promise<Response>)

```typescript
const { handler, dispose } = RpcServer.toWebHandler(UserRpcs, {
  layer: Layer.mergeAll(UsersLive, AuthLive, TimingLive, RpcSerialization.layerNdjson),
  middleware: (httpApp) => Cors.middleware(httpApp)
})
```

### Full HTTP wiring example

```typescript
const HttpServer = HttpRouter.Default.serve().pipe(
  Layer.provide(RpcLive),
  Layer.provideMerge(RpcServer.layerProtocolHttp({ path: "/rpc" }))
)

const HttpClient = UsersClient.layer.pipe(
  Layer.provide(
    RpcClient.layerProtocolHttp({
      url: "",
      transformClient: HttpClient.mapRequest(HttpClientRequest.appendUrl("/rpc"))
    })
  )
)

const Live = HttpClient.pipe(
  Layer.provideMerge(HttpServer),
  Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerNdjson])
)
```

### WebSocket wiring

```typescript
const WsServer = HttpRouter.Default.serve().pipe(
  Layer.provide(RpcLive),
  Layer.provideMerge(RpcServer.layerProtocolWebsocket({ path: "/rpc" }))
)

const WsClient = UsersClient.layer.pipe(
  Layer.provide(RpcClient.layerProtocolSocket()),
  Layer.provide(
    Effect.gen(function*() {
      const server = yield* HttpServer.HttpServer
      const address = server.address as HttpServer.TcpAddress
      return NodeSocket.layerWebSocket(`http://127.0.0.1:${address.port}/rpc`)
    }).pipe(Layer.unwrapEffect)
  )
)
```

## Error Handling

### Error sources

1. **RPC errors**: Defined via `error` in `Rpc.make`. Typed, serialized, survive the wire.
2. **Middleware errors**: Added via `failure` on `RpcMiddleware.Tag`. Union-ed with RPC errors.
3. **`RpcClientError`**: Protocol-level error. Always in client return types.

```typescript
export class RpcClientError extends Schema.TaggedError<RpcClientError>(
  "@effect/rpc/RpcClientError"
)("RpcClientError", {
  reason: Schema.Literal("Protocol", "Unknown"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
})
```

4. **Defects**: Unhandled `Effect.die()` propagates to ALL pending requests by default. Use `disableFatalDefects: true` for per-request failure only.

### Exit schema

The exit schema for each RPC unions all error sources: RPC error + stream failure + all middleware failures. Defects use `Schema.Defect`.

## Key Types

| Type | Purpose |
|---|---|
| `Rpc<Tag, Payload, Success, Error, Middleware>` | Single RPC procedure definition |
| `Rpc.Handler<Tag>` | Implemented handler (Context.Tag) |
| `Rpc.ToHandlerFn<Current, R>` | Handler function signature |
| `Rpc.ResultFrom<R, Context>` | What a handler returns (Effect or Stream) |
| `Rpc.Wrapper<A>` | `Rpc.fork` / `Rpc.uninterruptible` wrapper |
| `RpcGroup<R>` | Group of RPC procedures |
| `RpcClient<Rpcs, E>` | Client object (methods per RPC) |
| `RpcClient.Flat<Rpcs, E>` | Flat client (single function) |
| `RpcClient.Protocol` | Client transport abstraction |
| `RpcServer.Protocol` | Server transport abstraction |
| `RpcSerialization` | Serialization strategy service |
| `RpcMiddleware.TagClass` | Middleware definition |
| `RpcClientError` | Client protocol error |
| `RpcSchema.Stream<A, E>` | Stream schema wrapper |
