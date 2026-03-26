# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains the OpenAPI 3.0.0 specification for a multiplayer gaming platform API hosted at `https://alon.one/juegos/api`. The project is currently spec-only — there is no implementation yet.

## Project Structure

- `api.yaml` — The single source of truth: the full OpenAPI specification for the API.

## API Design

The API is documented in Spanish and manages four main resources:

| Resource | Endpoint | Key Operations |
|---|---|---|
| Users | `/users` | POST (register, generates UUID) |
| Games | `/games` | POST (register game type) |
| Rooms | `/rooms`, `/rooms/{code}` | POST (create + auto-join host), GET (room state + players) |
| Room actions | `/rooms/{code}/join`, `/rooms/{code}/state` | POST (join), PATCH (update state/settings/status) |
| Scores | `/scores` | POST (record score) |

Key design decisions:
- Users are identified by UUID internally; `host_id` and `user_id` fields always expect a UUID string.
- Rooms are accessed via a short `room_code` (not UUID), returned on creation.
- `game_state`, `room_settings`, and `default_config` are open-ended `type: object` fields for game-specific data.
- `PATCH /rooms/{code}/state` merges `game_state`, `status`, and `room_settings` selectively.

## Development Notes

When implementing this API (e.g., in PHP for MAMP), the base path should be `/juegos/api` on the server. The spec targets MAMP local development before deployment to `alon.one`.
