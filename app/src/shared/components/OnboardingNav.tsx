/**
 * OnboardingNav — the shared left-rail nav used across every onboarding
 * frame (F1 → F7).
 *
 * Per wireframe (spec-primitives.jsx · MiniNav): two width modes —
 *
 *   • Expanded (default, 180px) — labeled rows with initial + name.
 *   • Collapsed (48px)          — initial only, tooltipped.
 *
 * A chevron at the bottom of the rail toggles between modes. The chosen
 * mode is persisted to localStorage so it survives frame transitions
 * (F1 ↔ F2) and full reloads.
 *
 * Logged-out items per the spec:
 *
 *   Top section:    W · Workspaces (disabled)   "Sign in to use"
 *                   P · Projects   (disabled)   "Sign in to use"
 *   Bottom section: ★ · Book a call  (green-bordered CTA)
 *                   D · Docs
 *
 * The disabled state is visual + behavioral — `aria-disabled` is set
 * and `onItemClick` is suppressed. Docs is enabled even when logged out
 * (public docs URL).
 *
 * This component owns its visual chrome ONLY. Routing / opening the
 * call dialog / sending the user to docs is the caller's job via
 * `onItemClick`.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useEffect, useState, type FC, type ReactNode } from "react";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_SM,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  ONBOARDING_NAV_WIDTH_COLLAPSED,
  ONBOARDING_NAV_WIDTH_FULL,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";

const STORAGE_KEY = "groundx-onboarding.nav-collapsed.v1";

/** State hook for the collapsed/expanded toggle, persisted in localStorage. */
export function useOnboardingNavCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  // Re-write to localStorage whenever the in-memory value changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
    } catch {
      // localStorage may be disabled (Safari private mode, etc.). Silent — the
      // in-memory state still works for the current session.
    }
  }, [collapsed]);

  return [collapsed, setCollapsedState];
}

export type OnboardingNavAccountState = "loggedOut" | "free" | "paid";

export type OnboardingNavItemKey =
  | "workspaces"
  | "projects"
  | "call"
  | "docs"
  | "support"
  | "settings";

interface NavItemSpec {
  key: OnboardingNavItemKey;
  label: string;
  initial: string;
  disabled?: boolean;
  /** Whether to render as a CTA pill instead of a normal row. */
  cta?: boolean;
  /** Eyebrow text rendered above CTA labels (expanded mode only). */
  eyebrow?: string;
  /** Subtitle rendered below CTA labels (expanded mode only). */
  subLabel?: string;
}

/**
 * Top-section items by account state. Logged-out shows the section as a
 * disabled hint so users see "what's there once signed in"; signed-in
 * users get enabled items.
 */
function topItemsFor(state: OnboardingNavAccountState): NavItemSpec[] {
  const disabled = state === "loggedOut";
  return [
    { key: "workspaces", label: "Workspaces", initial: "W", disabled },
    { key: "projects", label: "Projects", initial: "P", disabled },
  ];
}

/**
 * Bottom-section items. The CTA flips between "Book a call" (free/loggedOut)
 * and "Get support" (paid).
 */
function bottomItemsFor(state: OnboardingNavAccountState): NavItemSpec[] {
  const cta: NavItemSpec =
    state === "paid"
      ? {
          key: "support",
          label: "Get support",
          initial: "?",
          cta: true,
          subLabel: "docs · chat",
        }
      : {
          key: "call",
          label: "Book a call",
          initial: "★",
          cta: true,
          eyebrow: "NEED HELP?",
          subLabel: "30 min with an engineer",
        };
  const items: NavItemSpec[] = [cta, { key: "docs", label: "Docs", initial: "D" }];
  if (state !== "loggedOut") {
    items.push({ key: "settings", label: "Settings", initial: "⚙" });
  }
  return items;
}

export interface OnboardingNavProps {
  accountState: OnboardingNavAccountState;
  activeKey?: OnboardingNavItemKey;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onItemClick?: (key: OnboardingNavItemKey) => void;
}

