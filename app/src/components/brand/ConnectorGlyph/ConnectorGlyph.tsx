import type { FC } from "react";

/**
 * Inline brand glyphs for the F1 "Connect a source" tile. These are the same
 * stylized SVGs the spec uses (spec-nav-v2.jsx `Glyph` function lines 52-77).
 * They are deliberately abstracted — no trademarks; the shape + palette
 * convey "the right vendor" without depending on official logo assets.
 */
export type ConnectorKind =
  | "sharepoint"
  | "onedrive"
  | "gdrive"
  | "dropbox"
  | "box"
  | "s3"
  | "slack"
  | "notion";

export interface ConnectorGlyphProps {
  kind: ConnectorKind;
  size?: number;
}

export const ConnectorGlyph: FC<ConnectorGlyphProps> = ({ kind, size = 22 }) => {
  const props = { width: size, height: size, viewBox: "0 0 24 24" as const };
  switch (kind) {
    case "sharepoint":
      return (
        <svg {...props}>
          <circle cx="9" cy="12" r="6" fill="#036ac4" />
          <circle cx="15" cy="12" r="4.5" fill="#1a93eb" fillOpacity="0.85" />
        </svg>
      );
    case "onedrive":
      return (
        <svg {...props}>
          <path
            d="M5 16c-2 0-3-1.5-3-3.2 0-1.8 1.3-3 3-3.2.4-2.4 2.4-4 4.8-4 1.8 0 3.3 1 4 2.4.6-.4 1.4-.7 2.2-.7 2 0 3.6 1.3 3.9 3 1.6.1 2.6 1.4 2.6 2.9 0 1.5-1.2 2.8-2.8 2.8H5z"
            fill="#0364b8"
          />
        </svg>
      );
    case "gdrive":
      return (
        <svg {...props}>
          <path d="M3 17l3-5h12l-3 5H3z" fill="#0f9d58" />
          <path d="M9 4l-6 13h6l6-13H9z" fill="#1da462" />
          <path d="M15 4l6 13h-6L9 4h6z" fill="#fbbc04" />
        </svg>
      );
    case "dropbox":
      return (
        <svg {...props}>
          <path
            d="M6 4L1 7l5 3 5-3-5-3zm12 0l-5 3 5 3 5-3-5-3zM1 13l5 3 5-3-5-3-5 3zm17-3l-5 3 5 3 5-3-5-3zM6 18l5 3 5-3-5-3-5 3z"
            fill="#0061fe"
          />
        </svg>
      );
    case "box":
      return (
        <svg {...props}>
          <rect x="2" y="6" width="20" height="13" rx="2" fill="#0061d5" />
          <text x="12" y="16" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff" fontFamily="sans-serif">
            BOX
          </text>
        </svg>
      );
    case "s3":
      return (
        <svg {...props}>
          <path d="M5 5l7-2 7 2v14l-7 2-7-2V5z" fill="#e25444" />
          <path d="M5 5l7 2v14l-7-2V5z" fill="#7b1d13" fillOpacity="0.7" />
        </svg>
      );
    case "slack":
      return (
        <svg {...props}>
          <rect x="5" y="10" width="6" height="4" fill="#36c5f0" />
          <rect x="13" y="10" width="6" height="4" fill="#2eb67d" />
          <rect x="10" y="5" width="4" height="6" fill="#ecb22e" />
          <rect x="10" y="13" width="4" height="6" fill="#e01e5a" />
        </svg>
      );
    case "notion":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#fff" stroke="#000" strokeWidth="1.5" />
          <path d="M8 7v10M8 7l8 10M16 7v10" stroke="#000" strokeWidth="1.5" fill="none" />
        </svg>
      );
    default:
      return null;
  }
};

export const CONNECTOR_KINDS: readonly ConnectorKind[] = [
  "sharepoint",
  "onedrive",
  "gdrive",
  "dropbox",
  "box",
  "s3",
  "slack",
  "notion",
];

export const CONNECTOR_LABELS: Record<ConnectorKind, string> = {
  sharepoint: "SharePoint",
  onedrive: "OneDrive",
  gdrive: "Google Drive",
  dropbox: "Dropbox",
  box: "Box",
  s3: "S3",
  slack: "Slack",
  notion: "Notion",
};
