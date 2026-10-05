-- Rest the pointer over a symbol and the LSP hover doc appears next to it.
--
-- Neovim reports pointer motion only when 'mousemoveevent' is set: it then asks
-- the terminal for DEC mode 1003 and turns each report into a <MouseMove> key.
--
-- The float is created only once a server has actually returned something, so
-- drifting over indentation, comments or string bodies stays silent instead of
-- flashing an empty window.

local api = vim.api
local lsp = vim.lsp

local DELAY_MS = 350

local timer ---@type uv.uv_timer_t?
local float_win ---@type integer?
local seq = 0

local function close_float()
  if float_win and api.nvim_win_is_valid(float_win) then
    api.nvim_win_close(float_win, true)
  end
  float_win = nil
end

---@return integer? bufnr, string? line, integer? row 0-based, integer? col 0-based byte
local function target_under_mouse()
  local mp = vim.fn.getmousepos()
  if mp.winid == 0 or mp.line == 0 then
    return
  end
  if api.nvim_win_get_config(mp.winid).relative ~= "" then
    return
  end

  local buf = api.nvim_win_get_buf(mp.winid)
  local line = api.nvim_buf_get_lines(buf, mp.line - 1, mp.line, false)[1]
  if not line then
    return
  end

  -- getmousepos() columns are 1-based byte indexes, clamped to one past the
  -- last byte when the pointer sits beyond the text.
  local col = mp.column - 1
  if col >= #line or line:sub(col + 1, col + 1):match("%s") then
    return
  end

  return buf, line, mp.line - 1, col
end

---@param results table<integer, { err: lsp.ResponseError?, result: lsp.Hover? }>
---@return string[]
local function collect(results)
  local contents = {}
  for client_id, resp in pairs(results) do
    if resp.err then
      lsp.log.error(resp.err.code, resp.err.message)
    elseif resp.result and resp.result.contents then
      local lines = lsp.util.convert_input_to_markdown_lines(resp.result.contents)
      if not vim.tbl_isempty(lines) then
        if not vim.tbl_isempty(contents) then
          contents[#contents + 1] = "---"
        end
        if vim.tbl_count(results) > 1 then
          contents[#contents + 1] = ("# %s"):format(assert(lsp.get_client_by_id(client_id)).name)
        end
        vim.list_extend(contents, lines)
      end
    end
  end
  return contents
end

local function show()
  seq = seq + 1
  local request = seq

  if float_win and vim.fn.getmousepos().winid == float_win then
    return
  end

  local buf, line, row, col = target_under_mouse()
  if not buf then
    close_float()
    return
  end

  if vim.tbl_isempty(lsp.get_clients({ bufnr = buf, method = "textDocument/hover" })) then
    close_float()
    return
  end

  local function params(client)
    return {
      textDocument = lsp.util.make_text_document_params(buf),
      position = {
        line = row,
        character = vim.str_utfindex(line, client.offset_encoding, col),
      },
    }
  end

  lsp.buf_request_all(buf, "textDocument/hover", params, function(results)
    -- A newer pointer position superseded this one; its own request will
    -- decide what to draw.
    if request ~= seq then
      return
    end

    local contents = collect(results)
    close_float()
    if vim.tbl_isempty(contents) then
      return
    end

    local _, win = lsp.util.open_floating_preview(contents, "markdown", {
      relative = "mouse",
      focus = false,
      border = "single",
      max_width = 90,
      max_height = 25,
    })
    float_win = win

    api.nvim_create_autocmd("WinScrolled", { once = true, callback = close_float })
  end)
end

vim.o.mousemoveevent = true

vim.keymap.set("n", "<MouseMove>", function()
  timer = timer or assert(vim.uv.new_timer())
  timer:stop()
  timer:start(DELAY_MS, 0, vim.schedule_wrap(show))
end, { desc = "Hover under mouse" })
