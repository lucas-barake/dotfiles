---
name: effect-ai
description: Effect AI patterns for language models, chat, tools, embeddings, providers, and MCP. Use when working with @effect/ai, LanguageModel, Chat, Tool, Toolkit, Prompt, or any provider package. Triggers on @effect/ai, LanguageModel.generateText, Chat.fromPrompt, Tool.make, Toolkit.make, AnthropicLanguageModel, OpenAiLanguageModel, GoogleLanguageModel, AmazonBedrockLanguageModel, OpenRouterLanguageModel, McpServer.
---

# Effect AI

Core package: `@effect/ai`. Provider packages: `@effect/ai-anthropic`, `@effect/ai-openai`, `@effect/ai-google`, `@effect/ai-amazon-bedrock`, `@effect/ai-openrouter`.

Source modules: `LanguageModel`, `Chat`, `Tool`, `Toolkit`, `Prompt`, `Response`, `Model`, `McpServer`, `EmbeddingModel`, `AiError`, `Tokenizer`, `Telemetry`, `IdGenerator`.

## LanguageModel

The core abstraction. A `Context.Tag` service with three operations.

```typescript
import { LanguageModel, Tool, Toolkit } from "@effect/ai"

class LanguageModel extends Context.Tag("@effect/ai/LanguageModel")<
  LanguageModel,
  LanguageModel.Service
>() {}
```

### Static accessors (primary consumer API)

```typescript
LanguageModel.generateText(options)
//=> Effect<GenerateTextResponse<Tools>, ExtractError<Options>, LanguageModel | ExtractContext<Options>>

LanguageModel.generateObject(options)
//=> Effect<GenerateObjectResponse<Tools, A>, ExtractError<Options>, LanguageModel | R | ExtractContext<Options>>

LanguageModel.streamText(options)
//=> Stream<Response.StreamPart<Tools>, ExtractError<Options>, LanguageModel | ExtractContext<Options>>
```

All three require `LanguageModel` in context. This requirement is leaked intentionally so consumers must provide it, making it easy to swap models for testing.

### GenerateTextOptions

```typescript
interface GenerateTextOptions<Tools extends Record<string, Tool.Any>> {
  readonly prompt: Prompt.RawInput
  readonly toolkit?: Toolkit.WithHandler<Tools> | Effect.Effect<Toolkit.WithHandler<Tools>, any, any>
  readonly toolChoice?: ToolChoice<...>
  readonly concurrency?: Concurrency
  readonly disableToolCallResolution?: boolean
}
```

`prompt` accepts a string (becomes a user message), an array of messages, or a `Prompt` object.

### GenerateObjectOptions (extends GenerateTextOptions)

```typescript
interface GenerateObjectOptions<Tools, A, I, R> extends GenerateTextOptions<Tools> {
  readonly objectName?: string
  readonly schema: Schema.Schema<A, I, R>
}
```

The model returns JSON text, which is decoded via `Schema.parseJson(schema)` internally.

### ToolChoice

```typescript
type ToolChoice<Tools extends string> =
  | "auto" | "none" | "required"
  | { readonly tool: Tools }
  | { readonly mode?: "auto" | "required"; readonly oneOf: ReadonlyArray<Tools> }
```

### GenerateTextResponse

```typescript
class GenerateTextResponse<Tools> {
  readonly content: Array<Response.Part<Tools>>
  get text(): string
  get reasoning(): Array<Response.ReasoningPart>
  get reasoningText(): string | undefined
  get toolCalls(): Array<Response.ToolCallParts<Tools>>
  get toolResults(): Array<Response.ToolResultParts<Tools>>
  get finishReason(): Response.FinishReason
  get usage(): Response.Usage
}
```

### GenerateObjectResponse (extends GenerateTextResponse)

```typescript
class GenerateObjectResponse<Tools, A> extends GenerateTextResponse<Tools> {
  readonly value: A
}
```

### ExtractError / ExtractContext

