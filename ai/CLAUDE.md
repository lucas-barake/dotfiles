# dotai

Centralized AI tool configuration. Define agents and skills once in `canonical/`, sync global assets to Claude Code (`~/.claude/`), OpenCode (`~/.config/opencode/`), and Codex (`~/.codex/`), and write project local skills into `.context/skills`.

## Project Structure

```
canonical/
  opencode.json                # OpenCode config file (copied verbatim)
  instructions.md              # Shared Claude Code and Codex instructions
  instructions.codex.md        # Instructions prepended only for Codex
  agents/                      # Agent definitions (frontmatter + markdown body)
    fast-lookup.md
    quick-dive.md
    deep-dive.md
    deep-reviewer.md
    web-search.md
  global-skills/               # Skills synced to provider skill directories
    <skill-name>.md
  project-skills/              # Skills written into project .context/skills
    <skill-name>.md
src/
  bin.ts                       # Entry point (provides BunServices, calls run)
  main.ts                      # CLI commands + sync logic
  transform.ts                 # Frontmatter parsing, per-target transforms, template expansion
test/
  sync.test.ts
  services/MockTerminal.ts
```

## Canonical Format

All agents and skills use Claude Code frontmatter as the superset format. The sync tool transforms per target:

- **Claude Code**: keeps all fields verbatim
- **OpenCode**: drops `name`/`model` from agents, adds `mode: subagent`, converts `tools` to a deny-object. Drops `model`/`context` from skills
- **Codex**: generates per-agent TOML files with `developer_instructions` (body text), prepends `canonical/instructions.codex.md` to `canonical/instructions.md` when writing `~/.codex/AGENTS.md`, and merges `[agents.<name>]` entries into `~/.codex/config.toml`. Drops `model`/`context` from skills

Global sync writes agents to all providers, writes `canonical/global-skills/` into provider `skills/` directories for Claude Code, OpenCode, and Codex using each platform's expected `skills/<name>/SKILL.md` layout, writes global instructions to `~/.claude/CLAUDE.md` for Claude Code and `~/.codex/AGENTS.md` for Codex, and syncs provider config where supported. Project sync writes selected `canonical/project-skills/` files to `./.context/skills/<skill-name>.md` with frontmatter removed, stores the selection in `./.context/settings.json`, and updates `./AGENTS.md` with a managed skill reference table.

## Workflow

Edit files in `canonical/`, then sync:

```bash
 bun run project                 # syncs project skills in the current directory
 bun run global                  # syncs agents, global skills, and config
 bun run src/bin.ts global --target claude
 bun run src/bin.ts global --target opencode
 bun run src/bin.ts global --target codex
```

For development (without building the binary):

```bash
bun run src/bin.ts project
```

## Building

```bash
bun run build    # compiles to bin/dotai
```

The binary is gitignored. Symlink it to your PATH: `ln -sf "$(pwd)/bin/dotai" ~/.local/bin/dotai`

## Tests

```bash
bun run test
```

## Model Remapping

Canonical files use simple model names (`sonnet`, `opus`, `haiku`). For platforms like AWS Bedrock that use different model IDs, generate a `model-mapper.json`:

```bash
dotai models                    # scans canonical files, writes model-mapper.json
```

This creates a gitignored `model-mapper.json` at the repo root with identity mappings:

```json
{
  "opus": "opus",
  "sonnet": "sonnet"
}
```

Edit the values to remap:

```json
{
  "opus": "us.anthropic.claude-opus-4-20250514",
  "sonnet": "us.anthropic.claude-sonnet-4-5-20250929"
}
```

When `model-mapper.json` exists, `dotai global` applies the remapping to synced agents and global skills. If the file doesn't exist, models are synced as-is.

Running `dotai models` again preserves your custom values and adds entries for any new models found in canonical files.

## Key Invariant

`canonical/agents/` is the source of truth for synced provider agents. `canonical/instructions.md` is the shared source of truth for Claude Code and Codex global instructions. `canonical/instructions.codex.md` contains the additional Codex only prefix. `canonical/global-skills/` is the source of truth for provider global skills. `canonical/project-skills/` is the source of truth for project local skill documents.
