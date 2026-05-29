# WF-17: F2 pick-view pills from live schema, not manifest

## Why

`ChatColumn.tsx:492` (`derivePickViews`) builds the F2 "pick a view" pills from
`scenario.manifest.extractionSchema.categories`. WF-12 moved F3's schema to the live workflow and
WF-08 §5 strips the manifest fixtures — once that lands, `derivePickViews` returns only the
"interact" pill (no category chips), because the manifest schema is gone. This is the one remaining
`manifest.extractionSchema` reader (in the chat surface, so it can't take ExtractView's prop).

## What changes

The F2 pick-view category pills SHALL derive their categories from the live schema source, not
`manifest.extractionSchema`. Since `ChatColumn` is a sibling of `ExtractView`, lift the live schema
to a shared place (a small `SchemaContext`/ChatStore slot ExtractView populates, or a lightweight
`categories` list on the scenario) so the chat surface reads the same categories the workbench does.

## Out of scope

- F3 value/schema display (WF-12, done) and the manifest strip itself (WF-08 §5) — this just keeps
  the F2 pills correct after both.

## Affected

- App: `ChatColumn.tsx` `derivePickViews` + a shared live-schema source; tests.
- Specs: `ui-views` (pick-view pills derive from the live schema).
