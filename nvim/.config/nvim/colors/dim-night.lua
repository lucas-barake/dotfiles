vim.cmd("hi clear")
if vim.fn.exists("syntax_on") then
  vim.cmd("syntax reset")
end

vim.o.termguicolors = true
vim.g.colors_name = "dim-night"

local hi = function(group, opts)
  vim.api.nvim_set_hl(0, group, opts)
end

-- Palette (from VS Code Dim Night theme)
local c = {
  bg = "#0A0A0A",
  bg_dark = "#060606",
  bg_float = "#0B0B0B",
  bg_highlight = "#151515",
  bg_widget = "#080808",
  border = "#404040",
  fg = "#e5e5e5",
  fg_dim = "#d4d4d4",
  fg_muted = "#9d9d9d",
  fg_gutter = "#4d4d4d",

  purple = "#BBB0FF",
  purple_dark = "#6d28d9",
  purple_accent = "#8b5cf6",
  purple_light = "#C792EA",
  pink = "#ec4899",
  pink_light = "#f6a9ff",
  pink_type = "#FF82C3",
  pink_id = "#f472b6",
  red = "#fe6767",
  red_error = "#f87171",
  red_dark = "#FF5370",
  orange = "#FFA86B",
  orange_dark = "#F78C6C",
  orange_brown = "#C17E70",
  yellow = "#f8ca73",
  yellow_light = "#fdce75",
  green = "#C8E997",
  green_bright = "#34d058",
  green_comment = "#60e67d",
  green_light = "#C3E88D",
  green_jade = "#4ade80",
  blue = "#8AC5F0",
  blue_bright = "#8BB1FF",
  blue_link = "#82BCFF",
  blue_cursor = "#c8e1ff",
  cyan = "#55D9C9",
  cyan_light = "#89DDFF",
  cyan_deep = "#33D6EF",
  teal = "#17E5E6",
  white = "#ffffff",
  gray = "#7a7a7a",
  gray_light = "#BCBCBC",
  gray_dark = "#353535",
  gray_comment = "#65737E",
  stone = "#d6d3d1",
  silver = "#dbdbdb",
  silver_light = "#B2CCD6",
  text_light = "#d1d5da",
  text = "#e1e4e8",
}

-- Editor UI
hi("Normal", { fg = c.fg, bg = c.bg })
hi("NormalFloat", { fg = c.fg, bg = c.bg_float })
hi("NormalNC", { fg = c.fg, bg = c.bg })
hi("SignColumn", { bg = c.bg })
hi("EndOfBuffer", { fg = c.bg })
hi("LineNr", { fg = "#707070" })
hi("CursorLineNr", { fg = c.purple })
hi("CursorLine", { bg = c.bg_highlight })
hi("CursorColumn", { bg = c.bg_highlight })
hi("ColorColumn", { bg = c.bg_highlight })
hi("Cursor", { fg = c.bg, bg = c.blue_cursor })
hi("lCursor", { fg = c.bg, bg = c.blue_cursor })
hi("CursorIM", { fg = c.bg, bg = c.blue_cursor })
hi("Visual", { bg = "#152e4b" })
hi("VisualNOS", { bg = "#0f1c2b" })
hi("Search", { bg = "#4b4018" })
hi("IncSearch", { bg = "#4b4018" })
hi("CurSearch", { bg = "#6c5a1e" })
hi("Substitute", { bg = "#4b4018" })
hi("MatchParen", { bg = "#0e4f4f" })
hi("Folded", { bg = "#191c1f", fg = c.fg_muted })
hi("FoldColumn", { fg = c.fg_gutter, bg = c.bg })

hi("Pmenu", { fg = c.text, bg = c.bg_float })
hi("PmenuSel", { bg = "#2a2a2a" })
hi("PmenuSbar", { bg = c.bg_widget })
hi("PmenuThumb", { bg = c.fg_gutter })

hi("StatusLine", { fg = c.text_light, bg = c.bg_dark })
hi("StatusLineNC", { fg = c.fg_muted, bg = c.bg_dark })
hi("TabLine", { fg = c.fg_muted, bg = c.bg_dark })
hi("TabLineFill", { bg = c.bg_dark })
hi("TabLineSel", { fg = c.text, bg = "#1a0f20" })
hi("WinSeparator", { fg = c.border })
hi("VertSplit", { fg = c.border })

hi("Directory", { fg = c.blue_bright })
hi("Title", { fg = c.text, bold = true })
hi("ErrorMsg", { fg = c.red_error })
hi("WarningMsg", { fg = "#ffab70" })
hi("MoreMsg", { fg = c.green })
hi("ModeMsg", { fg = c.fg })
hi("Question", { fg = c.green })
hi("NonText", { fg = c.fg_gutter })
hi("SpecialKey", { fg = c.fg_gutter })
hi("Conceal", { fg = c.fg_muted })
hi("Whitespace", { fg = c.fg_gutter })

hi("DiffAdd", { bg = "#102815" })
hi("DiffChange", { bg = "#0c140e" })
hi("DiffDelete", { bg = "#311316" })
hi("DiffText", { bg = "#133b1d" })

