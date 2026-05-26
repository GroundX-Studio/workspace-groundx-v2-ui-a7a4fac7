/**
 * UnderstandPlaceholder — the "no scenario picked" + "no documents"
 * empty states extracted from UnderstandView per ARCH-10
 * (2026-05-26). UnderstandView itself is now a thin wrapper that
 * mounts PdfViewerWidget when there's a doc to view; this component
 * carries the placeholder copy for the two edge cases.
 *
 * Both kinds use the same brand chrome (UNDERSTAND eyebrow + Heading
 * + BodyText). `kind="byo"` is the active BYO-flow placeholder shown
 * before the user signs in and uploads; `kind="no-doc"` is the
 * defensive case when a scenario is loaded but has no documents
 * (data shape issue; shouldn't happen in practice).
 */

import Box from "@mui/material/Box";
import type { FC } from "react";

import { BodyText } from "@/components/primitives/BodyText/BodyText";
import { Heading } from "@/components/primitives/Heading/Heading";
import { Label } from "@/components/primitives/Label/Label";
import { EYEBROW_ON_LIGHT } from "@/constants";

export interface UnderstandPlaceholderProps {
  kind: "byo" | "no-doc";
}

const COPY = {
  byo: {
    heading: "Sign in to start uploading your own docs.",
    body:
      "Once you're signed in, this surface streams the same parse + extract " +
      "experience over your documents. Use the chat column to send a magic " +
      "link, log in with SSO, or book a call with an engineer.",
    ariaLabel: "Understand · sign in to upload",
  },
  "no-doc": {
    heading: "No documents in this scenario yet.",
    body: "Pick a different sample from the F1 picker to see a parsed document.",
    ariaLabel: "Understand · no document",
  },
} as const;

export const UnderstandPlaceholder: FC<UnderstandPlaceholderProps> = ({ kind }) => {
  const copy = COPY[kind];
  return (
    <Box
      sx={{
        p: { xs: 3, md: 5 },
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 1,
        maxWidth: 560,
        mx: "auto",
      }}
      aria-label={copy.ariaLabel}
    >
      <Label sx={{ color: EYEBROW_ON_LIGHT }}>UNDERSTAND</Label>
      <Heading level="h4">{copy.heading}</Heading>
      <BodyText sx={{ mt: 1 }}>{copy.body}</BodyText>
    </Box>
  );
};
