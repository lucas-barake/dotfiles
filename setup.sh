#!/usr/bin/env bash
set -euo pipefail

DOTFILES="$(cd "$(dirname "$0")" && pwd)"
PACKAGES=(nvim zed git fish lsd ghostty cmux)

# Directories that mirror $HOME but are deliberately not stowed. Everything
# else that mirrors $HOME must be in PACKAGES, or it gets built, committed, and
# documented while never actually being linked to anything.
NOT_PACKAGES=(ai bin state)

check_package_drift() {
  local dir name unlisted=()
  for dir in "$DOTFILES"/*/; do
    name="$(basename "$dir")"
    printf '%s\n' "${PACKAGES[@]}" "${NOT_PACKAGES[@]}" | grep -qx "$name" && continue
    unlisted+=("$name")
  done
  if [ ${#unlisted[@]} -gt 0 ]; then
    echo "Unlisted directories: ${unlisted[*]}" >&2
    echo "Add each to PACKAGES to stow it, or to NOT_PACKAGES to skip it." >&2
    exit 1
  fi
}

check_package_drift

if [[ "$(uname)" == "Darwin" ]]; then
  if ! command -v brew &>/dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  echo "Installing packages..."
  brew install stow neovim fzf ripgrep fd node fish dlvhdr/formulae/diffnav lazygit lsd
  # --force takes over a copy of cmux.app that was installed by hand. The cask
  # sets auto_updates, so brew never touches it again after this.
  if ! brew list --cask cmux &>/dev/null; then
    brew install --cask --force cmux
  fi
elif command -v apt-get &>/dev/null; then
  sudo apt-get update && sudo apt-get install -y stow
elif command -v pacman &>/dev/null; then
  sudo pacman -S --noconfirm stow
elif command -v dnf &>/dev/null; then
  sudo dnf install -y stow
fi

echo "Stowing packages..."
cd "$DOTFILES"
for pkg in "${PACKAGES[@]}"; do
  echo "  $pkg"
  stow -v --restow "$pkg"
done


if [[ "$(uname)" == "Darwin" ]]; then
  # cmux settings that cmux.json cannot express. Quit cmux before running this
  # or it writes its in-memory preferences back over both keys on exit.
  defaults write com.cmuxterm.app browserDisabledOverride -bool true
  defaults write com.cmuxterm.app customSidebars.beta.enabled -bool false
  echo "Applied cmux defaults"
fi

if [ -f "$DOTFILES/ai/package.json" ]; then
  echo "Setting up ai tooling..."
  cd "$DOTFILES/ai"
  bun install
  bun run build
  ln -sf "$DOTFILES/ai/bin/dotai" "$HOME/.local/bin/dotai"
  echo "Linked dotai binary"
fi

echo "Done."
