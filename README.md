# dotfiles

Config files managed with [GNU Stow](https://www.gnu.org/software/stow/). Each top-level directory is a stow package that mirrors the target structure relative to `$HOME`.

## Setup

```bash
git clone https://github.com/lucas-barake/dotfiles.git ~/dotfiles
cd ~/dotfiles
./setup.sh
```

This installs system packages (via brew/apt/pacman/dnf) and the cmux terminal, stows all config packages, sets up the global gitignore, and builds the `dotai` CLI.

## Packages

| Directory | What it configures |
|---|---|
| `ghostty/` | Terminal font, palette and keybinds. cmux renders with libghostty and reads this file, so it applies even though Ghostty.app is not the terminal in use. |
| `cmux/` | cmux terminal. See below. |
| `nvim/` | Neovim |
| `zed/` | Zed editor |
| `fish/` | Fish shell config and functions |
| `lsd/` | `lsd` file listing |
| `git/` | Global gitconfig and gitignore |

Not stow packages: `ai/` (AI tooling config and sync CLI), `bin/` (PATH shims), `state/`.

`setup.sh` refuses to run if a top-level directory is in neither `PACKAGES` nor `NOT_PACKAGES`, so a new package cannot be added to the repo and then silently never linked.

## cmux (`cmux/`)

`cmux/.config/cmux/cmux.json` is cmux's own settings file. cmux watches it and reloads on save, and the Settings UI writes back into it, so changing a setting in the app updates the tracked file and shows up as a normal diff.

Two settings have no `cmux.json` equivalent and are only reachable through `NSUserDefaults`, so `setup.sh` writes them directly: the browser feature is disabled (`browserDisabledOverride`) and the custom sidebars beta is turned off (`customSidebars.beta.enabled`). cmux overwrites its preferences on exit, so quit cmux before running `setup.sh` or those two will not stick.

Terminal appearance is not configured here. cmux renders with libghostty and reads `ghostty/.config/ghostty/config`.

Avoid setting a socket control password while this file is tracked. `automation.socketPassword` is a valid `cmux.json` key, so the app would write the password into the repo.

## AI tooling (`ai/`)

Centralized config for Claude Code and OpenCode. Edit canonical files in `ai/canonical/`, then sync:

```bash
dotai sync
```

The `dotai` binary is built from `ai/` and symlinked to `~/.local/bin/dotai` during setup. See `ai/README.md` for details.
