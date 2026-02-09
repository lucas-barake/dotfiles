local function map(mode, lhs, rhs, opts)
  vim.keymap.set(mode, lhs, rhs, opts or {})
end

map("n", "<leader>w", "<cmd>w<cr>", { desc = "Save" })
map({ "n", "i", "v" }, "<C-s>", "<cmd>w<cr>", { desc = "Save" })
map("n", "<leader>q", "<cmd>q<cr>", { desc = "Quit" })
map("n", "<leader>bd", function()
  if not vim.bo.modified then
    vim.cmd("bdelete")
    return
  end
  vim.ui.select({ "Save and close", "Discard changes", "Cancel" }, { prompt = "Unsaved changes:" }, function(choice)
    if choice == "Save and close" then
      vim.cmd("write | bdelete")
    elseif choice == "Discard changes" then
      vim.cmd("bdelete!")
    end
  end)
end, { desc = "Close buffer" })

map("n", "[d", vim.diagnostic.goto_prev, { desc = "Prev diagnostic" })
map("n", "]d", vim.diagnostic.goto_next, { desc = "Next diagnostic" })
map("n", "<leader>cd", vim.diagnostic.open_float, { desc = "Line diagnostics" })

map("n", "<leader>cr", vim.lsp.buf.rename, { desc = "Rename" })
map("n", "<leader>ca", vim.lsp.buf.code_action, { desc = "Code action" })
map("n", "gd", vim.lsp.buf.definition, { desc = "Go to definition" })
map("n", "gt", vim.lsp.buf.type_definition, { desc = "Go to type definition" })
map("n", "gi", vim.lsp.buf.implementation, { desc = "Go to implementation" })
map("n", "gr", vim.lsp.buf.references, { desc = "References" })
map("n", "K", vim.lsp.buf.hover, { desc = "Hover" })

local function copy_relative_path()
  local path = vim.fn.fnamemodify(vim.fn.expand("%"), ":.")
  vim.fn.setreg("+", path)
  vim.notify("Copied: " .. path)
end

local function copy_absolute_path()
  local path = vim.fn.expand("%:p")
  vim.fn.setreg("+", path)
  vim.notify("Copied: " .. path)
end

map("n", "<leader>fp", copy_relative_path, { desc = "Copy relative path" })
map("n", "<leader>fP", copy_absolute_path, { desc = "Copy absolute path" })

vim.api.nvim_create_user_command("CopyRelativePath", copy_relative_path, {})
vim.api.nvim_create_user_command("CopyAbsolutePath", copy_absolute_path, {})

map({ "n", "i", "v" }, "<ScrollWheelUp>", "<C-y>", { desc = "Scroll up (slow)" })
map({ "n", "i", "v" }, "<ScrollWheelDown>", "<C-e>", { desc = "Scroll down (slow)" })

for _, key in ipairs({ "<Up>", "<Down>", "<Left>", "<Right>" }) do
  map({ "n", "v" }, key, "<Nop>")
end

map("n", "<Esc>", function()
  vim.cmd("nohlsearch")
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    if vim.api.nvim_win_get_config(win).relative ~= "" then
      vim.api.nvim_win_close(win, false)
    end
  end
end, { desc = "Clear search and close floats" })

map("n", "<C-w>v", function()
  vim.cmd("vsplit")
  require("oil").open(vim.fn.expand("#:p:h"))
end, { desc = "Vertical split with Oil (file dir)" })

map("n", "<C-h>", "<C-w>h", { desc = "Go to left window" })
map("n", "<C-j>", "<C-w>j", { desc = "Go to lower window" })
map("n", "<C-k>", "<C-w>k", { desc = "Go to upper window" })
map("n", "<C-l>", "<C-w>l", { desc = "Go to right window" })

map("i", "<C-Space>", function()
  require("blink.cmp").show()
end, { desc = "Trigger completion" })

map("i", "<BS>", function()
  local col = vim.fn.col(".")
  if col <= 1 then return "<BS>" end
  local line = vim.fn.getline(".")
  local before = line:sub(1, col - 1)
  local ws = before:match("%s+$")
  if ws and #ws > 1 then
    return string.rep("<BS>", #ws)
  end
  return "<BS>"
end, { expr = true, desc = "Hungry backspace" })

map({ "n", "i" }, "\x1b[13;5u", "<C-CR>", { remap = true })
map("n", "<C-CR>", vim.lsp.buf.code_action, { desc = "Code action" })
