/**
 * Rigby's Games — Apps Script backend  (Code.gs)
 * ---------------------------------------------------------------------------
 * Paste into the Apps Script editor bound to your Sheet
 * (Sheet → Extensions → Apps Script), then Deploy → Web app
 *   Execute as:      Me
 *   Who has access:  Anyone
 * Copy the /exec URL into app.js (API_URL). When you change this file later,
 * redeploy via Deploy → Manage deployments (edit the existing one) so the URL
 * stays the same.
 * ---------------------------------------------------------------------------
 *
 * Tabs and header rows (row 1). Column order matters on the tabs the script
 * WRITES to (Sessions, Scores, Nominations, Votes):
 *
 *   Settings     : key | value
 *   Sessions     : id | date | game | notes | created_at
 *   Scores       : id | session_id | player | score | won | created_at
 *   Nominations  : id | game | added_by | created_at
 *   Votes        : id | nomination_id | voter_id | created_at
 *
 * Set the subtitle by adding a row to Settings:
 *   next_game_night | Fri Nov 21 · 7pm @ Rigby's
 *
 * To start a fresh vote, clear the rows in Nominations and Votes.
 */

// Optional shared secret. Leave "" to accept any request.
// To enable: set a value here AND the same value in app.js (SECRET).
const SECRET = "";

const TABS = {
  settings: "Settings",
  sessions: "Sessions",
  scores: "Scores",
  nominations: "Nominations",
  votes: "Votes",
};

// ---- Web app entry points --------------------------------------------------

function doGet() {
  return json({ ok: true, data: readAll() });
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || "{}";
    const body = JSON.parse(raw);
    if (SECRET && body.secret !== SECRET) {
      return json({ ok: false, error: "unauthorized" });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      switch (body.action) {
        case "add_session":
          return json(addSession(body.payload));
        case "suggest_game":
          return json(suggestGame(body.payload));
        case "toggle_vote":
          return json(toggleVote(body.payload));
        default:
          return json({ ok: false, error: "unknown action: " + body.action });
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---- Actions ---------------------------------------------------------------

function addSession(p) {
  if (!p || !p.game) return { ok: false, error: "game is required" };
  const id = Utilities.getUuid();
  const now = new Date().toISOString();

  sheet(TABS.sessions).appendRow([
    id,
    String(p.date || now).slice(0, 10),
    String(p.game).slice(0, 100),
    String(p.notes || "").slice(0, 500),
    now,
  ]);

  (Array.isArray(p.scores) ? p.scores : []).forEach(function (s) {
    if (!s || !s.player) return;
    sheet(TABS.scores).appendRow([
      Utilities.getUuid(),
      id,
      String(s.player).slice(0, 60),
      Number(s.score) || 0,
      s.won ? "yes" : "",
      now,
    ]);
  });

  return { ok: true, id: id };
}

function suggestGame(p) {
  if (!p || !p.game) return { ok: false, error: "game is required" };
  const game = String(p.game).trim().slice(0, 100);
  if (!game) return { ok: false, error: "game is required" };

  // De-dupe by name (case-insensitive) against existing nominations.
  const existing = readTab(TABS.nominations);
  const match = existing.find(function (n) {
    return String(n.game).trim().toLowerCase() === game.toLowerCase();
  });
  if (match) return { ok: true, id: match.id, game: match.game, duplicate: true };

  const id = Utilities.getUuid();
  sheet(TABS.nominations).appendRow([
    id,
    game,
    String(p.added_by || "").slice(0, 60),
    new Date().toISOString(),
  ]);
  return { ok: true, id: id, game: game, duplicate: false };
}

// Approval voting: a voter may approve many games. Tapping a game toggles
// their approval — adds a vote row if absent, removes it if present.
function toggleVote(p) {
  if (!p || !p.nomination_id) return { ok: false, error: "nomination_id is required" };
  const voter = String(p.voter_id || "anon").slice(0, 80);
  const sh = sheet(TABS.votes);
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const iNom = headers.indexOf("nomination_id");
  const iVoter = headers.indexOf("voter_id");

  for (var r = 1; r < values.length; r++) {
    if (
      String(values[r][iNom]) === String(p.nomination_id) &&
      String(values[r][iVoter]) === voter
    ) {
      sh.deleteRow(r + 1); // toggle off
      return { ok: true, voted: false };
    }
  }

  sh.appendRow([
    Utilities.getUuid(),
    String(p.nomination_id).slice(0, 80),
    voter,
    new Date().toISOString(),
  ]);
  return { ok: true, voted: true };
}

// ---- Sheet helpers ---------------------------------------------------------

function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet(name) {
  const sh = ss().getSheetByName(name);
  if (!sh) throw new Error("Missing tab: " + name);
  return sh;
}

function readAll() {
  return {
    settings: readTab(TABS.settings),
    sessions: readTab(TABS.sessions),
    scores: readTab(TABS.scores),
    nominations: readTab(TABS.nominations),
    votes: readTab(TABS.votes),
  };
}

// Read a tab into an array of objects keyed by its header row.
// Skips rows whose FIRST column is blank (works for id-first and key-first tabs).
function readTab(name) {
  const values = sheet(name).getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const firstKey = headers[0];
  return values
    .slice(1)
    .map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    })
    .filter(function (o) { return o[firstKey] !== "" && o[firstKey] != null; });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
