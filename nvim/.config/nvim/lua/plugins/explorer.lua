return {
  {
    "mikavilpas/yazi.nvim",
    event = "VeryLazy",
    keys = {
      { "-", "<cmd>Yazi<cr>", desc = "Open yazi at current file" },
    },
    opts = {
      open_for_directories = true,
    },
  },
}
