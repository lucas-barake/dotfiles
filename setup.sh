#!/usr/bin/env bash
set -euo pipefail

DOTFILES="$(cd "$(dirname "$0")" && pwd)"
PACKAGES=(helix ghostty nvim)

if [[ "$(uname)" == "Darwin" ]]; then
  if ! command -v brew &>/dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  echo "Installing packages..."
  brew install stow helix yazi neovim ghostty
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
  stow -v "$pkg"
done

echo "Done."