hi("DiagnosticError", { fg = c.red_error })
hi("DiagnosticWarn", { fg = "#ffab70" })
hi("DiagnosticInfo", { fg = c.purple })
hi("DiagnosticHint", { fg = c.cyan })
hi("DiagnosticUnderlineError", { undercurl = true, sp = c.red_error })
hi("DiagnosticUnderlineWarn", { undercurl = true, sp = "#ffab70" })
hi("DiagnosticUnderlineInfo", { undercurl = true, sp = c.purple })
hi("DiagnosticUnderlineHint", { undercurl = true, sp = c.cyan })

hi("GitSignsAdd", { fg = "#28a745" })
hi("GitSignsChange", { fg = c.purple })
hi("GitSignsDelete", { fg = "#ea4a5a" })

-- Syntax (fallback for non-treesitter)
hi("Comment", { fg = c.green_comment, italic = true })
hi("Constant", { fg = c.yellow })
hi("String", { fg = c.green })
hi("Character", { fg = c.green })
hi("Number", { fg = c.yellow })
hi("Boolean", { fg = c.yellow })
hi("Float", { fg = c.yellow })
hi("Identifier", { fg = c.white })
hi("Function", { fg = c.orange })
hi("Statement", { fg = c.purple })
hi("Conditional", { fg = c.purple })
hi("Repeat", { fg = c.purple })
hi("Label", { fg = c.purple })
hi("Operator", { fg = c.stone })
hi("Keyword", { fg = c.purple })
hi("Exception", { fg = c.purple })
hi("PreProc", { fg = c.purple })
hi("Include", { fg = c.purple })
hi("Define", { fg = c.purple })
hi("Macro", { fg = c.purple })
hi("PreCondit", { fg = c.purple })
hi("Type", { fg = c.yellow })
hi("StorageClass", { fg = c.purple })
hi("Structure", { fg = c.yellow })
hi("Typedef", { fg = c.yellow })
hi("Special", { fg = c.stone })
hi("SpecialChar", { fg = c.cyan_light })
hi("Tag", { fg = c.red })
hi("Delimiter", { fg = c.stone })
hi("Debug", { fg = c.red_error })
hi("Underlined", { underline = true })
hi("Error", { fg = c.red_dark })
hi("Todo", { fg = c.purple, bold = true })

-- Tree-sitter highlights
hi("@comment", { link = "Comment" })
hi("@variable", { fg = c.white })
hi("@variable.builtin", { fg = c.red, italic = true })
hi("@variable.parameter", { fg = c.cyan })
hi("@variable.member", { fg = c.blue })
hi("@property", { fg = c.blue })
hi("@constant", { fg = c.yellow })
hi("@constant.builtin", { fg = c.yellow })
hi("@constant.macro", { fg = c.yellow })
hi("@module", { fg = c.silver })
hi("@string", { fg = c.green })
hi("@string.escape", { fg = c.cyan_light })
hi("@string.regexp", { fg = c.cyan_light })
hi("@string.special.url", { fg = c.green, underline = true })
hi("@character", { fg = c.green })
hi("@number", { fg = c.yellow })
hi("@boolean", { fg = c.yellow })
hi("@float", { fg = c.yellow })
hi("@function", { fg = c.orange })
hi("@function.builtin", { fg = c.orange })
hi("@function.call", { fg = c.orange })
hi("@function.method", { fg = c.orange })
hi("@function.method.call", { fg = c.orange })
hi("@constructor", { fg = c.orange })
hi("@keyword", { fg = c.purple })
hi("@keyword.function", { fg = c.purple })
hi("@keyword.return", { fg = c.purple })
hi("@keyword.operator", { fg = c.purple })
hi("@keyword.import", { fg = c.purple })
hi("@keyword.export", { fg = c.purple })
hi("@keyword.conditional", { fg = c.purple })
hi("@keyword.repeat", { fg = c.purple })
hi("@keyword.exception", { fg = c.purple })
hi("@keyword.type", { fg = c.purple })
hi("@keyword.modifier", { fg = c.purple })
hi("@operator", { fg = c.stone })
hi("@punctuation", { fg = c.stone })
hi("@punctuation.bracket", { fg = c.stone })
hi("@punctuation.delimiter", { fg = c.stone })
hi("@punctuation.special", { fg = c.pink })
hi("@type", { fg = c.yellow })
hi("@type.builtin", { fg = c.yellow })
hi("@type.definition", { fg = c.yellow })
hi("@type.qualifier", { fg = c.purple })
hi("@tag", { fg = c.orange })
hi("@tag.builtin", { fg = c.red })
hi("@tag.attribute", { fg = c.yellow, italic = true })
hi("@tag.delimiter", { fg = c.stone })
hi("@attribute", { fg = c.yellow })
hi("@label", { fg = c.purple })
hi("@markup.heading", { fg = c.green_light })
hi("@markup.italic", { fg = c.red, italic = true })
hi("@markup.strong", { fg = c.red, bold = true })
hi("@markup.underline", { fg = c.orange_dark, underline = true })
hi("@markup.strikethrough", { strikethrough = true })
hi("@markup.link", { fg = c.blue_bright })
hi("@markup.link.url", { fg = c.green, underline = true })
hi("@markup.raw", { fg = c.purple_light })
hi("@markup.list", { fg = c.white })

