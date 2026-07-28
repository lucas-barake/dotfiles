import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path } from "effect"
import { stripFrontmatter, transformAgent } from "../src/transform.ts"
import { deepMerge, loadProjectSettings, run, scanModels, syncConfig, syncProject, syncTarget } from "../src/main.ts"

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

const makeMemoryFs = (
  files: Record<string, string>,
  dirs: ReadonlyArray<string> = [],
  failingWrites: ReadonlySet<string> = new Set()
) => {
  const dirSet = new Set(dirs)
  const written = new Map<string, string>()
  const removed = new Set<string>()
  const hasImplicitEntry = (path: string) => {
    const prefix = path.endsWith("/") ? path : path + "/"
    for (const key of [...Object.keys(files), ...written.keys()]) {
      if (!removed.has(key) && key.startsWith(prefix)) return true
    }
    return false
  }
  const layer = FileSystem.layerNoop({
    readFileString: (path: string) => {
      const content = written.get(path) ?? files[path]
      if (content === undefined) return Effect.die(`Unexpected read: ${path}`)
      return Effect.succeed(content)
    },
    writeFileString: (path: string, data: string) => {
      if (failingWrites.has(path)) return Effect.die(`Expected write failure: ${path}`)
      written.set(path, data)
      removed.delete(path)
      return Effect.void
    },
    copyFile: (fromPath: string, toPath: string) => {
      const content = written.get(fromPath) ?? files[fromPath]
      if (content === undefined) return Effect.die(`Unexpected copy: ${fromPath}`)
      written.set(toPath, content)
      removed.delete(toPath)
      return Effect.void
    },
    exists: (path: string) => {
      const exists = ((path in files) || written.has(path) || dirSet.has(path) || hasImplicitEntry(path)) && !removed.has(path)
      return Effect.succeed(exists)
    },
    readDirectory: (path: string) => {
      const prefix = path.endsWith("/") ? path : path + "/"
      const entries = new Set<string>()
      for (const key of [...Object.keys(files), ...written.keys()]) {
        if (!removed.has(key) && key.startsWith(prefix)) {
          entries.add(key.slice(prefix.length).split("/")[0])
        }
      }
      return Effect.succeed([...entries])
    },
    makeDirectory: (path: string) => {
      dirSet.add(path)
      return Effect.void
    },
    remove: (path: string) => {
      removed.add(path)
      written.delete(path)
      return Effect.void
    }
  })
  return { layer, written, removed }
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

  it("keeps claude-style fields for kimi but drops model", () => {
    const result = transformAgent(sampleAgent, "kimi")
    expect(result).toContain("name: test-agent")
    expect(result).toContain("description: A test agent for verification.")
    expect(result).toContain("tools: Read, Glob, Grep")
    expect(result).not.toMatch(/^model:/m)
    expect(result).toContain("You are a test agent.")
  })

  it("remaps model when modelMap is provided", () => {
    const result = transformAgent(sampleAgent, "claude", { haiku: "us.anthropic.claude-haiku-4-5-20251001" })
    expect(result).toContain("model: us.anthropic.claude-haiku-4-5-20251001")
    expect(result).not.toContain("model: haiku")
  })
})

describe("stripFrontmatter", () => {
  it("removes frontmatter and keeps the body", () => {
    const result = stripFrontmatter(sampleSkill)
    expect(result).toContain("# Test Skill")
    expect(result).toContain(".context/plans")
    expect(result).not.toMatch(/^name:/m)
    expect(result).not.toMatch(/^model:/m)
  })
})

describe("scanModels", () => {
  it.effect("collects unique models from agents only", () =>
    Effect.gen(function*() {
      const { layer: fsLayer } = makeMemoryFs({
        "/src/agents/a.md": sampleAgent,
        "/src/project-skills/s.md": sampleSkill
      })

      const models = yield* scanModels("/src").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))
      expect(models).toEqual(new Set(["haiku"]))
    }))
})

describe("deepMerge", () => {
  it("adds missing keys and merges arrays", () => {
    const target = { permissions: { allow: ["a"] } }
    expect(deepMerge(target, { permissions: { allow: ["b"], extra: true } })).toBe(true)
    expect(target).toEqual({ permissions: { allow: ["a", "b"], extra: true } })
  })

  it("does not overwrite existing primitive keys", () => {
    const target = { a: 1 }
    expect(deepMerge(target, { a: 2 })).toBe(false)
    expect(target).toEqual({ a: 1 })
  })
})

