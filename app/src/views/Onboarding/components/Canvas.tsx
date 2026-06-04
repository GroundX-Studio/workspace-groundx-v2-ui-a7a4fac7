/**
 * Canvas — the right pane of the split. A thin orchestrator: it renders the
 * shared header (sample title + switcher) and delegates the body to a per-frame
 * sub-canvas (Understand / Extract / Peek / Compare), or a coming-soon
 * placeholder when the picked sample has no wired-up data.
 */

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  BORDER,
  BORDER_RADIUS_PILL,
  FONT_SIZE_LABEL,
  GRAY,
  INPUT_BORDER,
  MAIN_BACKGROUND,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";
import { onEnterOrSpace } from "@/shared/utils/onEnterOrSpace";

import { SampleData } from "../flow/extractionData";
import { FieldCategoryId, Frame, SampleProject } from "../flow/flowTypes";
import { CalendlyCanvas } from "./canvas/CalendlyCanvas";
import { CompareCanvas } from "./canvas/CompareCanvas";
import { ComingSoonCanvas } from "./canvas/DocParts";
import { ExtractCanvas } from "./canvas/ExtractCanvas";
import { IntegrateCanvas } from "./canvas/IntegrateCanvas";
import { PeekCanvas } from "./canvas/PeekCanvas";
import { UnderstandCanvas } from "./canvas/UnderstandCanvas";

export interface CanvasProps {
  sample: SampleProject | null;
  frame: Frame;
  /** Wired-up data for this sample; null/undefined renders coming-soon. */
  data?: SampleData | null;
  view: FieldCategoryId;
  hoveredField: string | null;
  selectedField: string | null;
  /** P6a: the canvas shows the Calendly embed (the chat shows booking context). */
  booking?: boolean;
  onHoverField: (name: string | null) => void;
  onSelectField: (name: string) => void;
  onClearField: () => void;
  /** Open the sign-in gate (from the unlock bar). */
  onOpenGate?: () => void;
  /** Close the booking embed. */
  onCloseGate?: () => void;
  onSwitchSample?: () => void;
}

export function Canvas({
  sample,
  frame,
  data,
  view,
  hoveredField,
  selectedField,
  booking,
  onHoverField,
  onSelectField,
  onClearField,
  onOpenGate,
  onCloseGate,
  onSwitchSample,
}: CanvasProps) {
  const category = data?.categories[view] ?? null;
  const peekField = category && selectedField ? (category.fields.find((f) => f.name === selectedField) ?? null) : null;

  const renderBody = () => {
    // P6a book-a-call overlays the canvas regardless of the underlying frame.
    if (booking) return <CalendlyCanvas onClose={onCloseGate} />;
    // P7 Integrate is sample-agnostic (works even for unwired samples).
    if (frame === "integrate") return <IntegrateCanvas sampleId={sample?.id} onUnlock={onOpenGate} />;
    if (!data) return <ComingSoonCanvas sampleName={sample?.name ?? "This sample"} />;
    if (frame === "extract" && category) {
      return (
        <ExtractCanvas
          sampleName={sample?.name}
          category={category}
          hoveredField={hoveredField}
          onHoverField={onHoverField}
          onSelectField={onSelectField}
          onUnlock={onOpenGate}
        />
      );
    }
    if (frame === "peek" && category && peekField) {
      return (
        <PeekCanvas sampleName={sample?.name} category={category} field={peekField} onClearField={onClearField} onUnlock={onOpenGate} />
      );
    }
    if (frame === "compare") {
      return <CompareCanvas sampleName={sample?.name} comparison={data.comparison} onUnlock={onOpenGate} />;
    }
    return <UnderstandCanvas sample={sample} />;
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: MAIN_BACKGROUND, minWidth: 0 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${BORDER}`, backgroundColor: WHITE }}
      >
        <Typography sx={{ flex: 1, fontWeight: 700, color: NAVY, fontSize: 16, minWidth: 0 }} noWrap>
          {sample ? sample.name : "Workspace"}
        </Typography>
        {sample ? (
          // TODO(P3a+): open a sample picker. In this slice "switch" returns to P1 ingest.
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            onClick={onSwitchSample}
            onKeyDown={onSwitchSample ? onEnterOrSpace(onSwitchSample) : undefined}
            role="button"
            tabIndex={0}
            aria-label={`Switch sample, currently ${sample.name}`}
            sx={{
              cursor: "pointer",
              px: 1.25,
              py: 0.5,
              borderRadius: BORDER_RADIUS_PILL,
              border: `1px solid ${INPUT_BORDER}`,
              color: NAVY,
              "&:hover": { backgroundColor: GRAY },
            }}
          >
            <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}>sample:</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{sample.name}</Typography>
            <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
          </Stack>
        ) : null}
      </Stack>

      {renderBody()}
    </Box>
  );
}

export default Canvas;
