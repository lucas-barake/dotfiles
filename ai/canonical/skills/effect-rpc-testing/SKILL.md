---
name: effect-rpc-testing
description: Effect RPC testing patterns with RpcTest, in-memory transports, handler unit tests, and HTTP integration tests. Use when testing RPC handlers, groups, middleware, streaming RPCs, or writing integration tests for @effect/rpc. Triggers on RpcTest, RpcTest.makeClient, toLayerHandler, accessHandler, RPC test files.
---

# Effect RPC Testing

> **See also**: Load the `effect-rpc` skill for RPC API reference. Load the `effect-testing` skill for general Effect testing patterns.

**Key assumption:** Schemas, RPCs, groups, and middleware tags are already defined in your source code. Tests import them. Never redefine schemas or RPCs in test files.

## Testing Hierarchy

| Level | Tool | What It Tests | Transport |
|---|---|---|---|
| Unit | `group.toLayerHandler` + `accessHandler` | Single handler in isolation | None |
| Integration | `RpcTest.makeClient` | Full client/server with middleware, no serialization | In-memory |
| E2E | `RpcServer.layerProtocol*` + `RpcClient.layerProtocol*` | Full stack with serialization and transport | HTTP/WS/TCP |

## In-Memory Test Client: `RpcTest.makeClient`

The primary tool for RPC testing. Creates an in-memory client that wires `RpcClient.makeNoSerialization` directly to `RpcServer.makeNoSerialization`. No serialization, no network, no HTTP server. Tests the full handler logic, middleware chain, streaming, and error propagation.

```typescript
import { RpcTest } from "@effect/rpc"

RpcTest.makeClient(group, options?) => Effect<
  RpcClient<Rpcs>,
  never,
  Scope | Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.MiddlewareClient<Rpcs>
>
```

Requirements: handler layers + server middleware layers + client middleware layers.

## Test Layer Setup

Import your RPC group, handler layer, middleware layers, and client tag from the source. The test file only wires them together.

```typescript
import { RpcTest } from "@effect/rpc"
import { RpcClient, RpcClientError } from "@effect/rpc"
import { Context, Effect, Layer } from "effect"
import { UserRpcs, UsersLive, AuthLive, TimingLive, AuthClient } from "../src/users-rpc.js"
```

### Client tag with `layerTest` (recommended pattern)

The client tag is typically defined alongside the RPC group in source code, with both a production layer and a test layer:

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

If the source doesn't define `layerTest`, build it in the test file:

```typescript
const TestLayer = Layer.scoped(UsersClient, RpcTest.makeClient(UserRpcs)).pipe(
  Layer.provide([UsersLive, AuthLive, TimingLive, AuthClient])
)
```

### Layer composition

```
UsersClient.layerTest
├── RpcTest.makeClient(UserRpcs)   → in-memory client+server
├── UsersLive                       → handler implementations
├── AuthLive                        → server middleware
├── TimingLive                      → server wrap middleware
└── AuthClient                      → client middleware
```

## Writing Tests

### Basic in-memory test

```typescript
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { UsersClient, User } from "../src/users-rpc.js"

describe("UsersRpc", () => {
  it.effect("should get user", () =>
    Effect.gen(function*() {
      const client = yield* UsersClient
      const user = yield* client.GetUser({ id: "1" })
      assert.deepStrictEqual(user, new User({ id: "1", name: "Logged in user" }))
    }).pipe(Effect.provide(UsersClient.layerTest))
  )
})
```

### Testing Option responses

```typescript
it.effect("returns Option", () =>
  Effect.gen(function*() {
    const client = yield* UsersClient
    const user = yield* client.GetUserOption({ id: "1" })
    assert.deepStrictEqual(user, Option.some(new User({ id: "1", name: "John" })))
  }).pipe(Effect.provide(UsersClient.layerTest))
)
```

### Testing nested/namespaced RPCs

```typescript
it.effect("nested rpc", () =>
  Effect.gen(function*() {
    const client = yield* UsersClient
    yield* client.nested.test()
  }).pipe(Effect.provide(UsersClient.layerTest))
)
```

### Testing headers

```typescript
it.effect("propagates headers", () =>
  Effect.gen(function*() {
    const client = yield* UsersClient
    const user = yield* client.GetUser({ id: "1" })
    assert.deepStrictEqual(user, new User({ id: "123", name: "Logged in user" }))
  }).pipe(
    RpcClient.withHeaders({ userId: "123" }),
    Effect.provide(UsersClient.layerTest)
  )
)
```

### Testing typed errors

