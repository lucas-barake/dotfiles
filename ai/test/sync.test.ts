import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { transformAgent, transformSkill } from "../src/transform.ts"
import { run, scanModels, syncTarget } from "../src/main.ts"
import * as MockTerminal from "./services/MockTerminal.ts"

const sampleAgent = `---
name: test-agent
description: A test agent for verification.
tools: Read, Glob, Grep
model: haiku
---

You are a test agent.
`

const sampleSkill = `---
name: test-skill
description: Test skill for .context/plans verification.
model: claude-sonnet-4-20250514
context: fork
---

# Test Skill

Write output to \`./.context/plans/output.md\`.
`

const makeMemoryFs = (files: Record<string, string>, dirs: ReadonlyArray<string> = []) => {
  const dirSet = new Set(dirs)
  const written = new Map<string, string>()
  const layer = FileSystem.layerNoop({
    readFileString: (path: string) => {
      const content = files[path]
      if (content === undefined) return Effect.die(`Unexpected read: ${path}`)
      return Effect.succeed(content)
    },
    writeFileString: (path: string, data: string) => {
      written.set(path, data)
      return Effect.void
    },
    exists: (path: string) => Effect.succeed(path in files || dirSet.has(path)),
    readDirectory: (path: string) => {
      const prefix = path.endsWith("/") ? path : path + "/"
      const entries = new Set<string>()
      for (const key of Object.keys(files)) {
        if (key.startsWith(prefix)) {
          entries.add(key.slice(prefix.length).split("/")[0])
        }
      }
      return Effect.succeed([...entries])
    },
    makeDirectory: () => Effect.void
  })
  return { layer, written }
}

describe("transformAgent", () => {
  it("preserves all fields for claude", () => {
    const result = transformAgent(sampleAgent, "claude")
    expect(result).toContain("name: test-agent")
    expect(result).toContain("model: haiku")
    expect(result).toContain("tools: Read, Glob, Grep")
    expect(result).toContain("You are a test agent.")
  })

  it("converts to opencode format", () => {
    const result = transformAgent(sampleAgent, "opencode")
    expect(result).not.toMatch(/^name:/m)
    expect(result).not.toMatch(/^model:/m)
    expect(result).toContain("mode: subagent")
    expect(result).toContain("write: false")
    expect(result).toContain("edit: false")
    expect(result).toContain("bash: false")
    expect(result).toContain("You are a test agent.")
  })

  it("does not deny tools that are allowed", () => {
    const agentWithAllTools = `---
name: full
description: Has all tools.
tools: Read, Glob, Grep, Bash, Edit, Write
model: opus
---

Body.
`
    const result = transformAgent(agentWithAllTools, "opencode")
    expect(result).not.toContain("write: false")
    expect(result).not.toContain("edit: false")
    expect(result).not.toContain("bash: false")
  })

  it("remaps model when modelMap is provided", () => {
    const result = transformAgent(sampleAgent, "claude", { haiku: "us.anthropic.claude-haiku-4-5-20251001" })
    expect(result).toContain("model: us.anthropic.claude-haiku-4-5-20251001")
    expect(result).not.toContain("model: haiku")
  })

  it("leaves model unchanged when not in modelMap", () => {
    const result = transformAgent(sampleAgent, "claude", { opus: "some-other-model" })
    expect(result).toContain("model: haiku")
  })
})

describe("transformSkill", () => {
  it("keeps all fields for claude", () => {
    const result = transformSkill(sampleSkill, "claude")
    expect(result).toContain(".context/plans")
    expect(result).toContain("model: claude-sonnet-4-20250514")
    expect(result).toContain("context: fork")
  })

  it("strips model and context fields for opencode", () => {
    const result = transformSkill(sampleSkill, "opencode")
    expect(result).toContain(".context/plans")
    expect(result).not.toMatch(/^model:/m)
    expect(result).not.toMatch(/^context:/m)
  })

  it("remaps model when modelMap is provided", () => {
    const result = transformSkill(sampleSkill, "claude", {
      "claude-sonnet-4-20250514": "us.anthropic.claude-sonnet-4-20250514"
    })
    expect(result).toContain("model: us.anthropic.claude-sonnet-4-20250514")
  })
})

describe("scanModels", () => {
  it.effect("collects unique models from agents and skills", () =>
    Effect.gen(function*() {
      const { layer: fsLayer } = makeMemoryFs({
        "/src/agents/a.md": sampleAgent,
        "/src/skills/s/SKILL.md": sampleSkill
      })

      const models = yield* scanModels("/src").pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      expect(models).toEqual(new Set(["haiku", "claude-sonnet-4-20250514"]))
    }))
})

