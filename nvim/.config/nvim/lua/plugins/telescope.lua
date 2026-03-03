local file_exclusions = {
  ".git", ".svn", ".hg", ".jj", ".sl", ".repo", "CVS",
  ".DS_Store", "Thumbs.db", "node_modules", ".pnpm",
  "dist", "build", ".next", ".nuxt", ".turbo", ".cache",
  ".parcel-cache", ".venv", ".env", "venv", "__pycache__",
  ".pytest_cache", ".mypy_cache", "target", ".cargo",
  "vendor", ".bundle", "coverage", ".nyc_output", "*.log",
}

local rg_extra = {}
for _, pattern in ipairs(file_exclusions) do
  rg_extra[#rg_extra + 1] = "--glob=!" .. pattern
end

local fd_extra = {}
for _, pattern in ipairs(file_exclusions) do
  fd_extra[#fd_extra + 1] = "--exclude=" .. pattern
end

local nav_winopts = {
  on_create = function()
    vim.keymap.set("t", "j", "<Down>", { buffer = true })
    vim.keymap.set("t", "k", "<Up>", { buffer = true })
  end,
}

return {
  {
    "ibhagwan/fzf-lua",
    cmd = "FzfLua",
    dependencies = { "echasnovski/mini.icons" },
    keys = {
      { "<leader>ff", function() require("fzf-lua").files() end, desc = "Find files" },
      { "<leader>fg", function() require("fzf-lua").live_grep() end, desc = "Grep" },
      { "<Tab>", function() require("fzf-lua").buffers() end, desc = "Find buffer" },
      { "<leader>fr", function() require("fzf-lua").oldfiles() end, desc = "Recent files" },
      { "<leader>sg", function() require("fzf-lua").live_grep() end, desc = "Grep" },
      { "<leader>sw", function() require("fzf-lua").grep_cword() end, desc = "Grep word" },
      { "<leader>/", function() require("fzf-lua").live_grep() end, desc = "Grep" },
      { "<leader>gc", function() require("fzf-lua").git_commits() end, desc = "Git commits" },
      { "<leader>gs", function() require("fzf-lua").git_status() end, desc = "Git status" },
      { "<leader>gd", function() require("fzf-lua").git_status() end, desc = "Git diff" },
      { "<leader>gb", function() require("fzf-lua").git_branches() end, desc = "Git branches" },
      { "<leader>gh", function() require("fzf-lua").git_bcommits() end, desc = "Git file history" },
      { "<leader><leader>", function() require("fzf-lua").files() end, desc = "Find files" },
    },
    opts = {
      defaults = {
        formatter = "path.filename_first",
      },
      keymap = {
        fzf = {
          ["ctrl-q"] = "select-all+accept",
        },
        builtin = {
          ["<C-j>"] = "preview-page-down",
          ["<C-k>"] = "preview-page-up",
        },
      },
      files = {
        cmd = "fd --type f --hidden --no-ignore " .. table.concat(fd_extra, " "),
        previewer = false,
        winopts = { height = 0.5, width = 0.5 },
      },
      grep = {
        rg_opts = "--column --line-number --no-heading --color=always --smart-case --hidden --no-ignore "
          .. table.concat(rg_extra, " "),
      },
      buffers = {
        sort_lastused = true,
        ignore_current_buffer = true,
        winopts = nav_winopts,
      },
      oldfiles = { winopts = nav_winopts },
      git = {
        commits = { winopts = nav_winopts },
        bcommits = { winopts = nav_winopts },
        status = { winopts = nav_winopts },
        branches = { winopts = nav_winopts },
      },
      lsp = {
        definitions = { winopts = nav_winopts },
        references = { winopts = nav_winopts },
        implementations = { winopts = nav_winopts },
        typedefs = { winopts = nav_winopts },
        code_actions = { winopts = nav_winopts },
        document_symbols = { winopts = nav_winopts },
        diagnostics = { winopts = nav_winopts },
      },
      diagnostics = { winopts = nav_winopts },
      winopts = {
        height = 0.95,
        width = 0.95,
        preview = { layout = "horizontal", horizontal = "right:50%", wrap = "wrap" },
      },
    },
    config = function(_, opts)
      require("fzf-lua").setup(opts)
      require("fzf-lua").register_ui_select()
    end,
  },
}