export const OnboardingNav: FC<OnboardingNavProps> = ({
  accountState,
  activeKey,
  collapsed,
  onToggleCollapsed,
  onItemClick,
}) => {
  const topItems = topItemsFor(accountState);
  const bottomItems = bottomItemsFor(accountState);
  const width = collapsed ? ONBOARDING_NAV_WIDTH_COLLAPSED : ONBOARDING_NAV_WIDTH_FULL;

  const handleClick = (item: NavItemSpec) => {
    if (item.disabled) return;
    onItemClick?.(item.key);
  };

  const renderRow = (item: NavItemSpec): ReactNode => {
    const isActive = item.key === activeKey && !item.disabled;
    if (item.cta) return renderCta(item, collapsed, handleClick);
    return collapsed
      ? renderCompactRow(item, isActive, handleClick)
      : renderExpandedRow(item, isActive, handleClick);
  };

  return (
    <Box
      data-testid="onboarding-nav"
      aria-label="Onboarding navigation"
      sx={{
        width,
        flexShrink: 0,
        height: "100%",
        backgroundColor: WARM_OFFWHITE,
        borderRight: `1px solid ${BORDER}`,
        boxSizing: "border-box",
        padding: collapsed ? "10px 6px" : "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        transition: "width 180ms ease-out",
      }}
    >
      {/* Brand mark — G avatar (always visible) + GroundX wordmark (expanded only) */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5, px: collapsed ? 0 : 0.5 }}>
        <Box
          aria-hidden
          sx={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            backgroundColor: NAVY,
            color: WHITE,
            fontSize: 13,
            fontWeight: FONT_WEIGHT_HEADLINE,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          G
        </Box>
        {!collapsed && (
          <Box sx={{ fontSize: 16, fontWeight: FONT_WEIGHT_HEADLINE, color: NAVY, lineHeight: 1 }}>
            GroundX
          </Box>
        )}
      </Box>
      <Box sx={{ height: "1px", background: BORDER, my: 0.5, flexShrink: 0 }} />

      <Stack spacing={0.25}>{topItems.map(renderRow)}</Stack>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ height: "1px", background: BORDER, my: 0.5, flexShrink: 0 }} />
      <Stack spacing={0.5}>{bottomItems.map(renderRow)}</Stack>

      {/* Collapse / expand toggle. Chevron direction matches state. */}
      <Box sx={{ pt: 0.5 }}>
        <Box sx={{ height: "1px", background: BORDER, flexShrink: 0 }} />
        <Box
          role="button"
          tabIndex={0}
          data-testid="onboarding-nav-toggle"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggleCollapsed();
            }
          }}
          sx={{
            mt: 0.5,
            px: 0.75,
            py: 0.5,
            fontSize: 14,
            color: MUTED_ON_LIGHT,
            textAlign: collapsed ? "center" : "right",
            cursor: "pointer",
            borderRadius: BORDER_RADIUS_SM,
            "&:hover": { backgroundColor: CYAN },
            "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 1 },
          }}
        >
          {collapsed ? "»" : "«"}
        </Box>
      </Box>
    </Box>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Row renderers
// ──────────────────────────────────────────────────────────────────────────

function renderExpandedRow(
  item: NavItemSpec,
  isActive: boolean,
  onClick: (item: NavItemSpec) => void,
): ReactNode {
  return (
    <Box
      key={item.key}
      role="button"
      tabIndex={item.disabled ? -1 : 0}
      data-testid={`onboarding-nav-item-${item.key}`}
      aria-disabled={item.disabled || undefined}
      title={item.disabled ? "Sign in to use" : undefined}
      onClick={() => onClick(item)}
      onKeyDown={(event) => {
        if (item.disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick(item);
        }
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        padding: "6px 10px",
        fontSize: 13,
        fontWeight: isActive ? FONT_WEIGHT_HEADLINE : FONT_WEIGHT_LABEL,
        backgroundColor: isActive ? CYAN : "transparent",
        border: isActive ? `1px solid ${BORDER}` : "1px solid transparent",
        borderRadius: BORDER_RADIUS_SM,
        color: item.disabled ? "rgba(41,51,92,0.35)" : isActive ? NAVY : BODY_TEXT,
        opacity: item.disabled ? 0.7 : 1,
        cursor: item.disabled ? "not-allowed" : "pointer",
        "&:hover": item.disabled ? undefined : { backgroundColor: CYAN },
      }}
    >
      <Box sx={{ flex: 1 }}>{item.label}</Box>
    </Box>
  );
}

