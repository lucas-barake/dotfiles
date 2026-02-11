# dotai

Centralized AI tool configuration. Define agents, skills, and instructions once in `canonical/` — sync to Claude Code (`~/.claude/`) and OpenCode (`~/.config/opencode/`).

## Project Structure

```
canonical/
  instructions.md              # Source of truth for ~/.claude/CLAUDE.md and ~/.config/opencode/AGENTS.md
  instructions.opencode.md     # OpenCode-only additions (appended to instructions.md during sync)
  opencode.json                # OpenCode config file (copied verbatim)
  agents/                      # Agent definitions (frontmatter + markdown body)
    fast-lookup.md
    quick-dive.md
    deep-dive.md
    deep-reviewer.md
    web-search.md
  skills/                      # Skill definitions (frontmatter + markdown body)
    <skill-name>/SKILL.md
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

Both targets use `.context/plans` for plan files (no template expansion needed).

## Workflow

Edit files in `canonical/`, then sync:

```bash
bun run sync                    # syncs to both targets
bun run sync --target claude    # Claude Code only
bun run sync --target opencode  # OpenCode only
```

For development (without building the binary):

```bash
bun run src/bin.ts sync
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

When `model-mapper.json` exists, `dotai sync` applies the remapping to all agent and skill frontmatter. If the file doesn't exist, models are synced as-is.

Running `dotai models` again preserves your custom values and adds entries for any new models found in canonical files.

## Key Invariant

`canonical/instructions.md` is the source of truth for global instructions. Never edit `~/.claude/CLAUDE.md` directly — edit `canonical/instructions.md` and run `dotai sync`.
