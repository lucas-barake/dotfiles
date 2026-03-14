---
name: effect-ai-testing
description: Testing patterns for @effect/ai with mock LanguageModel, tool call resolution, Chat persistence, streaming, and EmbeddingModel. Use when writing tests for AI code, mocking LanguageModel, testing tool handlers, Chat persistence, or streaming responses. Triggers on @effect/ai test files, withLanguageModel, LanguageModel mock, AI test, Chat.Persistence test, tool handler test.
---

# Effect AI Testing

All testing mocks at the `LanguageModel` service boundary. No provider (Anthropic, OpenAI, etc.) is instantiated in tests. The mock goes through the real `LanguageModel.make` constructor, so tool call resolution, schema decoding, and response wrapping all work identically to production.

## `withLanguageModel` Mock Utility

The central test utility. A dual function that creates a mock `LanguageModel` and provides it into the test effect.

```typescript
import * as TestUtils from "@effect/ai/test/utilities"

TestUtils.withLanguageModel({
  generateText?: Array<Response.PartEncoded>
    | ((opts: LanguageModel.ProviderOptions) => Array<Response.PartEncoded> | Effect<Array<Response.PartEncoded>>),
  streamText?: Array<Response.StreamPartEncoded>
    | ((opts: LanguageModel.ProviderOptions) => Array<Response.StreamPartEncoded> | Stream<Response.StreamPartEncoded>),
})
```

Three forms per method:

| Form | generateText | streamText |
|---|---|---|
| Static array | `Array<Response.PartEncoded>` | `Array<Response.StreamPartEncoded>` |
| Sync callback | `(opts) => Array<PartEncoded>` | `(opts) => Array<StreamPartEncoded>` |
| Async callback | `(opts) => Effect<Array<PartEncoded>>` | `(opts) => Stream<StreamPartEncoded>` |

When omitted, `generateText` defaults to `Effect.succeed([])` and `streamText` defaults to `Stream.empty`.

The callback receives `ProviderOptions`:

```typescript
interface ProviderOptions {
  readonly prompt: Prompt.Prompt
  readonly tools: ReadonlyArray<Tool.Any>
  readonly responseFormat:
    | { readonly type: "text" }
    | { readonly type: "json"; readonly objectName: string; readonly schema: Schema.Schema.Any }
  readonly toolChoice: ToolChoice<any>
  readonly span: Span
}
```

## Basic generateText Mock

```typescript
import { LanguageModel } from "@effect/ai"
import { it } from "@effect/vitest"
import * as TestUtils from "@effect/ai/test/utilities"

it.effect("returns text response", () =>
  Effect.gen(function*() {
    const response = yield* LanguageModel.generateText({
      prompt: "Hello",
    }).pipe(
      TestUtils.withLanguageModel({
        generateText: [{ type: "text", text: "Hello back" }],
      })
    )

    assert.strictEqual(response.text, "Hello back")
  }))
```

Mock data uses **encoded types** (`PartEncoded`, `StreamPartEncoded`). Field values like `params` are plain objects. The framework handles decoding internally.

## Inspecting What Was Sent to the Model

Use the callback form to inspect `ProviderOptions`. Import your real toolkit and handlers from production code:

```typescript
import { MyToolkit, HandlersLive } from "@org/ai/tools"

it.effect("sends correct prompt and tools", () =>
  Effect.gen(function*() {
    let capturedOpts: LanguageModel.ProviderOptions | undefined

    yield* LanguageModel.generateText({
      prompt: "Test",
      toolkit: MyToolkit,
    }).pipe(
      TestUtils.withLanguageModel({
        generateText: (opts) => {
          capturedOpts = opts
          return [{ type: "text", text: "ok" }]
        },
      }),
      Effect.provide(HandlersLive),
    )

    assert.strictEqual(capturedOpts!.tools.length, 1)
    assert.strictEqual(capturedOpts!.tools[0].name, "MyTool")
  }))
```

## Tool Call Testing

Tests import the real tool definitions, toolkits, and handler layers from production code. The mock only controls what the "model" returns. Handler resolution runs through the real handler implementations.

```typescript
import { MyToolkit, HandlersLive } from "@org/ai/tools"
```

### Test: User-defined tool call resolution

