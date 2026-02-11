# dotfiles

Config files managed with [GNU Stow](https://www.gnu.org/software/stow/). Each top-level directory is a stow package that mirrors the target structure relative to `$HOME`.

## Setup

```bash
git clone https://github.com/lucas-barake/dotfiles.git ~/dotfiles
cd ~/dotfiles
./setup.sh
```

This installs system packages (via brew/apt/pacman/dnf), stows all config packages, sets up the global gitignore, loads the launchd agent, and builds the `dotai` CLI.

## Packages

| Directory | What it configures |
|---|---|
| `helix/` | Helix editor |
| `ghostty/` | Ghostty terminal |
| `nvim/` | Neovim |
| `zed/` | Zed editor |
| `kitty/` | Kitty terminal |
| `yazi/` | Yazi file manager |
| `scripts/` | `~/.local/bin/` utilities (`oss-link`, `oss-update`) |
| `launchd/` | macOS LaunchAgents (daily `oss-update`) |
| `git/` | Global gitignore |
| `ai/` | AI tooling config and sync CLI (not a stow package) |

## AI tooling (`ai/`)

Centralized config for Claude Code and OpenCode. Edit canonical files in `ai/canonical/`, then sync:

```bash
dotai sync
```

The `dotai` binary is built from `ai/` and symlinked to `~/.local/bin/dotai` during setup. See `ai/README.md` for details.

## OSS library sources

`oss-link` creates a `.context/oss` symlink in the current project pointing to `~/src/oss/`. This makes library source code available to AI coding tools that scan the project directory.

```bash
cd ~/my-project
oss-link
```

`oss-update` pulls all repos in `~/src/oss/` (ff-only). Runs daily at noon via launchd, or manually:

```bash
oss-update
```
