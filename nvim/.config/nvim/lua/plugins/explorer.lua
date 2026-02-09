return {
  {
    "stevearc/oil.nvim",
    lazy = false,
    keys = {
      { "-", "<cmd>Oil<cr>", desc = "Open parent directory" },
    },
    opts = {
      default_file_explorer = true,
      skip_confirm_for_simple_edits = true,
      watch_for_changes = true,
      view_options = {
        show_hidden = true,
      },
    },
  },
}
