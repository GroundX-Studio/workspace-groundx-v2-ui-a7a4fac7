import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { type FC, useEffect, useId } from "react";

import { BodyText } from "@/components/primitives/BodyText/BodyText";
import { Button } from "@/components/primitives/Button/Button";
import { Heading } from "@/components/primitives/Heading/Heading";
import { IconButton } from "@/components/primitives/IconButton/IconButton";
import { Label } from "@/components/primitives/Label/Label";
import { BreathingMark } from "@/components/primitives/Loading/BreathingMark";
import {
  BORDER,
  BORDER_RADIUS_CARD,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";

import type { ViewerFrameAction, ViewerWidgetFrameProps } from "./viewerFrameDescriptor";

function actionIcon(action: ViewerFrameAction, fallbackIcon?: ViewerFrameAction["icon"]) {
  const icon = action.icon ?? fallbackIcon;
  if (icon === "back") return <ArrowBackRoundedIcon fontSize="small" />;
  if (icon === "close") return <CloseRoundedIcon fontSize="small" />;
  if (icon === "download") return <FileDownloadRoundedIcon fontSize="small" />;
  if (icon === "external") return <OpenInNewRoundedIcon fontSize="small" />;
  if (icon === "save") return <SaveRoundedIcon fontSize="small" />;
  return undefined;
}

function modeBodySx(contentMode: ViewerWidgetFrameProps["contentMode"]) {
  switch (contentMode) {
    case "centered-panel":
      return {
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto",
        p: { xs: 2, md: 3 },
      } as const;
    case "padded-scroll":
      return {
        alignItems: "stretch",
        justifyContent: "flex-start",
        overflow: "auto",
        p: { xs: 2, md: 3 },
      } as const;
    case "embed":
    case "edge-to-edge":
      // unified-loader §1.1 — a COLUMN, so a short child (a loading boundary)
      // anchors to the top of the pane instead of being row-stretched to full
      // height / floating mid-pane. Full-size widgets are unaffected: they
      // stretch on the (now horizontal) cross axis and flex to fill.
      return {
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "flex-start",
        overflow: "hidden",
        p: 0,
      } as const;
  }
}

export const ViewerWidgetFrame: FC<ViewerWidgetFrameProps> = ({
  widgetId,
  active = true,
  chromePolicy,
  contentMode,
  eyebrow,
  title,
  subtitle,
  closeAction,
  primaryAction,
  secondaryActions = [],
  loading,
  status,
  children,
}) => {
  const titleId = useId();
  const hasHeaderContent = Boolean(
    (active && closeAction) ||
      eyebrow ||
      title ||
      subtitle ||
      primaryAction ||
      secondaryActions.length > 0,
  );
  const showHeader = chromePolicy !== "hostless-exception" && hasHeaderContent;

  useEffect(() => {
    if (!active || !closeAction) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAction.onClick();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, closeAction]);

  return (
    <Box
      data-testid="viewer-widget-frame"
      data-viewer-widget-id={widgetId}
      data-viewer-frame-active={active ? "true" : "false"}
      data-viewer-content-mode={contentMode}
      data-viewer-chrome-policy={chromePolicy}
      role="region"
      aria-label={title}
      aria-labelledby={title ? titleId : undefined}
      aria-hidden={active ? undefined : "true"}
      {...(!active ? { inert: "" as unknown as undefined } : {})}
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: WHITE,
        borderRadius: BORDER_RADIUS_CARD,
      }}
    >
      {showHeader ? (
        <Box
          data-testid="viewer-frame-header"
          sx={{
            flexShrink: 0,
            borderBottom: `1px solid ${BORDER}`,
            backgroundColor: WHITE,
            px: { xs: 1.5, md: 2 },
            py: 1.25,
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            {/* A "back" affordance leads (upper-left, conventional for going
                back); a "close" X trails (upper-right, conventional for
                dismissing) so it never crowds the eyebrow › title. */}
            {active && closeAction && (closeAction.icon ?? "close") === "back" ? (
              <IconButton
                noTool="viewer frame close/back navigation"
                icon={actionIcon(closeAction, "close")}
                aria-label={closeAction.label}
                onClick={closeAction.onClick}
                data-testid="viewer-frame-close"
                sx={{ flexShrink: 0 }}
              />
            ) : null}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              {/* Eyebrow › title share ONE row (coral kicker + chevron + title);
                  the subtitle drops to a muted second line only when present. So
                  the header is 1 line when there's no subtitle, 2 at most — never
                  the old three-line stack. */}
              {eyebrow || title ? (
                <Stack
                  direction="row"
                  spacing={0.75}
                  alignItems="baseline"
                  sx={{ minWidth: 0, flexWrap: "wrap" }}
                >
                  {eyebrow ? (
                    <Label variant="eyebrow" sx={{ color: EYEBROW_ON_LIGHT, flexShrink: 0 }}>
                      {eyebrow}
                    </Label>
                  ) : null}
                  {eyebrow && title ? (
                    <ChevronRightRoundedIcon
                      fontSize="small"
                      aria-hidden
                      sx={{ color: MUTED_ON_LIGHT, alignSelf: "center", flexShrink: 0 }}
                    />
                  ) : null}
                  {title ? (
                    <Heading
                      id={titleId}
                      level="h6"
                      sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL, minWidth: 0 }}
                    >
                      {title}
                    </Heading>
                  ) : null}
                </Stack>
              ) : null}
              {subtitle ? (
                <BodyText
                  size="sm"
                  sx={{
                    mt: 0.25,
                    color: MUTED_ON_LIGHT,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {subtitle}
                </BodyText>
              ) : null}
            </Box>
            {primaryAction ? (
              <Button
                noTool="viewer frame primary action"
                onClick={primaryAction.onClick}
                data-testid={primaryAction.testId}
                startIcon={actionIcon(primaryAction)}
              >
                {primaryAction.label}
              </Button>
            ) : null}
            {secondaryActions.length > 0 ? (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                {secondaryActions.map((action) => (
                  <Button
                    key={action.id}
                    noTool="viewer frame secondary action"
                    variant="secondary"
                    isUppercase={false}
                    startIcon={actionIcon(action)}
                    onClick={action.onClick}
                    data-testid={action.testId}
                    sx={{ flexShrink: 0 }}
                  >
                    {action.label}
                  </Button>
                ))}
              </Stack>
            ) : null}
            {/* Trailing close (X) — upper-right, the conventional dismiss spot.
                Rendered last so it never competes with the eyebrow › title. */}
            {active && closeAction && (closeAction.icon ?? "close") !== "back" ? (
              <IconButton
                noTool="viewer frame close/back navigation"
                icon={actionIcon(closeAction, "close")}
                aria-label={closeAction.label}
                onClick={closeAction.onClick}
                data-testid="viewer-frame-close"
                sx={{ flexShrink: 0 }}
              />
            ) : null}
          </Stack>
        </Box>
      ) : null}

      {loading || status ? (
        <Box
          data-testid="viewer-frame-status"
          aria-live="polite"
          sx={{
            flexShrink: 0,
            borderBottom: `1px solid ${BORDER}`,
            // Seamless with the white header/body — NOT the cream/green
            // treatment that read as a foreign "alert" strip. The indicator is
            // the shared breathing mark (unified-loader §1.8) rendered BARE —
            // it accompanies the visible status text, so it's the mark, not
            // the in-place-of-content boundary.
            backgroundColor: WHITE,
            color: MUTED_ON_LIGHT,
            px: { xs: 1.5, md: 2 },
            py: 1,
          }}
        >
          {loading ? (
            <Stack direction="row" spacing={1.25} alignItems="center">
              <BreathingMark size="sm" aria-label={loading.label} />
              <BodyText size="sm" component="span" sx={{ color: MUTED_ON_LIGHT }}>
                {loading.label}
              </BodyText>
            </Stack>
          ) : (
            status
          )}
        </Box>
      ) : null}

      <Box
        data-testid="viewer-frame-body"
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          backgroundColor: contentMode === "centered-panel" ? WARM_OFFWHITE : WHITE,
          ...modeBodySx(contentMode),
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export type {
  ViewerChromePolicy,
  ViewerContentMode,
  ViewerFrameButtonAction,
  ViewerFrameAction,
  ViewerFrameDescriptor,
  ViewerWidgetFrameProps,
} from "./viewerFrameDescriptor";
