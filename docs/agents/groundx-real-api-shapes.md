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

- Field IDs are snake_case in the response. Need a label rendering rule (snake_case → Title Case) unless the schema defines explicit labels.
- Nested values (meters → meter_charges) need a tree-or-table renderer.
- `_currency` suffix pattern is a sibling-typed-value pattern; the widget can treat them as a unit.

## `GET /v1/workflow` — empty today

```json
{ "workflows": [] }
```

No workflows defined on this account.

## `GET /v1/workflow/relationship` — empty today

```json
{ "workflow": {} }
```

No account-default workflow assigned. **This is the open question** — see "Where does the schema metadata live?" below.

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

## The schema-metadata gap

**Extract endpoint returns values without schema metadata.**

- Field IDs are present (the JSON keys: `account_number`, `amount_due`, etc.).
- Field LABELS, DESCRIPTIONS, and TYPES are **not** in the response.
- The `/v1/workflow` endpoint is empty for this account.
- The `/v1/workflow/relationship` endpoint is empty.
- The bucket object has no schema reference.

So **today** there is no GroundX endpoint that returns the schema's display metadata (name, description, type) for the keys in the extract response. The hardcoded `extractionSchema` in `utility.json` was filling that gap.

**Open question for the user (2026-05-25):**

Where SHOULD the schema metadata live? Three options:

1. **In the workflow** — `/v1/workflow/{id}` returns a schema definition with field-level name/description/type. Today no workflow is assigned to this bucket, so the schema doesn't exist via this path. To get F3 working with real schema metadata, someone needs to author + assign a workflow.

2. **Inferred at render-time from the extract response.** Snake_case → Title Case for labels. Type inferred from value (number / string / date / array / nested object). No descriptions. Looks reasonable but no per-field intent (e.g. `amount_due` vs `total_amount`).

3. **Hybrid (current)** — schema definitions live in the seed manifest, values come from the extract endpoint. The schema is hand-authored; values are real. **This is the current state of the codebase** and matches one read of "the schema builder is based on the real data: it BUILDS the workflow that GroundX runs."

The user already declined option 3 ("nothing hardcoded"). The question is whether option 1 or option 2 is the intent.

## Action items

1. **Decide schema source** (workflow API vs. inferred).
2. **Implement PdfViewer widget** against `xray.sourceUrl` + `documentPages[].pageUrl`.
3. **Implement Extract widget** against `getGroundXDocumentExtract` + whichever schema source wins #1.
4. **Strip the manifest's `extractionSchema` + `sampleExtractionValues` + `sampleChatScript`** from `utility.json`. Re-seed.
5. **Keep `chatSeeds` + `hero` + `thinkingScript`** as scenario-level UX strings (Option A in the rewire gap doc).
