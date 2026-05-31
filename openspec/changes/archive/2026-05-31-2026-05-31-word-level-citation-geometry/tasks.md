# Tasks — Word-level citation geometry (live `-118-map` fetch)

## 0. Investigate-first (no code) — settle `processId` + storage URL

- [x] **UNBLOCK / INVESTIGATE:** Determine how to obtain a usable `processId` for a document at
      runtime. — DONE 2026-05-31. `document_get` DOES surface a `processId` field
      (`2e4473b3…` for seed doc c3bfff49) **but it 403s for the map** — wrong render. The processId
      that serves the map lives in the `xrayUrl` PATH (`…/processed/{processId}/{documentId}-xray.json`).
      Resolution: do NOT parse the processId standalone — derive the map URL by string-swapping
      `-xray.json` → `-118-map.json` directly on the `xrayUrl` (a full absolute URL on `document_get`),
      which needs no processId parsing and no origin config. `document_getprocesses` not needed.
- [x] **UNBLOCK / INVESTIGATE:** Confirm the storage origin + exact URL + unauthed reachability. — DONE
      2026-05-31. The `-118-map.json` is served from the same storage origin as the X-Ray
      (`https://upload.eyelevel.ai/layout/processed/{processId}/{documentId}-118-map.json`) as a PLAIN,
      UNAUTHED HTTPS GET — verified HTTP 200, 524KB, NO API key, server-side `curl`. Its JSON matches
      the `WordMap` shape exactly (`pages[].{pageNumber,width,height,molecules[].rows[].atoms[]}`,
      `atom.{text,minX,minY,maxX,maxY}`, page dims 1700×2200). The dedup ambiguity is moot: the
      `xrayUrl` processId `7e811d87` serves a valid 200 map; the X-Ray *content* references NO processId
      at all (the proposal's `58a442bd` is not present in the current X-Ray); the `document.processId`
      field (`2e4473b3`) 403s. Live resolver sanity-checked: "$7,613.20" → tight page-1 box
      [739,1415,836,1435] on the live map. So: **xrayUrl-swap is the reliable derivation.**
- [x] **INPUT NEEDED:** N/A — DONE 2026-05-31. No credential, no new endpoint, no origin/base-URL
      decision: a plain unauthed CDN GET works. The `document_get` call (which yields `xrayUrl`) uses
      the existing GroundX API key already threaded into the RAG path. No escalation; live path wired.

## 1. `-118-map` fetch service (mirror `xrayCache.ts`) — TDD

- [x] Write FAILING test `wordMapCache.test.ts`: a per-document fetch returns the parsed word-map on
      a 200, returns `null` on non-OK / network error / malformed JSON (never throws), caches per
      documentId with a short TTL, and re-fetches after expiry; expose a `__clearWordMapCache()` test
      seam. — DONE. 11 tests; watched fail (no module), then green.
- [x] Implement `wordMapCache.ts` to pass: derive the `-118-map.json` URL from the §0 resolution
      (`document_get` → `xrayUrl` → swap `-xray.json`→`-118-map.json`), fetch + parse to the `WordMap`
      shape, cache with TTL, best-effort (`null` on any failure). Storage GET injectable via `fetchImpl`
      seam (unauthed); `document_get` uses `client.forward` + apiKey. Did NOT re-author
      `resolveWordGeometry`. — DONE.

## 2. Wire the live path into the chat router — TDD

- [x] Write FAILING router test: a RAG reply with a structured citation whose verbatim `quote`
      appears in the doc's word-map resolves to `tier: "exact"` with the **tighter** word-level bbox
      (not the X-Ray chunk box). Uses `wordMap.fixture.json` via the injected `wordMapFetch` dep seam.
      — DONE. Watched fail (`paraphrase`), then green.
- [x] Write FAILING router test for the fallback chain: (a) word-map unfetchable → `paraphrase`;
      (b) verified quote not present verbatim in the word-map → `paraphrase`; (c) chat turn never fails
      on any word-map error; plus (d) unverified citation → `ambient` AND no fetch fires. — DONE. 4
      router tests total.
- [x] Implement: for each ALREADY-VERIFIED citation, fetch the word-map (cached) via the
      `wordMapFetch` dep (default `fetchDocumentWordMap`) and call the shipped
      `resolveWordGeometry(quote, map)`; on a hit, set `bbox` to the tighter box and `hasAtomBox: true`.
      Fetch guarded by `v.verified && groundxClient && groundxApiKey`, so unverified citations skip it.
      Citation map made async (`Promise.all`). — DONE.
- [x] Delete the hardcoded `assignTier(v, { hasAtomBox: false })` (was `chatRouter.ts:734`, proposal
      cited :706 — line drifted), replacing it with `assignTier(v, { hasAtomBox })` where `hasAtomBox`
      is derived from the live resolve. No `hasAtomBox: false` literal remains in non-test code. — DONE.

## 3. Retire the dormant-plumbing language

- [x] Update `attribution.ts` docstring: removed "dormant until built"; the module header + `assignTier`
      docstring now describe the live word-map resolve. — DONE.
- [x] Update `citationGeometry.ts` docstrings for `resolveWordGeometry` + the WF-05b header: removed
      "the live `-118-map.json` fetch is backlogged"; now points at `wordMapCache.ts` as the live
      caller. Function kept PURE (body unchanged — no fetch inside it). — DONE.

## 4. Adversarial review + gate (per project discipline §10)

- [x] Falsify every claim against code: the `exact` tier lights end-to-end on a verified verbatim
      citation (router test asserts `tier:"exact"` + tight bbox through `routeChat`, not just the unit
      resolver); `hasAtomBox` is no longer a literal `false` (grep: zero `hasAtomBox: false` in non-test
      code); no fetch fires for unverified citations (guard + test asserts `wordMapFetch` not called);
      fallback degrades to `paraphrase`/`ambient` without throwing (3 fallback tests green). — DONE.
- [x] Confirm no resolver re-author (`resolveWordGeometry` body unchanged — only its docstring edited),
      no new tier (still exact/paraphrase/ambient), no UI change (tighter bbox flows through the
      existing `Citation.bbox` path). Gates: app build (tsc+vite) clean; middleware tsc clean;
      middleware vitest 619 passed (file-serial); app vitest 1404 passed (drift guards green);
      `openspec validate … --strict` valid. — DONE.