```typescript
it.effect("resolves tool calls via real handlers", () =>
  Effect.gen(function*() {
    const response = yield* LanguageModel.generateText({
      prompt: "Test",
      toolkit: MyToolkit,
    }).pipe(
      TestUtils.withLanguageModel({
        generateText: [{
          type: "tool-call",
          id: "tool-123",
          name: "MyTool",
          params: { input: "hello" },
        }],
      }),
      Effect.provide(HandlersLive),
    )

    assert.strictEqual(response.toolResults.length, 1)
    assert.strictEqual(response.toolResults[0].isFailure, false)
  }))
```

The mock returns a `tool-call` encoded part. The framework calls `toolkit.handle(name, params)` which decodes params, runs the real handler, encodes the result, and appends a `tool-result` part. Provide the production handler layer via `Effect.provide(HandlersLive)`.

### Tool failure modes

Behavior depends on how the tool was defined in production code. The test just needs to simulate the model returning a tool call and observe the result.

**`failureMode: "error"` (default):** Handler failures propagate to the Effect error channel. Use `Effect.flip` to assert on the error.

```typescript
import { MyToolkit, HandlersLive } from "@org/ai/tools"

it.effect("propagates handler failure as Effect error", () =>
  Effect.gen(function*() {
    const error = yield* LanguageModel.generateText({
      prompt: "Test",
      toolkit: MyToolkit,
    }).pipe(
      TestUtils.withLanguageModel({
        generateText: [{
          type: "tool-call",
          id: "t1",
          name: "MyTool",
          params: { input: "triggers-failure" },
        }],
      }),
      Effect.provide(HandlersLive),
      Effect.flip,
    )

    assert.strictEqual(error._tag, "MyToolError")
  }))
```

**`failureMode: "return"`:** Handler failures are captured as tool results with `isFailure: true` and sent back to the model. The Effect succeeds.

```typescript
import { ReturnModeToolkit, ReturnModeHandlersLive } from "@org/ai/tools"

it.effect("captures handler failure as tool result", () =>
  Effect.gen(function*() {
    const response = yield* LanguageModel.generateText({
      prompt: "Test",
      toolkit: ReturnModeToolkit,
    }).pipe(
      TestUtils.withLanguageModel({
        generateText: [{
          type: "tool-call",
          id: "t1",
          name: "ReturnModeTool",
          params: { input: "triggers-failure" },
        }],
      }),
      Effect.provide(ReturnModeHandlersLive),
    )

    assert.strictEqual(response.toolResults[0].isFailure, true)
  }))
```

### Malformed tool parameters

When the model sends params that don't match the tool's schema, a `MalformedOutput` error is raised regardless of failure mode:

```typescript
it.effect("raises MalformedOutput on invalid params", () =>
  Effect.gen(function*() {
    const error = yield* LanguageModel.generateText({
      prompt: "Test",
      toolkit: MyToolkit,
    }).pipe(
      TestUtils.withLanguageModel({
        generateText: [{
          type: "tool-call",
          id: "t1",
          name: "MyTool",
          params: {},
        }],
      }),
      Effect.provide(HandlersLive),
      Effect.flip,
    )

    assert.strictEqual(error._tag, "MalformedOutput")
  }))
```

## Provider-Defined Tool Testing

Provider-defined tools (e.g., Anthropic's `WebSearch_20250305`, OpenAI's `CodeInterpreter`) are imported from the provider package and instantiated with args. The toolkit and handlers come from production code.

### `providerExecuted` flag semantics

- `providerExecuted: true`: The provider already executed the tool. The framework skips handler resolution. The mock must return BOTH `tool-call` AND `tool-result` parts.
- `providerExecuted: false`: The framework must resolve via a user-provided handler.

### No handler required (`requiresHandler: false`, default)

Most provider tools (web search, code execution) don't require user handlers. The mock must return both the tool-call and the tool-result with `providerExecuted: true`:

```typescript
import { ToolkitWithSearch, SearchToolName, SearchProviderName } from "@org/ai/tools"

it.effect("passes through provider-executed results", () =>
  Effect.gen(function*() {
    const response = yield* LanguageModel.generateText({
      prompt: "Search for Effect",
      toolkit: ToolkitWithSearch,
    }).pipe(
      TestUtils.withLanguageModel({
        generateText: [
          {
            type: "tool-call",
            id: "t1",
            name: SearchToolName,
            providerName: SearchProviderName,
            providerExecuted: true,
            params: {},
          },
          {
            type: "tool-result",
            id: "t1",
            name: SearchToolName,
            isFailure: false,
            result: { url: "https://effect.website" },
            providerName: SearchProviderName,
            providerExecuted: true,
          },
        ],
      })
    )

    assert.strictEqual(response.toolResults.length, 1)
    assert.strictEqual(response.toolResults[0].isFailure, false)
  }))
```