```typescript
it.effect("returns typed error", () =>
  Effect.gen(function*() {
    const client = yield* UsersClient
    const exit = yield* client.GetUser({ id: "nonexistent" }).pipe(Effect.exit)
    assert.deepStrictEqual(exit, Exit.fail(new UserNotFound({ id: "nonexistent" })))
  }).pipe(Effect.provide(UsersClient.layerTest))
)
```

### Testing defects

```typescript
it.effect("defect propagation", () =>
  Effect.gen(function*() {
    const client = yield* UsersClient
    const cause = yield* client.ProduceDefect().pipe(
      Effect.sandbox,
      Effect.flip
    )
    assert.deepStrictEqual(cause, Cause.die("boom"))
  }).pipe(
    RpcClient.withHeaders({ userId: "123" }),
    Effect.provide(UsersClient.layerTest)
  )
)
```

### Testing streaming RPCs

```typescript
it.live("streaming with backpressure", () =>
  Effect.gen(function*() {
    const client = yield* UsersClient
    const users: Array<User> = []
    yield* client.StreamUsers({ id: "1" }).pipe(
      Stream.take(5),
      Stream.runForEach((user) =>
        Effect.sync(() => { users.push(user) })
      ),
      Effect.fork
    )
    yield* Effect.sleep(2000)
    assert.lengthOf(users, 5)
  }).pipe(Effect.provide(UsersClient.layerTest)),
  { timeout: 20000 }
)
```

### Testing interruption

```typescript
it.live("interruption propagates to server", () =>
  Effect.gen(function*() {
    const client = yield* UsersClient
    const fiber = yield* client.Never().pipe(Effect.fork)
    yield* Effect.sleep(500)
    assert.isNull(fiber.unsafePoll())
    yield* Fiber.interrupt(fiber)
  }).pipe(
    RpcClient.withHeaders({ userId: "123" }),
    Effect.provide(UsersClient.layerTest)
  )
)
```

### Testing wrap middleware

```typescript
it.effect("wrap middleware tracks metrics", () =>
  Effect.gen(function*() {
    const client = yield* UsersClient
    yield* client.TimedMethod({ shouldFail: false })
    yield* client.TimedMethod({ shouldFail: true }).pipe(Effect.exit)
    const { count, defect, success } = yield* client.GetTimingMiddlewareMetrics()
    assert.notEqual(count, 0)
    assert.notEqual(defect, 0)
    assert.notEqual(success, 0)
  }).pipe(Effect.provide(UsersClient.layerTest))
)
```

## Unit Testing: Single Handler

Test a handler in complete isolation without client/server. Import the group from source:

```typescript
import { Headers } from "@effect/platform"
import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { MyRpcs } from "../src/my-rpcs.js"

it.effect("single handler", () =>
  Effect.gen(function*() {
    const TwoHandler = MyRpcs.toLayerHandler("two", () => Effect.succeed("two"))
    const handler = yield* MyRpcs.accessHandler("two").pipe(
      Effect.provide(TwoHandler)
    )
    const result = yield* handler(void 0, Headers.empty)
    assert.strictEqual(result, "two")
  })
)
```

## E2E HTTP Integration Tests

For full stack testing with serialization and transport. Import `RpcLive` (the server layer) from source.

### HTTP (NDJSON)

```typescript
import { HttpClient, HttpClientRequest, HttpRouter } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { RpcClient, RpcSerialization, RpcServer } from "@effect/rpc"
import { Layer } from "effect"
import { RpcLive, UsersClient } from "../src/users-rpc.js"

const HttpNdjsonServer = HttpRouter.Default.serve().pipe(
  Layer.provide(RpcLive),
  Layer.provideMerge(RpcServer.layerProtocolHttp({ path: "/rpc" }))
)

const HttpNdjsonClient = UsersClient.layer.pipe(
  Layer.provide(
    RpcClient.layerProtocolHttp({
      url: "",
      transformClient: HttpClient.mapRequest(HttpClientRequest.appendUrl("/rpc"))
    })
  )
)

const TestLayer = HttpNdjsonClient.pipe(
  Layer.provideMerge(HttpNdjsonServer),
  Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerNdjson])
)

it.effect("e2e http", () =>
  Effect.gen(function*() {
    const client = yield* UsersClient
    const user = yield* client.GetUser({ id: "1" })
    assert.instanceOf(user, User)
  }).pipe(Effect.provide(TestLayer))
)
```

### WebSocket

