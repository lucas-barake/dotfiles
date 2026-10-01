#!/usr/bin/env bash
set -euo pipefail

DOTFILES="$(cd "$(dirname "$0")" && pwd)"
PACKAGES=(nvim zed git fish lsd ghostty cmux)

# Directories that mirror $HOME but are deliberately not stowed. Everything
# else that mirrors $HOME must be in PACKAGES, or it gets built, committed, and
# documented while never actually being linked to anything.
NOT_PACKAGES=(ai attribution bin state)

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

# Login shells rebuild PATH after the parent shell set it (path_helper in
# /etc/zprofile and /etc/profile on macOS), which puts the real git and gh back
# in front of the shims in bin/. ~/.zprofile and the bash login profile run
# after that rebuild, so the shims go back in front there.
put_shims_first() {
  local profile=$1 line="export PATH=\"$DOTFILES/bin:\$PATH\""
  grep -qxF "$line" "$profile" 2>/dev/null && return
  printf '\n# Keeps the %s shims ahead of the real git and gh.\n%s\n' "$DOTFILES/bin" "$line" >>"$profile"
  echo "Put $DOTFILES/bin first in $profile"
}
put_shims_first "$HOME/.zprofile"
# bash reads only the first of these that exists.
for bash_profile in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
  [ -f "$bash_profile" ] && break
done
put_shims_first "$bash_profile"

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
