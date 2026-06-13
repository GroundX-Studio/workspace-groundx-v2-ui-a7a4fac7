import type { ViewerOverlay } from "@/contexts/ChatStoreContext";
import type { ViewerFrameDescriptor } from "@/components/layout/ViewerWidgetFrame/viewerFrameDescriptor";

type ViewerOverlayKind = ViewerOverlay["kind"];

export const viewerOverlayFrameDescriptors: Record<ViewerOverlayKind, ViewerFrameDescriptor> = {
  "sign-up": {
    chromePolicy: "framed",
    contentMode: "centered-panel",
    eyebrow: "Save your work",
    title: "Create an account",
    subtitle: "Your chat, viewer state, and sample progress stay together after sign-in.",
  },
  "book-call": {
    chromePolicy: "framed",
    contentMode: "embed",
    eyebrow: "Need help?",
    title: "Book a 30-minute engineer call",
    subtitle: "Choose a time in the calendar.",
  },
  "citation-peek": {
    chromePolicy: "edge-to-edge",
    contentMode: "edge-to-edge",
    title: "Citation source",
  },
};