```typescript
type ExtractError<Options> =
  // With toolkit + disableToolCallResolution: true
  | AiError.AiError
  // With toolkit (tool handler errors added)
  | AiError.AiError | Tool.HandlerError<Tools[keyof Tools]>
  // Without toolkit
  | AiError.AiError

type ExtractContext<Options> =
  // With toolkit: tool handler requirements
  | Tool.Requirements<Tools[keyof Tools]>
  // Without toolkit
  | never
```

## Tools

### `Tool.make`

```typescript
import { Tool, Toolkit } from "@effect/ai"

const GetWeather = Tool.make("GetWeather", {
  description: "Fetches current weather for a location",
  parameters: { location: Schema.String },
  success: Schema.Struct({ temperature: Schema.Number, condition: Schema.String }),
})
```

Options:
- `parameters` accepts raw `Schema.Struct.Fields` (auto-wrapped into `Schema.Struct`)
- `success` defaults to `Schema.Void`, `failure` defaults to `Schema.Never`
- `failureMode`: `"error"` (default) or `"return"`. `"error"` sends failures to the Effect error channel. `"return"` captures failures as tool results sent back to the model
- `dependencies`: array of `Context.Tag`s the tool handler requires

### `Tool.fromTaggedRequest`

```typescript
class ListFiles extends Schema.TaggedRequest<ListFiles>()("ListFiles", {
  success: Schema.Array(Schema.String),
  failure: Schema.Never,
  payload: { directory: Schema.String }
}) {}

Tool.fromTaggedRequest(ListFiles)
```

### `Tool.providerDefined`

For tools executed by the provider (web search, code execution, etc.).

```typescript
const MyProviderTool = Tool.providerDefined({
  id: "provider.my_tool",
  toolkitName: "MyProviderTool",
  providerName: "my_tool",
  args: { config: Schema.String },
  requiresHandler: false,
})

const tool = MyProviderTool({ config: "value" })
```

When `requiresHandler: false` (default), the provider executes the tool and returns both tool-call and tool-result with `providerExecuted: true`. When `requiresHandler: true`, you must provide a handler.

### Tool annotations

```typescript
Tool.Title       // display name
Tool.Readonly    // default: false
Tool.Destructive // default: true
Tool.Idempotent  // default: false
Tool.OpenWorld   // default: true
```

## Toolkits

A `Toolkit` groups tools and resolves handlers from context. **Toolkit itself IS an Effect** that resolves its handlers when yielded.

### Creating toolkits

```typescript
const MyToolkit = Toolkit.make(GetWeather, ListFiles)
Toolkit.merge(ToolkitA, ToolkitB)
Toolkit.empty
```

### Providing handlers

```typescript
const HandlersLayer = MyToolkit.toLayer({
  GetWeather: (params) =>
    Effect.succeed({ temperature: 72, condition: "sunny" }),
  ListFiles: (params) =>
    Effect.succeed(["file1.txt", "file2.txt"]),
})
```

Handler signature: `(params: Tool.Parameters<T>) => Effect<Tool.Success<T>, Tool.Failure<T>, Tool.Requirements<T>>`

### Using toolkits with LanguageModel

```typescript
const response = yield* LanguageModel.generateText({
  prompt: "What's the weather in NYC?",
  toolkit: MyToolkit,
}).pipe(Effect.provide(HandlersLayer))
```

Tool calls are resolved automatically. Use `disableToolCallResolution: true` to get raw tool calls without execution.

## Chat

Stateful conversation sessions with history management. Uses a semaphore (permits=1) to serialize access.

### Creating a chat

```typescript
import { Chat } from "@effect/ai"

const chat = yield* Chat.empty
const chat = yield* Chat.fromPrompt("You are a helpful assistant")
const chat = yield* Chat.fromExport(data)
const chat = yield* Chat.fromJson(jsonString)
```

### Chat.Service

