# dotai

Centralized AI tool configuration. Define agents and skills once in `canonical/`, sync global assets to Claude Code (`~/.claude/`), OpenCode (`~/.config/opencode/`), Codex (`~/.codex/`), Kimi Code CLI (`~/.kimi-code/`, or `$KIMI_CODE_HOME` when set), and the Kimi desktop app (`~/Library/Application Support/kimi-desktop/daimon-share/daimon/`), and write project local skills into `.context/skills`.

## Project Structure

```
canonical/
  opencode.json                # OpenCode config file (copied verbatim)
  instructions.md              # Shared Claude Code and Codex instructions
  instructions.claude.md       # Claude Code only prefix, currently empty (empty means no prefix)
  instructions.codex.md        # Instructions prepended only for Codex
  agents/                      # Agent definitions (frontmatter + markdown body)
    fast-lookup.md
    quick-dive.md
    deep-dive.md
    web-search.md
  global-skills/               # Skills synced to provider skill directories
    change-audit.md             # Relevance selected implementation review
    code-explainer.md           # Natural language walkthrough of a change or file set
    product-explainer.md        # Product level explanation of a change for non-engineers
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

- **Claude Code**: keeps all fields verbatim, and prepends `canonical/instructions.claude.md` to `canonical/instructions.md` when writing `~/.claude/CLAUDE.md`. That file is currently empty, so Claude Code gets the shared instructions unchanged
- **OpenCode**: drops `name`/`model` from agents, adds `mode: subagent`, converts `tools` to a deny-object. Drops `model`/`context` from skills
- **Codex**: generates per-agent TOML files with `developer_instructions` (body text), prepends `canonical/instructions.codex.md` to `canonical/instructions.md` when writing `~/.codex/AGENTS.md`, and merges `[agents.<name>]` entries into `~/.codex/config.toml`. Drops `model`/`context` from skills
- **Kimi Code**: keeps `name`/`description`/`tools` on agents (Kimi Code reads Claude Code-style agent files) and drops `model`/`context`. Drops `model`/`context` from skills. Writes `canonical/instructions.md` to `$KIMI_CODE_HOME/AGENTS.md`
- **Kimi desktop**: same agent/skill transforms as Kimi Code. Agents are written to `<daimon>/user/agents/` and mirrored to the generic `~/.agents/agents/` directory (which kimi-code scans unconditionally), and registered via a managed `extra_agent_dirs`/`extra_skill_dirs` block inserted at the top of `<daimon>/runtime/kimi-code/config.toml` (all other keys, including credentials, are preserved; the block is replaced on re-sync). The kernel currently vendored in the desktop app predates custom agents, so agent discovery is dormant until the app updates; the config key and directories match the official spec. Skills are written to `<daimon>/skills/<name>/SKILL.md`, the directory the desktop harness builds its skill index from. Instructions are copied to `<workspace>/AGENTS.md`, where `<workspace>` is the main agent's `workDir` from `<daimon>/config.json` (default `~/Documents/kimi/workspace`) — the desktop harness injects that file into the system prompt (truncated past 32 KB) and ignores the kernel home. Kernel settings from `canonical/kimi-desktop.toml` are merged into the matching `[table]` sections of `config.toml` (existing keys updated in place, missing keys and tables added, everything else preserved)

Global sync writes agents to all providers, writes `canonical/global-skills/` into provider `skills/` directories for Claude Code, OpenCode, Codex, Kimi Code, and the Kimi desktop app using each platform's expected `skills/<name>/SKILL.md` layout, writes global instructions to `~/.claude/CLAUDE.md` for Claude Code, `~/.codex/AGENTS.md` for Codex, `$KIMI_CODE_HOME/AGENTS.md` for Kimi Code, and the desktop session workspace `AGENTS.md` for the Kimi desktop app, and syncs provider config where supported. Project sync writes selected `canonical/project-skills/` files to `./.context/skills/<skill-name>.md` with frontmatter removed, stores the selection in `./.context/settings.json`, and updates `./AGENTS.md` with a managed skill reference table.

Renamed or retired built in reviewers and global skills are removed from provider directories during global sync. Custom provider assets are left untouched.

## Workflow

Edit files in `canonical/`, then sync:

```bash
 bun run project                 # syncs project skills in the current directory
 bun run global                  # syncs agents, global skills, and config
 bun run src/bin.ts global --target claude
 bun run src/bin.ts global --target opencode
 bun run src/bin.ts global --target codex
 bun run src/bin.ts global --target kimi
 bun run src/bin.ts global --target kimi-desktop
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

`canonical/agents/` is the source of truth for synced provider agents. `canonical/instructions.md` is the shared source of truth for Claude Code, Codex, and Kimi global instructions. `canonical/instructions.claude.md` is reserved for a Claude Code only prefix and is currently empty, and `canonical/instructions.codex.md` holds the Codex only prefix. `canonical/global-skills/` is the source of truth for provider global skills. `canonical/project-skills/` is the source of truth for project local skill documents.