describe("loadProjectSettings", () => {
  it.effect("defaults to all skills when settings do not exist", () =>
    Effect.gen(function*() {
      const { layer: fsLayer } = makeMemoryFs({}, ["/project"])

      const settings = yield* loadProjectSettings("/project", ["a.md", "b.md"]).pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      expect(settings).toEqual({ skills: ["a.md", "b.md"] })
    }))

  it.effect("filters unknown stored skills", () =>
    Effect.gen(function*() {
      const { layer: fsLayer } = makeMemoryFs({
        "/project/.context/settings.json": JSON.stringify({ skills: ["a.md", "missing.md"] })
      }, ["/project", "/project/.context"])

      const settings = yield* loadProjectSettings("/project", ["a.md", "b.md"]).pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      expect(settings).toEqual({ skills: ["a.md"] })
    }))
})

describe("syncProject", () => {
  it.effect("writes selected skills, updates AGENTS, and stores settings", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/project-skills/test-skill.md": sampleSkill,
        "/src/project-skills/second-skill.md": sampleSkill.replace("test-skill", "second-skill")
      }, ["/project"])

      const synced = yield* syncProject("/src", "/project", ["test-skill.md"]).pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      expect(synced).toEqual(["test-skill.md"])
      expect(written.get("/project/.context/skills/test-skill.md")).toContain("# Test Skill")
      expect(written.get("/project/.context/settings.json")).toBe('{"skills":["test-skill.md"]}')

      const agents = written.get("/project/AGENTS.md")!
      expect(agents).toContain("<!-- dotai skills table start -->")
      expect(agents).toContain("`./.context/skills/test-skill.md`")
      expect(agents).not.toContain("second-skill.md")
    }))

  it.effect("removes deselected managed skill files", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, removed } = makeMemoryFs({
        "/src/project-skills/test-skill.md": sampleSkill,
        "/project/.context/skills/test-skill.md": "old"
      }, ["/project", "/project/.context", "/project/.context/skills"])

      yield* syncProject("/src", "/project", []).pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(removed.has("/project/.context/skills/test-skill.md")).toBe(true)
    }))

  it.effect("replaces an existing managed AGENTS section and preserves surrounding content", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/project-skills/test-skill.md": sampleSkill,
        "/project/AGENTS.md": [
          "# Project Notes",
          "",
          "<!-- dotai skills table start -->",
          "old",
          "<!-- dotai skills table end -->",
          "",
          "Keep this"
        ].join("\n")
      }, ["/project"])

      yield* syncProject("/src", "/project", ["test-skill.md"]).pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      const agents = written.get("/project/AGENTS.md")!
      expect(agents).toContain("# Project Notes")
      expect(agents).toContain("Keep this")
      expect(agents).not.toContain("\nold\n")
      expect(agents).toContain("`./.context/skills/test-skill.md`")
    }))
})