```typescript
interface Service {
  readonly history: Ref.Ref<Prompt.Prompt>
  readonly export: Effect.Effect<unknown, AiError.AiError>
  readonly exportJson: Effect.Effect<string, AiError.MalformedOutput>
  readonly generateText: <...>(options) => Effect<GenerateTextResponse<Tools>, ..., LanguageModel | ...>
  readonly streamText: <...>(options) => Stream<Response.StreamPart<Tools>, ..., LanguageModel | ...>
  readonly generateObject: <...>(options) => Effect<GenerateObjectResponse<Tools, A>, ..., LanguageModel | R | ...>
}
```

Each call merges the new prompt with history, calls LanguageModel, then updates history with response parts.

### Chat persistence

```typescript
import { Chat, Persistence } from "@effect/ai"

const PersistenceLayer = Chat.layerPersisted({ storeId: "chat" }).pipe(
  Layer.provide(Persistence.layerMemory)
)

const persistence = yield* Chat.Persistence
const chat = yield* persistence.getOrCreate("conversation-1")
const chat = yield* persistence.getOrCreate("conversation-1", { timeToLive: "30 days" })
const chat = yield* persistence.get("conversation-1")
//=> Effect<Chat.Persisted, ChatNotFoundError>
```

`Chat.Persisted` extends `Chat.Service` with `id` and `save`.

## Prompt

### `Prompt.RawInput` (what `prompt` accepts everywhere)

```typescript
type RawInput =
  | string                         // becomes user message with text part
  | Iterable<MessageEncoded>       // array of messages
  | Prompt                         // passed through
```

### Message types

```typescript
type Message =
  | SystemMessage      // { role: "system", content: string }
  | UserMessage        // { role: "user", content: Array<TextPart | FilePart> }
  | AssistantMessage   // { role: "assistant", content: Array<TextPart | FilePart | ReasoningPart | ToolCallPart | ToolResultPart> }
  | ToolMessage        // { role: "tool", content: Array<ToolResultPart> }
```

### Constructors and combinators

```typescript
Prompt.empty
Prompt.make("hello")
Prompt.make([{ role: "user", content: [{ type: "text", text: "hello" }] }])

Prompt.merge(prompt, "follow up")
Prompt.setSystem(prompt, "You are a helpful assistant")
Prompt.prependSystem(prompt, "Important: ")
Prompt.appendSystem(prompt, "\nAdditional context")
Prompt.fromResponseParts(response.content)
```

## Response Parts

### Non-streaming: `Response.Part<Tools>`

```typescript
type Part<Tools> =
  | TextPart | ReasoningPart | ToolCallParts<Tools> | ToolResultParts<Tools>
  | FilePart | DocumentSourcePart | UrlSourcePart | ResponseMetadataPart | FinishPart
```

### Streaming: `Response.StreamPart<Tools>`

```typescript
type StreamPart<Tools> =
  | TextStartPart | TextDeltaPart | TextEndPart
  | ReasoningStartPart | ReasoningDeltaPart | ReasoningEndPart
  | ToolParamsStartPart | ToolParamsDeltaPart | ToolParamsEndPart
  | ToolCallParts<Tools> | ToolResultParts<Tools>
  | FilePart | DocumentSourcePart | UrlSourcePart
  | ResponseMetadataPart | FinishPart | ErrorPart
```

### FinishReason and Usage

```typescript
type FinishReason = "stop" | "length" | "content-filter" | "tool-calls" | "error" | "pause" | "other" | "unknown"

class Usage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
}
```

## Model

A `Model` wraps a `Layer` with a provider name. **Model is both a Layer and an Effect.** When used as a Layer, it provides `LanguageModel` + `ProviderName` directly. When used as an Effect (inside `Effect.gen`), it lifts the layer's requirements into the effect context, which is useful when constructing inside services.

