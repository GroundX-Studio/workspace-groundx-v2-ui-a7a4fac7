# Multi-region citations — preserve all real proof as highlights

## Status: PLANNED (brainstormed 2026-06-14) — NOT STARTED. Implementation gated on the phased tasks below.

## Why

A live adversarial probe over the real sample invoice (7 cooperative + 8
adversarial grounded queries, `middleware/scripts/probe-citation-funnel.ts`,
real GroundX + LLM + embeddings) surfaced that the citation pipeline **throws
away real proof**:

- **`branchNode` — 36 drops, TWO answers shipped ZERO citations.** "List every
  charge" / "list all meters with totals" produced fully-grounded, correct
  answers whose every citation died because the model cited a *container*
  (`meters[6]`, or a charge object `meters[6].meter_charges[2]`) instead of the
  leaf inside it. The values are really there — the citation was one level too
  coarse — and we dropped it rather than descending to the cells.
- **`geometry` — a validated value dropped for lack of a box.** "Exact kWh/
  gallons usage" emitted 10, shipped 9; one *validated* figure was dropped purely
  because its on-page location couldn't be resolved ("no pageless citation form").
- **The highlight model is single-box.** `Citation.bbox` is ONE optional box,
  and `normalizeBox` **unions** a chunk's word boxes into one loose envelope —
  the individual word/line boxes (which the X-Ray provides) are discarded, and a
  value appearing in several places lights up in only one.

The result: correct, grounded answers arrive with no clickable sources (reads as
untrustworthy), and the highlights that do show are loose single rectangles.

## Locked principle (2026-06-14)

**A citation shows ALL the source material that informed an answer or extracted
value — every place the cited value/quote appears — NOT a single "best" source.**
Showing everything considered (including a value that was considered but may have
been the wrong pick) lets a reader verify what the answer was built on and catch a
mistake. The two open design forks were decided on this basis:
- **D1 = show every occurrence** (NOT field-path-narrowed to one instance). Lighting
  every place a value appears — even values identical across distinct records — is
  the POINT, not an over-highlight bug.
- **D2 = precision PER highlight** (each region carries its own `tier`), because
  every region is real source material and must be shown honestly.

## What changes

A citation should **preserve all real proof and show all of it**:

1. **Multiple regions per citation, each with its own tier.** `Citation` carries
   `regions: { page, bbox, tier }[]` (the old single `page`/`bbox`/`tier` kept as a
   first-region alias during migration).
2. **Tight-when-locatable, chunk as the floor.** Highlight the precise
   word-run boxes for each cited span/value (multiple, per occurrence + per wrap
   line); when a tight box can't be pinned, fall back to the grounding chunk's
   own per-line regions — **never a single union envelope.** A real grounding gets
   a region whenever its text is locatable; the one honest exception is a validated
   value not printed verbatim (a reformatted date, a derived value), which keeps a
   regionless source chip rather than vanishing (see design §C, review #8).
3. **Show EVERY occurrence (D1).** Highlight every place the cited value/quote
   appears — for extraction, every chunk that matches the value by the value-exact
   rule (NUMERICALLY for numbers, normalized whole-token for words — R1); do NOT
   narrow to one instance via the `field` path or the field label. A value
   identical across records lights all of them — by design.
4. **Never drop a real grounding (Bucket B closed).** A container (`branchNode`)
   descends to its scalar leaf values and shows every place each appears; a
   printed validated value resolves to at least its chunk region (the former
   `geometry` drop of a printed value no longer happens). A validated value that is
   genuinely unlocatable (reformatted/derived) is still NOT dropped — it degrades to
   a label-located region or, last, a regionless `ambient` source chip.
5. **Still reject FALSE claims, and fix the cause (Bucket A).** `docId` / `path` /
   `value` / `parse` stay rejected — they're fabricated, not proof. AND we
   measure their rate; if material, **tighten the citation prompt** so the model
   emits leaf paths + valid ids in the first place (fixing the source, not just
   catching it).

## Supersedes / relationship to the parked changes

- **`extraction-citation-geometry-miss-policy`** is ABSORBED here — its
  geometry-miss question is answered (chunk-region floor, never drop). Close it
  in favor of this change.
- **`citation-retry-backstop`** stays a no-op (the adversarial probe re-confirmed
  0 omission / 0 parse losses) — NOT addressed here; the zero-shipped turns we
  see are `branchNode`, which this change fixes by descending, not by retrying.

## Scope: APP-WIDE (user, 2026-06-14)

These fixes apply to EVERY citation surface — "citations are broken without them."
Chat, Report sections, Extract-field, **the Extract VALUE grid** (the former
"third path" via `/field-geometry`), and the scenario sample citations all use the
SAME shared `Citation` (`regions:{page,bbox,tier}[]`) and the SAME multi-region /
show-all / never-drop / token-boundary geometry. The shared
`resolveFieldGeometry` is upgraded once; both the grounded arm and the Extract
endpoint get it. **NO CAP** — show every region; persistence/transport/overlay
handle arbitrary counts efficiently, never by truncating. The ONLY grounded-arm-
specific bit is quote-EMBEDDING verification (extract values aren't paraphrases).

## Non-goals

- No relaxation of the Bucket-A rejection — a fabricated citation is still dropped.
- No quote-embedding verification on extracted VALUES (they're validated as the
  extracted value, not semantically matched) — that distinction stays.
