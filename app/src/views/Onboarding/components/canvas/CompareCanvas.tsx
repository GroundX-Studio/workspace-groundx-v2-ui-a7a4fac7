/** P5 compare: the doc with the answer's anchored citation regions. */

import Box from "@mui/material/Box";

import { AnswerCitation } from "../../flow/flowTypes";
import { CitationRegion, DocLine, DocPage, DocToolbar, UnlockBar, docName } from "./DocParts";

export interface CompareCanvasProps {
  sampleName?: string;
  comparison: AnswerCitation[];
  onUnlock?: () => void;
}

export const CompareCanvas = ({ sampleName, comparison, onUnlock }: CompareCanvasProps) => (
  <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2.5 }}>
      <DocToolbar docName={docName(sampleName)} />
      <DocPage title={`${(sampleName ?? "DOCUMENT").toUpperCase()} · PAGES 1–3`}>
        <DocLine width="90%" />
        <DocLine width="72%" />
        {comparison.map((citation) => (
          <CitationRegion key={citation.id} citation={citation} />
        ))}
        <DocLine width="64%" />
      </DocPage>
    </Box>
    <UnlockBar onUnlock={onUnlock} />
  </Box>
);

export default CompareCanvas;
