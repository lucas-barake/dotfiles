export type Target = "claude" | "opencode" | "codex"

export const parseFrontmatter = (content: string) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { fields: [] as ReadonlyArray<readonly [string, string]>, body: content }
  const fields = match[1]
    .split("\n")
    .filter((line) => line.includes(":") && !line.startsWith(" "))
    .map((line) => {
      const idx = line.indexOf(":")
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()] as const
    })
  return { fields, body: match[2] }
}

const getField = (fields: ReadonlyArray<readonly [string, string]>, key: string) =>
  fields.find(([k]) => k === key)?.[1]

const serializeFrontmatter = (entries: ReadonlyArray<readonly [string, string | Record<string, boolean>]>) => {
  const lines = entries.map(([key, value]) => {
    if (typeof value === "object") {
      return `${key}:\n${Object.entries(value).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`
    }
    return `${key}: ${value}`
  })
  return `---\n${lines.join("\n")}\n---`
}

const deniableTools = ["write", "edit", "bash"] as const

const toolsToDenyObject = (toolsStr: string) => {
  const allowed = new Set(toolsStr.split(",").map((t) => t.trim().toLowerCase()))
  const denied = deniableTools.filter((t) => !allowed.has(t))
  return Object.fromEntries(denied.map((t) => [t, false]))
}

const remapModelField = (
  fields: ReadonlyArray<readonly [string, string]>,
  modelMap: Record<string, string> | undefined
) =>
  modelMap
    ? fields.map(([k, v]) => k === "model" && v in modelMap ? [k, modelMap[v]] as const : [k, v] as const)
    : fields

export const transformAgent = (content: string, target: Target, modelMap?: Record<string, string>) => {
  const { fields: rawFields, body } = parseFrontmatter(content)
  const fields = remapModelField(rawFields, modelMap)
  if (target === "claude") {
    return `${serializeFrontmatter(fields)}\n${body}`
  }

  if (target === "codex") {
    const description = getField(fields, "description") ?? ""
    return { description, developerInstructions: body.trim() }
  }

  const description = getField(fields, "description") ?? ""
  const toolsStr = getField(fields, "tools")

  const entries: Array<readonly [string, string | Record<string, boolean>]> = [
    ["description", description],
    ["mode", "subagent"]
  ]

  if (toolsStr) {
    const denyObject = toolsToDenyObject(toolsStr)
    if (Object.keys(denyObject).length > 0) {
      entries.push(["tools", denyObject])
    }
  }

  return `${serializeFrontmatter(entries)}\n${body}`
}

export const stripFrontmatter = (content: string) => {
  const { body } = parseFrontmatter(content)
  const stripped = body.replace(/^\n/, "")
  return stripped.endsWith("\n") ? stripped : `${stripped}\n`
}

export const transformSkill = (content: string, target: Exclude<Target, "codex">, modelMap?: Record<string, string>) => {
  const { fields: rawFields, body } = parseFrontmatter(content)
  const fields = remapModelField(rawFields, modelMap)

  if (target === "claude") {
    return `${serializeFrontmatter(fields)}\n${body}`
  }

  const keptFields = fields.filter(([key]) => key !== "model" && key !== "context")
  return `${serializeFrontmatter(keptFields)}\n${body}`
}

export const escapeTomlString = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/"""/g, '"\\""')

export const agentToToml = (name: string, developerInstructions: string) =>
  `developer_instructions = """\n${escapeTomlString(developerInstructions)}\n"""\n`