```typescript
import { HttpServer, NodeSocket } from "@effect/platform-node"

const HttpWsServer = HttpRouter.Default.serve().pipe(
  Layer.provide(RpcLive),
  Layer.provideMerge(RpcServer.layerProtocolWebsocket({ path: "/rpc" }))
)

const HttpWsClient = UsersClient.layer.pipe(
  Layer.provide(RpcClient.layerProtocolSocket()),
  Layer.provide(
    Effect.gen(function*() {
      const server = yield* HttpServer.HttpServer
      const address = server.address as HttpServer.TcpAddress
      return NodeSocket.layerWebSocket(`http://127.0.0.1:${address.port}/rpc`)
    }).pipe(Layer.unwrapEffect)
  )
)

const TestLayer = HttpWsClient.pipe(
  Layer.provideMerge(HttpWsServer),
  Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerNdjson])
)
```

### TCP Socket

```typescript
import { NodeSocket, NodeSocketServer } from "@effect/platform-node"
import { SocketServer } from "@effect/platform"

const TcpServer = RpcLive.pipe(
  Layer.provideMerge(RpcServer.layerProtocolSocketServer),
  Layer.provideMerge(NodeSocketServer.layer({ port: 0 }))
)

const TcpClient = UsersClient.layer.pipe(
  Layer.provide(RpcClient.layerProtocolSocket()),
  Layer.provide(
    Effect.gen(function*() {
      const server = yield* SocketServer.SocketServer
      const address = server.address as SocketServer.TcpAddress
      return NodeSocket.layerNet({ port: address.port })
    }).pipe(Layer.unwrapEffect)
  )
)

const TestLayer = TcpClient.pipe(
  Layer.provideMerge(TcpServer),
  Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerNdjson])
)
```

### HTTP test layer composition

```
TestLayer
├── HttpNdjsonClient (UsersClient.layer + RpcClient.layerProtocolHttp)
├── HttpNdjsonServer (HttpRouter.Default.serve() + RpcLive + RpcServer.layerProtocolHttp)
├── NodeHttpServer.layerTest (test HTTP server on port 0 + HttpClient pointed at it)
└── RpcSerialization.layerNdjson
```

## Reusable E2E Test Suite Pattern

Create a function that accepts any transport layer and runs the full test suite:

```typescript
import { RpcClient, RpcServer } from "@effect/rpc"
import { assert, describe, it } from "@effect/vitest"
import type { Layer } from "effect"
import { Cause, Effect, Stream } from "effect"
import { UsersClient, User } from "../src/users-rpc.js"

export const e2eSuite = <E>(
  name: string,
  layer: Layer.Layer<UsersClient | RpcServer.Protocol, E>,
  concurrent = true
) => {
  describe(name, { concurrent, timeout: 30_000 }, () => {
    it.effect("should get user", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const user = yield* client.GetUser({ id: "1" })
        assert.instanceOf(user, User)
      }).pipe(Effect.provide(layer))
    )

    it.live("streaming", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const users: Array<User> = []
        yield* client.StreamUsers({ id: "1" }).pipe(
          Stream.take(5),
          Stream.runForEach((user) => Effect.sync(() => { users.push(user) })),
          Effect.fork
        )
        yield* Effect.sleep(2000)
        assert.lengthOf(users, 5)
      }).pipe(Effect.provide(layer)),
      { timeout: 20000 }
    )

    it.effect("defect", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const cause = yield* client.ProduceDefect().pipe(Effect.sandbox, Effect.flip)
        assert.deepStrictEqual(cause, Cause.die("boom"))
      }).pipe(
        RpcClient.withHeaders({ userId: "123" }),
        Effect.provide(layer)
      )
    )
  })
}

e2eSuite("http ndjson", HttpNdjsonLayer)
e2eSuite("websocket", WebSocketLayer)
e2eSuite("tcp", TcpLayer)
```

The layer type `Layer.Layer<UsersClient | RpcServer.Protocol, E>` provides both the client (for calls) and `RpcServer.Protocol` (for checking protocol capabilities like `supportsAck`).

## Rules of Thumb

1. **Never define schemas or RPCs in test files.** Import everything from source
2. **Default to `RpcTest.makeClient`** for most tests. It tests handlers, middleware, streaming, and error propagation without transport overhead
3. **Use `toLayerHandler` + `accessHandler`** only when testing a single handler in isolation
4. **Use E2E tests** when you need to verify serialization or transport-specific behavior
5. **Use `it.live`** for streaming and interruption tests (they need real time)
6. **Use `it.effect`** for everything else (deterministic, uses TestClock)
7. **Always provide client middleware** when middleware has `requiredForClient: true`
8. **The `layerTest` pattern** on the client tag (production layer vs test layer) is the standard approach
