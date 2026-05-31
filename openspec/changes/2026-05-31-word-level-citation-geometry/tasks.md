# Tasks — Word-level citation geometry (live `-118-map` fetch)

## 0. Investigate-first (no code) — settle `processId` + storage URL

- [ ] **UNBLOCK / INVESTIGATE:** Determine how to obtain a usable `processId` for a document at
      runtime. Probe, in order: (a) parse the processId out of the X-Ray `xrayUrl` path
      (`…/processed/{processId}/{documentId}-xray.json`) — the middleware already fetches the X-Ray
      via `xrayCache.ts`, so this is free; (b) `document_getprocesses`; (c) a `document_get` field.
      Record which one yields a processId whose `-118-map.json` actually fetches.
- [ ] **UNBLOCK / INVESTIGATE:** Confirm the storage origin + exact URL the `-118-map.json` is served
      from (`…/layout/processed/{processId}/{documentId}-118-map.json`), and whether it is reachable
      **server-side without an API key**. For seed doc `c3bfff49`, resolve the dedup ambiguity: the
      X-Ray file-path processId (`7e811d87`) and the X-Ray content's referenced processId
      (`58a442bd`) disagree — confirm which one (if either) serves a fetchable `-118-map.json`.
- [ ] **INPUT NEEDED:** If the investigation shows the `-118-map.json` requires a credential, a new
      endpoint, or a storage-origin/base-URL configuration decision (rather than a plain unauthed CDN
      GET), surface the exact constraint and proposed resolution to the user and BLOCK on their
      answer before any fetch wiring. *(Resolve before §1.)*

## 1. `-118-map` fetch service (mirror `xrayCache.ts`) — TDD

- [ ] Write FAILING test `wordMapCache.test.ts`: a per-document fetch returns the parsed word-map on
      a 200, returns `null` on non-OK / network error / malformed JSON (never throws), caches per
      documentId with a short TTL, and re-fetches after expiry; expose a `__clearWordMapCache()` test
      seam.
- [ ] Implement `wordMapCache.ts` to pass: derive the `-118-map.json` URL from the processId resolved
      in §0, fetch + parse to the `WordMap` shape (already exported from `citationGeometry.ts`),
      cache with TTL, best-effort (`null` on any failure). Do NOT re-author `resolveWordGeometry`.

## 2. Wire the live path into the chat router — TDD

- [ ] Write FAILING router test: a RAG reply with a structured citation whose verbatim `quote`
      appears in the doc's word-map resolves to `tier: "exact"` with the **tighter** word-level bbox
      (not the X-Ray chunk box). Use the existing `wordMap.fixture.json` via an injected fetch seam.
- [ ] Write FAILING router test for the fallback chain: (a) word-map unfetchable → citation stays at
      `paraphrase` chunk box; (b) verified quote not present verbatim in the word-map → `paraphrase`;
      (c) chat turn never fails on any word-map error.
- [ ] Implement: for each ALREADY-VERIFIED citation, fetch the word-map (cached) and call the shipped
      `resolveWordGeometry(quote, map)`; on a hit, set `bbox` to the tighter box and assign
      `assignTier(v, { hasAtomBox: true })`. Skip the fetch entirely for unverified citations.
- [ ] Delete the hardcoded `assignTier(v, { hasAtomBox: false })` at `chatRouter.ts:706`, replacing
      it with the real `hasAtomBox` derived above.

## 3. Retire the dormant-plumbing language

- [ ] Update `attribution.ts` docstring: remove "needs WF-05's `-118-map` atom resolver; dormant
      until built" / "dormant until built" — the `exact` tier is now live.
- [ ] Update `citationGeometry.ts` docstrings for `resolveWordGeometry` + the WF-05b header: remove
      "the live `-118-map.json` fetch is backlogged" (it now has a live caller). Keep the function
      PURE (no fetch inside it).

## 4. Adversarial review + gate (per project discipline §10)

- [ ] Falsify every claim against code: the `exact` tier actually lights end-to-end on a real
      verified verbatim citation (not just the unit test); `hasAtomBox` is no longer a literal
      `false`; no fetch fires for unverified citations; the fallback degrades to `paraphrase`/none
      without throwing.
- [ ] Confirm no resolver re-author (diff `resolveWordGeometry` body = unchanged), no new tier, no UI
      change. Run `npm run build`, the middleware vitest suite (file-serial), and `openspec validate
      2026-05-31-word-level-citation-geometry --strict`. Do not mark done red.
