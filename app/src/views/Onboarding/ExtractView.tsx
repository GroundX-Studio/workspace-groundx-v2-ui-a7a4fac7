import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useEffect, useMemo, useState, type FC, type SyntheticEvent } from "react";
import { useSearchParams } from "react-router-dom";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_CARD,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GREEN,
  NAVY,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { track } from "@/lib/analytics";
import type { ExtractedFieldValue } from "@/types/scenarios";
import { CiteChip } from "@/components/brand/CiteChip/CiteChip";

/**
 * F3 ExtractView — fields panel side-by-side with a citation peek panel.
 *
 * Renders the active scenario's extraction schema (categories +
 * fields) alongside the manifest's sample extracted values + citations.
 * Field rows are clickable; selecting a row surfaces a "Citation Peek"
 * panel on the right showing source pages and snippets.
 *
 * Loan scenario carries the workflow-handoff demo via a JSON render
 * mode toggle ("Table" / "JSON"), backed by the same manifest data.
 *
 * The full `extraction-workbench` widget integration (with real
 * pdfjs-driven PDF rendering + region overlays from citation
 * coordinates) is the Phase 7 wire-up — until that lands the citation
 * peek panel above carries the same data in a flat list.
 *
 * Optional inbound URL search param `?focus=<categoryId>` pre-selects
 * the first field in that category — used by the F2 Pick-a-view pills
 * (`statement` / `meters` / `charges`) so the chat-driven choice lands
 * the user on the right slice of the schema.
 */
