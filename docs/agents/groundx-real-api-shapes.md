# GroundX real API response shapes — discovered 2026-05-25

Live test calls against the dev environment, samples bucket
(`28454`, one doc, `c3bfff49-6640-4213-822b-e81c3a771e45`,
`utility-bill-april-2026.pdf`). Captured here so we don't have to
re-probe.

## `GET /v1/ingest/document/xray/{documentId}`

The PDF viewer + page-image side-panel data source.

```ts
interface XrayResponse {
  fileName: string;
  fileType: "pdf" | "docx" | "..." ;
  fileKeywords: string;        // comma-separated keyword list
  fileSummary: string;          // LLM-generated summary
  language: string;             // "English"
  sourceUrl: string;            // signed URL to the original PDF binary
  documentPages: Array<{
    pageNumber: number;
    pageUrl: string;            // signed URL to a per-page rendered image
    width: number;              // page image dimensions, pixels
    height: number;
    chunks: Chunk[];            // chunks intersecting this page
  }>;
  chunks: Chunk[];              // flat list of all chunks across the doc
}

interface Chunk {
  chunk: string;                // unique chunk id, e.g. "gq8bkz-0"
  contentType: string[];        // ["paragraph"] | ["figure"] | ["table"] | etc.
  pageNumbers: number[];        // pages this chunk spans
  text: string;                 // merged text (do NOT use as a citation snippet)
  suggestedText: string;        // single-citable snippet — prefer this for citation chips
  boundingBoxes: Array<{
    pageNumber: number;
    topLeftX: number;
    topLeftY: number;
    bottomRightX: number;
    bottomRightY: number;
    corrected: boolean;         // true if a reviewer edited the auto-detected bbox
  }>;
  json?: unknown[];             // structured data for `figure`-type chunks — key/value pairs
}
```

**Implication for PdfViewer widget:**

- Use `sourceUrl` for the pdfjs-driven full-PDF view.
- Use `documentPages[].pageUrl` for instant per-page image rendering (no pdfjs needed; supports bbox overlays naturally).
- Use `documentPages[].width / .height` to scale bbox coordinates to the rendered image.
- The xray response is ~224KB for a 3-page PDF — fetch once, cache.

## `POST /v1/search/{id}` + `POST /v1/search/documents` — search result shape (added 2026-05-28)

The RAG + citation data source. Verified on `c3bfff49` (bucket 28454) both bucket-scoped
(`search_content(28454)`) and doc-scoped (`search_documents([c3bfff49])`).

```ts
interface SearchResult {
  documentId: string;
  bucketId: number;
  fileName: string;
  score: number;
  sourceUrl: string;
  text: string;                 // OCR layout text for this chunk
  suggestedText: string;        // LLM rewrite — prefer for LLM context, NOT word-mappable
  processId: string;            // + documentId → builds the -118-map URL (below)
  boundingBoxes: Array<{ pageNumber; topLeftX; topLeftY; bottomRightX; bottomRightY; corrected }>;
  pages: Array<{ number; imageUrl; width; height }>;
  searchData?: { documentSummary; sectionSummary; fullTitle; publisher };  // verbosity 2 only
  multimodalUrl?: string;       // table/figure clipping, when the chunk is a visual element
}
```

- **`verbosity`**: `0` = no `results` array (only `search.text`); `1` = results without `searchData`; `2` = results **with** `searchData`. Use `2` for source-view UIs.
- **Citation geometry is read straight off the result** (WF-03): `pageOf` = `boundingBoxes[0].pageNumber`; group boxes by `pageNumber` (a chunk can carry many / span pages — never union across pages); union the cited page's boxes; normalize px ÷ `pages[].width/height` → 0-1 `{x,y,w,h}`.
- **The chatRouter bug WF-03 fixes:** the mapper reads a nonexistent top-level `r.pageNumber` and ignores `boundingBoxes`/`pages`, so every citation defaults to page 1 / no bbox. Forward the real fields instead.
- **Fallback:** if a result lacks `boundingBoxes`, resolve via the X-Ray (snippet → match `chunks[].text` → box). Cache the X-Ray per doc.
- **Word-level precision** (WF-05 extract values, WF-06 exact-tier attribution): the OCR map at
  `https://upload.eyelevel.ai/layout/processed/{processId}/{documentId}-118-map.json` (no API key)
  gives per-atom (word) boxes. Unstable schema — "use X-Ray for production" (source-view guide §10).

## `GET /v1/ingest/document/extract/{documentId}`

The extract-values data source.

**Returns the raw extracted JSON object — no schema wrapper.** Keys are field ids; values are the extracted scalars / nested objects / arrays. Currency fields come paired with a sibling `_currency` field (e.g. `amount_due` + `amount_due_currency`).

```json
{
  "account_charges": [],
  "account_number": "",
  "amount_due": 7613.2,
  "amount_due_currency": "currency_dollars",
  "due_date": "2025-07-30",
  "invoice_number": "10295809",
  "measurement_period_start_date": "2025-06-01",
  "measurement_period_end_date": "2025-06-30",
  "meters": [
    {
      "meter_number": "70182657",
      "meter_charges": [
        {
          "charge_amount": 55.0,
          "charge_amount_currency": "currency_dollars",
          "charge_description_as_printed": "Industrial Energy Electric"
        }
        // ...
      ]
      // ...
    }
  ]
  // ...
}
```