```typescript
import { Model } from "@effect/ai"
import { AnthropicLanguageModel } from "@effect/ai-anthropic"

const SonnetModel = AnthropicLanguageModel.model("claude-sonnet-4-5-20250929")
//=> Model<"anthropic", LanguageModel, AnthropicClient>

// As Layer (direct provide)
Effect.provide(myEffect, SonnetModel)

// As Effect (yield inside a service)
const modelLayer = yield* SonnetModel
//=> Layer<LanguageModel | ProviderName>
```

## Providers

All providers follow the same three-layer architecture:
1. **XxxConfig**: Transport-level `transformClient` configuration
2. **XxxClient**: HTTP client with auth, base URL, API methods
3. **XxxLanguageModel**: `LanguageModel` implementation with provider-specific `Config` tag and `withConfigOverride`

### Anthropic (`@effect/ai-anthropic`)

```typescript
import { AnthropicClient, AnthropicLanguageModel, AnthropicTool } from "@effect/ai-anthropic"

AnthropicClient.layer({
  apiKey: Redacted.make("sk-..."),
  apiUrl: "https://api.anthropic.com",
  transformClient: (client) => client,
})
//=> Layer<AnthropicClient, never, HttpClient>

AnthropicLanguageModel.model("claude-sonnet-4-5-20250929")
//=> Model<"anthropic", LanguageModel, AnthropicClient>

AnthropicLanguageModel.modelWithTokenizer("claude-sonnet-4-5-20250929")
//=> Model<"anthropic", LanguageModel | Tokenizer, AnthropicClient>
```

Config overrides (partial `CreateMessageParams` minus messages/tools/stream):
```typescript
LanguageModel.generateText({ prompt: "..." }).pipe(
  AnthropicLanguageModel.withConfigOverride({
    temperature: 0.5,
    max_tokens: 8192,
    top_k: 40,
    disableParallelToolCalls: true,
  })
)
```

Provider-specific features:
- Prompt caching via `options.anthropic.cacheControl` on messages/parts
- Extended thinking with `signature` metadata on reasoning parts
- Citations via `options.anthropic.citations` on file parts
- Default `max_tokens: 4096` (hardcoded)

Provider-defined tools: `Bash_20241022`, `Bash_20250124`, `CodeExecution_20250522`, `CodeExecution_20250825`, `ComputerUse_20241022`, `ComputerUse_20250124`, `TextEditor_20241022`, `TextEditor_20250124`, `TextEditor_20250429`, `TextEditor_20250728`, `WebSearch_20250305`.

### OpenAI (`@effect/ai-openai`)

```typescript
import { OpenAiClient, OpenAiLanguageModel, OpenAiTool, OpenAiEmbeddingModel } from "@effect/ai-openai"

OpenAiClient.layer({
  apiKey: Redacted.make("sk-..."),
  apiUrl: "https://api.openai.com/v1",
  organizationId: Redacted.make("org-..."),
})
//=> Layer<OpenAiClient, never, HttpClient>

OpenAiLanguageModel.model("gpt-4o")
//=> Model<"openai", LanguageModel, OpenAiClient>
```

Config overrides (partial `CreateResponse` minus input/tools/stream):
```typescript
OpenAiLanguageModel.withConfigOverride({
  temperature: 0.7,
  max_output_tokens: 4096,
  reasoning: { effort: "high", summary: "detailed" },
  service_tier: "auto",
})
```

Uses the Responses API (`/responses`), not Chat Completions. Provider-defined tools: `CodeInterpreter`, `FileSearch`, `WebSearch`, `WebSearchPreview`. User tools are sent with `strict: true` by default. Automatically uses `"developer"` role for system messages on `o*`, `gpt-5*`, `codex-*` models.

Embeddings:
```typescript
OpenAiEmbeddingModel.model("text-embedding-3-small", {
  mode: "batched",
  maxBatchSize: 2048,
  cache: { capacity: 1000, timeToLive: "1 hour" },
})
//=> Model<"openai", EmbeddingModel, OpenAiClient>
```

### Google (`@effect/ai-google`)