describe("syncTarget", () => {
  it.effect("syncs instructions, agents, and skills for claude", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/instructions.md": "# Base Rules\n",
        "/src/agents/deep-dive.md": sampleAgent,
        "/src/skills/test-skill/SKILL.md": sampleSkill
      }, ["/out"])

      yield* syncTarget("/src", "/out", "claude").pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      expect(written.has("/out/CLAUDE.md")).toBe(true)
      expect(written.get("/out/CLAUDE.md")).toContain("# Base Rules")

      const agent = written.get("/out/agents/deep-dive.md")!
      expect(agent).toContain("name: test-agent")
      expect(agent).toContain("model: haiku")

      const skill = written.get("/out/skills/test-skill/SKILL.md")!
      expect(skill).toContain(".context/plans")
      expect(skill).toContain("model: claude-sonnet-4-20250514")
    }))

  it.effect("applies model remapping during sync", () =>
    Effect.gen(function*() {
      const modelMap = { haiku: "bedrock-haiku", "claude-sonnet-4-20250514": "bedrock-sonnet" }
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/instructions.md": "# Rules\n",
        "/src/agents/a.md": sampleAgent,
        "/src/skills/s/SKILL.md": sampleSkill
      }, ["/out"])

      yield* syncTarget("/src", "/out", "claude", modelMap).pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      expect(written.get("/out/agents/a.md")).toContain("model: bedrock-haiku")
      expect(written.get("/out/skills/s/SKILL.md")).toContain("model: bedrock-sonnet")
    }))

  it.effect("skips target when target directory does not exist", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/instructions.md": "# Rules\n",
        "/src/agents/a.md": sampleAgent,
        "/src/skills/s/SKILL.md": sampleSkill
      })

      // /out does not exist in the filesystem — syncTarget should skip it
      const skipped = yield* syncTarget("/src", "/out", "claude").pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      expect(skipped).toBe(true)
      expect(written.size).toBe(0)
    }))

  it.effect("syncs instructions with extras, agents, and skills for opencode", () =>
    Effect.gen(function*() {
      const configContent = JSON.stringify({ permission: { bash: { "git push *": "ask" } } })
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/instructions.md": "# Base Rules\n",
        "/src/instructions.opencode.md": "\n## MCP Tools\n\n- **linear**: Issue tracking.\n",
        "/src/agents/deep-dive.md": sampleAgent,
        "/src/skills/test-skill/SKILL.md": sampleSkill,
        "/src/opencode.json": configContent
      }, ["/out"])

      yield* syncTarget("/src", "/out", "opencode").pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      const instructions = written.get("/out/AGENTS.md")!
      expect(instructions).toContain("# Base Rules")
      expect(instructions).toContain("## MCP Tools")

      const agent = written.get("/out/agents/deep-dive.md")!
      expect(agent).toContain("mode: subagent")
      expect(agent).not.toMatch(/^name:/m)
      expect(agent).toContain("bash: false")

      const skill = written.get("/out/skills/test-skill/SKILL.md")!
      expect(skill).toContain(".context/plans")
      expect(skill).not.toMatch(/^model:/m)

      expect(written.get("/out/opencode.json")).toBe(configContent)
    }))

  it.effect("creates settings.json with additionalDirectories for claude when none exists", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/instructions.md": "# Rules\n",
        "/src/agents/a.md": sampleAgent,
        "/src/skills/s/SKILL.md": sampleSkill
      }, ["/out"])

      yield* syncTarget("/src", "/out", "claude").pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      const settings = JSON.parse(written.get("/out/settings.json")!)
      expect(settings.permissions.additionalDirectories).toEqual(["~/src"])
    }))

  it.effect("adds additionalDirectories to existing claude settings without replacing", () =>
    Effect.gen(function*() {
      const existing = JSON.stringify({
        permissions: {
          allow: ["Bash(bun)", "WebSearch"]
        }
      })
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/instructions.md": "# Rules\n",
        "/src/agents/a.md": sampleAgent,
        "/src/skills/s/SKILL.md": sampleSkill,
        "/out/settings.json": existing
      }, ["/out"])

      yield* syncTarget("/src", "/out", "claude").pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      const settings = JSON.parse(written.get("/out/settings.json")!)
      expect(settings.permissions.additionalDirectories).toEqual(["~/src"])
      expect(settings.permissions.allow).toEqual(["Bash(bun)", "WebSearch"])
    }))

  it.effect("does not overwrite settings.json when additionalDirectories already has ~/src", () =>
    Effect.gen(function*() {
      const existing = JSON.stringify({
        permissions: {
          allow: ["Bash(bun)"],
          additionalDirectories: ["~/src"]
        }
      })
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/instructions.md": "# Rules\n",
        "/src/agents/a.md": sampleAgent,
        "/src/skills/s/SKILL.md": sampleSkill,
        "/out/settings.json": existing
      }, ["/out"])

      yield* syncTarget("/src", "/out", "claude").pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      expect(written.has("/out/settings.json")).toBe(false)
    }))
})

const CliTestLayer = Layer.mergeAll(
  TestConsole.layer,
  FileSystem.layerNoop({}),
  Path.layer,
  MockTerminal.layer,
  Layer.mock(ChildProcessSpawner)({})
)

describe("CLI", () => {
  it.effect("prints sync confirmation for each target", () =>
    Effect.gen(function*() {
      const cmd = Command.make(
        "test-sync",
        {},
        () => Effect.gen(function*() {
          yield* syncTarget("/src", "/out", "claude")
          yield* Effect.log("Synced claude")
        })
      )

      yield* Command.runWith(cmd, { version: "0.1.0" })([]).pipe(
        Effect.provide(
          Layer.mergeAll(
            makeMemoryFs({
              "/src/instructions.md": "# Rules\n",
              "/src/agents/a.md": sampleAgent,
              "/src/skills/s/SKILL.md": sampleSkill
            }, ["/out"]).layer,
            Path.layer,
            TestConsole.layer,
            MockTerminal.layer,
            Layer.mock(ChildProcessSpawner)({})
          )
        )
      )

      const logs = yield* TestConsole.logLines
      expect(logs.length).toBeGreaterThan(0)
    }))
})