**Implication for Extract widget:**

- Field IDs are snake_case in the response. The Extract widget pairs these with the workflow's schema metadata (see `GET /v1/workflow/{id}` below) to render labels / descriptions / types.
- Nested values (meters → meter_charges) need a tree-or-table renderer.
- `_currency` suffix pattern is a sibling-typed-value pattern; the widget can treat them as a unit.

## `GET /v1/workflow/{workflow_id}` — **THE schema source** (verified 2026-05-25)

Looked up using the `workflow_id` carried on the document's `filter.workflow_id`. Returns the full extraction schema including field-level prompts, identifiers, types, formats, and defaults.

Top-level keys:

```
workflow:
  workflowId: string                    # the same uuid we queried with
  name: string
  chunkStrategy: string                 # e.g. "element"
  relationships: { account, documents, ids }
  steps: { ... }                        # chunk / instruct / engine config
  extract:
    statement:
      fields:
        <field_id>:
          prompt:
            description: string         # field's natural-language description
            format: string?             # optional shape hint (e.g. "string", "YYYY-MM-DD")
            identifiers: string[]?      # optional list of label strings that may appear on the doc
            instructions: string        # multi-line markdown instructions
            type: string | string[]     # e.g. "str", ["int", "float"]
            default: string?            # optional fallback value
        # ... 14 fields total
    meters:
      prompt: { instructions: string }  # group-level prompt (meter-detection rules)
      fields:
        <field_id>:
          prompt: { ... as above ... }
        # ... 16 fields total
    charges:
      prompt: { instructions: string }  # group-level prompt (charge-detection rules)
      fields:
        <field_id>:
          prompt: { ... as above ... }
        # ... 6 fields total
```

**Group counts** observed today (extraction workflow `9910308e-3100-473e-9da6-3ac29f5958a6`):

| Group | Field count | Has group-level prompt? |
|---|---|---|
| statement | 14 | no |
| meters | 16 | yes (meter-detection rules) |
| charges | 6 | yes (charge-detection rules) |

This is the canonical schema source for the Extract widget. **The Extract widget render path:**

1. Read `document.filter.workflow_id` from the doc list.
2. Call `getGroundXWorkflow(workflow_id)` → cache per workflow id, keyed by id.
3. Call `getGroundXDocumentExtract(documentId)` → values keyed by `<field_id>`.
4. For each `extract.<group>.fields.<field_id>`:
   - Field id = the key.
   - Label = `prompt.description` (or snake_case-titled if absent).
   - Type = `prompt.type`.
   - Format = `prompt.format` (optional).
   - Default = `prompt.default` (optional).
5. Match the extract response's keys to schema field ids; nested values (e.g. `meters[].meter_charges[]`) line up with the workflow's nested group structure.

## `GET /v1/workflow` (account workflows list)

```json
{ "workflows": [ ...workflow summaries ] }
```

May be empty when no workflow has been authored. Today (2026-05-25) the sample bucket's workflow (`9910308e-...`) was authored via Studio Agents directly and may not appear in this list under this account; query by id (`GET /v1/workflow/{id}`) when the id is known from a document's `filter.workflow_id`.

## `GET /v1/workflow/relationship` (account-default workflow)

```json
{ "workflow": {} }
```

When empty, no default is set; the per-doc `filter.workflow_id` is the source of truth for which schema to fetch. The Extract widget reads the per-doc id; it does not depend on an account default.

## `GET /v1/bucket/{id}` — no schema reference

```json
{
  "bucket": {
    "bucketId": 28454,
    "name": "Studio Onboarding Samples",
    "fileCount": 1,
    "fileSize": "65 KB",
    "fileTokens": 22196,
    "created": "2026-05-22T19:36:20Z",
    "updated": "2026-05-22T19:52:24Z"
  }
}
```

The bucket object does not carry a workflow reference. Workflow assignment is via the workflow-relationship endpoint, which is empty.

## `GET /v1/ingest/documents?n=N` — document list (with filter)

Returns the docs in the customer's buckets. **Today, the
`filter.manifest` field on the first sample doc still carries the
hardcoded `extractionSchema` + `sampleChatScript` + `sampleExtractionValues`** because the seed script writes it there. That's the drift the rewire eliminates.

```json
{
  "count": 1,
  "documents": [
    {
      "documentId": "c3bfff49-...",
      "fileName": "utility-bill-april-2026.pdf",
      "fileType": "pdf",
      "fileSize": "65 KB",
      "extracted": false,  // ← yet to be marked extracted? Despite extract endpoint working
      "filter": { "kind": "sample-doc", "manifest": { /* the drift lives here */ } }
    }
  ]
}
```

Note `"extracted": false` despite the extract endpoint returning real values — possibly a status field that lags or means something else.

