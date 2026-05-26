/**
 * OnboardingNav — the shared left-rail nav used across F2+ frames
 * (F1 hides the nav entirely; see OnboardingShell.hideNav).
 *
 * Per wireframe (spec-primitives.jsx · MiniNav): two width modes —
 *
 *   • Expanded (default, 156px) — labeled rows with initial + name.
 *   • Collapsed (48px)          — initial only, tooltipped.
 *
 * The expanded mode is the default in F2+ (force-overridden by
 * OnboardingShell at viewports ≥ md / 900px); the collapsed rail is
 * reserved for the AppShell's compact-mode drawer below 900px. The
 * old chevron toggle inside the rail was removed 2026-05-25 because
 * it was dead UI in both branches (above 900: state is force-set;
 * below 900: the nav is in a drawer where the in-rail chevron is
 * unreachable).
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
  /**
   * Fired when the brand mark / logo is clicked. The shell wires this
   * to `navigate("/onboarding")` in onboarding context and `"/"`
   * elsewhere. When omitted the logo is non-interactive (back-compat
   * for surfaces that don't want a home affordance).
   */
  onLogoClick?: () => void;
}

export const OnboardingNav: FC<OnboardingNavProps> = ({
  accountState,
  activeKey,
  collapsed,
  // `onToggleCollapsed` is accepted for back-compat with existing
  // call sites (OnboardingShell + SteadyShell) but no longer wired —
  // the chevron toggle was removed 2026-05-25.
  onToggleCollapsed: _onToggleCollapsed,
  onItemClick,
  onLogoClick,
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
      {/* Brand mark.
          Expanded: full GroundX Studio lockup (groundx-studio-color.png,
          1328x277 — natural ~4.79:1 aspect; rendered at 26px tall ≈
          124px wide, which fits the 178px expanded nav comfortably).
          Collapsed: G avatar (no icon-only variant of the lockup
          ships with this scaffold, so we fall back to the badge). */}
      <Box
        // The brand mark doubles as the "go home" affordance — clicking
        // it takes the user back to /onboarding. We always render it as
        // a button-equivalent (role=button + tabIndex + key handler);
        // when `onLogoClick` isn't provided the handler short-circuits
        // and the element is effectively non-interactive (back-compat).
        data-testid="onboarding-nav-logo-button"
        role="button"
        tabIndex={onLogoClick ? 0 : -1}
        aria-label="Back to onboarding home"
        onClick={onLogoClick}
        onKeyDown={(event) => {
          if (!onLogoClick) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onLogoClick();
          }
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          mb: 0.5,
          // Match the nav-item content inset exactly: rows use
          // `padding: "6px 10px"` + a 1.5px transparent border (see
          // renderExpandedRow), so label text starts at 11.5px from
          // the row's outer-left edge. The logo has no border of its
          // own, so we apply 11.5px as padding directly.
          px: collapsed ? 0 : "11.5px",
          minHeight: 28,
          cursor: onLogoClick ? "pointer" : "default",
          borderRadius: BORDER_RADIUS_SM,
          "&:focus-visible": onLogoClick
            ? { outline: `2px solid ${NAVY}`, outlineOffset: 2 }
            : undefined,
        }}
      >
        {collapsed ? (
          <Box
            aria-hidden
            data-testid="onboarding-nav-logo"
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
        ) : (
          <Box
            component="img"
            src="/assets/logos/groundx-studio-color.png"
            alt="GroundX Studio"
            data-testid="onboarding-nav-logo"
            sx={{ height: 26, width: "auto", display: "block" }}
          />
        )}
      </Box>
      <Box sx={{ height: "1px", background: BORDER, my: 0.5, flexShrink: 0 }} />

      <Stack spacing={0.25}>{topItems.map(renderRow)}</Stack>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ height: "1px", background: BORDER, my: 0.5, flexShrink: 0 }} />
      <Stack spacing={0.5}>{bottomItems.map(renderRow)}</Stack>
      {/* Chevron collapse toggle removed 2026-05-25. It was dead UI:
          OnboardingShell now force-overrides collapsed=false above the
          AppShell compact breakpoint (md = 900px), and below 900px the
          AppShell renders the nav inside a drawer so the in-rail
          chevron is unreachable anyway. */}
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
        // 1.5px transparent border (matches the bottom-section CTA's
        // 1.5px GREEN border) so all rows — Workspaces, Projects, Docs,
        // Settings, and the Book-a-call CTA — share identical
        // box-sizing math: 1.5px border + 10px padding = 11.5px
        // content inset. Without this match the Docs row's text
        // rendered ~0.5px left of the CTA card's label.
        border: isActive ? `1.5px solid ${BORDER}` : "1.5px solid transparent",
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