No handler layer needed. The framework passes through provider-executed results directly.

### Handler required (`requiresHandler: true`)

Some provider-defined tools need user-space handlers. The mock returns `providerExecuted: false` and the framework resolves through the real handler layer:

```typescript
import { CustomProviderToolkit, CustomHandlersLive } from "@org/ai/tools"

it.effect("resolves via real handler", () =>
  Effect.gen(function*() {
    const response = yield* LanguageModel.generateText({
      prompt: "Test",
      toolkit: CustomProviderToolkit,
    }).pipe(
      TestUtils.withLanguageModel({
        generateText: [{
          type: "tool-call",
          id: "t1",
          name: "CustomTool",
          providerName: "custom",
          providerExecuted: false,
          params: { query: "hello" },
        }],
      }),
      Effect.provide(CustomHandlersLive),
    )

    assert.strictEqual(response.toolResults.length, 1)
    assert.strictEqual(response.toolResults[0].isFailure, false)
  }))
```

## Streaming Tests

### Fork + Latch + TestClock pattern

Stream processing must be forked. Use a latch for synchronization and TestClock to control time-dependent handlers. Import the real toolkit and handlers from production code.

```typescript
import { MyToolkit, HandlersLive } from "@org/ai/tools"

it.effect("emits tool calls before handler completes", () =>
  Effect.gen(function*() {
    const parts: Array<Response.StreamPart<Toolkit.Tools<typeof MyToolkit>>> = []
    const latch = yield* Effect.makeLatch()

    yield* LanguageModel.streamText({
      prompt: [],
      toolkit: MyToolkit,
    }).pipe(
      Stream.runForEach((part) =>
        Effect.andThen(latch.open, () => { parts.push(part) })
      ),
      TestUtils.withLanguageModel({
        streamText: [{
          type: "tool-call",
          id: "t1",
          name: "MyTool",
          params: { input: "test" },
        }],
      }),
      Effect.provide(HandlersLive),
      Effect.fork,
    )

    yield* latch.await
    assert.strictEqual(parts.length, 1)
    assert.strictEqual(parts[0].type, "tool-call")

    yield* TestClock.adjust("10 seconds")
    assert.strictEqual(parts.length, 2)
    assert.strictEqual(parts[1].type, "tool-result")
  }))
```

The stream consumer is forked. The latch opens when the first part arrives. After `latch.await`, the tool-call has been emitted but the handler hasn't completed yet. `TestClock.adjust` advances virtual time, triggering the handler completion and emitting the tool-result.

### Text streaming deltas

```typescript
it.effect("streams text deltas", () =>
  Effect.gen(function*() {
    const parts: Array<Response.StreamPart<{}>> = []

    yield* LanguageModel.streamText({ prompt: "Hello" }).pipe(
      Stream.runForEach((part) => Effect.sync(() => { parts.push(part) })),
      TestUtils.withLanguageModel({
        streamText: [
          { type: "text-start", id: "1" },
          { type: "text-delta", id: "1", delta: "Hello" },
          { type: "text-delta", id: "1", delta: ", World!" },
          { type: "text-end", id: "1" },
        ],
      }),
    )

    assert.strictEqual(parts.length, 4)
    assert.strictEqual(parts[1].type, "text-delta")
  }))
```

## Chat Persistence Testing

Chat tests use `it.scoped` because Chat.Persistence requires a Scope.

### Setup

```typescript
import { Chat, IdGenerator, Prompt } from "@effect/ai"
import * as Persistence from "@effect/experimental/Persistence"

const withConstantIdGenerator = (id: string) =>
  Effect.provideService(IdGenerator.IdGenerator, {
    generateId: () => Effect.succeed(id),
  })

const PersistenceLayer = Layer.provideMerge(
  Chat.layerPersisted({ storeId: "chat" }),
  Persistence.layerMemory,
)
```

`Persistence.layerMemory` provides an in-memory backing store. `withConstantIdGenerator` makes message IDs deterministic for assertions.