describe("syncTarget", () => {
  it.effect("syncs agent files for claude", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/agents/deep-dive.md": sampleAgent,
        "/src/global-skills/ship.md": sampleSkill
      }, ["/out"])

      const skipped = yield* syncTarget("/src", "/out", "claude").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(skipped).toBe(false)
      expect(written.get("/out/agents/deep-dive.md")).toContain("name: test-agent")
      expect(written.get("/out/skills/ship/SKILL.md")).toContain("model: claude-sonnet-4-20250514")
    }))

  it.effect("removes retired claude agents and renamed global skills", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, removed } = makeMemoryFs({
        "/src/agents/deep-dive.md": sampleAgent,
        "/src/global-skills/change-audit.md": sampleSkill,
        "/out/agents/reviewer-logic.md": "stale",
        "/out/skills/deep-review/SKILL.md": "stale"
      }, ["/out"])

      yield* syncTarget("/src", "/out", "claude").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(removed.has("/out/agents/reviewer-logic.md")).toBe(true)
      expect(removed.has("/out/skills/deep-review")).toBe(true)
    }))

  it.effect("applies model remapping during agent sync", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/agents/a.md": sampleAgent,
        "/src/global-skills/ship.md": sampleSkill
      }, ["/out"])

      yield* syncTarget("/src", "/out", "claude", {
        haiku: "bedrock-haiku",
        "claude-sonnet-4-20250514": "bedrock-sonnet"
      }).pipe(
        Effect.provide(Layer.mergeAll(fsLayer, Path.layer))
      )

      expect(written.get("/out/agents/a.md")).toContain("model: bedrock-haiku")
      expect(written.get("/out/skills/ship/SKILL.md")).toContain("model: bedrock-sonnet")
    }))

  it.effect("skips target when target directory does not exist", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/agents/a.md": sampleAgent
      })

      const skipped = yield* syncTarget("/src", "/out", "claude").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(skipped).toBe(true)
      expect(written.size).toBe(0)
    }))

  it.effect("syncs global skills even when there are no agents", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/global-skills/ship.md": sampleSkill
      }, ["/out"])

      const skipped = yield* syncTarget("/src", "/out", "claude").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(skipped).toBe(false)
      expect(written.get("/out/skills/ship/SKILL.md")).toContain("# Test Skill")
    }))

  it.effect("writes global instructions to CLAUDE.md for claude", () =>
    Effect.gen(function*() {
      const instructions = `# Base Rules

Use the canonical instructions.
`
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/agents/deep-dive.md": sampleAgent,
        "/src/instructions.codex.md": "# Codex Rules\n",
        "/src/instructions.md": instructions
      }, ["/out"])

      yield* syncTarget("/src", "/out", "claude").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(written.get("/out/CLAUDE.md")).toBe(instructions)
    }))

  it.effect("syncs agent files for opencode", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/agents/deep-dive.md": sampleAgent,
        "/src/global-skills/ship.md": sampleSkill,
        "/src/instructions.codex.md": "# Codex Rules\n",
        "/src/instructions.md": "# Base Rules\n"
      }, ["/out"])

      yield* syncTarget("/src", "/out", "opencode").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      const agent = written.get("/out/agents/deep-dive.md")!
      expect(agent).toContain("mode: subagent")
      expect(agent).not.toMatch(/^name:/m)
      expect(agent).toContain("bash: false")
      expect(written.get("/out/skills/ship/SKILL.md")).not.toContain("model:")
      expect(written.has("/out/CLAUDE.md")).toBe(false)
      expect(written.has("/out/AGENTS.md")).toBe(false)
    }))

  it.effect("removes retired opencode agents", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, removed } = makeMemoryFs({
        "/src/agents/deep-dive.md": sampleAgent,
        "/out/agents/reviewer-behavioral.md": "stale"
      }, ["/out"])

      yield* syncTarget("/src", "/out", "opencode").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(removed.has("/out/agents/reviewer-behavioral.md")).toBe(true)
    }))

  it.effect("syncs codex agent files and config entries", () =>
    Effect.gen(function*() {
      const codexInstructions = `# Codex Rules

Run independent tool calls concurrently.
`
      const instructions = `# Base Rules

Use the canonical Codex instructions.
`
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/agents/deep-dive.md": sampleAgent,
        "/src/global-skills/ship.md": sampleSkill,
        "/src/instructions.codex.md": codexInstructions,
        "/src/instructions.md": instructions
      }, ["/out"])

      yield* syncTarget("/src", "/out", "codex").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(written.get("/out/agents/deep-dive.toml")).toContain("developer_instructions")
      expect(written.get("/out/config.toml")).toContain("[agents.deep-dive]")
      expect(written.get("/out/AGENTS.md")).toBe(`${codexInstructions.trim()}\n\n${instructions}`)
      expect(written.get("/out/skills/ship/SKILL.md")).not.toContain("model:")
    }))

  it.effect("removes retired codex agents and preserves unmanaged config", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written, removed } = makeMemoryFs({
        "/src/agents/deep-dive.md": sampleAgent,
        "/out/agents/effect-reviewer.toml": "stale",
        "/out/config.toml": [
          "approval_policy = \"never\"",
          "",
          "# --- dotai agents start ---",
          "[agents.effect-reviewer]",
          "config_file = \"agents/effect-reviewer.toml\"",
          "# --- dotai agents end ---",
          ""
        ].join("\n")
      }, ["/out"])

      yield* syncTarget("/src", "/out", "codex").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(removed.has("/out/agents/effect-reviewer.toml")).toBe(true)
      expect(written.get("/out/config.toml")).toContain("approval_policy = \"never\"")
      expect(written.get("/out/config.toml")).not.toContain("[agents.effect-reviewer]")
    }))

  it.effect("preserves retired resources when a codex sync fails before registration", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, removed } = makeMemoryFs({
        "/src/agents/retained.md": sampleAgent,
        "/src/global-skills/change-audit.md": sampleSkill,
        "/out/agents/effect-reviewer.toml": "stale",
        "/out/skills/deep-review/SKILL.md": "stale",
        "/out/config.toml": [
          "# --- dotai agents start ---",
          "[agents.effect-reviewer]",
          'config_file = "agents/effect-reviewer.toml"',
          "# --- dotai agents end ---",
          ""
        ].join("\n")
      }, ["/out"], new Set(["/out/agents/retained.toml"]))

      const exit = yield* Effect.exit(
        syncTarget("/src", "/out", "codex").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))
      )

      expect(exit._tag).toBe("Failure")
      expect(removed.has("/out/agents/effect-reviewer.toml")).toBe(false)
      expect(removed.has("/out/skills/deep-review")).toBe(false)
    }))

  it.effect("copies shared instructions unchanged when codex instructions are absent", () =>
    Effect.gen(function*() {
      const instructions = "# Base Rules\n"
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/agents/deep-dive.md": sampleAgent,
        "/src/instructions.md": instructions
      }, ["/out"])

      yield* syncTarget("/src", "/out", "codex").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(written.get("/out/AGENTS.md")).toBe(instructions)
    }))

  it.effect("copies shared instructions unchanged when codex instructions are blank", () =>
    Effect.gen(function*() {
      const instructions = "\n# Base Rules\n\n"
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/agents/deep-dive.md": sampleAgent,
        "/src/instructions.codex.md": " \n\t",
        "/src/instructions.md": instructions
      }, ["/out"])

      yield* syncTarget("/src", "/out", "codex").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(written.get("/out/AGENTS.md")).toBe(instructions)
    }))

  it.effect("syncs kimi agents, skills, and global instructions", () =>
    Effect.gen(function*() {
      const instructions = `# Base Rules

Use the canonical global instructions.
`
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/agents/deep-dive.md": sampleAgent,
        "/src/global-skills/planning.md": sampleSkill,
        "/src/instructions.md": instructions
      }, ["/out"])

      const skipped = yield* syncTarget("/src", "/out", "kimi").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(skipped).toBe(false)
      const agent = written.get("/out/agents/deep-dive.md")!
      expect(agent).toContain("name: test-agent")
      expect(agent).toContain("tools: Read, Glob, Grep")
      expect(agent).not.toMatch(/^model:/m)
      expect(written.get("/out/skills/planning/SKILL.md")).toContain("name: test-skill")
      expect(written.get("/out/skills/planning/SKILL.md")).not.toContain("model:")
      expect(written.get("/out/AGENTS.md")).toBe(instructions)
    }))
})

