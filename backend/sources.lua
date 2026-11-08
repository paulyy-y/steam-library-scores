--[[
    Fetches the raw Steam responses the frontend parses.

    Kept deliberately thin: response bodies are passed through as strings and all
    parsing happens in frontend/scores (unit tested with bun). The exception is
    Metacritic: its scores need the game's slug first (from Steam's own Metacritic
    link, else a name search), so the slug is picked here. Steam's local Metacritic
    score stays the frontend's fallback.
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
M.METACRITIC_SEARCH_LIMIT = 10

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

function M.appdetails_url(app_id)
    return "https://store.steampowered.com/api/appdetails?appids=" .. string.format("%d", app_id)
        .. "&filters=metacritic"
end

-- Steam links the old URL format, https://www.metacritic.com/game/pc/<slug>?ftag=...
function M.slug_from_metacritic_url(url)
    if type(url) ~= "string" then
        return nil
    end
    return url:match("^https?://www%.metacritic%.com/game/[^/]+/([^/?#]+)")
end

function M.metacritic_search_url(name)
    return "https://backend.metacritic.com/finder/metacritic/search/" .. url_encode(name)
        .. "/web?offset=0&limit=" .. M.METACRITIC_SEARCH_LIMIT .. "&mcoTypeId=13"
end

-- kind is "critic" or "user". Without /platform/pc the scores are the lead platform's (often PS5).
function M.metacritic_stats_url(kind, slug)
    return "https://backend.metacritic.com/reviews/metacritic/" .. kind .. "/games/" .. url_encode(slug)
        .. "/platform/pc/stats/web"
end

-- Steam names carry ™, ® and curly quotes that Metacritic titles don't.
local function normalize_title(s)
    return (s:lower():gsub("[^%w]", ""))
end

-- Slug of the first search result with the same title that is on PC, or nil.
-- Exact titles only: a near match would show another game's (or a DLC's) score.
function M.pick_metacritic_slug(items, name)
    local wanted = normalize_title(name)
    for _, item in ipairs(items or {}) do
        if type(item.title) == "string" and normalize_title(item.title) == wanted then
            for _, platform in ipairs(item.platforms or {}) do
                if platform.name == "PC" then
                    return item.slug
                end
            end
        end
    end
    return nil
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
        return nil, "HTTP " .. tostring(response.status), response.status, response.body
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

-- Metacritic answers a renamed slug with a 301 that has no Location header; the new
-- slug is only in the body: errors[1].context.availableOn[1].slug = "<slug>/pc".
function M.moved_metacritic_slug(body)
    local ok, decoded = pcall(json.decode, body or "")
    if not ok or type(decoded) ~= "table" then
        return nil
    end
    local first_error = type(decoded.errors) == "table" and decoded.errors[1]
    local context = type(first_error) == "table" and first_error.context
    local available = type(context) == "table" and type(context.availableOn) == "table" and context.availableOn[1]
    local slug = type(available) == "table" and available.slug
    return type(slug) == "string" and slug:match("^[^/]+") or nil
end

-- The PC stats item ({ score, reviewCount, sentiment, url, ... }), or false when
-- Metacritic has none (404). On a 301, the 4th value is the slug the game moved to.
local function fetch_metacritic_stats(kind, slug)
    local body, err, status, error_body = get(M.metacritic_stats_url(kind, slug))
    if status == 404 then
        return false, nil, status
    end
    if status == 301 then
        return nil, err, status, M.moved_metacritic_slug(error_body)
    end
    if not body then
        return nil, err, status
    end
    local ok, decoded = pcall(json.decode, body)
    if not ok or type(decoded) ~= "table" then
        return nil, "invalid Metacritic " .. kind .. " stats", status
    end
    return decoded.data and decoded.data.item or false, nil, status
end

-- Slug from the Metacritic link Steam keeps for the app, or false when it has none.
-- Matched by app id, so it can't pick a same-named game.
local function steam_metacritic_slug(app_id)
    local body, err, status = get(M.appdetails_url(app_id))
    if not body then
        return nil, err, status
    end
    local ok, decoded = pcall(json.decode, body)
    if not ok or type(decoded) ~= "table" then
        return nil, "invalid appdetails response", status
    end
    local app = decoded[tostring(app_id)]
    local metacritic = app and type(app.data) == "table" and app.data.metacritic
    return M.slug_from_metacritic_url(metacritic and metacritic.url) or false, nil, status
end

-- Slug of the PC game with exactly this name, or false.
local function search_metacritic_slug(name)
    if type(name) ~= "string" or name == "" then
        return false, nil, 0
    end
    local body, err, status = get(M.metacritic_search_url(name))
    if status == 404 then
        return false, nil, status
    end
    if not body then
        return nil, err, status
    end
    local ok, decoded = pcall(json.decode, body)
    if not ok or type(decoded) ~= "table" then
        return nil, "invalid Metacritic search response", status
    end
    return M.pick_metacritic_slug(decoded.data and decoded.data.items, name) or false, nil, status
end

-- { slug, critic, user } as JSON, or false when Metacritic has no PC game for the app.
function M.fetch_metacritic(app_id, name)
    local slug, err, status = steam_metacritic_slug(app_id)
    if slug == false then
        slug, err, status = search_metacritic_slug(name)
    end
    if not slug then
        return slug, err, status
    end
    local result = { slug = slug }
    for _, kind in ipairs({ "critic", "user" }) do
        local item, stats_err, stats_status, moved = fetch_metacritic_stats(kind, result.slug)
        -- Steam's links can carry slugs Metacritic has since renamed. Follow once, not in a loop.
        if moved then
            result.slug = moved
            item, stats_err, stats_status = fetch_metacritic_stats(kind, moved)
        end
        if item == nil then
            return nil, stats_err, stats_status
        end
        result[kind] = item
    end
    return json.encode(result), nil, status
end

return M
