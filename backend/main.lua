--[[
    Library Scores - Millennium plugin backend.

    Fetches and caches raw Steam data per game; the frontend parses it and decides
    what to prefetch. Lua runs one call at a time, so a page-open fetch waits for at
    most one in-flight prefetch.
]]

local logger = require("logger")
local millennium = require("millennium")
local json = require("json")
local sources = require("sources")
local cache = require("cache")
local settings = require("settings")
local paths = require("paths")

local GAME_SOURCES = {
    { key = "storebrowse", fetch = function(app_id)
        local by_id, err, status = sources.fetch_storebrowse({ app_id })
        return by_id and by_id[app_id], err, status
    end },
    { key = "appreviews", fetch = sources.fetch_appreviews },
    { key = "recent_row", fetch = sources.fetch_recent_row },
}

-- Runs fn and returns its JSON result, or a JSON error if it throws.
local function guarded(name, fn)
    local ok, result = pcall(fn)
    if not ok then
        logger:error(name .. " error: " .. tostring(result))
        return json.encode({ success = false, error = tostring(result) })
    end
    return result
end

local function valid_app_id(app_id)
    app_id = tonumber(app_id)
    if app_id and app_id > 0 and app_id < 2147483648 then
        return math.floor(app_id)
    end
    return nil
end

-- Cached bodies plus which sources still need fetching.
local function cached_state(app_id)
    local missing, stale = {}, {}
    for _, source in ipairs(GAME_SOURCES) do
        local state = cache.state(app_id, source.key)
        if state == "missing" then
            table.insert(missing, source.key)
        elseif state == "stale" then
            table.insert(stale, source.key)
        end
    end
    return { success = true, data = cache.bodies(app_id), missing = missing, stale = stale }
end

-- Instant: whatever is cached for a game, no requests.
function GetCached(app_id)
    return guarded("GetCached", function()
        app_id = valid_app_id(app_id)
        if not app_id then
            return json.encode({ success = false, error = "invalid app_id" })
        end
        return json.encode(cached_state(app_id))
    end)
end

-- Fetches the sources of one game that are missing or stale (all of them when force).
-- fetched = number of requests made; rateLimited when Steam answered 429.
function FetchGame(app_id, force)
    return guarded("FetchGame", function()
        app_id = valid_app_id(app_id)
        if not app_id then
            return json.encode({ success = false, error = "invalid app_id" })
        end
        local fetched, errors, rate_limited = 0, {}, false
        for _, source in ipairs(GAME_SOURCES) do
            if force or cache.state(app_id, source.key) ~= "fresh" then
                local body, err, status = source.fetch(app_id)
                fetched = fetched + 1
                if body ~= nil then
                    cache.set(app_id, source.key, body)
                else
                    table.insert(errors, source.key .. ": " .. tostring(err))
                    if status == 429 then
                        rate_limited = true
                        break
                    end
                end
            end
        end
        if fetched > 0 then
            cache.save()
        end
        if #errors > 0 then
            logger:warn("FetchGame " .. app_id .. ": " .. table.concat(errors, "; "))
        end
        local result = cached_state(app_id)
        result.fetched = fetched
        result.rateLimited = rate_limited
        result.errors = errors
        return json.encode(result)
    end)
end

-- Review summaries for many games, BATCH_SIZE per request, skipping fresh ones.
function FetchReviewsBatch(app_ids_json)
    return guarded("FetchReviewsBatch", function()
        local ok, ids = pcall(json.decode, app_ids_json)
        if not ok or type(ids) ~= "table" then
            return json.encode({ success = false, error = "invalid app id list" })
        end
        local todo = {}
        for _, raw in ipairs(ids) do
            local id = valid_app_id(raw)
            if id and cache.state(id, "storebrowse") ~= "fresh" then
                table.insert(todo, id)
            end
        end

        local fetched, rate_limited, errors = 0, false, {}
        for i = 1, #todo, sources.BATCH_SIZE do
            local chunk = {}
            for j = i, math.min(i + sources.BATCH_SIZE - 1, #todo) do
                table.insert(chunk, todo[j])
            end
            local by_id, err, status = sources.fetch_storebrowse(chunk)
            if by_id then
                for id, body in pairs(by_id) do
                    cache.set(id, "storebrowse", body)
                end
                fetched = fetched + #chunk
            else
                table.insert(errors, tostring(err))
                if status == 429 then
                    rate_limited = true
                    break
                end
            end
        end
        if fetched > 0 then
            cache.save()
        end
        return json.encode({ success = true, fetched = fetched, rateLimited = rate_limited, errors = errors })
    end)
end

function GetSettings()
    return guarded("GetSettings", function()
        return json.encode({ success = true, data = settings.load() })
    end)
end

function SaveSettings(settings_json)
    return guarded("SaveSettings", function()
        local parsed = json.decode(settings_json)
        if type(parsed) ~= "table" then
            return json.encode({ success = false, error = "Invalid settings" })
        end
        if not settings.save(settings.merge_defaults(parsed)) then
            return json.encode({ success = false, error = "Failed to write settings file" })
        end
        return json.encode({ success = true })
    end)
end

function ClearCache()
    return guarded("ClearCache", function()
        cache.clear()
        return json.encode({ success = true })
    end)
end

-- Frontend diagnostics into this plugin's log file.
function Log(message)
    logger:info(tostring(message))
    return json.encode({ success = true })
end

local function on_load()
    logger:info("Library Scores loaded, Millennium " .. millennium.version())
    logger:info("Data folder: " .. paths.plugin_dir())
    cache.load()
    logger:info("Cache entries: " .. cache.count())
    millennium.ready()
end

local function on_frontend_loaded()
    logger:info("Library Scores: frontend loaded")
end

local function on_unload()
    logger:info("Library Scores unloaded")
end

return {
    on_load = on_load,
    on_frontend_loaded = on_frontend_loaded,
    on_unload = on_unload,
    GetCached = GetCached,
    FetchGame = FetchGame,
    FetchReviewsBatch = FetchReviewsBatch,
    GetSettings = GetSettings,
    SaveSettings = SaveSettings,
    ClearCache = ClearCache,
    Log = Log,
}