```typescript
import { GoogleClient, GoogleLanguageModel, GoogleTool } from "@effect/ai-google"

GoogleClient.layer({
  apiKey: Redacted.make("..."),
})
//=> Layer<GoogleClient, never, HttpClient>

GoogleLanguageModel.model("gemini-2.5-pro")
//=> Model<"google", LanguageModel, GoogleClient>
```

Config overrides:
```typescript
GoogleLanguageModel.withConfigOverride({
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 4096,
    thinkingConfig: { includeThoughts: true },
  },
  toolConfig: {},
})
```

Provider-defined tools: `CodeExecution`, `GoogleSearch`, `GoogleSearchRetrieval`, `UrlContext`. Cannot mix provider-defined tools with user-defined tools in the same request. Special handling for Gemma models (system instructions prepended to first user message). No tokenizer available.

### Amazon Bedrock (`@effect/ai-amazon-bedrock`)

```typescript
import { AmazonBedrockClient, AmazonBedrockLanguageModel, AmazonBedrockTool } from "@effect/ai-amazon-bedrock"

AmazonBedrockClient.layer({
  accessKeyId: "AKIA...",
  secretAccessKey: Redacted.make("..."),
  region: "us-east-1",
})
//=> Layer<AmazonBedrockClient, never, HttpClient>

AmazonBedrockLanguageModel.model("anthropic.claude-sonnet-4-5-20250929-v1:0")
//=> Model<"amazon-bedrock", LanguageModel, AmazonBedrockClient>
```

Uses AWS SigV4 signing via the Converse API. Automatically detects Anthropic models and routes their provider-defined tools correctly. Re-exports Anthropic tools as `AnthropicBash_*`, `AnthropicComputerUse_*`, `AnthropicTextEditor_*`. Prompt caching via `options.bedrock.cachePoint` on messages.

### OpenRouter (`@effect/ai-openrouter`)

```typescript
import { OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter"

OpenRouterClient.layer({
  apiKey: Redacted.make("sk-or-..."),
  referrer: "https://myapp.com",
  title: "My App",
})
//=> Layer<OpenRouterClient, never, HttpClient>

OpenRouterLanguageModel.model("anthropic/claude-sonnet-4-5-20250929")
//=> Model<"openrouter", LanguageModel, OpenRouterClient>
```

Uses Chat Completions API. Model is a plain string (e.g., `"anthropic/claude-sonnet-4-5-20250929"`, `"openai/gpt-4o"`). Provider-defined tools are NOT supported. Supports `options.openrouter.cacheControl` on parts.

## Client Layer Patterns

Each provider client requires `HttpClient` in context. Use `Layer.unwrapEffect` or `Layer.unwrapScoped` to build client layers that read config from the environment.

```typescript
import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { GoogleClient, GoogleLanguageModel } from "@effect/ai-google"

const AnthropicLive = Layer.unwrapEffect(
  Effect.map(EnvVars.ANTHROPIC_API_KEY, (apiKey) =>
    AnthropicClient.layer({ apiKey })
  ),
).pipe(Layer.provide(HttpContext))

const OpenAiLive = Layer.unwrapEffect(
  Effect.map(EnvVars.OPENAI_API_KEY, (apiKey) =>
    OpenAiClient.layer({ apiKey })
  ),
).pipe(Layer.provide(HttpContext))

const GoogleLive = Layer.unwrapEffect(
  Effect.map(EnvVars.GOOGLE_API_KEY, (apiKey) =>
    GoogleClient.layer({ apiKey })
  ),
).pipe(Layer.provide(HttpContext))

const AiLive = Layer.mergeAll(AnthropicLive, OpenAiLive, GoogleLive).pipe(Layer.orDie)
```

For rate limiting, you can use `transformClient` to wrap the HTTP client:

