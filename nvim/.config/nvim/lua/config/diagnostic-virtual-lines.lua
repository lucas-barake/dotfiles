local api = vim.api

local chars = {
  cross = "┼",
  horizontal = "─",
  horizontal_up = "┴",
  up_right = "└",
  vertical = "│",
  vertical_right = "├",
}

local severity_highlights = {
  [1] = "DiagnosticVirtualLinesError",
  [2] = "DiagnosticVirtualLinesWarn",
  [3] = "DiagnosticVirtualLinesInfo",
  [4] = "DiagnosticVirtualLinesHint",
}

local CENTER_WIDTH = 6
local TYPE_INDENT = "  "

local function distance_between_cols(bufnr, lnum, start_col, end_col)
  return api.nvim_buf_call(bufnr, function()
    local s = vim.fn.virtcol({ lnum + 1, start_col })
    local e = vim.fn.virtcol({ lnum + 1, end_col + 1 })
    return e - 1 - s
  end)
end

local function wrap_text(text, max_width)
  if max_width < 10 then
    return { text }
  end
  if vim.fn.strdisplaywidth(text) <= max_width then
    return { text }
  end

  local lines = {}
  local remaining = text
  while vim.fn.strdisplaywidth(remaining) > max_width do
    local break_at = max_width
    local sub = remaining:sub(1, break_at)
    local space_pos = sub:reverse():find(" ")
    if space_pos and space_pos <= break_at - 5 then
      break_at = break_at - space_pos + 1
      table.insert(lines, remaining:sub(1, break_at - 1))
      remaining = remaining:sub(break_at + 1)
    else
      table.insert(lines, remaining:sub(1, max_width))
      remaining = remaining:sub(max_width + 1)
    end
  end
  if #remaining > 0 then
    table.insert(lines, remaining)
  end
  return lines
end

local function is_complex_type(text)
  return #text > 40
    or text:find("{")
    or text:find("|")
    or text:find("=>")
    or text:find("&")
    or text:find("<")
end

local function is_ts_source(diagnostic)
  local source = (diagnostic.source or ""):lower()
  return source == "ts" or source == "typescript" or source:find("^ts")
end