### Test: Chat history is persisted

```typescript
it.scoped("persists chat history", () =>
  Effect.gen(function*() {
    const backing = yield* Persistence.BackingPersistence
    const persistence = yield* Chat.Persistence
    const store = yield* backing.make("chat")
    const chat = yield* persistence.getOrCreate("conv-1")

    yield* chat.generateText({ prompt: "hello" }).pipe(
      TestUtils.withLanguageModel({
        generateText: [{ type: "text", text: "hi there" }],
      })
    )

    const chatHistory = yield* chat.history
    const storeHistory = yield* store.get("conv-1").pipe(
      Effect.flatten,
      Effect.flatMap(Schema.decodeUnknown(Prompt.FromJson)),
    )

    const options = { [Chat.Persistence.key]: { messageId: "msg_001" } }
    const expectedHistory = Prompt.make([
      { role: "user", content: [{ type: "text", text: "hello" }], options },
      { role: "assistant", content: [{ type: "text", text: "hi there" }], options },
    ])

    assert.deepStrictEqual(chatHistory, expectedHistory)
    assert.deepStrictEqual(chatHistory, storeHistory)
  }).pipe(withConstantIdGenerator("msg_001"), Effect.provide(PersistenceLayer)))
```

Access the backing store directly via `Persistence.BackingPersistence` to verify data is actually persisted. Decode stored data with `Schema.decodeUnknown(Prompt.FromJson)`. Chat messages include `options` with `Chat.Persistence.key` containing the `messageId`.

### Test: TTL expiration with TestClock

```typescript
it.scoped("expires after timeToLive", () =>
  Effect.gen(function*() {
    const backing = yield* Persistence.BackingPersistence
    const persistence = yield* Chat.Persistence
    const store = yield* backing.make("chat")
    const chat = yield* persistence.getOrCreate("conv-1", {
      timeToLive: "30 days",
    })

    yield* chat.generateText({ prompt: "hello" }).pipe(
      TestUtils.withLanguageModel({
        generateText: [{ type: "text", text: "hi" }],
      })
    )

    const before = yield* store.get("conv-1")
    assert.isTrue(Option.isSome(before))

    yield* TestClock.adjust("30 days")

    const after = yield* store.get("conv-1")
    assert.deepStrictEqual(after, Option.none())
  }).pipe(withConstantIdGenerator("msg_001"), Effect.provide(PersistenceLayer)))
```

### Test: ChatNotFoundError

```typescript
it.scoped("raises ChatNotFoundError for missing chat", () =>
  Effect.gen(function*() {
    const persistence = yield* Chat.Persistence

    const error = yield* persistence.get("nonexistent").pipe(Effect.flip)

    assert.instanceOf(error, Chat.ChatNotFoundError)
    assert.strictEqual(error.chatId, "nonexistent")
  }).pipe(Effect.provide(PersistenceLayer)))
```

`persistence.get(id)` (not `getOrCreate`) fails for missing chats. Use `Effect.flip` to assert on the error.

### Prepopulating chat history

```typescript
it.scoped("appends to existing history", () =>
  Effect.gen(function*() {
    const persistence = yield* Chat.Persistence
    const chat = yield* persistence.getOrCreate("conv-1")

    const existingHistory = Prompt.make([
      { role: "user", content: "first message" },
      { role: "assistant", content: "first reply" },
    ])
    yield* Ref.set(chat.history, existingHistory)
    yield* chat.save

    yield* chat.generateText({ prompt: "second message" }).pipe(
      TestUtils.withLanguageModel({
        generateText: [{ type: "text", text: "second reply" }],
      })
    )

    const history = yield* chat.history
    assert.strictEqual(history.content.length, 4)
  }).pipe(withConstantIdGenerator("msg_001"), Effect.provide(PersistenceLayer)))
```

`chat.history` is a `Ref<Prompt.Prompt>` that can be set directly. Call `chat.save` after setting to persist.

## Mocking EmbeddingModel

No official test utility exists. Provide the service directly:

```typescript
import { EmbeddingModel } from "@effect/ai"

const mockEmbedding = Effect.provideService(
  EmbeddingModel.EmbeddingModel,
  {
    embed: (input) => Effect.succeed([0.1, 0.2, 0.3]),
    embedMany: (inputs) => Effect.succeed(inputs.map(() => [0.1, 0.2, 0.3])),
  },
)
```

