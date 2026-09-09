/* Board game meetup — front-end logic (app.js). Goes in your GitHub repo. */

// 1) Paste your Apps Script web-app /exec URL here after deploying Code.gs:
const API_URL = https://script.google.com/macros/s/AKfycby-gQkBNdSh2pc1v-iZvJgi8Euf81zf9wSXYvcYgKut-EAmPejPkiTm4BkWccavSxNm/exec;

// 2) If you set a SECRET in Code.gs, put the same value here (else leave ""):
const SECRET = "";

/* ---- per-browser voter id (so one person = one vote per poll) ---- */
function voterId() {
  let id = localStorage.getItem("gn_voter");
  if (!id) {
    id = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("gn_voter", id);
  }
  return id;
}

/* ---- tiny DOM helpers ---- */
const $ = (sel) => document.querySelector(sel);
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

/* ---- API calls ---- */
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

/* ---- rendering ---- */
function render(data) {
  renderPoll(data);
  renderLeaderboard(data);
  renderHistory(data);
}

function renderPoll(data) {
  const box = $("#poll");
  box.innerHTML = "";

  const open = (data.polls || []).filter(
    (p) => String(p.status).toLowerCase() === "open"
  );
  if (!open.length) {
    box.appendChild(
      el("p", null, "No open vote right now — add a row to the Polls tab to start one.")
    );
    return;
  }

  const poll = open[0];
  const options = String(poll.options || "")
    .split("|")
    .map((o) => o.trim())
    .filter(Boolean);

  const votes = (data.votes || []).filter(
    (v) => String(v.poll_id) === String(poll.id)
  );
  const counts = {};
  options.forEach((o) => (counts[o] = 0));
  votes.forEach((v) => {
    if (counts[v.option] != null) counts[v.option]++;
  });
  const max = Math.max(1, ...options.map((o) => counts[o]));
  const mine = votes.find((v) => v.voter_id === voterId());

  box.appendChild(el("p", "poll-q", esc(poll.title || "Vote")));

  options.forEach((opt) => {
    const row = el("div", "poll-option");
    const chosen = mine && mine.option === opt;
    const btn = el("button", "nes-btn" + (chosen ? " is-success" : ""), esc(opt));
    btn.onclick = async () => {
      try {
        status("Saving vote\u2026");
        await post("cast_vote", { poll_id: poll.id, option: opt, voter_id: voterId() });
        status("Vote saved.", "ok");
        refresh();
      } catch (e) {
        status(e.message, "err");
      }
    };
    const bar = el("span", "poll-bar");
    bar.style.width = Math.round((counts[opt] / max) * 150) + "px";
    row.append(btn, bar, el("span", "poll-count", String(counts[opt])));
    box.appendChild(row);
  });
}

function renderLeaderboard(data) {
  const box = $("#leaderboard");
  const agg = {};
  (data.scores || []).forEach((s) => {
    const p = s.player;
    if (!p) return;
    if (!agg[p]) agg[p] = { player: p, games: 0, wins: 0, points: 0 };
    agg[p].games++;
    agg[p].points += Number(s.score) || 0;
    if (String(s.won).toLowerCase() === "yes") agg[p].wins++;
  });

  const rows = Object.values(agg).sort(
    (a, b) => b.wins - a.wins || b.points - a.points
  );
  if (!rows.length) {
    box.innerHTML = "<p>No games logged yet — add your first result above.</p>";
    return;
  }

  box.innerHTML = "";
  const wrap = el("div", "nes-table-responsive");
  const t = el("table", "nes-table is-bordered is-dark");
  t.innerHTML =
    "<thead><tr><th>Player</th><th>Wins</th><th>Games</th><th>Points</th></tr></thead>";
  const tb = el("tbody");
  rows.forEach((r) => {
    tb.appendChild(
      el(
        "tr",
        null,
        `<td>${esc(r.player)}</td><td>${r.wins}</td><td>${r.games}</td><td>${r.points}</td>`
      )
    );
  });
  t.appendChild(tb);
  wrap.appendChild(t);
  box.appendChild(wrap);
}

function renderHistory(data) {
  const box = $("#history");
  const byId = {};
  (data.scores || []).forEach((s) => {
    (byId[s.session_id] = byId[s.session_id] || []).push(s);
  });

  const sessions = (data.sessions || [])
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 10);

  if (!sessions.length) {
    box.innerHTML = "<p>No games logged yet — add your first result above.</p>";
    return;
  }

  box.innerHTML = "";
  sessions.forEach((sn) => {
    const scores = (byId[sn.id] || [])
      .slice()
      .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    const line = scores
      .map(
        (s) =>
          `${esc(s.player)} ${Number(s.score) || 0}` +
          (String(s.won).toLowerCase() === "yes" ? " \u2605" : "")
      )
      .join("  \u00b7  ");

    const row = el("div", "history-row");
    row.innerHTML =
      `<p><strong>${esc(sn.date)}</strong> &mdash; ${esc(sn.game)}</p>` +
      `<p class="history-scores">${line || "(no scores)"}</p>` +
      (sn.notes ? `<p class="nes-text is-disabled">${esc(sn.notes)}</p>` : "");
    box.appendChild(row);
    box.appendChild(el("hr"));
  });
}

/* ---- log-a-game form ---- */
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
    status("Saving\u2026");
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
  $("#g-date").valueAsDate = new Date();
  addPlayerRow();
  $("#add-player").onclick = addPlayerRow;
  $("#save-session").onclick = saveSession;
  refresh();
}

document.addEventListener("DOMContentLoaded", init);
