/* Rigby's Games — front-end logic (app.js). Goes in your GitHub repo. */

// 1) Paste your Apps Script web-app /exec URL here after deploying Code.gs:
const API_URL = "PASTE_YOUR_WEB_APP_EXEC_URL_HERE";

// 2) If you set a SECRET in Code.gs, put the same value here (else leave ""):
const SECRET = "";

/* ---- per-browser voter id (one person = one vote per game) ---- */
function voterId() {
  let id = localStorage.getItem("gn_voter");
  if (!id) {
    id = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("gn_voter", id);
  }
  return id;
}

/* ---- tiny DOM helpers ---- */
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) =>
  String(s == null ? "" : s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

function status(msg, kind) {
  const s = $("#status");
  s.textContent = msg;
  s.className = "nes-container is-rounded status " + (kind || "");
  s.hidden = false;
  if (kind === "ok") setTimeout(() => (s.hidden = true), 2500);
}

/* ---- API ---- */
async function getData() {
  const res = await fetch(API_URL, { method: "GET" });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || "load failed");
  return body.data;
}
async function post(action, payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    // text/plain keeps this a "simple request" and skips the CORS preflight
    // that Apps Script web apps can't answer. Do not change to application/json.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload, secret: SECRET }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || "save failed");
  return body;
}

/* ---- render ---- */
function render(data) {
  renderNextNight(data);
  renderWinners(data);
  renderNoms(data);
}

function renderNextNight(data) {
  const row = (data.settings || []).find(
    (s) => String(s.key).trim().toLowerCase() === "next_game_night"
  );
  const val = row && String(row.value).trim();
  $("#next-night").querySelector(".ngn-value").textContent = val || "TBD";
}

/* --- champions --- */
function scoresBySession(data) {
  const map = {};
  (data.scores || []).forEach((s) => {
    (map[s.session_id] = map[s.session_id] || []).push(s);
  });
  return map;
}

function winnersOf(scores) {
  const flagged = scores.filter((s) => String(s.won).toLowerCase() === "yes");
  if (flagged.length) return flagged.map((s) => s.player);
  if (!scores.length) return [];
  const top = scores
    .slice()
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))[0];
  return top && top.player ? [top.player] : [];
}

function popover(scores) {
  const sorted = scores
    .slice()
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const lines = sorted
    .map((s) => {
      const win = String(s.won).toLowerCase() === "yes";
      return (
        `<span class="pop-line${win ? " pop-win" : ""}">` +
        `<span>${esc(s.player)}${win ? " \u2605" : ""}</span>` +
        `<span>${Number(s.score) || 0}</span></span>`
      );
    })
    .join("");
  return (
    `<span class="pop"><span class="pop-title">Full results</span>` +
    (lines || "No scores recorded.") +
    `</span>`
  );
}

function renderWinners(data) {
  const box = $("#winners");
  const byId = scoresBySession(data);
  const sessions = (data.sessions || [])
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (!sessions.length) {
    box.innerHTML = "<p>No results yet — log one below to crown a champion.</p>";
    return;
  }

  box.innerHTML = "";
  box.appendChild(
    el("div", "champ-head", "<span>Game</span><span>Winner</span><span>Date</span>")
  );

  sessions.forEach((sn) => {
    const scores = byId[sn.id] || [];
    const winners = winnersOf(scores).map(esc).join(" &amp; ") || "&mdash;";
    const hasDetail = scores.length > 0;
    const pop = hasDetail ? popover(scores) : "";
    const cls = hasDetail ? "cell has-detail" : "cell";
    const tab = hasDetail ? ' tabindex="0"' : "";

    const row = el("div", "champ-row");
    row.innerHTML =
      `<span class="${cls}"${tab}>${esc(sn.game)}${pop}</span>` +
      `<span class="${cls}"${tab}>${winners}${pop}</span>` +
      `<span class="date">${esc(sn.date)}</span>`;
    box.appendChild(row);
  });
}