## Mocking Tokenizer

```typescript
import { Tokenizer, Prompt } from "@effect/ai"

const mockTokenizer = Effect.provideService(
  Tokenizer.Tokenizer,
  Tokenizer.make({
    tokenize: (content) => Effect.succeed([1, 2, 3]),
  }),
)
```

`Tokenizer.make` builds `truncate` automatically from `tokenize`.

## Prompt Testing (Pure, No Effect)

Prompt tests are pure data tests. No `it.effect`, no mock, no layers.

```typescript
import { Prompt, Response } from "@effect/ai"

it("reconstructs streaming deltas into messages", () => {
  const parts = [
    Response.makePart("text-start", { id: "1" }),
    Response.makePart("text-delta", { id: "1", delta: "Hello" }),
    Response.makePart("text-delta", { id: "1", delta: ", World!" }),
    Response.makePart("text-end", { id: "1" }),
  ]
  const prompt = Prompt.fromResponseParts(parts)
  const expected = Prompt.make([{
    role: "assistant",
    content: [{ type: "text", text: "Hello, World!" }],
  }])
  assert.deepStrictEqual(prompt, expected)
})

it("appends to system message", () => {
  const prompt = Prompt.make([
    { role: "system", content: "You are helpful." },
    { role: "user", content: "Hello" },
  ])
  const result = Prompt.appendSystem(prompt, " Be concise.")
  assert.deepStrictEqual(
    result.content[0],
    Prompt.makeMessage("system", { content: "You are helpful. Be concise." }),
  )
})
```

`Prompt.fromResponseParts` reassembles streaming delta parts (start/delta/end sequences correlated by `id`) into a single assistant message with concatenated text.

## Layer Composition Patterns

### Standard test pipe chain

```typescript
import { MyToolkit, HandlersLive } from "@org/ai/tools"

Effect.gen(function*() { ... }).pipe(
  TestUtils.withLanguageModel({ ... }),   // provides mock LanguageModel
  Effect.provide(HandlersLive),            // provides real tool handlers
)
```

`withLanguageModel` is always between `Effect.gen` and `Effect.provide` in the pipe chain.

### Scoped tests with persistence

```typescript
Effect.gen(function*() { ... }).pipe(
  withConstantIdGenerator("msg_001"),      // deterministic IDs
  Effect.provide(PersistenceLayer),        // provides Chat.Persistence + BackingPersistence
)
```

### Combining multiple concerns

```typescript
Effect.gen(function*() { ... }).pipe(
  TestUtils.withLanguageModel({ ... }),
  Effect.provide(HandlersLive),
  withConstantIdGenerator("msg_001"),
  Effect.provide(PersistenceLayer),
)
```

## Assertion Patterns

| Pattern | When to use |
|---|---|
| `assert.deepStrictEqual(a, b)` | Exact equality (most common) |
| `assert.deepInclude(array, element)` | Array contains element (use with `response.toolResults`) |
| `assert.strictEqual(a, b)` | Scalar values, error `_tag` checks |
| `assert.instanceOf(val, Class)` | Error class checks (e.g., `Chat.ChatNotFoundError`) |
| `Effect.flip` then assert | Error channel testing (flips error to success for assertion) |

## `Response.makePart` for Expected Values

Use `Response.makePart` to construct expected parts when doing exact assertions. It adds `[PartTypeId]` and defaults `metadata: {}`.

```typescript
Response.makePart("text", { text: "hello" })
Response.makePart("tool-call", { id: "t1", name: "MyTool", params: { input: "test" }, providerExecuted: false })
Response.makePart("tool-result", { id: "t1", name: "MyTool", isFailure: false, result: { ... }, encodedResult: { ... }, providerExecuted: false })
```

For most tests, prefer asserting on specific fields (`response.toolResults[0].isFailure`, `response.text`, `response.finishReason`) instead of constructing full expected parts. Use `makePart` only when you need `deepStrictEqual` or `deepInclude` on entire part objects.

## `it.effect` vs `it.scoped`

- `it.effect`: No Scope requirement. Use for LanguageModel and Tool tests.
- `it.scoped`: Provides a Scope. Use for Chat.Persistence tests (resources require Scope).
- Plain `it`: No Effect at all. Use for pure Prompt data tests.
