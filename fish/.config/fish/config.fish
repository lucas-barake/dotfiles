fish_add_path /opt/homebrew/bin
fish_add_path $HOME/.local/bin

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
fish_add_path /Users/lucas/dotfiles/opencode-profile/bin
