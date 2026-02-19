return {
  { "nvim-lua/plenary.nvim", lazy = true },

  {
    "nvim-treesitter/nvim-treesitter",
    lazy = false,
    config = function()
      local wanted = {
        "bash", "html", "javascript", "json", "lua",
        "markdown", "markdown_inline", "rust", "tsx",
        "typescript", "yaml", "sql",
      }
      local missing = vim.tbl_filter(function(lang)
        return not pcall(vim.treesitter.language.inspect, lang)
      end, wanted)
      if #missing > 0 then
        require("nvim-treesitter").install(missing)
      end

      vim.api.nvim_create_autocmd("FileType", {
        callback = function(args)
          if pcall(vim.treesitter.start, args.buf) then
            vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
          end
        end,
      })
    end,
  },

  {
    "williamboman/mason.nvim",
    cmd = "Mason",
    opts = {},
  },

  {
    "williamboman/mason-lspconfig.nvim",
    dependencies = { "mason.nvim" },
    opts = {
      automatic_installation = true,
    },
  },

  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = { "mason.nvim", "mason-lspconfig.nvim" },
    config = function()
      local prefs_dir = vim.fn.stdpath("data") .. "/ts-server-prefs"

      local function project_key()
        local root = vim.fn.getcwd()
        return root:gsub("/", "%%")
      end

      local function get_saved_ts_server()
        local path = prefs_dir .. "/" .. project_key()
        local f = io.open(path, "r")
        if not f then return nil end
        local server = f:read("*l")
        f:close()
        return server
      end

      local function save_ts_server(server)
        vim.fn.mkdir(prefs_dir, "p")
        local f = io.open(prefs_dir .. "/" .. project_key(), "w")
        if not f then return end
        f:write(server)
        f:close()
      end

      vim.lsp.config("*", {
        capabilities = require("blink.cmp").get_lsp_capabilities(),
      })

      vim.lsp.enable("ts_ls", false)

      vim.lsp.config("vtsls", {
        cmd = { "vtsls", "--stdio" },
        filetypes = { "typescript", "typescriptreact", "javascript", "javascriptreact" },
        root_markers = { "tsconfig.json", "jsconfig.json", "package.json", ".git" },
        settings = {
          typescript = {
            tsdk = (function()
              local local_tsdk = vim.fn.getcwd() .. "/node_modules/typescript/lib"
              if vim.uv.fs_stat(local_tsdk) then
                return local_tsdk
              end
              local global = vim.fn.trim(vim.fn.system("npm root -g")) .. "/typescript/lib"
              return global
            end)(),
          },
        },
      })

      local saved = get_saved_ts_server()
      if saved == "vtsls" then
        vim.lsp.enable("tsgo", false)
        vim.lsp.enable({ "lua_ls", "vtsls", "rust_analyzer", "jsonls", "yamlls" })
      else
        vim.lsp.enable("vtsls", false)
        vim.lsp.enable({ "lua_ls", "tsgo", "rust_analyzer", "jsonls", "yamlls" })
      end

      vim.api.nvim_create_user_command("TsSwitch", function()
        local tsgo_active = #vim.lsp.get_clients({ name = "tsgo" }) > 0

        if tsgo_active then
          vim.lsp.enable("tsgo", false)
          vim.lsp.enable("vtsls")
          save_ts_server("vtsls")
          vim.notify("Switched to vtsls (saved)")
        else
          vim.lsp.enable("vtsls", false)
          vim.lsp.enable("tsgo")
          save_ts_server("tsgo")
          vim.notify("Switched to tsgo (saved)")
        end
      end, { desc = "Toggle between tsgo and vtsls" })
    end,
  },

  {
    "saghen/blink.cmp",
    version = "*",
    event = "InsertEnter",
    dependencies = { "rafamadriz/friendly-snippets" },
    opts = {
      fuzzy = { implementation = "prefer_rust" },
      sources = {
        default = { "lsp", "path", "snippets" },
        providers = {
          lsp = { score_offset = 0, fallbacks = {} },
        },
      },
      completion = {
        trigger = {
          show_on_insert = true,
          show_on_blocked_trigger_characters = {},
        },
        list = { max_items = 50 },
        menu = { border = "single" },
        documentation = { auto_show = true, window = { border = "single" } },
      },
      keymap = {
        preset = "default",
        ["<CR>"] = { "accept", "fallback" },
        ["<C-j>"] = { "select_next", "fallback" },
        ["<C-k>"] = { "select_prev", "fallback" },
        ["<C-d>"] = { "scroll_documentation_down", "fallback" },
        ["<C-u>"] = { "scroll_documentation_up", "fallback" },
      },
    },
  },

  {
    "stevearc/conform.nvim",
    event = "BufWritePre",
    cmd = "ConformInfo",
    opts = {
      formatters_by_ft = {
        lua = { "stylua" },
        javascript = { "dprint", "prettier", stop_after_first = true },
        javascriptreact = { "dprint", "prettier", stop_after_first = true },
        typescript = { "dprint", "prettier", stop_after_first = true },
        typescriptreact = { "dprint", "prettier", stop_after_first = true },
        json = { "dprint", "prettier", stop_after_first = true },
        yaml = { "prettier" },
        markdown = { "dprint", "prettier", stop_after_first = true },
        html = { "prettier" },
        css = { "dprint", "prettier", stop_after_first = true },
      },
      formatters = {
        dprint = {
          condition = function(_, ctx)
            return vim.fs.find("dprint.json", { path = ctx.filename, upward = true })[1] ~= nil
          end,
        },
      },
      format_on_save = {
        timeout_ms = 3000,
        lsp_fallback = true,
      },
    },
  },

  {
    "mfussenegger/nvim-lint",
    event = { "BufReadPre", "BufNewFile" },
    config = function()
      local lint = require("lint")
      lint.linters_by_ft = {
        typescript = { "oxlint" },
        typescriptreact = { "oxlint" },
        javascript = { "oxlint" },
        javascriptreact = { "oxlint" },
      }
      vim.api.nvim_create_autocmd({ "BufWritePost", "BufReadPost" }, {
        callback = function()
          local ctx = { filename = vim.api.nvim_buf_get_name(0) }
          local has_oxlint_config = vim.fs.find({ "oxlintrc.json", ".oxlintrc.json" }, {
            path = ctx.filename,
            upward = true,
          })[1] ~= nil
          if has_oxlint_config then
            lint.try_lint()
          end
        end,
      })
    end,
  },

  {
    "lewis6991/gitsigns.nvim",
    event = { "BufReadPre", "BufNewFile" },
    opts = {
      signs = {
        add = { text = "▎" },
        change = { text = "▎" },
        delete = { text = "" },
        topdelete = { text = "" },
        changedelete = { text = "▎" },
      },
      on_attach = function(buffer)
        local gs = require("gitsigns")
        local function map(mode, l, r, desc)
          vim.keymap.set(mode, l, r, { buffer = buffer, desc = desc })
        end
        map("n", "]h", function() gs.nav_hunk("next") end, "Next hunk")
        map("n", "[h", function() gs.nav_hunk("prev") end, "Prev hunk")
        map("n", "<leader>hs", gs.stage_hunk, "Stage hunk")
        map("n", "<leader>hr", gs.reset_hunk, "Reset hunk")
        map("n", "<leader>hp", gs.preview_hunk, "Preview hunk")
        map("n", "<leader>hb", gs.blame_line, "Blame line")
      end,
    },
  },

  {
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = {
      spec = {
        { "<leader>b", group = "buffer" },
        { "<leader>f", group = "file/find" },
        { "<leader>g", group = "git" },
        { "<leader>h", group = "hunks" },
        { "<leader>s", group = "search" },
        { "<leader>c", group = "code" },
      },
    },
  },

  { "NMAC427/guess-indent.nvim", event = "BufReadPre", opts = {} },

  { "folke/ts-comments.nvim", event = "VeryLazy", opts = {} },

  { "echasnovski/mini.pairs", event = "InsertEnter", opts = {} },

  {
    "rachartier/tiny-inline-diagnostic.nvim",
    event = "LspAttach",
    opts = {
      preset = "modern",
      multilines = { enabled = true },
    },
  },

  {
    "smoka7/hop.nvim",
    keys = {
      { "gw", "<cmd>HopWord<cr>", mode = { "n", "x", "o" }, desc = "Jump to word" },
    },
    opts = {},
  },
}
