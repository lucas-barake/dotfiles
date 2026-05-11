import { realpathSync } from "node:fs"
import { dirname } from "node:path"
import { Schema } from "effect"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as Prompt from "effect/unstable/cli/Prompt"
import { agentToToml, parseFrontmatter, stripFrontmatter, transformAgent, transformSkill, type Target } from "./transform.ts"

const targetPaths: Record<Target, string> = {
  claude: `${process.env.HOME}/.claude`,
  opencode: `${process.env.HOME}/.config/opencode`,
  codex: `${process.env.HOME}/.codex`
}

const configFiles: Partial<Record<Target, { source: string; target: string; merge: boolean }>> = {
  claude: { source: "claude.json", target: "settings.json", merge: true },
  opencode: { source: "opencode.json", target: "opencode.json", merge: false }
}

const ProjectSettings = Schema.Struct({
  skills: Schema.Array(Schema.String)
})

const ProjectSettingsFile = Schema.fromJsonString(ProjectSettings)

const CODEX_AGENTS_START = "# --- dotai agents start ---"
const CODEX_AGENTS_END = "# --- dotai agents end ---"
const PROJECT_SKILLS_START = "<!-- dotai skills table start -->"
const PROJECT_SKILLS_END = "<!-- dotai skills table end -->"

const readModelMap = (home: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const mapperPath = p.join(home, "model-mapper.json")
    if (!(yield* fs.exists(mapperPath))) return undefined
    return JSON.parse(yield* fs.readFileString(mapperPath)) as Record<string, string>
  })

const readCanonicalSkills = (sourceDir: string, kind: "global-skills" | "project-skills") =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const skillsDir = p.join(sourceDir, kind)
    if (!(yield* fs.exists(skillsDir))) return [] as Array<{ content: string; description: string; fileName: string }>
    const entries = yield* fs.readDirectory(skillsDir)

    const skills = yield* Effect.forEach(
      entries.filter((entry) => entry.endsWith(".md")),
      (fileName) =>
        Effect.gen(function*() {
          const content = yield* fs.readFileString(p.join(skillsDir, fileName))
          const { fields } = parseFrontmatter(content)
          const description = fields.find(([key]) => key === "description")?.[1] ?? ""
          return { content, description, fileName }
        }),
      { concurrency: "unbounded" }
    )

    return skills.sort((left, right) => left.fileName.localeCompare(right.fileName))
  })

export const scanModels = (sourceDir: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const models = new Set<string>()
    const agentFiles = yield* fs.readDirectory(p.join(sourceDir, "agents"))

    yield* Effect.forEach(
      agentFiles.filter((file) => file.endsWith(".md")),
      (file) =>
        Effect.gen(function*() {
          const content = yield* fs.readFileString(p.join(sourceDir, "agents", file))
          const { fields } = parseFrontmatter(content)
          const model = fields.find(([key]) => key === "model")?.[1]
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
      continue
    }

    if (
      typeof source[key] === "object" && source[key] !== null &&
      typeof target[key] === "object" && target[key] !== null &&
      !Array.isArray(source[key])
    ) {
      if (deepMerge(target[key], source[key])) changed = true
      continue
    }

    if (!(key in target)) {
      target[key] = source[key]
      changed = true
    }
  }
  return changed
}

const escapeTomlString = (value: string) => JSON.stringify(value)

const replaceManagedBlock = (existing: string, startMarker: string, endMarker: string, block: string) => {
  const startIndex = existing.indexOf(startMarker)
  const endIndex = existing.indexOf(endMarker)

  if (startIndex >= 0 && endIndex > startIndex) {
    const before = existing.slice(0, startIndex).trimEnd()
    const after = existing.slice(endIndex + endMarker.length).trimStart()
    const prefix = before.length > 0 ? `${before}\n\n` : ""
    const suffix = after.length > 0 ? `\n\n${after}` : "\n"
    return `${prefix}${block}${suffix}`
  }

  return existing.trim().length > 0 ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`
}

const renderSkillsSection = (skills: ReadonlyArray<{ fileName: string; description: string }>) => {
  if (skills.length === 0) {
    return [
      PROJECT_SKILLS_START,
      "## Skills",
      "",
      "Read the relevant skills for the current task.",
      "",
      "No skills selected.",
      PROJECT_SKILLS_END
    ].join("\n")
  }

  const rows = skills
    .map((skill) => `| \`./.context/skills/${skill.fileName}\` | ${skill.description.replace(/\|/g, "\\|")} |`)
    .join("\n")

  return [
    PROJECT_SKILLS_START,
    "## Skills",
    "",
    "Read the relevant skills for the current task.",
    "",
    "| Skill path | Description |",
    "| --- | --- |",
    rows,
    PROJECT_SKILLS_END
  ].join("\n")
}