```typescript
const AnthropicLive = Layer.unwrapScoped(
  Effect.gen(function*() {
    const apiKey = yield* EnvVars.ANTHROPIC_API_KEY
    const rl = yield* RateLimiter.make({ limit: 50, interval: "1 minute" })
    return AnthropicClient.layer({
      apiKey,
      transformClient: (client) =>
        HttpClient.transform(client, (effect) => rl(effect)),
    })
  }),
).pipe(Layer.provide(HttpContext))
```

Use `Layer.unwrapScoped` (not `unwrapEffect`) when the setup itself needs a scope (e.g., `RateLimiter.make` is scoped).

## Model Registry Pattern

Centralize model selection in a service that leaks `LanguageModel` as a requirement. Each consumer provides its own model.

```typescript
const SonnetModel = AnthropicLanguageModel.model("claude-sonnet-4-5-20250929")
const OpusModel = AnthropicLanguageModel.model("claude-opus-4-5-20251101")
const GptModel = OpenAiLanguageModel.model("gpt-4o")
const GeminiModel = GoogleLanguageModel.model("gemini-2.5-pro", {
  generationConfig: { thinkingConfig: { includeThoughts: true } },
  toolConfig: {},
})

export class AiModels extends Effect.Service<AiModels>()("AiModels", {
  dependencies: [AiLive],
  effect: Effect.gen(function*() {
    const sonnet = yield* SonnetModel
    const opus = yield* OpusModel
    const gpt = yield* GptModel
    const gemini = yield* GeminiModel

    const getModelLayer = (model: ModelFamily): Layer.Layer<LanguageModel.LanguageModel> => {
      switch (model) {
        case "sonnet": return sonnet
        case "opus": return opus
        case "gpt": return gpt
        case "gemini": return gemini
      }
    }

    return {
      use: (model: ModelFamily, config?: { readonly temperature?: number; readonly maxTokens?: number }) =>
        <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, LanguageModel.LanguageModel>> => {
          const modelLayer = getModelLayer(model)
          if (config === undefined) return Effect.provide(self, modelLayer)
          switch (model) {
            case "sonnet":
            case "opus":
              return self.pipe(
                AnthropicLanguageModel.withConfigOverride({
                  ...(config.temperature !== undefined && { temperature: config.temperature }),
                  ...(config.maxTokens !== undefined && { max_tokens: config.maxTokens }),
                }),
                Effect.provide(modelLayer),
              )
            case "gpt":
              return self.pipe(
                OpenAiLanguageModel.withConfigOverride({
                  ...(config.temperature !== undefined && { temperature: config.temperature }),
                  ...(config.maxTokens !== undefined && { max_output_tokens: config.maxTokens }),
                }),
                Effect.provide(modelLayer),
              )
            case "gemini":
              return self.pipe(
                GoogleLanguageModel.withConfigOverride({
                  generationConfig: {
                    ...(config.temperature !== undefined && { temperature: config.temperature }),
                    ...(config.maxTokens !== undefined && { maxOutputTokens: config.maxTokens }),
                  },
                  toolConfig: {},
                }),
                Effect.provide(modelLayer),
              )
          }
        },
      layer: (model: ModelFamily): Layer.Layer<LanguageModel.LanguageModel> => getModelLayer(model),
    } as const
  }),
}) {}
```

Note: config field names differ per provider (`max_tokens` for Anthropic, `max_output_tokens` for OpenAI, `maxOutputTokens` for Google nested in `generationConfig`).

## EmbeddingModel

```typescript
import { EmbeddingModel } from "@effect/ai"

class EmbeddingModel extends Context.Tag("@effect/ai/EmbeddingModel")<
  EmbeddingModel,
  EmbeddingModel.Service
>() {}

interface Service {
  readonly embed: (input: string) => Effect<Array<number>, AiError>
  readonly embedMany: (input: ReadonlyArray<string>, options?: {
    readonly concurrency?: Concurrency
  }) => Effect<Array<Array<number>>, AiError>
}
```

Two construction modes for OpenAI embeddings:
- `"batched"`: synchronous batching with optional cache (`{ capacity, timeToLive }`)
- `"data-loader"`: windowed batching with `{ window: Duration }` for auto-batching over time