export const ExtractView: FC = () => {
  // All hooks must run before any conditional return. Otherwise the render
  // order diverges when the active scenario flips to one without a schema
  // (e.g. Solar), violating React's rules of hooks and crashing.
  const { state: appMode } = useAppMode();
  const { state: session, advanceFrame } = useOnboardingSession();
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<"table" | "json">("table");
  const handleRenderMode = (_event: SyntheticEvent, value: "table" | "json") => {
    if (value) setRenderMode(value);
  };

  const scenarioId = appMode.scenario ?? session.scenario ?? "utility";
  const { byId } = useScenarioRegistry();
  const scenario = byId(scenarioId);
  const schema = scenario?.manifest.extractionSchema;

  // Schema defs come from the manifest; extracted values (with citations)
  // come from the manifest's sampleExtractionValues array. Eventually live
  // extraction will replace the values lookup, schema stays as-is.
  const valuesByFieldId = useMemo(() => {
    const map = new Map<string, ExtractedFieldValue>();
    for (const v of scenario?.manifest.sampleExtractionValues ?? []) {
      map.set(v.fieldId, v);
    }
    return map;
  }, [scenario]);

  // ?focus=<categoryId> from the F2 Pick-a-view pill → select the first
  // field in that category so the right-side preview opens to the
  // user's chosen slice. Only runs on initial mount; user clicks on
  // other fields after that take precedence.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus || !schema || selectedFieldId !== null) return;
    const category = schema.categories.find((c) => c.id === focus);
    const firstField = category?.fields[0];
    if (firstField) setSelectedFieldId(firstField.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  if (!schema) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="body1" sx={{ color: BODY_TEXT }}>
          This sample skips extract — it's an Interact + Report sample. Try the chat instead.
        </Typography>
      </Box>
    );
  }

  const allFields = schema.categories.flatMap((c) => c.fields);
  const selectedField = selectedFieldId ? allFields.find((f) => f.id === selectedFieldId) ?? null : null;
  const selectedValue = selectedField ? valuesByFieldId.get(selectedField.id) : undefined;

  // Loan scenario surfaces the workflow handoff demo via JSON render mode.
  const supportsJsonRender = scenarioId === "loan";

  const jsonOutput = JSON.stringify(
    {
      schemaId: schema.id,
      name: schema.name,
      categories: schema.categories.map((category) => ({
        id: category.id,
        type: category.type,
        fields: category.fields.map((field) => {
          const value = valuesByFieldId.get(field.id);
          return {
            id: field.id,
            type: field.type,
            value: value?.value ?? null,
            citations: value?.citations.map((c) => ({ documentId: c.documentId, page: c.page })) ?? [],
          };
        }),
      })),
    },
    null,
    2
  );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr" },
        gridTemplateRows: "auto 1fr",
        gap: 2,
        p: { xs: 2, md: 4 },
        height: "100%",
        overflow: "hidden",
      }}
      aria-label="Extract"
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ md: "flex-end" }}
        justifyContent="space-between"
        spacing={1}
        sx={{ gridColumn: "1 / -1" }}
      >
        <Stack spacing={0.5}>
          <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
            ANALYZE · EXTRACT
          </Typography>
          <Typography variant="h4">{schema.name}</Typography>
        </Stack>
        {supportsJsonRender ? (
          <Tabs
            value={renderMode}
            onChange={handleRenderMode}
            aria-label="Render mode"
            data-testid="render-mode-tabs"
            sx={{ minHeight: 36 }}
          >
            <Tab value="table" label="Table" data-testid="render-mode-table" sx={{ minHeight: 36 }} />
            <Tab value="json" label="JSON" data-testid="render-mode-json" sx={{ minHeight: 36 }} />
          </Tabs>
        ) : null}
      </Stack>

      <Box sx={{ overflow: "auto" }}>
        {supportsJsonRender && renderMode === "json" ? (
          <Box
            component="pre"
            data-testid="extract-json"
            sx={{
              fontFamily: "monospace",
              fontSize: FONT_SIZE_LABEL,
              backgroundColor: WHITE,
              border: `1px solid ${BORDER}`,
              borderRadius: BORDER_RADIUS_2X,
              p: 2,
              m: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: NAVY,
            }}
          >
            {jsonOutput}
          </Box>
        ) : null}
        {!supportsJsonRender || renderMode === "table" ? schema.categories.map((category) => (
          <Card key={category.id} sx={{ mb: 2, p: 2 }} aria-label={category.name}>
            <Typography variant="overline" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
              {category.name}
            </Typography>
            <Stack spacing={1} sx={{ mt: 1.5 }}>
              {category.fields.map((field) => {
                const extracted = valuesByFieldId.get(field.id);
                const value = extracted?.value;
                const citations = extracted?.citations ?? [];
                return (
                  <Box
                    key={field.id}
                    tabIndex={0}
                    aria-label={`Inspect field: ${field.name}`}
                    data-testid={`field-row-${field.id}`}
                    onMouseEnter={() => {
                      // OB-02 — extract.field_hovered fires on every
                      // row hover. PostHog dedupes via session_id +
                      // event_ts so spam isn't a concern; the funnel
                      // wants total hover-count per field.
                      track("extract.field_hovered", {
                        fieldId: field.id,
                        fieldName: field.name,
                      });
                    }}
                    onClick={() => setSelectedFieldId(field.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedFieldId(field.id);
                      }
                    }}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 1,
                      p: 1.25,
                      borderRadius: BORDER_RADIUS,
                      cursor: "pointer",
                      backgroundColor: selectedFieldId === field.id ? alpha(GREEN, 0.12) : "transparent",
                      "&:hover": { backgroundColor: alpha(GREEN, 0.08) },
                    }}
                  >
                    <Stack spacing={0.25}>
                      <Typography variant="body2" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
                        {field.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: BODY_TEXT }}>
                        {field.description}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography variant="body2" sx={{ fontFamily: "monospace", color: NAVY }}>
                        {value === undefined || value === null ? "—" : String(value)}
                      </Typography>
                      {citations.map((c, idx) => (
                        <CiteChip key={`${field.id}-${idx}`} citation={c} index={idx + 1} />
                      ))}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Card>
        )) : null}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Box
            role="button"
            tabIndex={0}
            data-testid="advance-to-f5"
            onClick={() => advanceFrame("f5")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                advanceFrame("f5");
              }
            }}
            sx={{
              display: "inline-block",
              px: 2,
              py: 1,
              borderRadius: BORDER_RADIUS_PILL,
              border: `1px solid ${NAVY}`,
              color: NAVY,
              cursor: "pointer",
              fontWeight: FONT_WEIGHT_LABEL,
              "&:hover": { backgroundColor: alpha(NAVY, 0.04) },
            }}
          >
            Try asking a question →
          </Box>
        </Stack>
      </Box>

      <Box
        data-testid="extract-preview"
        sx={{
          border: `1px solid ${BORDER}`,
          borderRadius: BORDER_RADIUS_CARD,
          p: 2,
          backgroundColor: WHITE,
          overflow: "auto",
        }}
        aria-label="Citation preview"
      >
        {selectedField ? (
          <>
            <Typography variant="overline" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
              CITATION PEEK
            </Typography>
            <Typography variant="h6" sx={{ mt: 1 }}>
              {selectedField.name}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, color: BODY_TEXT }}>
              {selectedField.description}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" sx={{ color: BODY_TEXT }}>
                Source pages
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap" }}>
                {(selectedValue?.citations ?? []).map((c, idx) => (
                  <Box key={idx} sx={{ p: 1, borderRadius: BORDER_RADIUS_SM, border: `1px solid ${BORDER}` }}>
                    <Typography variant="caption" sx={{ color: NAVY }}>
                      {c.documentId} · page {c.page}
                    </Typography>
                    {c.snippet ? (
                      <Typography variant="body2" sx={{ color: BODY_TEXT, mt: 0.25 }}>
                        "{c.snippet}"
                      </Typography>
                    ) : null}
                  </Box>
                ))}
                {(selectedValue?.citations ?? []).length === 0 ? (
                  <Typography variant="caption" sx={{ color: BODY_TEXT }}>
                    No citations on this field.
                  </Typography>
                ) : null}
              </Stack>
            </Box>
          </>
        ) : (
          <Stack spacing={1}>
            <Typography variant="overline" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
              PREVIEW
            </Typography>
            <Typography variant="body2" sx={{ color: BODY_TEXT }}>
              Click a field on the left to see its source pages and snippets.
            </Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
};