## `GET /v1/ingest` (list) + `GET /v1/ingest/{processId}` (status) — ingest processes (added 2026-06-01)

Live-probed 2026-06-01 (partner account, `api.groundx.ai`) via the GroundX MCP
`document_getprocesses` + `document_getprocessingstatusbyid` tools, cross-checked
against the harness `groundx-api` reference (`references/02-documents.md` §5–§7,
`references/12-python-sdk-objects.md` §10). Closes `2026-06-01-data-model-tail`
item 6 — the prior app-side `IngestProcess` was a 3-field guess
(`processId`/`status`/`message`) and `IngestProcessesResponse` carried
mutually-exclusive `ingests?`/`processes?` keys.

### `GET /v1/ingest` — list (each item is `IngestStatusLight`)

Top-level key is **`processes`** (NOT `ingests`). Live response:

```json
{ "processes": [
  { "id": 25903, "processId": "567e37f4-…", "status": "complete" },
  { "id": 25903, "processId": "19aeaffa-…", "status": "complete" }
] }
```

- `id` (integer), `processId` (uuid), `status`. `statusMessage` is documented on
  the light object (ref §7) but was **absent** on these `complete` items → optional.
- The `ingests` top-level key is **never** the list shape — it was a phantom in
  the old hand-mirrored `IngestProcessesResponse`. The list reader now collapses
  to the single `processes` array (with `ingests` still tolerated as a defensive
  fallback at the reader boundary, never re-exposed).

### `GET /v1/ingest/{processId}` — status (the heavy `ingest` object)

Live response (the empty buckets were OMITTED — only the non-empty `complete`
bucket was present, confirming each bucket is optional):

```json
{ "ingest": {
  "processId": "567e37f4-…",
  "status": "complete",
  "progress": {
    "complete": { "total": 1, "documents": [
      { "documentId": "5a64053d-…", "bucketId": 25903, "fileName": "table-and-figure-eng.pdf",
        "fileType": "pdf", "fileSize": "71 KB", "fileTokens": 24280, "processId": "567e37f4-…",
        "processLevel": "full", "sourceUrl": "https://upload.eyelevel.ai/…",
        "xrayUrl": "https://upload.eyelevel.ai/…-xray.json", "status": "complete",
        "extracted": false, "created": "2026-05-21T19:40:35Z", "updated": "2026-05-21T19:42:27Z" }
    ] }
  }
} }
```

Documented but absent on this live `complete` response → modeled OPTIONAL:
- `ingest.id` (integer — present on the list-light shape, ref §5 shows it on status too)
- `ingest.statusMessage` (human-readable; populated when `status === "error"`, ref §5)
- the other four `progress` buckets `queued` / `processing` / `errors` / `cancelled`
  (each `{ total: number, documents: [...] }`; ref §5 lists all five, each `Optional`
  on the typed SDK even at `status === "complete"`).

So the reconciled `IngestProcess` (status object) is:
`processId` + `status` + optional `id` / `statusMessage` (canonical name; the old
`message` was the guess) / `progress` (object of optional buckets). Each progress
bucket document is a rich `GroundXDocument`-shaped record (`documentId`, `bucketId`,
`fileName`, `fileType`, `fileSize`, `fileTokens`, `processId`, `processLevel`,
`sourceUrl`, `xrayUrl`, `status`, `extracted`, `created`, `updated`).

**Note — `IngestResponse` (`{ ingest }`) from `ingest_remote` / status / cancel.**
Right after an ingest submit the `ingest` object is the LIGHT shape (`processId` +
`status`, ref §2); after polling it is the HEAVY shape above. Both are the same
`IngestProcess` type with everything past `processId`/`status` optional — so the
single reconciled type covers submit, poll, and cancel responses.

## Schema-metadata source — RESOLVED 2026-05-25

The schema metadata comes from `GET /v1/workflow/{workflow_id}`, looked up via the document's `filter.workflow_id`. See the dedicated section above.

The earlier "no workflow assigned" observation was a transient state: as of 2026-05-25 the sample bucket doc carries `filter.workflow_id = 9910308e-3100-473e-9da6-3ac29f5958a6`, and that workflow returns the full schema (statement 14 / meters 16 / charges 6 fields = 36 fields total). The Extract widget's render path is locked: per-doc → workflow_id → workflow.extract.{group}.fields → match extract values by field id.

## Action items

1. ~~Decide schema source.~~ **DONE** — workflow API via per-doc `filter.workflow_id`.
2. **PdfViewer widget** — closed (PdfViewerWidget shipped 2026-05-25). Reads `xray.sourceUrl` + `documentPages[].pageUrl`.
3. **Extract widget** — pending. Reads `document.filter.workflow_id` → `getGroundXWorkflow(workflow_id)` for schema → `getGroundXDocumentExtract(documentId)` for values → merge by field id.
4. **Strip the manifest's `extractionSchema` + `sampleExtractionValues` + `sampleChatScript`** from `utility.json` once the Extract widget lands. Re-seed.
5. **Keep `chatSeeds` + `hero` + `thinkingScript`** as scenario-level UX strings (Option A in the rewire gap doc).
