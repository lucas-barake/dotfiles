#!/bin/bash
MASON="$HOME/.local/share/nvim/mason/bin"
EXT="$1"

has_config() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    [ -f "$dir/$1" ] && return 0
    dir="$(dirname "$dir")"
  done
  return 1
}

if has_config "dprint.json" && command -v dprint >/dev/null 2>&1; then
  exec dprint fmt --stdin "file.$EXT"
fi

if has_config "dprint.json" && [ -x "$MASON/dprint" ]; then
  exec "$MASON/dprint" fmt --stdin "file.$EXT"
fi

for cfg in .prettierrc .prettierrc.json .prettierrc.js .prettierrc.yaml .prettierrc.yml prettier.config.js prettier.config.cjs prettier.config.mjs; do
  if has_config "$cfg"; then
    case "$EXT" in
      ts|tsx) PARSER="typescript" ;;
      js|jsx) PARSER="babel" ;;
      json) PARSER="json" ;;
      yaml|yml) PARSER="yaml" ;;
      md) PARSER="markdown" ;;
      css) PARSER="css" ;;
      html) PARSER="html" ;;
      *) PARSER="$EXT" ;;
    esac
    if command -v prettier >/dev/null 2>&1; then
      exec prettier --parser "$PARSER"
    elif [ -x "$MASON/prettier" ]; then
      exec "$MASON/prettier" --parser "$PARSER"
    fi
  fi
done

exec cat
