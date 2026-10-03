--[[
    Fetches the raw Steam responses the frontend parses.

    Kept deliberately thin: response bodies are passed through as strings and all
    parsing happens in frontend/scores (unit tested with bun). Metacritic comes from
    Steam's local app overview in the frontend, so it isn't fetched here.
    scripts/capture-fixtures.mjs makes the same requests to refresh test fixtures.

    Each fetch returns: value (or nil), error string, HTTP status (429 = rate limited).
]]

local http = require("http")
local json = require("json")

local M = {}

M.TIMEOUT = 10
M.USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
-- Skips the store's age gate so mature games return their normal page.
M.STORE_COOKIE = "birthtime=0; wants_mature_content=1; lastagecheckage=1-0-1990"
M.ROW_MARKER = "user_reviews_summary_row"
M.ROW_MAX_CHARS = 3000
M.BATCH_SIZE = 50

-- Exposed so it can be swapped in tests.
M._http = http

local function url_encode(s)
    return (s:gsub("[^%w%-_%.~]", function(c)
        return string.format("%%%02X", string.byte(c))
    end))
end

function M.storebrowse_url(app_ids)
    local ids = {}
    for _, id in ipairs(app_ids) do
        table.insert(ids, '{"appid":' .. string.format("%d", id) .. "}")
    end
    local input = '{"ids":[' .. table.concat(ids, ",") .. '],"context":{"language":"english","country_code":"US"},'
        .. '"data_request":{"include_reviews":true}}'
    return "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=" .. url_encode(input)
end

function M.appreviews_url(app_id)
    return "https://store.steampowered.com/appreviews/" .. string.format("%d", app_id)
        .. "?json=1&filter=all&language=all&purchase_type=all&filter_offtopic_activity=0&num_per_page=0"
end

function M.storepage_url(app_id)
    return "https://store.steampowered.com/app/" .. string.format("%d", app_id) .. "/?l=english&cc=us"
end

-- Cuts the first review summary row out of a store page. When the game has
-- enough recent reviews, that row is "Recent Reviews".
-- Mirrors extractFirstReviewRow in scripts/capture-fixtures.mjs.
function M.extract_first_review_row(body)
    local s = body:find(M.ROW_MARKER, 1, true)
    if not s then
        return nil
    end
    local from = math.max(1, s - 40)
    local last = from + M.ROW_MAX_CHARS - 1
    local next_row = body:find(M.ROW_MARKER, s + 1, true)
    if next_row and next_row - 1 < last then
        last = next_row - 1
    end
    return body:sub(from, last)
end

local function get(url, headers)
    local response, err = M._http.get(url, {
        timeout = M.TIMEOUT,
        user_agent = M.USER_AGENT,
        headers = headers,
    })
    if not response then
        return nil, "request failed: " .. tostring(err), 0
    end
    if response.status ~= 200 then
        return nil, "HTTP " .. tostring(response.status), response.status
    end
    return response.body, nil, 200
end

-- Review summaries for up to BATCH_SIZE games in one request.
-- Returns a table of app id -> body shaped like a single-game GetItems response.
function M.fetch_storebrowse(app_ids)
    local body, err, status = get(M.storebrowse_url(app_ids))
    if not body then
        return nil, err, status
    end
    local ok, decoded = pcall(json.decode, body)
    if not ok or type(decoded) ~= "table" then
        return nil, "invalid GetItems response", status
    end
    local items = decoded.response and decoded.response.store_items or {}
    local by_id = {}
    for _, item in ipairs(items) do
        local id = tonumber(item.appid or item.id)
        if id then
            -- Keep only what the frontend reads; the full item (prices, categories) is ~4x bigger.
            local trimmed = { appid = id, reviews = item.reviews }
            by_id[id] = json.encode({ response = { store_items = { trimmed } } })
        end
    end
    -- Games Steam returned nothing for still get an entry, so they aren't refetched.
    for _, id in ipairs(app_ids) do
        if not by_id[id] then
            by_id[id] = '{"response":{"store_items":[]}}'
        end
    end
    return by_id, nil, status
end

function M.fetch_appreviews(app_id)
    return get(M.appreviews_url(app_id))
end

-- Returns the recent-reviews row, or false when the page has no review rows.
function M.fetch_recent_row(app_id)
    local page, err, status = get(M.storepage_url(app_id), { Cookie = M.STORE_COOKIE })
    if not page then
        return nil, err, status
    end
    return M.extract_first_review_row(page) or false, nil, status
end

return M
