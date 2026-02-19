import { realpathSync } from "node:fs"
import { dirname } from "node:path"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { parseFrontmatter, transformAgent, transformSkill, type Target } from "./transform.ts"

const configFiles: Partial<Record<Target, { source: string; target: string; merge: boolean }>> = {
  opencode: { source: "opencode.json", target: "opencode.json", merge: false },
  claude: { source: "claude.json", target: "settings.json", merge: true }
}

const targetPaths: Record<Target, string> = {
  claude: `${process.env.HOME}/.claude`,
  opencode: `${process.env.HOME}/.config/opencode`
}

const instructionsFileName: Record<Target, string> = {
  claude: "CLAUDE.md",
  opencode: "AGENTS.md"
}

const readModelMap = (home: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const mapperPath = p.join(home, "model-mapper.json")
    if (!(yield* fs.exists(mapperPath))) return undefined
    return JSON.parse(yield* fs.readFileString(mapperPath)) as Record<string, string>
  })

export const scanModels = (sourceDir: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const models = new Set<string>()

    const agentFiles = yield* fs.readDirectory(p.join(sourceDir, "agents"))
    yield* Effect.forEach(
      agentFiles.filter((f) => f.endsWith(".md")),
      (file) =>
        Effect.gen(function*() {
          const content = yield* fs.readFileString(p.join(sourceDir, "agents", file))
          const { fields } = parseFrontmatter(content)
          const model = fields.find(([k]) => k === "model")?.[1]
          if (model) models.add(model)
        }),
      { concurrency: "unbounded" }
    )

    const skillDirs = yield* fs.readDirectory(p.join(sourceDir, "skills"))
    yield* Effect.forEach(
      skillDirs,
      (dir) =>
        Effect.gen(function*() {
          const skillPath = p.join(sourceDir, "skills", dir, "SKILL.md")
          if (!(yield* fs.exists(skillPath))) return
          const content = yield* fs.readFileString(skillPath)
          const { fields } = parseFrontmatter(content)
          const model = fields.find(([k]) => k === "model")?.[1]
          if (model) models.add(model)
        }),
      { concurrency: "unbounded" }
    )

    return models
  })

export const deepMerge = (target: Record<string, any>, source: Record<string, any>): boolean => {
  let changed = false
  for (const key of Object.keys(source)) {
    if (Array.isArray(source[key]) && Array.isArray(target[key])) {
      const merged = [...new Set([...target[key], ...source[key]])]
      if (merged.length !== target[key].length) {
        target[key] = merged
        changed = true
      }
    } else if (
      typeof source[key] === "object" && source[key] !== null &&
      typeof target[key] === "object" && target[key] !== null &&
      !Array.isArray(source[key])
    ) {
      if (deepMerge(target[key], source[key])) changed = true
    } else if (!(key in target)) {
      target[key] = source[key]
      changed = true
    }
  }
  return changed
}

export const syncTarget = (sourceDir: string, targetDir: string, target: Target, modelMap?: Record<string, string>) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path

    if (!(yield* fs.exists(targetDir))) return true

    const base = yield* fs.readFileString(p.join(sourceDir, "instructions.md"))
    const extrasPath = p.join(sourceDir, `instructions.${target}.md`)
    const extras = (yield* fs.exists(extrasPath)) ? yield* fs.readFileString(extrasPath) : ""
    const instructions = extras ? `${base}\n${extras}` : base
    yield* fs.writeFileString(p.join(targetDir, instructionsFileName[target]), instructions)

    yield* fs.makeDirectory(p.join(targetDir, "agents"), { recursive: true })
    const agentFiles = yield* fs.readDirectory(p.join(sourceDir, "agents"))
    yield* Effect.forEach(
      agentFiles.filter((f) => f.endsWith(".md")),
      (file) =>
        Effect.gen(function*() {
          const content = yield* fs.readFileString(p.join(sourceDir, "agents", file))
          yield* fs.writeFileString(p.join(targetDir, "agents", file), transformAgent(content, target, modelMap))
        }),
      { concurrency: "unbounded" }
    )

    const skillDirs = yield* fs.readDirectory(p.join(sourceDir, "skills"))
    yield* Effect.forEach(
      skillDirs,
      (dir) =>
        Effect.gen(function*() {
          const skillPath = p.join(sourceDir, "skills", dir, "SKILL.md")
          if (!(yield* fs.exists(skillPath))) return
          const content = yield* fs.readFileString(skillPath)
          yield* fs.makeDirectory(p.join(targetDir, "skills", dir), { recursive: true })
          yield* fs.writeFileString(p.join(targetDir, "skills", dir, "SKILL.md"), transformSkill(content, target, modelMap))
        }),
      { concurrency: "unbounded" }
    )

    const configFile = configFiles[target]
    if (configFile) {
      const configPath = p.join(sourceDir, configFile.source)
      if (!(yield* fs.exists(configPath))) return
      const canonical = JSON.parse(yield* fs.readFileString(configPath))
      const destPath = p.join(targetDir, configFile.target)

      if (!configFile.merge) {
        yield* fs.writeFileString(destPath, JSON.stringify(canonical, null, 2) + "\n")
        return
      }

      const existing: Record<string, any> = (yield* fs.exists(destPath))
        ? JSON.parse(yield* fs.readFileString(destPath))
        : {}
      if (deepMerge(existing, canonical)) {
        yield* fs.writeFileString(destPath, JSON.stringify(existing, null, 2) + "\n")
      }
    }
  })

const sync = Command.make(
  "sync",
  {
    target: Flag.choice("target", ["claude", "opencode", "all"]).pipe(
      Flag.withDefault("all" as const),
      Flag.withDescription("Target to sync: claude, opencode, or all")
    ),
    home: Flag.directory("home").pipe(
      Flag.withDefault(dirname(dirname(realpathSync(process.execPath)))),
      Flag.withDescription("Path to the dotai repo (resolved from binary location)")
    )
  },
  ({ target, home }) =>
    Effect.gen(function*() {
      const modelMap = yield* readModelMap(home)
      const targets: ReadonlyArray<Target> = target === "all" ? ["claude", "opencode"] : [target]
      for (const t of targets) {
        const skipped = yield* syncTarget(`${home}/canonical`, targetPaths[t], t, modelMap)
        yield* Console.log(skipped ? `Skipped ${t} (directory not found)` : `Synced ${t}`)
      }
    })
)

const models = Command.make(
  "models",
  {
    home: Flag.directory("home").pipe(
      Flag.withDefault(dirname(dirname(realpathSync(process.execPath)))),
      Flag.withDescription("Path to the dotai repo")
    )
  },
  ({ home }) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const p = yield* Path.Path
      const mapperPath = p.join(home, "model-mapper.json")

      const found = yield* scanModels(`${home}/canonical`)
      const existing = (yield* fs.exists(mapperPath))
        ? JSON.parse(yield* fs.readFileString(mapperPath)) as Record<string, string>
        : {}

      const merged: Record<string, string> = {}
      for (const model of [...found].sort()) {
        merged[model] = existing[model] ?? model
      }

      yield* fs.writeFileString(mapperPath, JSON.stringify(merged, null, 2) + "\n")
      yield* Console.log(`Wrote ${mapperPath} with ${Object.keys(merged).length} model(s)`)
    })
)

const cli = Command.make("dotai").pipe(Command.withSubcommands([sync, models]))

export const run = Command.run(cli, { version: "0.1.0" })
