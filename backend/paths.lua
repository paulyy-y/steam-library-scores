--[[
    Where this plugin keeps its own files (cache.json, settings.json).

    millennium.get_install_path() is Millennium's folder, shared by every
    plugin, so files there collide with other plugins' files of the same name.
    Use this plugin's own folder instead: this file lives in <plugin>/backend/.
]]

local millennium = require("millennium")

local M = {}

M.PLUGIN_NAME = "steam-library-scores"

-- Parses a Lua chunk source ("@C:/.../plugin/backend/paths.lua") to the plugin folder.
function M.plugin_dir_from_source(source)
    if type(source) ~= "string" then
        return nil
    end
    return source:match("^@(.+)[/\\]backend[/\\][^/\\]+%.lua$")
end

local cached_dir

function M.plugin_dir()
    if cached_dir then
        return cached_dir
    end
    local info = debug and debug.getinfo and debug.getinfo(1, "S")
    cached_dir = M.plugin_dir_from_source(info and info.source)
        or (millennium.get_install_path() .. "/plugins/" .. M.PLUGIN_NAME)
    return cached_dir
end

function M.data_file(name)
    return M.plugin_dir() .. "/" .. name
end

return M
