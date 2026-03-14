import os from "node:os"
import { Option, Schema } from "effect"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as Prompt from "effect/unstable/cli/Prompt"

const Settings = Schema.Struct({
  currentProfile: Schema.optionalKey(Schema.String)
})

const SettingsFile = Schema.fromJsonString(Settings)

export const profilePaths = (dotfilesDir: string, profile: string) => ({
  root: `${dotfilesDir}/state/opencode/${profile}`,
  cache: `${dotfilesDir}/state/opencode/${profile}/cache`,
  config: `${dotfilesDir}/state/opencode/${profile}/config`,
  data: `${dotfilesDir}/state/opencode/${profile}/data`,
  state: `${dotfilesDir}/state/opencode/${profile}/state`
})

const stateRoot = (dotfilesDir: string) => `${dotfilesDir}/state/opencode`
const settingsPath = (dotfilesDir: string) => `${stateRoot(dotfilesDir)}/.settings.json`

export const validateProfileName = (name: string) => {
  if (name.length === 0) return "profile name is required"
  if (name === "system") return "system is reserved"
  if (name === "." || name === "..") return "profile names may not be . or .."
  if (name.startsWith("-")) return "profile names may not begin with a hyphen"
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return "profile names may only contain letters, numbers, dots, underscores, and hyphens"
  }
  return undefined
}

const assertProfileName = (name: string) =>
  Effect.gen(function*() {
    const error = validateProfileName(name)
    if (error) return yield* Effect.fail(new Error(error))
    return name
  })

const readSettings = (dotfilesDir: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const file = settingsPath(dotfilesDir)
    if (!(yield* fs.exists(file))) return {}

    const content = yield* fs.readFileString(file)
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(SettingsFile)(content),
      catch: () => ({})
    })
  })

const writeSettings = (dotfilesDir: string, settings: { currentProfile?: string }) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(stateRoot(dotfilesDir), { recursive: true })
    yield* fs.writeFileString(settingsPath(dotfilesDir), Schema.encodeUnknownSync(SettingsFile)(settings))
  })

export const getCurrentProfile = (dotfilesDir: string) =>
  Effect.gen(function*() {
    const settings = yield* readSettings(dotfilesDir)
    return settings.currentProfile ?? "system"
  })

export const listProfiles = (dotfilesDir: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const p = yield* Path.Path
    const root = stateRoot(dotfilesDir)
    if (!(yield* fs.exists(root))) return [] as Array<string>

    const entries = yield* fs.readDirectory(root)
    const valid = yield* Effect.forEach(
      entries,
      (entry) =>
        Effect.gen(function*() {
          const info = yield* fs.stat(p.join(root, entry))
          if (info.type !== "Directory") return Option.none<string>()
          if (validateProfileName(entry)) return Option.none<string>()
          return Option.some(entry)
        }),
      { concurrency: "unbounded" }
    )

    return valid
      .filter(Option.isSome)
      .map((option) => option.value)
      .sort((left, right) => left.localeCompare(right))
  })

export const ensureProfile = (dotfilesDir: string, profile: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const paths = profilePaths(dotfilesDir, yield* assertProfileName(profile))
    yield* fs.makeDirectory(paths.cache, { recursive: true })
    yield* fs.makeDirectory(paths.config, { recursive: true })
    yield* fs.makeDirectory(paths.data, { recursive: true })
    yield* fs.makeDirectory(paths.state, { recursive: true })
    return paths
  })

export const createProfile = (dotfilesDir: string, profile: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const paths = profilePaths(dotfilesDir, yield* assertProfileName(profile))
    if (yield* fs.exists(paths.root)) return yield* Effect.fail(new Error(`profile already exists: ${profile}`))
    return yield* ensureProfile(dotfilesDir, profile)
  })

export const switchProfile = (dotfilesDir: string, profile: string) =>
  Effect.gen(function*() {
    if (profile === "system") {
      yield* writeSettings(dotfilesDir, {})
      return "system"
    }

    yield* ensureProfile(dotfilesDir, profile)
    yield* writeSettings(dotfilesDir, { currentProfile: profile })
    return profile
  })

export const deleteProfile = (dotfilesDir: string, profile: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const current = yield* getCurrentProfile(dotfilesDir)
    const name = yield* assertProfileName(profile)

    if (name === current) return yield* Effect.fail(new Error(`cannot delete the active profile: ${name}`))

    const paths = profilePaths(dotfilesDir, name)
    if (!(yield* fs.exists(paths.root))) return yield* Effect.fail(new Error(`profile does not exist: ${name}`))

    yield* fs.remove(paths.root, { recursive: true, force: true })
    return name
  })

export const buildProfileEnv = (dotfilesDir: string, profile: string) => {
  const env = { ...process.env } as Record<string, string>
  delete env.OPENCODE_PROFILE

  if (profile === "system") return env

  const paths = profilePaths(dotfilesDir, profile)
  env.OPENCODE_PROFILE = profile
  env.XDG_CACHE_HOME = paths.cache
  env.XDG_CONFIG_HOME = paths.config
  env.XDG_DATA_HOME = paths.data
  env.XDG_STATE_HOME = paths.state
  return env
}

const promptForProfileName = (message: string) =>
  Prompt.run(
    Prompt.text({
      message,
      validate: (value) => {
        const error = validateProfileName(value.trim())
        return error ? Effect.fail(error) : Effect.succeed(value.trim())
      }
    })
  )

const promptToSelectProfile = (choices: ReadonlyArray<string>, message: string, selected: string) =>
  Prompt.run(
    Prompt.select({
      message,
      choices: choices.map((choice) => ({
        title: choice,
        value: choice,
        selected: choice === selected
      }))
    })
  )

