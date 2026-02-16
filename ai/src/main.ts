import { realpathSync } from "node:fs"
import { dirname } from "node:path"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { parseFrontmatter, transformAgent, transformSkill, type Target } from "./transform.ts"

const configFiles: Partial<Record<Target, string>> = {
  opencode: "opencode.json"
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
      const configPath = p.join(sourceDir, configFile)
      if (yield* fs.exists(configPath)) {
        yield* fs.writeFileString(p.join(targetDir, configFile), yield* fs.readFileString(configPath))
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
