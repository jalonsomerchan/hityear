# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**HitYear** is a multiplayer web game where players listen to a song preview and guess the year it was published. The project consists of:

- A **frontend** (`index.html`) — the complete game, built with HTML, vanilla JavaScript and Tailwind CSS (CDN).
- A **REST API** (`api.yaml`) — OpenAPI 3.0.0 spec for the backend, live at `https://alon.one/juegos/api`.
- **Song data** (`data/`) — categorised song lists with Deezer IDs, used as game content.

## Project Structure

```
index.html                   — Full game (single file, all JS inline)
api.yaml                     — OpenAPI spec (source of truth for the backend contract)
data/
  themes.js                  — Registry of available categories (HIT_THE_YEAR_THEMES array)
  hitsterSpain.js            — Song list: Hitster Spain
  popEspanolHoyYSiempre.js   — Song list: Pop Español Hoy y Siempre
  espana80y90.js             — Song list: España 80 y 90
```

## Song Data Format

Each file in `data/` declares a `var <varName> = [...]` with objects:

```js
{
  title:    "Nombre de la canción",
  artist:   "Artista",
  year:     1995,           // correct answer
  deezerId: "1234567",      // used to fetch preview via Deezer JSONP API
  preview:  "https://...",  // cached URL (may be expired — always fetch fresh via Deezer)
  cover:    "https://..."   // album cover thumbnail
}
```

To add a new category: create `data/<id>.js` with the array, then add an entry to `data/themes.js`:
```js
{ id: 'myTheme', label: 'My Theme Label', variable: 'myTheme' }
```

## API Integration

The frontend calls `https://alon.one/juegos/api` directly from the browser.

| Operation | Endpoint | Notes |
|---|---|---|
| Register user | `POST /users` | Only if name changed; `user_id` cached in localStorage |
| Create room | `POST /rooms` | Sends full `game_state` as initial state |
| Get room state | `GET /rooms/{code}` | Normalised to `{ id, code, state: d.game_state }` |
| Join room | `POST /rooms/{code}/join` | Followed by PATCH to add player to `game_state.players` |
| Update state | `PATCH /rooms/{code}/state` | **Server replaces `game_state` entirely** — see below |
| Save score | `POST /scores` | Called by host at end of each round |

### Critical: PATCH replaces, does not merge
The backend replaces `game_state` on every PATCH. `API.patchState()` always merges the patch
onto the current in-memory `gs` before sending to avoid losing fields:
```js
const fullState = { ...(gs || {}), ...patch };
```

### Deezer JSONP
Previews are fetched via JSONP (not `fetch`) to avoid CORS errors:
```js
script.src = `https://api.deezer.com/track/${deezerId}?output=jsonp&callback=${cb}`;
```
Results are cached in `deezerCache`. The album cover is hidden during playing and revealed only in round results.

## Game State Object (`game_state`)

All multiplayer state lives inside `game_state` stored in the API:

```json
{
  "phase":            "lobby | playing | round_end | game_end",
  "themeId":          "hitsterSpain",
  "audioMode":        "all | host_only",
  "round":            1,
  "totalRounds":      5,
  "timePerTurn":      30,
  "songIndices":      [3, 17, 2, 11, 8],
  "currentSongIndex": 0,
  "timerEnd":         1712345678000,
  "roundEndTime":     null,
  "answers":          { "userId": { "year": 1982, "at": 1712345600000 } },
  "roundScores":      { "userId": 800 },
  "totalScores":      { "userId": 1600 },
  "players":          { "userId": { "name": "Alice", "host": true } }
}
```

`songIndices` are indices into the loaded theme array. `players` is keyed by user UUID.

## Game Flow

```
Welcome  → create user (if new/renamed) → create or join room
Lobby    → host configures (theme, rounds, time, audio mode) → host starts game
Playing  → each player hears song, moves slider, confirms year
         → host detects: all answered OR timer expired → finishRound()
Round result → host presses "Siguiente ronda" or "Ver resultados finales"
Game over    → host clicks "Nueva partida" → resets game_state to phase='lobby'
             → all clients detect phase='lobby' via polling → auto-return to lobby
             → same players, same room code, fresh scores
```

## Multiplayer Sync

- All clients poll `GET /rooms/{code}` every 2.5 seconds.
- `BroadcastChannel('hityear')` provides instant sync between tabs of the same browser.
- The host's `tick()` loop detects round-end and patches state.
- Polling stays active on the game-over screen so clients auto-navigate to lobby on new game.

## Scoring

- Exact year: **1000 pts** · ±1: 800 · ±2: 600 · ±3: 400 · ±5: 200 · ±10: 100 · >10: 0
- Speed bonus: up to +200 pts (linear decay over the round duration)

## User Identity

`user_id` is stored in `localStorage` (`hy_user`) and reused across sessions. A new user is only
created via `POST /users` when the username changes. This avoids creating orphaned users on every page load.