const syncProviderSkills = (
  sourceDir: string,
  targetDir: string,
  target: Target,
  modelMap?: Record<string, string>
) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const skillsDir = p.join(targetDir, "skills")
    const globalSkills = yield* readCanonicalSkills(sourceDir, "global-skills")

    yield* fs.makeDirectory(skillsDir, { recursive: true })
    yield* Effect.forEach(
      globalSkills,
      (skill) =>
        Effect.gen(function*() {
          const skillName = skill.fileName.replace(/\.md$/, "")
          yield* fs.remove(p.join(skillsDir, skill.fileName), { force: true })
          const targetSkillDir = p.join(skillsDir, skillName)
          yield* fs.makeDirectory(targetSkillDir, { recursive: true })
          yield* fs.writeFileString(
            p.join(targetSkillDir, "SKILL.md"),
            transformSkill(skill.content, target, modelMap)
          )
        }),
      { concurrency: "unbounded" }
    )
  })

const syncCodexInstructions = (sourceDir: string, targetDir: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const sourcePath = p.join(sourceDir, "instructions.md")

    if (!(yield* fs.exists(sourcePath))) return

    yield* fs.writeFileString(p.join(targetDir, "AGENTS.md"), yield* fs.readFileString(sourcePath))
  })

const mergeCodexConfig = (targetDir: string, agents: Array<{ name: string; description: string }>) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const configPath = p.join(targetDir, "config.toml")
    const existing = (yield* fs.exists(configPath)) ? yield* fs.readFileString(configPath) : ""
    const block = [
      CODEX_AGENTS_START,
      agents
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((agent) => {
          return [
            `[agents.${agent.name}]`,
            `description = ${escapeTomlString(agent.description)}`,
            `config_file = "agents/${agent.name}.toml"`
          ].join("\n")
        })
        .join("\n\n"),
      CODEX_AGENTS_END
    ].join("\n")

    yield* fs.writeFileString(configPath, replaceManagedBlock(existing, CODEX_AGENTS_START, CODEX_AGENTS_END, block))
  })

export const loadProjectSettings = (projectDir: string, availableSkills: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const settingsPath = p.join(projectDir, ".context", "settings.json")
    const defaultSettings = { skills: [...availableSkills] }

    if (!(yield* fs.exists(settingsPath))) return defaultSettings

    const content = yield* fs.readFileString(settingsPath)
    return yield* Effect.try({
      try: () => {
        const decoded = Schema.decodeUnknownSync(ProjectSettingsFile)(content)
        const available = new Set(availableSkills)
        return {
          skills: decoded.skills.filter((skill) => available.has(skill))
        }
      },
      catch: () => defaultSettings
    })
  })

const writeProjectSettings = (projectDir: string, skills: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const contextDir = p.join(projectDir, ".context")
    yield* fs.makeDirectory(contextDir, { recursive: true })
    yield* fs.writeFileString(
      p.join(contextDir, "settings.json"),
      Schema.encodeUnknownSync(ProjectSettingsFile)({ skills: [...skills] })
    )
  })

const promptForSkills = (
  skills: ReadonlyArray<{ fileName: string; description: string }>,
  selectedSkills: ReadonlyArray<string>
) =>
  Prompt.run(
    Prompt.multiSelect({
      message: "Select project skills",
      choices: skills.map((skill) => ({
        title: skill.fileName.replace(/\.md$/, ""),
        value: skill.fileName,
        description: skill.description,
        selected: selectedSkills.includes(skill.fileName)
      }))
    })
  )

export const syncProject = (sourceDir: string, projectDir: string, selectedSkills: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const skills = yield* readCanonicalSkills(sourceDir, "project-skills")
    const selected = new Set(selectedSkills)
    const selectedEntries = skills.filter((skill) => selected.has(skill.fileName))
    const skillsDir = p.join(projectDir, ".context", "skills")
    const agentsPath = p.join(projectDir, "AGENTS.md")
    const existingAgents = (yield* fs.exists(agentsPath)) ? yield* fs.readFileString(agentsPath) : ""

    yield* fs.makeDirectory(skillsDir, { recursive: true })
    yield* writeProjectSettings(projectDir, selectedEntries.map((skill) => skill.fileName))

    yield* Effect.forEach(
      skills,
      (skill) => {
        const filePath = p.join(skillsDir, skill.fileName)
        return selected.has(skill.fileName)
          ? fs.writeFileString(filePath, stripFrontmatter(skill.content))
          : fs.remove(filePath, { force: true })
      },
      { concurrency: "unbounded" }
    )

    yield* fs.writeFileString(
      agentsPath,
      replaceManagedBlock(existingAgents, PROJECT_SKILLS_START, PROJECT_SKILLS_END, renderSkillsSection(selectedEntries))
    )

    return selectedEntries.map((skill) => skill.fileName)
  })

