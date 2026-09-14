# Rigby's Games

A tiny static site for a board games meetup: see who's won, vote on what to play
next, and log results. Hosted free on GitHub Pages, with a Google Sheet as the
database.

## The page

- **Rigby's Games** — the title.
- **Next Game Night: …** — pulled live from the `Settings` tab.
- **Hall of champions** — every session's game, winner, and date. Hover (or tap)
  a game or winner to reveal that night's full scoreboard.
- **Vote: next session** — approval voting. Suggest a game, then tap every game
  you'd be happy to play; you can pick several, and tap again to remove a vote.
- **Log a result** — records a session so it can appear in the champions list.

## Files

| File | Where it lives | What it is |
|------|----------------|------------|
| `index.html` | repo (GitHub Pages) | page markup |
| `app.js` | repo | data, rendering, and actions |
| `styles.css` | repo | retro styling on top of NES.css |
| `Code.gs` | Apps Script editor | the JSON API (not a repo file) |

## Google Sheet tabs

Header row (row 1) for each tab. Column order matters on the tabs the script
writes to (`Sessions`, `Scores`, `Nominations`, `Votes`).

| Tab | Header row |
|-----|------------|
| `Settings` | `key \| value` |
| `Sessions` | `id \| date \| game \| notes \| created_at` |
| `Scores` | `id \| session_id \| player \| score \| won \| created_at` |
| `Nominations` | `id \| game \| added_by \| created_at` |
| `Votes` | `id \| nomination_id \| voter_id \| created_at` |

Set the subtitle by adding a row to `Settings`:

```
next_game_night | Fri Nov 21 · 7pm @ Rigby's
```

## Deploy / update

1. Paste `Code.gs` into the Sheet's Apps Script editor (Extensions → Apps Script).
2. Deploy as a Web app — Execute as **Me**, Who has access **Anyone** — and copy
   the `/exec` URL. When updating later, use **Deploy → Manage deployments** and
   edit the *existing* deployment so the URL stays the same.
3. Put the `/exec` URL in `app.js` (`API_URL`), push `index.html`, `app.js`, and
   `styles.css`, and enable GitHub Pages.

## Running the meetup

- **Winners** appear automatically when you log a result with a player marked
  "win." If no one is marked, the top score is shown as the winner.
- **Start a fresh vote**: clear the rows in `Nominations` and `Votes`.
- **Set the next game night / fix data**: edit the Sheet directly.

## Gotchas

- Writes use `text/plain` on purpose — it skips the CORS preflight Apps Script
  web apps can't answer. Don't change it to `application/json`.
- After editing `Code.gs`, redeploy via **Manage deployments** so `/exec` stays put.
- No keep-alive needed — Sheets and Apps Script don't sleep.

## Cost

$0 at meetup scale.