function renderCompactRow(
  item: NavItemSpec,
  isActive: boolean,
  onClick: (item: NavItemSpec) => void,
): ReactNode {
  return (
    <Box
      key={item.key}
      role="button"
      tabIndex={item.disabled ? -1 : 0}
      data-testid={`onboarding-nav-item-${item.key}`}
      aria-disabled={item.disabled || undefined}
      title={item.disabled ? "Sign in to use" : item.label}
      onClick={() => onClick(item)}
      onKeyDown={(event) => {
        if (item.disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick(item);
        }
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 4px",
        fontSize: 13,
        fontWeight: isActive ? FONT_WEIGHT_HEADLINE : FONT_WEIGHT_LABEL,
        backgroundColor: isActive ? CYAN : "transparent",
        border: isActive ? `1px solid ${BORDER}` : "1px solid transparent",
        borderRadius: BORDER_RADIUS_SM,
        color: item.disabled ? "rgba(41,51,92,0.3)" : isActive ? NAVY : MUTED_ON_LIGHT,
        opacity: item.disabled ? 0.55 : 1,
        cursor: item.disabled ? "not-allowed" : "pointer",
        "&:hover": item.disabled ? undefined : { backgroundColor: CYAN, color: NAVY },
      }}
    >
      {item.initial}
    </Box>
  );
}

function renderCta(
  item: NavItemSpec,
  collapsed: boolean,
  onClick: (item: NavItemSpec) => void,
): ReactNode {
  if (collapsed) {
    return (
      <Box
        key={item.key}
        role="button"
        tabIndex={0}
        data-testid={`onboarding-nav-cta-${item.key}`}
        title={item.label}
        onClick={() => onClick(item)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick(item);
          }
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "6px 4px",
          fontSize: 13,
          fontWeight: FONT_WEIGHT_HEADLINE,
          backgroundColor: WHITE,
          border: `1.5px solid ${GREEN}`,
          borderRadius: BORDER_RADIUS_SM,
          color: NAVY,
          cursor: "pointer",
          "&:hover": { backgroundColor: CYAN },
        }}
      >
        {item.initial}
      </Box>
    );
  }
  return (
    <Box
      key={item.key}
      role="button"
      tabIndex={0}
      data-testid={`onboarding-nav-cta-${item.key}`}
      onClick={() => onClick(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick(item);
        }
      }}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 0.25,
        padding: "8px 10px",
        backgroundColor: WHITE,
        border: `1.5px solid ${GREEN}`,
        borderRadius: BORDER_RADIUS_SM,
        color: NAVY,
        cursor: "pointer",
        "&:hover": { backgroundColor: CYAN },
      }}
    >
      {item.eyebrow && (
        <Box
          sx={{
            fontSize: 9,
            fontWeight: FONT_WEIGHT_HEADLINE,
            letterSpacing: LETTER_SPACING_LABEL,
            textTransform: "uppercase",
            color: EYEBROW_ON_LIGHT,
          }}
        >
          {item.eyebrow}
        </Box>
      )}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: 13, fontWeight: FONT_WEIGHT_HEADLINE }}>
        <Box>{item.label}</Box>
        <Box aria-hidden sx={{ color: GREEN }}>
          →
        </Box>
      </Box>
      {item.subLabel && (
        <Box sx={{ fontSize: 11, color: MUTED_ON_LIGHT, lineHeight: 1.2 }}>{item.subLabel}</Box>
      )}
    </Box>
  );
}
