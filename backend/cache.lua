--[[
    Per-game cache of raw source data, kept in memory and in cache.json in the
    plugin's own folder (see paths.lua). Each source (storebrowse, appreviews,
    recent_row) has its own timestamp: stale after 12 hours (shown, then refreshed),
    dropped after 30 days. Call save() after a batch of changes.
]]

local json = require("json")
local logger = require("logger")
local paths = require("paths")

local M = {}

M.STALE_SECONDS = 12 * 60 * 60
M.EXPIRE_SECONDS = 30 * 24 * 60 * 60
M.MAX_ENTRIES = 5000
M.SOURCES = { "storebrowse", "appreviews", "recent_row" }

local entries = {}

local function cache_path()
    return paths.data_file("cache.json")
end

-- Converts an entry from the first cache format ({ t, data = { source = body } }).
local function migrate(entry)
    if type(entry) ~= "table" or type(entry.data) ~= "table" then
        return entry
    end
    local migrated = {}
    for _, key in ipairs(M.SOURCES) do
        local body = entry.data[key]
        if body ~= nil then
            migrated[key] = { t = entry.t or 0, body = body }
        elseif key == "recent_row" then
            -- The old format only cached complete fetches, so a missing row meant "no row".
            migrated[key] = { t = entry.t or 0, body = false }
        end
    end
    return migrated
end

local function newest(entry)
    local t = 0
    for _, key in ipairs(M.SOURCES) do
        if entry[key] and (entry[key].t or 0) > t then
            t = entry[key].t
        end
    end
    return t
end

-- Drops the least recently updated games beyond MAX_ENTRIES.
local function prune()
    local list = {}
    for key, entry in pairs(entries) do
        table.insert(list, { key = key, t = newest(entry) })
    end
    if #list <= M.MAX_ENTRIES then
        return
    end
    table.sort(list, function(a, b)
        return a.t < b.t
    end)
    for i = 1, #list - M.MAX_ENTRIES do
        entries[list[i].key] = nil
    end
end

function M.load()
    entries = {}
    local file = io.open(cache_path(), "r")
    if not file then
        return
    end
    local content = file:read("*a")
    file:close()
    local ok, parsed = pcall(json.decode, content)
    if not ok or type(parsed) ~= "table" then
        logger:info("Cache file invalid, starting empty")
        return
    end
    for key, entry in pairs(parsed) do
        entries[key] = migrate(entry)
    end
end

function M.save()
    prune()
    local file, err = io.open(cache_path(), "w")
    if not file then
        logger:error("Failed to write cache: " .. tostring(err))
        return
    end
    file:write(json.encode(entries))
    file:close()
end

-- "fresh", "stale" or "missing" for one source of one game.
function M.state(app_id, key)
    local entry = entries[tostring(app_id)]
    local source = entry and entry[key]
    if not source then
        return "missing"
    end
    local age = os.time() - (source.t or 0)
    if age > M.EXPIRE_SECONDS then
        entry[key] = nil
        return "missing"
    end
    return age > M.STALE_SECONDS and "stale" or "fresh"
end

-- Raw bodies for a game: { source = body } (body may be false for "no recent row").
function M.bodies(app_id)
    local entry = entries[tostring(app_id)] or {}
    local result = {}
    for _, key in ipairs(M.SOURCES) do
        if entry[key] then
            result[key] = entry[key].body
        end
    end
    return result
end

function M.set(app_id, key, body)
    local id = tostring(app_id)
    entries[id] = entries[id] or {}
    entries[id][key] = { t = os.time(), body = body }
end

function M.clear()
    entries = {}
    M.save()
end

function M.count()
    local n = 0
    for _ in pairs(entries) do
        n = n + 1
    end
    return n
end

return M