const promptToConfirmDelete = (profile: string) =>
  Prompt.run(Prompt.confirm({ message: `Delete OpenCode profile '${profile}'?` }))

const resolveOptionalName = (name: Option.Option<string>, message: string) =>
  Option.isSome(name) ? Effect.succeed(name.value) : promptForProfileName(message)

const resolveSwitchTarget = (dotfilesDir: string, name: Option.Option<string>) =>
  Effect.gen(function*() {
    if (Option.isSome(name)) return name.value
    const current = yield* getCurrentProfile(dotfilesDir)
    const profiles = yield* listProfiles(dotfilesDir)
    return yield* promptToSelectProfile(["system", ...profiles], "Switch to profile", current)
  })

const resolveDeleteTarget = (dotfilesDir: string, name: Option.Option<string>) =>
  Effect.gen(function*() {
    if (Option.isSome(name)) return name.value
    const profiles = yield* listProfiles(dotfilesDir)
    if (profiles.length === 0) return yield* Effect.fail(new Error("no profiles exist"))
    return yield* promptToSelectProfile(profiles, "Delete profile", profiles[0])
  })

const printProfileDetails = (dotfilesDir: string, profile: string) =>
  Effect.gen(function*() {
    if (profile === "system") {
      yield* Console.log("active profile: system")
      return
    }

    const paths = profilePaths(dotfilesDir, profile)
    yield* Console.log(`active profile: ${profile}`)
    yield* Console.log(`auth file: ${paths.data}/opencode/auth.json`)
    yield* Console.log(`config dir: ${paths.config}/opencode`)
  })

const dotfilesFlag = Flag.directory("dotfiles").pipe(
  Flag.withDefault(`${os.homedir()}/dotfiles`),
  Flag.withDescription("Path to the dotfiles repo")
)

const list = Command.make(
  "list",
  { dotfiles: dotfilesFlag },
  ({ dotfiles }) =>
    Effect.gen(function*() {
      const current = yield* getCurrentProfile(dotfiles)
      const profiles = yield* listProfiles(dotfiles)
      yield* Console.log(current === "system" ? "* system" : "  system")
      for (const profile of profiles) {
        yield* Console.log(profile === current ? `* ${profile}` : `  ${profile}`)
      }
    })
)

const current = Command.make(
  "current",
  { dotfiles: dotfilesFlag },
  ({ dotfiles }) => getCurrentProfile(dotfiles).pipe(Effect.flatMap(Console.log))
)

const create = Command.make(
  "new",
  {
    dotfiles: dotfilesFlag,
    name: Argument.string("name").pipe(Argument.optional, Argument.withDescription("Profile name"))
  },
  ({ dotfiles, name }) =>
    Effect.gen(function*() {
      const profile = yield* resolveOptionalName(name, "New profile name")
      const paths = yield* createProfile(dotfiles, profile)
      yield* Console.log(`created profile: ${profile}`)
      yield* Console.log(`root: ${paths.root}`)
      yield* Console.log(`next: opencode-profile switch ${profile}`)
      yield* Console.log("then: opencode auth login")
    })
)

const switchCommand = Command.make(
  "switch",
  {
    dotfiles: dotfilesFlag,
    name: Argument.string("name").pipe(Argument.optional, Argument.withDescription("Profile name or system"))
  },
  ({ dotfiles, name }) =>
    Effect.gen(function*() {
      const profile = yield* resolveSwitchTarget(dotfiles, name)
      const next = yield* switchProfile(dotfiles, profile)
      yield* printProfileDetails(dotfiles, next)
    })
)

const deleteCommand = Command.make(
  "delete",
  {
    dotfiles: dotfilesFlag,
    yes: Flag.boolean("yes").pipe(Flag.withDescription("Delete without confirmation")),
    name: Argument.string("name").pipe(Argument.optional, Argument.withDescription("Profile name"))
  },
  ({ dotfiles, name, yes }) =>
    Effect.gen(function*() {
      const profile = yield* resolveDeleteTarget(dotfiles, name)
      if (!yes) {
        const confirmed = yield* promptToConfirmDelete(profile)
        if (!confirmed) return yield* Effect.fail(new Error("delete cancelled"))
      }
      yield* deleteProfile(dotfiles, profile)
      yield* Console.log(`deleted profile: ${profile}`)
    })
)

const runCommand = Command.make(
  "run",
  {
    dotfiles: dotfilesFlag,
    profile: Flag.optional(Flag.string("profile")).pipe(Flag.withDescription("Profile name or system")),
    args: Argument.string("args").pipe(Argument.variadic(), Argument.withDescription("Arguments passed to opencode"))
  },
  ({ dotfiles, profile, args }) =>
    Effect.gen(function*() {
      const selectedProfile = Option.getOrElse(profile, () => undefined)
      const active = selectedProfile ?? (yield* getCurrentProfile(dotfiles))
      if (active !== "system") yield* ensureProfile(dotfiles, active)

      const bin = Bun.which("opencode")
      if (!bin) return yield* Effect.fail(new Error("opencode binary not found in PATH"))

      const proc = Bun.spawn([bin, ...args], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        env: buildProfileEnv(dotfiles, active)
      })

      const exitCode = yield* Effect.promise(() => proc.exited)
      if (exitCode !== 0) return yield* Effect.fail(new Error(`opencode exited with code ${exitCode}`))
    })
)

const cli = Command.make("opencode-profile").pipe(
  Command.withSubcommands([list, current, create, switchCommand, deleteCommand, runCommand])
)

export const run = Command.run(cli, { version: "0.1.0" })
