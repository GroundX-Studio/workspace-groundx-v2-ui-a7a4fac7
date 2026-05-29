# Tasks — WF-16 citation persistence

- [x] **Root cause (not the write path):** the write already persisted `citations_json`
      (`chatHandler.ts:454`) WITH bbox. The bug was the **read projection** — the MySQL `JSON` column
      returns `citations_json` ALREADY parsed (an array), but `app.ts` did `JSON.parse()` on it →
      threw → every hydrated turn degraded to `citations: []` (chips never survived reload). Memory
      mode (stores a string) hid it; only MySQL broke.
- [x] **Failing test (TDD):** `apiRouteContract.test.ts` — `GET /chat-sessions/:id/messages` projects
      `citations[]` (with bbox) when `citationsJson` is an already-parsed array (MySQL JSON column).
      RED confirmed (citations was `[]`).
- [x] Fix: `app.ts` projection tolerates string|array (`typeof raw === "string" ? JSON.parse : raw`);
      `mysqlRepository.rowToChatMessage` normalizes JSON columns back to strings
      (`jsonColumnToString`) so `citations_json`/`tool_calls_json`/`attachments_json` honor the
      `string | null` record type.
- [x] Middleware suite **476/476**; tsc **0** (app side unchanged — hydration already maps bbox via WF-13).
- [x] **Live-verified (2026-05-29):** after reload, both persisted assistant turns hydrate WITH their
      2 citation chips (doc `c3bfff49`), bbox intact. Previously `[]` on every hydrated turn.
- [x] Archive.