export const syncTarget = (sourceDir: string, targetDir: string, target: Target, modelMap?: Record<string, string>) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path

    if (!(yield* fs.exists(targetDir))) return true

    const agentFiles = yield* fs.readDirectory(p.join(sourceDir, "agents"))
    if (target === "codex") {
      yield* fs.makeDirectory(p.join(targetDir, "agents"), { recursive: true })
      yield* syncProviderSkills(sourceDir, targetDir, target, modelMap)
      yield* syncCodexInstructions(sourceDir, targetDir)
      const agentEntries: Array<{ name: string; description: string }> = []

      yield* Effect.forEach(
        agentFiles.filter((file) => file.endsWith(".md")),
        (file) =>
          Effect.gen(function*() {
            const content = yield* fs.readFileString(p.join(sourceDir, "agents", file))
            const result = transformAgent(content, target, modelMap) as { description: string; developerInstructions: string }
            const name = file.replace(/\.md$/, "")
            agentEntries.push({ name, description: result.description })
            yield* fs.writeFileString(p.join(targetDir, "agents", `${name}.toml`), agentToToml(name, result.developerInstructions))
          }),
        { concurrency: "unbounded" }
      )

      yield* mergeCodexConfig(targetDir, agentEntries)
      return false
    }

    yield* fs.makeDirectory(p.join(targetDir, "agents"), { recursive: true })
    yield* Effect.forEach(
      agentFiles.filter((file) => file.endsWith(".md")),
      (file) =>
        Effect.gen(function*() {
          const content = yield* fs.readFileString(p.join(sourceDir, "agents", file))
          yield* fs.writeFileString(p.join(targetDir, "agents", file), transformAgent(content, target, modelMap) as string)
        }),
      { concurrency: "unbounded" }
    )
    yield* syncProviderSkills(sourceDir, targetDir, target, modelMap)

    return false
  })

export const syncConfig = (sourceDir: string, targetDir: string, target: Exclude<Target, "codex">) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const configFile = configFiles[target]

    if (!configFile || !(yield* fs.exists(targetDir))) return true

    const sourcePath = p.join(sourceDir, configFile.source)
    if (!(yield* fs.exists(sourcePath))) return false

    const canonical = JSON.parse(yield* fs.readFileString(sourcePath)) as Record<string, any>
    const destPath = p.join(targetDir, configFile.target)

    if (!configFile.merge) {
      yield* fs.writeFileString(destPath, JSON.stringify(canonical, null, 2) + "\n")
      return false
    }

    const existing: Record<string, any> = (yield* fs.exists(destPath))
      ? JSON.parse(yield* fs.readFileString(destPath))
      : {}

    if (deepMerge(existing, canonical)) {
      yield* fs.writeFileString(destPath, JSON.stringify(existing, null, 2) + "\n")
    }

    return false
  })

const project = Command.make(
  "project",
  {
    home: Flag.directory("home").pipe(
      Flag.withDefault(dirname(dirname(realpathSync(process.execPath)))),
      Flag.withDescription("Path to the dotai repo (resolved from binary location)")
    )
  },
  ({ home }) =>
    Effect.gen(function*() {
      const projectDir = process.cwd()
      const skills = yield* readCanonicalSkills(`${home}/canonical`, "project-skills")
      const settings = yield* loadProjectSettings(projectDir, skills.map((skill) => skill.fileName))
      const selectedSkills = yield* promptForSkills(skills, settings.skills)
      const syncedSkills = yield* syncProject(`${home}/canonical`, projectDir, selectedSkills)

      yield* Console.log(
        `Updated ${projectDir}/AGENTS.md, ${projectDir}/.context/settings.json, and ${syncedSkills.length} skill file(s)`
      )
    })
)

const global = Command.make(
  "global",
  {
    target: Flag.choice("target", ["claude", "opencode", "codex", "all"]).pipe(
      Flag.withDefault("all" as const),
      Flag.withDescription("Target to sync: claude, opencode, codex, or all")
    ),
    home: Flag.directory("home").pipe(
      Flag.withDefault(dirname(dirname(realpathSync(process.execPath)))),
      Flag.withDescription("Path to the dotai repo (resolved from binary location)")
    )
  },
  ({ target, home }) =>
    Effect.gen(function*() {
      const modelMap = yield* readModelMap(home)
      const targets: ReadonlyArray<Target> = target === "all" ? ["claude", "opencode", "codex"] : [target]

      for (const currentTarget of targets) {
        const skipped = yield* syncTarget(`${home}/canonical`, targetPaths[currentTarget], currentTarget, modelMap)
        yield* Console.log(skipped ? `Skipped ${currentTarget} (directory not found)` : `Synced ${currentTarget} agents`)
        if (currentTarget !== "codex") {
          const configSkipped = yield* syncConfig(`${home}/canonical`, targetPaths[currentTarget], currentTarget)
          yield* Console.log(configSkipped ? `Skipped ${currentTarget} config (directory not found)` : `Synced ${currentTarget} config`)
        }
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

const cli = Command.make("dotai").pipe(Command.withSubcommands([project, global, models]))

export const run = Command.run(cli, { version: "0.1.0" })
