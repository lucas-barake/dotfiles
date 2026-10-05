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
| `fish/` | Fish shell config and functions, plus `~/.hushlogin` to drop the `Last login:` banner |
| `lsd/` | `lsd` file listing |
| `git/` | Global gitconfig and gitignore |

Not stow packages: `ai/` (AI tooling config and sync CLI), `attribution/` (AI attribution stripping), `bin/` (PATH shims), `state/`.

`setup.sh` refuses to run if a top-level directory is in neither `PACKAGES` nor `NOT_PACKAGES`, so a new package cannot be added to the repo and then silently never linked.

## cmux (`cmux/`)

`cmux/.config/cmux/cmux.json` is cmux's own settings file. cmux watches it and reloads on save, and the Settings UI writes back into it, so changing a setting in the app updates the tracked file and shows up as a normal diff.

Two settings have no `cmux.json` equivalent and are only reachable through `NSUserDefaults`, so `setup.sh` writes them directly: the browser feature is disabled (`browserDisabledOverride`) and the custom sidebars beta is turned off (`customSidebars.beta.enabled`). cmux overwrites its preferences on exit, so quit cmux before running `setup.sh` or those two will not stick.

`⌘1`–`⌘9` are remapped from `selectWorkspaceByNumber` to `selectSurfaceByNumber`. Workspaces are the sidebar rows and surfaces are the tabs across the top of a window, so with the sidebar hidden the stock binding drives a list nobody can see. Workspace-by-number moves to `⇧⌘1`–`⇧⌘9`. Only the `1` is written: cmux normalizes a numbered binding to cover all nine digits.

`cmux reload-config` applies changes to this file and to the Ghostty config without restarting the app. `cmux config validate` checks the JSONC before you reload.

Terminal appearance is not configured here, with one exception. cmux renders with libghostty and reads `ghostty/.config/ghostty/config`.

The exception is `app.globalFontMagnification`, set to `110`. It scales cmux chrome (tab titles, sidebars, settings, overlays) and is also multiplied into the Ghostty `font-size` before libghostty sees it, so the terminal renders at ~19pt inside cmux while Ghostty.app stays at the configured 17. Only multiples of 10 from 50 to 200 are accepted.

That file no longer binds `new_tab` or `goto_tab`. Tabs and windows belong to cmux, not to the terminal surface it embeds, so those Ghostty actions had nothing to act on.

Avoid setting a socket control password while this file is tracked. `automation.socketPassword` is a valid `cmux.json` key, so the app would write the password into the repo.

## AI attribution (`attribution/`)

Claude Code, Cursor, Codex, Copilot, aider, opencode, Devin and others add their own attribution to commits and PRs: `Co-authored-by: Claude <noreply@anthropic.com>` trailers, `🤖 Generated with [Claude Code](https://claude.com/claude-code)` footers. The `bin/git` and `bin/gh` shims remove it on the way out, so agents keep running plain `git` and `gh`.

- `git commit`, `merge`, `pull`, `cherry-pick`, `revert`, `rebase` and `am` run with `core.hooksPath` pointed at `attribution/hooks/`. Every hook there is `attribution/dispatch`, which strips the message in `prepare-commit-msg` (runs even with `--no-verify`), `commit-msg` (after the editor) and `applypatch-msg`, then runs the repository's own hook of the same name. Husky, `.githooks` and `.git/hooks` keep working.
- `gh pr`, `gh issue` and `gh release` text flags (`--body`, `--body-file`, `--notes`, `--notes-file`) and `gh api` `body`/`message` fields are stripped before the real `gh` runs.
- `Co-authored-by` trailers are removed only when the name or address belongs to an AI tool. Human co-authors stay. Fenced code blocks are left alone.

The routing is passed through `GIT_CONFIG_COUNT` rather than a global `core.hooksPath`, because a repository's own `core.hooksPath` outranks the global one. Anything that runs git by absolute path (`/usr/bin/git`) instead of through `PATH` skips the shims.

`attribution/test` runs every case end to end against real repositories.

## AI tooling (`ai/`)

Centralized config for Claude Code and OpenCode. Edit canonical files in `ai/canonical/`, then sync:

```bash
dotai sync
```

The `dotai` binary is built from `ai/` and symlinked to `~/.local/bin/dotai` during setup. See `ai/README.md` for details.