/* --- voting (approval) --- */
function renderNoms(data) {
  const box = $("#noms");
  box.innerHTML = "";

  const noms = (data.nominations || [])
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  if (!noms.length) {
    box.appendChild(
      el("p", null, "No games suggested yet — add the first one above.")
    );
    return;
  }

  const votes = data.votes || [];
  const counts = {};
  votes.forEach((v) => {
    counts[v.nomination_id] = (counts[v.nomination_id] || 0) + 1;
  });
  const mine = new Set(
    votes.filter((v) => v.voter_id === voterId()).map((v) => String(v.nomination_id))
  );
  const max = Math.max(1, ...noms.map((n) => counts[n.id] || 0));

  noms.forEach((n) => {
    const count = counts[n.id] || 0;
    const chosen = mine.has(String(n.id));

    const row = el("div", "nom");
    const btn = el(
      "button",
      "nes-btn" + (chosen ? " is-success" : ""),
      (chosen ? "\u2713 " : "") + esc(n.game)
    );
    btn.onclick = async () => {
      try {
        await post("toggle_vote", { nomination_id: n.id, voter_id: voterId() });
        refresh();
      } catch (e) {
        status(e.message, "err");
      }
    };

    const bar = el("span", "nom-bar");
    bar.style.width = Math.round((count / max) * 140) + "px";

    row.append(
      btn,
      bar,
      el("span", "nom-count", count + (count === 1 ? " vote" : " votes"))
    );
    if (n.added_by) row.append(el("span", "nom-by", "suggested by " + esc(n.added_by)));
    box.appendChild(row);
  });
}

async function suggestGame() {
  const input = $("#v-suggest");
  const game = input.value.trim();
  if (!game) return status("Type a game name to suggest.", "err");
  try {
    const r = await post("suggest_game", {
      game,
      added_by: $("#v-name").value.trim(),
    });
    input.value = "";
    status(
      r.duplicate ? "That game's already on the list." : "Added — now tap it to vote.",
      "ok"
    );
    refresh();
  } catch (e) {
    status(e.message, "err");
  }
}

/* --- log form --- */
function addPlayerRow() {
  const row = el("div", "player-row");

  const nameI = el("input", "nes-input p-name");
  nameI.type = "text";
  nameI.placeholder = "Player";

  const scoreI = el("input", "nes-input p-score");
  scoreI.type = "number";
  scoreI.placeholder = "Score";

  const winL = el("label", "win");
  const winC = document.createElement("input");
  winC.type = "checkbox";
  winC.className = "nes-checkbox";
  winL.append(winC, el("span", null, "win"));

  const del = el("button", "nes-btn is-error p-del", "\u00d7");
  del.setAttribute("aria-label", "Remove player");
  del.onclick = () => row.remove();

  row.append(nameI, scoreI, winL, del);
  row._get = () => ({
    player: nameI.value.trim(),
    score: scoreI.value,
    won: winC.checked,
  });
  $("#players").appendChild(row);
}

async function saveSession() {
  const game = $("#g-game").value.trim();
  if (!game) return status("Enter a game name.", "err");

  const rows = [...document.querySelectorAll(".player-row")]
    .map((r) => r._get())
    .filter((r) => r.player);

  try {
    await post("add_session", {
      date: $("#g-date").value,
      game,
      notes: $("#g-notes").value.trim(),
      scores: rows,
    });
    status("Result saved.", "ok");
    $("#g-game").value = "";
    $("#g-notes").value = "";
    $("#players").innerHTML = "";
    addPlayerRow();
    refresh();
  } catch (e) {
    status(e.message, "err");
  }
}

/* ---- boot ---- */
async function refresh() {
  try {
    render(await getData());
  } catch (e) {
    status("Couldn't load data: " + e.message, "err");
  }
}

function init() {
  if (API_URL.startsWith("PASTE_")) {
    status("Set API_URL in app.js to your Apps Script /exec URL.", "err");
  }

  // remember your name locally so game suggestions are attributed
  const nameEl = $("#v-name");
  nameEl.value = localStorage.getItem("gn_name") || "";
  nameEl.addEventListener("change", () =>
    localStorage.setItem("gn_name", nameEl.value.trim())
  );

  $("#g-date").valueAsDate = new Date();
  addPlayerRow();
  $("#add-player").onclick = addPlayerRow;
  $("#save-session").onclick = saveSession;
  $("#v-add").onclick = suggestGame;
  $("#v-suggest").addEventListener("keydown", (e) => {
    if (e.key === "Enter") suggestGame();
  });

  refresh();
}

document.addEventListener("DOMContentLoaded", init);
