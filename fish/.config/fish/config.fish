fish_add_path /opt/homebrew/bin
fish_add_path $HOME/.local/bin
# Shims must outrank the real binaries. See ~/dotfiles/bin/gh.
fish_add_path $HOME/dotfiles/bin

if not contains -- /Users/lucas/dotfiles/fish/.config/fish/functions $fish_function_path
    set -g fish_function_path /Users/lucas/dotfiles/fish/.config/fish/functions $fish_function_path
end

if status is-interactive
    set -g fish_prompt_pwd_dir_length 3
    set -gx EDITOR nvim
    set -gx VISUAL nvim
    eval (direnv hook fish)
    fzf --fish | source
end

# Added by OrbStack: command-line tools and integration
# This won't be added again if you remove it.
source ~/.orbstack/shell/init2.fish 2>/dev/null || :

# opencode
fish_add_path /Users/lucas/.opencode/bin

# pnpm
set -gx PNPM_HOME "/Users/lucas/Library/pnpm"
if not string match -q -- $PNPM_HOME $PATH
  set -gx PATH "$PNPM_HOME" $PATH
end
# pnpm end
