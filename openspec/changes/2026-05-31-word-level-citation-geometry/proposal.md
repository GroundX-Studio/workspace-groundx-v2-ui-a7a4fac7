# Word-level citation geometry — live `-118-map` fetch + tight bbox

## Why

The pure word-level resolver is **already shipped**: `resolveWordGeometry(span, map)` in
`middleware/src/services/citationGeometry.ts` (lines 383-411) takes a `-118-map.json` word-map
and returns a box strictly tighter than the X-Ray chunk box (it scans the consecutive atom run
that spells out a verbatim span and unions those atoms' page-pixel boxes). It has tests
(`citationGeometry.test.ts:206`) and a fixture (`wordMap.fixture.json`). But it is **dormant**:
nothing fetches the live `-118-map.json` and feeds it in. Its docstring says so verbatim — "PURE —
fixture/payload in, no fetch (the live `-118-map.json` fetch is backlogged)."

The visible consequence: the WF-06 `exact` (word-level) attribution tier never lights. In the chat
router (`chatRouter.ts:706`), the citation tier is assigned with `assignTier(v, { hasAtomBox: false })`
— `hasAtomBox` is hardcoded `false`, so a verified verbatim quote can only ever resolve at
`paraphrase` (the coarse X-Ray chunk box). For the Utility "amount due" answer, that chunk box lands
on the whole payment stub, not the "$7,613.20" line — exactly the imprecision word-level geometry
exists to fix.

This change wires the **live path** only. It does **not** re-author the resolver (forbidden) — it
fetches the word-map, calls the shipped resolver, threads the tighter bbox + `hasAtomBox: true` into
the citation so the `exact` tier lights automatically, and removes the dormant-plumbing caveat.

There is one genuine unknown gating the wiring: **how to obtain `processId` at runtime** so the
storage URL `…/layout/processed/{processId}/{documentId}-118-map.json` can be constructed.
`document_get` is authoritative for `bucketId`/`sourceUrl` but does **not** surface `processId`
directly; the processId is embedded in the X-Ray's `xrayUrl` path
(`…/processed/{processId}/{documentId}-xray.json`) and `document_getprocesses` lists processes.
Worse, for the seed doc `c3bfff49` the X-Ray content is dedup'd onto another render, so the
file-path processId (`7e811d87`) and the content's referenced processId (`58a442bd`) disagree — so
*which* processId yields a fetchable `-118-map.json`, and whether the storage origin is reachable
server-side without a credential, must be settled by investigation before wiring. If that resolves
to a credential/endpoint **decision**, it escalates to the user.

## What Changes

- **INVESTIGATE FIRST (no code):** Determine at runtime (a) which GroundX field/endpoint surfaces a
  usable `processId` for a document (candidates: parse it out of the X-Ray `xrayUrl` path, which the
  middleware already fetches via `xrayCache.ts`; `document_getprocesses`; a `document_get` field),
  and (b) the storage origin + exact URL the `-118-map.json` is served from, and whether it is
  reachable server-side without an API key. Record the answer. If it needs a credential or endpoint
  decision, **escalate to the user** (gating INPUT-NEEDED task) before wiring.
- **New `-118-map` fetch service** (mirrors the existing `xrayCache.ts` precedent): per-document
  fetch + short-TTL in-memory cache + a `__clear*` test seam, best-effort (any error → `null`, never
  throws). It derives the URL from the processId discovered above and fetches the word-map JSON.
- **Wire the live path in the chat router.** For a citation that already verified its quote
  (`verifyQuote` → verified), fetch the word-map for that documentId, call the SHIPPED
  `resolveWordGeometry(quote, map)`, and — when it returns a box — use that tighter bbox and pass
  `assignTier(v, { hasAtomBox: true })` so the `exact` tier lights. The lookup fires **only** for
  already-verified citations (the `paraphrase`/`ambient` floor needs no word-map), so unverified
  turns pay no extra fetch.
- **Fallback chain (degrade cleanly):** word-level box → X-Ray chunk box (existing WF-03 path) →
  none. A missing/unfetchable word-map, or a span that doesn't appear verbatim, leaves the citation
  at the `paraphrase` chunk box (or geometry-less) exactly as today; the chat turn never fails.
- **Delete the hardcoded `hasAtomBox: false`** at `chatRouter.ts:706` and the dormant-plumbing
  caveat ("dormant until built" / "the live `-118-map.json` fetch is backlogged") in
  `attribution.ts` + `citationGeometry.ts` docstrings — the live path replaces them.
- **Out of scope:** the `UTILITY_AMOUNT_DUE_REGION` / `isUtilityAmountDue` hardcoded-box hack named
  in the source scope is **already gone** — a code search finds it only in a removed-it comment
  (`InteractView.test.tsx:139`, `InteractView.tsx:65`), with the lit region already rendering the
  real citation bbox. There is no hack to delete; this change supplies the tighter box that comment
  anticipates. No resolver re-authoring, no new attribution tiers, no UI changes (the tighter bbox
  flows through the existing `Citation.bbox` → `litRegions` path unchanged).

## Conformance to core architectural decisions

- **Composable, not forked** — consumes the shipped pure resolver and the shipped `assignTier`
  contract; adds one fetch service modeled on `xrayCache.ts`. It flips one hardcoded flag from a
  dead value to a real one. No parallel resolver, no new tier, no forked code path.
- **No dormant plumbing** — this change exists specifically to retire dormant plumbing
  (`hasAtomBox: false`, the "backlogged"/"dormant" docstrings). Done = the `exact` tier lights on a
  real verified verbatim citation, proven by a router-level test.
- **Done-able / round-trip** — verified by a chat-router test that a verbatim-quoted citation against
  a doc with a fetchable word-map returns `tier: "exact"` with the tighter bbox, and that the
  fallback chain degrades to `paraphrase`/none without failing the turn.