describe("syncConfig", () => {
  it.effect("copies opencode config verbatim", () =>
    Effect.gen(function*() {
      const canonical = JSON.stringify({ permission: { read: "allow" } })
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/opencode.json": canonical
      }, ["/out"])

      const skipped = yield* syncConfig("/src", "/out", "opencode").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(skipped).toBe(false)
      expect(JSON.parse(written.get("/out/opencode.json")!)).toEqual(JSON.parse(canonical))
    }))

  it.effect("merges claude config into existing settings", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/claude.json": JSON.stringify({ permissions: { additionalDirectories: ["~/src"] } }),
        "/out/settings.json": JSON.stringify({ permissions: { allow: ["Bash(bun)"] } })
      }, ["/out"])

      yield* syncConfig("/src", "/out", "claude").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(JSON.parse(written.get("/out/settings.json")!)).toEqual({
        permissions: {
          allow: ["Bash(bun)"],
          additionalDirectories: ["~/src"]
        }
      })
    }))

  it.effect("skips config sync when target directory does not exist", () =>
    Effect.gen(function*() {
      const { layer: fsLayer, written } = makeMemoryFs({
        "/src/opencode.json": JSON.stringify({ permission: { read: "allow" } })
      })

      const skipped = yield* syncConfig("/src", "/out", "opencode").pipe(Effect.provide(Layer.mergeAll(fsLayer, Path.layer)))

      expect(skipped).toBe(true)
      expect(written.size).toBe(0)
    }))
})

describe("CLI", () => {
  it("exports a runnable CLI", () => {
    expect(run).toBeDefined()
  })
})
