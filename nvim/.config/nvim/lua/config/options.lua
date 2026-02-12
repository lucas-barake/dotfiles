vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

local opt = vim.opt

opt.autowrite = true
opt.clipboard = "unnamedplus"
opt.cmdheight = 0
opt.shortmess:append("WcCS")
vim.o.winborder = "single"

opt.cursorline = true
opt.expandtab = true
opt.ignorecase = true
opt.inccommand = "nosplit"
opt.linebreak = true
opt.number = true
opt.relativenumber = true
opt.scrolloff = 8
opt.shiftround = true
opt.shiftwidth = 2
opt.showmode = false
opt.sidescrolloff = 8
opt.signcolumn = "yes"
opt.smartcase = true
opt.smartindent = true
opt.smoothscroll = true
opt.splitbelow = true
opt.splitright = true
opt.swapfile = false
opt.tabstop = 2
opt.termguicolors = true
opt.undofile = true
opt.updatetime = 200
opt.timeoutlen = 300
opt.ttimeoutlen = 10
opt.virtualedit = "block"
opt.winbar = "%f"
opt.wrap = true
opt.breakindent = true
opt.showbreak = "↪ "
opt.wildmenu = true
opt.wildmode = "longest:full,full"
opt.wildoptions = "pum"
opt.pumheight = 15

vim.diagnostic.config({
  virtual_text = false,
  virtual_lines = { current_line = true },
  signs = true,
  underline = true,
  severity_sort = true,
})
