/**
 * Board game meetup — BoardGameGeek enrichment add-on  (bgg-enrich.gs)
 * ---------------------------------------------------------------------------
 * OPTIONAL. Paste this into the SAME Apps Script project as Code.gs
 * (File → + → Script, name it "bgg-enrich", and paste). It reuses the
 * sheet() and readTab() helpers already defined in Code.gs.
 *
 * What it does: fills a "Games" tab with cover art, player counts, play time,
 * and BGG rating, pulled from BoardGameGeek. It runs SERVER-SIDE inside Apps
 * Script, so there's no CORS problem (unlike calling BGG from the browser).
 *
 * Setup:
 *   1. Add a tab named "Games" with this exact header row:
 *        name | bgg_id | thumbnail | min_players | max_players | playtime | rating | updated_at
 *   2. Type the games you care about into the "name" column; leave the rest blank.
 *      (If you already know a game's BGG id, put it in "bgg_id" to skip the search.)
 *   3. In Code.gs, expose the tab to the site with two small edits:
 *        - add   games: "Games"          to the TABS object
 *        - add   games: readTab(TABS.games),   inside readAll()
 *   4. Run enrichGames() once from the editor to authorize and populate.
 *   5. Run installBggTrigger() once so it refreshes daily (or add a time-based
 *      trigger by hand via the clock icon in the Apps Script sidebar).
 * ---------------------------------------------------------------------------
 */

const BGG_BASE = "https://boardgamegeek.com/xmlapi2";

function enrichGames() {
  const sh = sheet("Games"); // sheet() is defined in Code.gs
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return;

  const col = {};
  values[0].forEach(function (h, i) { col[String(h).trim()] = i; });

  for (var r = 1; r < values.length; r++) {
    var name = String(values[r][col.name] || "").trim();
    if (!name) continue;

    var id = String(values[r][col.bgg_id] || "").trim();
    try {
      if (!id) {
        id = bggSearchId(name);
        if (!id) continue;
      }
      var g = bggThing(id);
      if (!g) continue;

      setCell(sh, r, col.bgg_id, id);
      setCell(sh, r, col.thumbnail, g.thumbnail);
      setCell(sh, r, col.min_players, g.minPlayers);
      setCell(sh, r, col.max_players, g.maxPlayers);
      setCell(sh, r, col.playtime, g.playingTime);
      setCell(sh, r, col.rating, g.rating);
      setCell(sh, r, col.updated_at, new Date().toISOString());
    } catch (err) {
      Logger.log("BGG enrich failed for " + name + ": " + err);
    }
    Utilities.sleep(1500); // be polite to BGG's servers / rate limits
  }
}

// Resolve a game name to a BGG id (first match).
function bggSearchId(name) {
  var xml = fetchXml(BGG_BASE + "/search?type=boardgame&query=" + encodeURIComponent(name));
  if (!xml) return "";
  var items = xml.getRootElement().getChildren("item");
  return items.length ? items[0].getAttribute("id").getValue() : "";
}

// Fetch and parse a single game's details.
function bggThing(id) {
  var xml = fetchXml(BGG_BASE + "/thing?stats=1&id=" + encodeURIComponent(id));
  if (!xml) return null;
  var item = xml.getRootElement().getChild("item");
  if (!item) return null;

  return {
    thumbnail: nodeText(item.getChild("thumbnail")),
    minPlayers: nodeAttr(item.getChild("minplayers"), "value"),
    maxPlayers: nodeAttr(item.getChild("maxplayers"), "value"),
    playingTime: nodeAttr(item.getChild("playingtime"), "value"),
    rating: bggAverage(item),
  };
}

function bggAverage(item) {
  var stats = item.getChild("statistics");
  var ratings = stats ? stats.getChild("ratings") : null;
  var avg = ratings ? nodeAttr(ratings.getChild("average"), "value") : "";
  var n = Number(avg);
  return n ? Math.round(n * 10) / 10 : "";
}

// --- fetch + tiny XML helpers ---
function fetchXml(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code === 202) { // BGG sometimes queues a request — retry once
    Utilities.sleep(2500);
    res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    code = res.getResponseCode();
  }
  return code === 200 ? XmlService.parse(res.getContentText()) : null;
}

function nodeText(node) { return node ? node.getText() : ""; }

function nodeAttr(node, name) {
  if (!node) return "";
  var a = node.getAttribute(name);
  return a ? a.getValue() : "";
}

function setCell(sh, rowIndex0, colIndex0, value) {
  if (colIndex0 == null || colIndex0 < 0) return;
  sh.getRange(rowIndex0 + 1, colIndex0 + 1).setValue(value);
}

// Run once to refresh the data every day at ~4am.
function installBggTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "enrichGames") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("enrichGames").timeBased().everyDays(1).atHour(4).create();
}
