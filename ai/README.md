# .dotai

Centralized AI tool configuration. Define agents, skills, and instructions once — sync to Claude Code and OpenCode.

## Setup

```bash
git clone <repo-url> ~/path/to/.dotai
cd ~/path/to/.dotai
bun install
bun run build
```

Symlink the binary somewhere in your `$PATH`:

```bash
ln -sf "$(pwd)/bin/dotai" ~/.local/bin/dotai
```

The binary resolves its own real path through symlinks to find the canonical files, so it works from any directory.

## Usage

Sync to both Claude Code (`~/.claude/`) and OpenCode (`~/.config/opencode/`):

```bash
dotai sync
```

Sync to a specific target:

```bash
dotai sync --target claude
dotai sync --target opencode
```

Override the repo location (e.g. for dev/testing):

```bash
dotai sync --home /other/path/to/.dotai
```

## Structure

```
canonical/
  instructions.md              # Shared base rules (becomes CLAUDE.md / AGENTS.md)
  instructions.opencode.md     # OpenCode-only additions (appended)
  agents/                      # Agent definitions (canonical frontmatter)
  skills/                      # Skill definitions (canonical frontmatter)
src/
  bin.ts                       # Entry point
  main.ts                      # CLI command + sync logic
  transform.ts                 # Frontmatter + content transforms
test/
  sync.test.ts                 # Tests
  services/MockTerminal.ts     # Mock terminal for CLI testing
```

## How it works

Canonical files use the Claude Code frontmatter format as the superset. The sync tool transforms per target:

**Agents** — Claude keeps all fields verbatim. OpenCode drops `name` and `model`, adds `mode: subagent`, converts `tools` from a positive list to a deny-object (`write: false`, `edit: false`, `bash: false`).

**Skills** — Claude keeps all fields. OpenCode drops `model` and `context` (unsupported).

**Content** — Both targets use `.context/plans` for plan files.

**Instructions** — `instructions.md` is the shared base. `instructions.opencode.md` is appended for OpenCode only.

## Adding a new skill or agent

1. Create the file under `canonical/` using Claude Code frontmatter format
2. Run `dotai sync`

## Rebuilding the binary

```bash
bun run build
```

## Tests

```bash
bun run test
```