-- LSP semantic tokens
hi("@lsp.type.namespace", { fg = c.silver })
hi("@lsp.type.property", { fg = c.blue })
hi("@lsp.type.variable", { fg = c.white })
hi("@lsp.type.parameter", { fg = c.cyan })
hi("@lsp.type.function", { fg = c.orange })
hi("@lsp.type.method", { fg = c.orange })
hi("@lsp.type.class", { fg = c.yellow })
hi("@lsp.type.interface", { fg = c.yellow })
hi("@lsp.type.type", { fg = c.yellow })
hi("@lsp.type.typeParameter", { fg = c.pink_type })
hi("@lsp.type.enum", { fg = c.yellow })
hi("@lsp.type.enumMember", { fg = c.yellow })
hi("@lsp.type.keyword", { fg = c.purple })
hi("@lsp.type.string", { fg = c.green })
hi("@lsp.type.number", { fg = c.yellow })
hi("@lsp.type.regexp", { fg = c.cyan_light })
hi("@lsp.mod.readonly", {})
hi("@lsp.mod.defaultLibrary", {})
hi("@lsp.typemod.variable.readonly", { fg = c.white })
hi("@lsp.typemod.property.readonly", { fg = c.blue })
hi("@lsp.typemod.class.defaultLibrary", { fg = c.yellow })

hi("FzfLuaNormal", { fg = c.fg, bg = c.bg_float })
hi("FzfLuaBorder", { fg = c.border, bg = c.bg_float })
hi("FzfLuaTitle", { fg = c.text, bg = c.purple_dark })
hi("FzfLuaPreviewTitle", { fg = c.text, bg = c.purple_dark })
hi("FzfLuaCursorLine", { bg = "#2a2a2a" })
hi("FzfLuaFzfMatch", { fg = c.purple })
hi("FzfLuaDirPart", { fg = c.fg_gutter })
hi("FzfLuaFilePart", { fg = "#ffffff" })

-- Plugin: Neo-tree
hi("NeoTreeNormal", { fg = c.text_light, bg = c.bg_dark })
hi("NeoTreeNormalNC", { fg = c.text_light, bg = c.bg_dark })
hi("NeoTreeDirectoryName", { fg = c.text_light })
hi("NeoTreeDirectoryIcon", { fg = c.blue_bright })
hi("NeoTreeRootName", { fg = c.text, bold = true })
hi("NeoTreeGitAdded", { fg = c.green_bright })
hi("NeoTreeGitModified", { fg = c.blue_link })
hi("NeoTreeGitDeleted", { fg = "#ea4a5a" })
hi("NeoTreeGitUntracked", { fg = c.green_bright })
hi("NeoTreeIndentMarker", { fg = c.bg_float })

-- Plugin: Which-key
hi("WhichKey", { fg = c.purple })
hi("WhichKeyGroup", { fg = c.orange })
hi("WhichKeyDesc", { fg = c.fg })
hi("WhichKeySeparator", { fg = c.fg_gutter })
hi("WhichKeyFloat", { bg = c.bg_dark })

-- Plugin: Indent Blankline
hi("IblIndent", { fg = c.gray_dark })
hi("IblScope", { fg = c.fg_gutter })

-- Plugin: Noice / Notify
hi("NotifyINFOBorder", { fg = c.purple })
hi("NotifyINFOTitle", { fg = c.purple })
hi("NotifyINFOIcon", { fg = c.purple })
hi("NotifyWARNBorder", { fg = "#ffab70" })
hi("NotifyWARNTitle", { fg = "#ffab70" })
hi("NotifyWARNIcon", { fg = "#ffab70" })
hi("NotifyERRORBorder", { fg = c.red_error })
hi("NotifyERRORTitle", { fg = c.red_error })
hi("NotifyERRORIcon", { fg = c.red_error })

-- Plugin: Lualine (handled via theme table below, but set fallbacks)
hi("lualine_a_normal", { fg = c.bg_dark, bg = c.purple_accent, bold = true })
hi("lualine_b_normal", { fg = c.text, bg = "#1A1A1A" })
hi("lualine_c_normal", { fg = c.fg_muted, bg = c.bg_dark })

-- Plugin: Lazy
hi("LazyButton", { fg = c.text, bg = "#1A1A1A" })
hi("LazyButtonActive", { fg = c.bg_dark, bg = c.purple })
hi("LazyH1", { fg = c.bg_dark, bg = c.purple, bold = true })

-- Plugin: Snacks Picker
hi("SnacksPickerDir", { fg = c.fg_muted })
hi("SnacksPickerFile", { fg = c.fg })
hi("SnacksPickerMatch", { fg = c.purple, bold = true })

-- Misc
hi("FloatBorder", { fg = c.border, bg = c.bg_float })
hi("WinBar", { fg = c.fg_muted })
hi("WinBarNC", { fg = c.fg_muted })
hi("LspInlayHint", { fg = "#949494", bg = "#101010" })