## McpServer

```typescript
import { McpServer } from "@effect/ai"

McpServer.layer
//=> Layer<McpServer | McpServerClient>

McpServer.layerStdio({ name: "My Server", version: "1.0.0", stdin, stdout })
McpServer.layerHttp({ name: "My Server", version: "1.0.0" })
```

### Register tools from a Toolkit

```typescript
McpServer.toolkit(MyToolkit)
//=> Layer<never, never, Tool.HandlersFor<Tools> | ...>
```

### Resources (tagged template literals for URI templates)

```typescript
const ReadmeResource = McpServer.resource`file://docs/${docId}`({
  name: "Documentation",
  completion: { docId: (_) => Effect.succeed(["readme", "changelog"]) },
  content: Effect.fn(function*(_uri, docId) {
    return `# ${docId}`
  })
})
```

### Prompts

```typescript
const SummarizePrompt = McpServer.prompt({
  name: "Summarize",
  description: "Summarize a document",
  parameters: Schema.Struct({ text: Schema.String }),
  content: ({ text }) => Effect.succeed(`Please summarize:\n${text}`)
})
```

### Elicitation

```typescript
McpServer.elicit({
  message: "Please confirm",
  schema: Schema.Struct({ confirmed: Schema.Boolean }),
})
//=> Effect<{ confirmed: boolean }, ...>
```

### Layer composition

```typescript
const ServerLayer = Layer.mergeAll(ReadmeResource, SummarizePrompt, McpServer.toolkit(MyToolkit)).pipe(
  Layer.provide(McpServer.layerStdio({
    name: "My Server",
    version: "1.0.0",
    stdin: NodeStream.stdin,
    stdout: NodeSink.stdout,
  })),
  Layer.provide(HandlersLayer),
)

Layer.launch(ServerLayer).pipe(NodeRuntime.runMain)
```

## AiError

```typescript
type AiError =
  | HttpRequestError    // network/transport failures
  | HttpResponseError   // bad status codes, decode failures
  | MalformedInput      // input validation failures
  | MalformedOutput     // output parsing failures (including failed tool param decoding)
  | UnknownError        // catch-all
```

All are `Schema.TaggedError` classes with `module`, `method`, optional `description` and `cause`.

## Tokenizer

```typescript
class Tokenizer extends Context.Tag("@effect/ai/Tokenizer")<Tokenizer, Tokenizer.Service>() {}

interface Service {
  readonly tokenize: (input: Prompt.RawInput) => Effect<Array<number>, AiError>
  readonly truncate: (input: Prompt.RawInput, tokens: number) => Effect<Prompt.Prompt, AiError>
}
```

Available via `AnthropicLanguageModel.modelWithTokenizer` (uses `@anthropic-ai/tokenizer`) or `OpenAiLanguageModel.modelWithTokenizer` (uses `gpt-tokenizer`). Google and Bedrock have no tokenizer support.

## Testing

Use the test utility to mock `LanguageModel` without a real provider.

```typescript
import * as TestUtils from "@effect/ai/test/utilities"

it.effect("handles tool calls", () =>
  Effect.gen(function*() {
    const toolkit = Toolkit.make(MyTool)
    const handlers = toolkit.toLayer({
      MyTool: (params) => Effect.succeed({ result: "ok" }),
    })

    const response = yield* LanguageModel.generateText({
      prompt: "Test",
      toolkit,
    }).pipe(
      TestUtils.withLanguageModel({
        generateText: [{
          type: "tool-call",
          id: "tool-123",
          name: "MyTool",
          params: { input: "test" },
        }],
      }),
      Effect.provide(handlers),
    )

    assert.strictEqual(response.toolResults.length, 1)
  }))
