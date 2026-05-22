import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState, type FC } from "react";

import { BODY_TEXT, BORDER, FONT_WEIGHT_LABEL, GREEN, NAVY, WHITE } from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { scenarioFixtures } from "@/fixtures";
import type { Citation } from "@/types/onboarding";
import { CiteChip } from "@/shared/components/CiteChip";

/**
 * F3 ExtractView — fields panel side-by-side with the doc.
 *
 * Placeholder rendering — the real Phase 2/7 wire-up mounts the
 * `extraction-workbench` widget here, configured for the 2-pane sample mode
 * documented in the widget README. For now we render the schema directly
 * from the fixture so the user can see citations + values.
 *
 * F4 (expanded field citation) is the same view with the `selectedFieldId`
 * state set — see the right-side preview card.
 */
export const ExtractView: FC = () => {
  const { state: appMode } = useAppMode();
  const { state: session, advanceFrame } = useOnboardingSession();
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const scenario = appMode.scenario ?? session.scenario ?? "utility";
  const fixture = scenarioFixtures[scenario];

  if (!fixture.schema) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="body1" sx={{ color: BODY_TEXT }}>
          This sample skips extract — it's an Interact + Report sample. Try the chat instead.
        </Typography>
      </Box>
    );
  }

  const allFields = fixture.schema.categories.flatMap((c) => c.fields);
  const selectedField = selectedFieldId ? allFields.find((f) => f.id === selectedFieldId) ?? null : null;

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
      <Stack spacing={0.5} sx={{ gridColumn: "1 / -1" }}>
        <Typography variant="overline" sx={{ color: GREEN, fontWeight: FONT_WEIGHT_LABEL }}>
          ANALYZE · EXTRACT
        </Typography>
        <Typography variant="h4">{fixture.schema.name}</Typography>
      </Stack>

      <Box sx={{ overflow: "auto" }}>
        {fixture.schema.categories.map((category) => (
          <Card key={category.id} sx={{ mb: 2, p: 2 }} role="region" aria-label={category.name}>
            <Typography variant="overline" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
              {category.name}
            </Typography>
            <Stack spacing={1} sx={{ mt: 1.5 }}>
              {category.fields.map((field) => (
                <Box
                  key={field.id}
                  role="row"
                  data-testid={`field-row-${field.id}`}
                  onClick={() => setSelectedFieldId(field.id)}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 1,
                    p: 1.25,
                    borderRadius: 1.5,
                    cursor: "pointer",
                    backgroundColor: selectedFieldId === field.id ? "rgba(161, 236, 131, 0.12)" : "transparent",
                    "&:hover": { backgroundColor: "rgba(161, 236, 131, 0.08)" },
                  }}
                >
                  <Stack spacing={0.25}>
                    <Typography variant="body2" sx={{ color: NAVY, fontWeight: 600 }}>
                      {field.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: BODY_TEXT }}>
                      {field.description}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="body2" sx={{ fontFamily: "monospace", color: NAVY }}>
                      {field.value === null ? "—" : String(field.value)}
                    </Typography>
                    {field.citations.map((c: Citation, idx) => (
                      <CiteChip key={`${field.id}-${idx}`} citation={c} index={idx + 1} />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Card>
        ))}
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
              borderRadius: 100,
              border: `1px solid ${NAVY}`,
              color: NAVY,
              cursor: "pointer",
              fontWeight: 600,
              "&:hover": { backgroundColor: "rgba(41, 51, 92, 0.04)" },
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
          borderRadius: 2.5,
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
                {selectedField.citations.map((c, idx) => (
                  <Box key={idx} sx={{ p: 1, borderRadius: 1, border: `1px solid ${BORDER}` }}>
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
                {selectedField.citations.length === 0 ? (
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