local function parse_ts_chunks(msg)
  local display_lines = {}
  local current_chunks = {}

  local pos = 1
  while pos <= #msg do
    local q_start = msg:find("'", pos, true)
    if not q_start then
      local rest = msg:sub(pos)
      if #rest > 0 then
        table.insert(current_chunks, { text = rest, kind = "prose" })
      end
      break
    end

    local q_end = msg:find("'", q_start + 1, true)
    if not q_end then
      local rest = msg:sub(pos)
      if #rest > 0 then
        table.insert(current_chunks, { text = rest, kind = "prose" })
      end
      break
    end

    if q_start > pos then
      table.insert(current_chunks, { text = msg:sub(pos, q_start - 1), kind = "prose" })
    end

    local type_text = msg:sub(q_start + 1, q_end - 1)

    if is_complex_type(type_text) then
      if #current_chunks > 0 then
        table.insert(display_lines, current_chunks)
        current_chunks = {}
      end
      table.insert(display_lines, { { text = TYPE_INDENT .. type_text, kind = "type" } })
    else
      table.insert(current_chunks, { text = type_text, kind = "type" })
    end

    pos = q_end + 1
  end

  if #current_chunks > 0 then
    table.insert(display_lines, current_chunks)
  end

  for i = #display_lines, 2, -1 do
    local line = display_lines[i]
    local flat = ""
    for _, chunk in ipairs(line) do
      flat = flat .. chunk.text
    end
    if flat:match("^%s*%p?%s*$") then
      local prev = display_lines[i - 1]
      prev[#prev].text = prev[#prev].text .. vim.trim(flat)
      table.remove(display_lines, i)
    end
  end

  return display_lines
end

local function chunks_total_width(chunks)
  local w = 0
  for _, chunk in ipairs(chunks) do
    w = w + vim.fn.strdisplaywidth(chunk.text)
  end
  return w
end

local function flatten_chunks_text(chunks)
  local parts = {}
  for _, chunk in ipairs(chunks) do
    table.insert(parts, chunk.text)
  end
  return table.concat(parts)
end

local function render_msg_chunks(chunks, hl, max_width)
  local total = chunks_total_width(chunks)
  if total <= max_width then
    local result = {}
    for _, chunk in ipairs(chunks) do
      local chunk_hl = chunk.kind == "type" and "DiagnosticVirtualLinesType" or hl
      table.insert(result, { chunk.text, chunk_hl })
    end
    return { result }
  end

  local all_type = true
  for _, chunk in ipairs(chunks) do
    if chunk.kind ~= "type" then
      all_type = false
      break
    end
  end
  local wrap_hl = all_type and "DiagnosticVirtualLinesType" or hl

  local flat = flatten_chunks_text(chunks)
  local wrapped = wrap_text(flat, max_width)
  local lines = {}
  for _, line in ipairs(wrapped) do
    table.insert(lines, { { line, wrap_hl } })
  end
  return lines
end

local function render_plain_msg(text, hl, max_width)
  local wrapped = wrap_text(text, max_width)
  local lines = {}
  for _, line in ipairs(wrapped) do
    table.insert(lines, { { line, hl } })
  end
  return lines
end

local ElementType = { Space = 1, Diagnostic = 2, Overlap = 3, Blank = 4 }

local function render(namespace, bufnr, diagnostics)
  table.sort(diagnostics, function(a, b)
    if a.lnum ~= b.lnum then
      return a.lnum < b.lnum
    end
    if a.col ~= b.col then
      return a.col < b.col
    end
    return a.severity < b.severity
  end)

  api.nvim_buf_clear_namespace(bufnr, namespace, 0, -1)

  if not next(diagnostics) then
    return
  end

  local win_width = api.nvim_win_get_width(0)

  local line_stacks = {}
  local prev_lnum = -1
  local prev_col = 0
  for _, diag in ipairs(diagnostics) do
    if not line_stacks[diag.lnum] then
      line_stacks[diag.lnum] = {}
    end
    local stack = line_stacks[diag.lnum]

    if diag.lnum ~= prev_lnum then
      local space = string.rep(" ", distance_between_cols(bufnr, diag.lnum, 0, diag.col))
      table.insert(stack, { ElementType.Space, space })
    elseif diag.col ~= prev_col then
      local space =
        string.rep(" ", distance_between_cols(bufnr, diag.lnum, prev_col + 1, diag.col))
      table.insert(stack, { ElementType.Space, space })
    else
      table.insert(stack, { ElementType.Overlap, diag.severity })
    end

    if diag.message:find("^%s*$") then
      table.insert(stack, { ElementType.Blank, diag })
    else
      table.insert(stack, { ElementType.Diagnostic, diag })
    end

    prev_lnum, prev_col = diag.lnum, diag.col
  end

  for lnum, stack in pairs(line_stacks) do
    local virt_lines = {}

    for i = #stack, 1, -1 do
      if stack[i][1] == ElementType.Diagnostic then
        local diagnostic = stack[i][2]
        local hl = severity_highlights[diagnostic.severity]
        local left = {}
        local left_width = 0
        local overlap = false
        local multi = false

        for j = 1, i - 1 do
          local etype = stack[j][1]
          local data = stack[j][2]
          if etype == ElementType.Space then
            if multi then
              table.insert(left, { string.rep(chars.horizontal, data:len()), hl })
            else
              table.insert(left, { data, "" })
            end
            left_width = left_width + data:len()
          elseif etype == ElementType.Diagnostic then
            if stack[j + 1][1] ~= ElementType.Overlap then
              table.insert(left, { chars.vertical, severity_highlights[data.severity] })
              left_width = left_width + 1
            end
            overlap = false
          elseif etype == ElementType.Blank then
            if multi then
              table.insert(left, { chars.horizontal_up, severity_highlights[data.severity] })
            else
              table.insert(left, { chars.up_right, severity_highlights[data.severity] })
            end
            left_width = left_width + 1
            multi = true
          elseif etype == ElementType.Overlap then
            overlap = true
          end
        end

        local center_char
        if overlap and multi then
          center_char = chars.cross
        elseif overlap then
          center_char = chars.vertical_right
        elseif multi then
          center_char = chars.horizontal_up
        else
          center_char = chars.up_right
        end

        local center_text = center_char .. string.rep(chars.horizontal, 4) .. " "
        local center_first = { { center_text, hl } }

        local center_cont
        if overlap then
          center_cont = { { chars.vertical, hl }, { "     ", "" } }
        else
          center_cont = { { "      ", "" } }
        end

        local max_msg_width = win_width - left_width - CENTER_WIDTH

        local msg = diagnostic.message
        if diagnostic.code then
          msg = string.format("%s: %s", diagnostic.code, msg)
        end

        local use_ts_format = is_ts_source(diagnostic)

        for msg_line in msg:gmatch("([^\n]+)") do
          local rendered_lines

          if use_ts_format then
            local parsed = parse_ts_chunks(msg_line)
            rendered_lines = {}
            for _, chunks in ipairs(parsed) do
              local chunk_lines = render_msg_chunks(chunks, hl, max_msg_width)
              vim.list_extend(rendered_lines, chunk_lines)
            end
          else
            rendered_lines = render_plain_msg(msg_line, hl, max_msg_width)
          end

          for _, msg_chunks in ipairs(rendered_lines) do
            local vline = {}
            vim.list_extend(vline, left)
            vim.list_extend(vline, center_first)
            vim.list_extend(vline, msg_chunks)
            table.insert(virt_lines, vline)
            center_first = center_cont
          end
        end
      end
    end

    api.nvim_buf_set_extmark(bufnr, namespace, lnum, 0, {
      virt_lines = virt_lines,
    })
  end
end

local ns = api.nvim_create_namespace("diagnostic_virtual_lines_wrap")
local augroup = api.nvim_create_augroup("diagnostic_virtual_lines_wrap", { clear = true })

local function diagnostics_on_line(diagnostics, lnum)
  local result = {}
  for _, d in ipairs(diagnostics) do
    if d.lnum == lnum then
      table.insert(result, d)
    end
  end
  return result
end

vim.diagnostic.handlers.virtual_lines = {
  show = function(namespace_id, bufnr, diagnostics, opts)
    bufnr = vim.fn.bufnr(bufnr)
    local vl = opts and opts.virtual_lines
    if not vl then
      return
    end

    api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
    api.nvim_clear_autocmds({ group = augroup, buffer = bufnr })

    if type(vl) == "table" and vl.current_line then
      local function refresh()
        local cursor_lnum = api.nvim_win_get_cursor(0)[1] - 1
        render(ns, bufnr, diagnostics_on_line(diagnostics, cursor_lnum))
      end

      api.nvim_create_autocmd("CursorMoved", {
        buffer = bufnr,
        group = augroup,
        callback = refresh,
      })
      refresh()
    else
      render(ns, bufnr, diagnostics)
    end
  end,

  hide = function(_, bufnr)
    bufnr = vim.fn.bufnr(bufnr)
    if api.nvim_buf_is_valid(bufnr) then
      api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
      api.nvim_clear_autocmds({ group = augroup, buffer = bufnr })
    end
  end,
}