```

`withLanguageModel` accepts:
- Static array of `Response.PartEncoded` (simplest)
- Function `(options: ProviderOptions) => Array<PartEncoded> | Effect<Array<PartEncoded>>` (for inspecting what was sent)
- Same for `streamText` with `StreamPartEncoded` or `Stream<StreamPartEncoded>`

For streaming tests with tool resolution timing, use `Effect.fork` + `Effect.makeLatch` + `TestClock.adjust`:

```typescript
it.effect("emits tool calls before handler completes", () =>
  Effect.gen(function*() {
    const parts: Array<Response.StreamPart<...>> = []
    const latch = yield* Effect.makeLatch()

    yield* LanguageModel.streamText({ prompt: [], toolkit: MyToolkit }).pipe(
      Stream.runForEach((part) => Effect.andThen(latch.open, () => { parts.push(part) })),
      TestUtils.withLanguageModel({
        streamText: [{ type: "tool-call", id: "t1", name: "MyTool", params: {} }],
      }),
      Effect.provide(HandlersLayer),
      Effect.fork,
    )

    yield* latch.await
    // Tool call emitted before handler completes
    assert.strictEqual(parts.length, 1)

    yield* TestClock.adjust("10 seconds")
    // Now tool result is also present
    assert.strictEqual(parts.length, 2)
  }))
```

## Key Types

| Type | Purpose |
|---|---|
| `LanguageModel` | Core service Context.Tag |
| `LanguageModel.Service` | `generateText`, `generateObject`, `streamText` methods |
| `LanguageModel.GenerateTextResponse<Tools>` | Non-streaming response with `.text`, `.toolCalls`, `.usage` |
| `LanguageModel.GenerateObjectResponse<Tools, A>` | Extends text response with `.value: A` |
| `LanguageModel.ToolChoice<Tools>` | Tool selection strategy |
| `Tool<Name, Config, Requirements>` | Single tool definition |
| `Tool.Any` | Existential tool type |
| `Tool.HandlersFor<Tools>` | Context tags needed for tool handlers |
| `Toolkit<Tools>` | Group of tools (also an Effect) |
| `Toolkit.WithHandler<Tools>` | Resolved toolkit with `.handle(name, params)` |
| `Toolkit.HandlersFrom<Tools>` | Record of handler functions for `.toLayer()` |
| `Chat.Service` | Stateful conversation with history |
| `Chat.Persistence` | Persistent chat storage |
| `Prompt.Prompt` | Immutable message sequence |
| `Prompt.RawInput` | `string \| Iterable<MessageEncoded> \| Prompt` |
| `Response.Part<Tools>` | Non-streaming response part union |
| `Response.StreamPart<Tools>` | Streaming response part union |
| `Response.Usage` | Token usage stats |
| `Response.FinishReason` | Why generation stopped |
| `Model<Provider, Provides, Requires>` | Layer + Effect wrapping a provider model |
| `Model.ProviderName` | Context.Tag for the provider string |
| `EmbeddingModel` | Embedding service Context.Tag |
| `AiError.AiError` | Union of all AI error types |
| `Tokenizer` | Tokenization service Context.Tag |
| `McpServer` | MCP server Context.Tag |

## Provider Summary

| Feature | Anthropic | OpenAI | Google | Bedrock | OpenRouter |
|---|---|---|---|---|---|
| Package | `@effect/ai-anthropic` | `@effect/ai-openai` | `@effect/ai-google` | `@effect/ai-amazon-bedrock` | `@effect/ai-openrouter` |
| Auth | `x-api-key` | Bearer token | `x-goog-api-key` | AWS SigV4 | Bearer token |
| API | Messages | Responses | GenerateContent | Converse | Chat Completions |
| Tokenizer | Yes | Yes | No | No | No |
| Embeddings | No | Yes | No | No | No |
| Provider tools | 11 | 4 | 4 | Re-exports Anthropic | None |
| Caching | `cacheControl` on parts | N/A | `cachedContent` config | `cachePoint` blocks | `cacheControl` on parts |
| Reasoning | thinking/redacted | summary/encrypted | thought/signature | Via Anthropic | text/summary/encrypted |
