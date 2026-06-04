/**
 * SplitLayout — the workspace surface for P2+.
 *
 * Desktop / ultrawide (≥ 1024): a two-pane split — chat (left) | drag handle |
 * canvas (right). Drag the divider to resize; a focus toggle lets the chat take
 * the full width.
 *
 * Compact (< 1024, tablet portrait + mobile): the two panes can't co-exist
 * meaningfully, so the drag handle disappears and a Chat / Workspace tab switch
 * shows one pane at a time, full-width. The canvas stacks its internals.
 */

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import { BORDER, GREEN, INPUT_BORDER, MUTED_ON_LIGHT, NAVY, WHITE } from "@/constants";

import { getSampleData } from "../flow/extractionData";
import { CHAT_WIDTH_MAX, CHAT_WIDTH_MIN } from "../flow/flowData";
import { useFlow } from "../flow/FlowContext";
import { useViewport } from "../useViewport";
import { Canvas } from "./Canvas";
import { ChatPanel } from "./ChatPanel";

/** Keyboard resize step (px) for the divider's arrow-key handler. */
const RESIZE_STEP = 16;

export function SplitLayout() {
  const {
    selectedSample,
    frame,
    view,
    hoveredField,
    setHoveredField,
    selectedField,
    selectField,
    clearField,
    compareMeters,
    showExtract,
    gateOpen,
    booking,
    openGate,
    closeGate,
    bookCall,
    backToGate,
    chatWidth,
    setChatWidth,
    focusMode,
    resetToIngest,
    setFocusMode,
  } = useFlow();

  const { isCompact } = useViewport();

  // Per-sample data registry — unwired samples render coming-soon (no special-casing).
  const data = getSampleData(selectedSample?.id);
  const openedField =
    data && selectedField ? (data.categories[view].fields.find((f) => f.name === selectedField) ?? null) : null;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const chatFocused = focusMode === "chat";
  // On compact, focusMode doubles as the active tab (canvas → Workspace, else Chat).
  const activePane = focusMode === "canvas" ? "canvas" : "chat";

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!containerRef.current) return;
      setChatWidth(event.clientX - containerRef.current.getBoundingClientRect().left);
    },
    [setChatWidth],
  );

  // Listen for moves/release only while dragging; the cleanup also covers
  // unmount mid-drag, so body styles never leak.
  useEffect(() => {
    if (!dragging) return undefined;
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, onPointerMove]);

  const toggleChatFocus = useCallback(() => setFocusMode(chatFocused ? "split" : "chat"), [chatFocused, setFocusMode]);

  const onDividerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setChatWidth(chatWidth - RESIZE_STEP);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setChatWidth(chatWidth + RESIZE_STEP);
      }
    },
    [chatWidth, setChatWidth],
  );

  const chatPanel = (
    <ChatPanel
      sample={selectedSample}
      frame={frame}
      wired={Boolean(data)}
      onFocusChat={isCompact ? undefined : toggleChatFocus}
      onPickView={showExtract}
      onCompare={compareMeters}
      selectedValue={openedField?.value}
      selectedCitation={openedField?.citation}
      comparisonQuestion={data?.comparisonQuestion}
      comparisonAnswer={data?.comparisonAnswer}
      gateOpen={gateOpen}
      booking={booking}
      onCloseGate={closeGate}
      onBookCall={bookCall}
      onBackToGate={backToGate}
    />
  );

  const canvasPane = (
    <Canvas
      sample={selectedSample}
      frame={frame}
      data={data}
      view={view}
      hoveredField={hoveredField}
      selectedField={selectedField}
      booking={booking}
      stacked={isCompact}
      onHoverField={setHoveredField}
      onSelectField={selectField}
      onClearField={clearField}
      onOpenGate={openGate}
      onCloseGate={closeGate}
      onSwitchSample={resetToIngest}
    />
  );

  // ── Compact (tablet portrait + mobile): Chat / Workspace tab switch ──
  if (isCompact) {
    const TABS = [
      { pane: "chat" as const, label: "Chat" },
      { pane: "canvas" as const, label: "Workspace" },
    ];
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, width: "100%" }}>
        <Box role="tablist" aria-label="Chat or workspace" sx={{ display: "flex", flexShrink: 0, borderBottom: `1px solid ${BORDER}`, backgroundColor: WHITE }}>
          {TABS.map(({ pane, label }) => {
            const active = activePane === pane;
            return (
              <ButtonBase
                key={pane}
                role="tab"
                aria-selected={active}
                onClick={() => setFocusMode(pane)}
                disableRipple
                sx={{
                  flex: 1,
                  py: 1.25,
                  fontSize: 14,
                  fontWeight: 700,
                  color: active ? NAVY : MUTED_ON_LIGHT,
                  borderBottom: `2px solid ${active ? GREEN : "transparent"}`,
                }}
              >
                {label}
              </ButtonBase>
            );
          })}
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>{activePane === "chat" ? chatPanel : canvasPane}</Box>
      </Box>
    );
  }

  // ── Desktop / ultrawide: resizable split ──
  return (
    <Box ref={containerRef} sx={{ display: "flex", height: "100%", minHeight: 0, width: "100%" }}>
      {/* Chat pane */}
      <Box
        sx={{
          width: chatFocused ? "100%" : chatWidth,
          flexShrink: 0,
          minWidth: 0,
          borderRight: chatFocused ? "none" : `1px solid ${BORDER}`,
          height: "100%",
        }}
      >
        {chatPanel}
      </Box>

      {/* Drag handle */}
      {chatFocused ? null : (
        <Box
          role="separator"
          aria-label="Resize chat and canvas"
          aria-orientation="vertical"
          aria-valuenow={Math.round(chatWidth)}
          aria-valuemin={CHAT_WIDTH_MIN}
          aria-valuemax={CHAT_WIDTH_MAX}
          tabIndex={0}
          onPointerDown={() => setDragging(true)}
          onKeyDown={onDividerKeyDown}
          sx={{
            position: "relative",
            width: 10,
            flexShrink: 0,
            cursor: "col-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
            "&:hover .gx-grip": { backgroundColor: GREEN },
            "&:focus-visible": { outline: "none", "& .gx-grip": { backgroundColor: GREEN, height: 56 } },
          }}
        >
          <Box
            className="gx-grip"
            sx={{ width: 4, height: 36, borderRadius: 2, backgroundColor: INPUT_BORDER, transition: "background-color 120ms ease" }}
          />
        </Box>
      )}

      {/* Canvas pane */}
      {chatFocused ? null : <Box sx={{ flex: 1, minWidth: 0, height: "100%" }}>{canvasPane}</Box>}
    </Box>
  );
}

export default SplitLayout;
