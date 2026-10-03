local json = require("json")
local logger = require("logger")
local paths = require("paths")

local M = {}

M.DEFAULTS = {
    showReviews = true,
    showRecent = true,
    showSteamDb = true,
    showMetacritic = true,
}

local function settings_path()
    return paths.data_file("settings.json")
end

-- Keeps only known keys of the right type; anything else falls back to the default.
function M.merge_defaults(settings)
    local result = {}
    for key, default in pairs(M.DEFAULTS) do
        if type(settings[key]) == type(default) then
            result[key] = settings[key]
        else
            result[key] = default
        end
    end
    return result
end

function M.load()
    local file = io.open(settings_path(), "r")
    if not file then
        return M.merge_defaults({})
    end
    local content = file:read("*a")
    file:close()
    local ok, parsed = pcall(json.decode, content)
    if not ok or type(parsed) ~= "table" then
        logger:info("Settings file invalid, using defaults")
        return M.merge_defaults({})
    end
    return M.merge_defaults(parsed)
end

function M.save(settings)
    local file, err = io.open(settings_path(), "w")
    if not file then
        logger:error("Failed to write settings: " .. tostring(err))
        return false
    end
    file:write(json.encode(settings))
    file:close()
    return true
end

return M
