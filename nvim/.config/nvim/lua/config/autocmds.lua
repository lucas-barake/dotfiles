vim.api.nvim_create_autocmd("TextYankPost", {
  callback = function()
    vim.highlight.on_yank()
  end,
})

local timer = vim.uv.new_timer()
timer:start(0, 10000, vim.schedule_wrap(function()
  if vim.fn.getcmdwintype() == "" then
    vim.cmd("checktime")
  end
end))
