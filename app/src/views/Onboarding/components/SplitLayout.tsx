/**
 * SplitLayout — the default two-pane split: chat panel (left) | drag handle |
 * canvas (right). Drag the divider to resize; the chat owns a fixed px width and
 * the canvas takes the rest. A focus toggle lets the chat take over the full
 * width (the spec's "focus chat" mode); snapping back restores the split.
 *
 * Below tablet the drag handle disappears and focus modes take over — that
 * responsive behaviour is wired in a later slice; this is the desktop split.
 */

import Box from "@mui/material/Box";
import { KeyboardEvent, useCallback, useEffect, useRef } from "react";

import { BORDER, GREEN, INPUT_BORDER } from "@/constants";

import { UTILITY_BILL_CATEGORIES } from "../flow/extractionData";
import { CHAT_WIDTH_MAX, CHAT_WIDTH_MIN } from "../flow/flowData";
import { useFlow } from "../flow/FlowContext";
import { Canvas } from "./Canvas";
import { ChatPanel } from "./ChatPanel";

/** Keyboard resize step (px) for the divider's arrow-key handler. */
const RESIZE_STEP = 16;

export function SplitLayout() {
  const {
    selectedSample,
    activePhase,
    view,
    hoveredField,
    setHoveredField,
    showExtract,
    chatWidth,
    setChatWidth,
    focusMode,
    setFocusMode,
    resetToIngest,
  } = useFlow();

  // Only the canonical Utility Bill demo has extraction data wired in this slice.
  const category = selectedSample?.id === "utility-bill" ? UTILITY_BILL_CATEGORIES[view] : null;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const chatFocused = focusMode === "chat";

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const { left } = containerRef.current.getBoundingClientRect();
      setChatWidth(event.clientX - left);
    },
    [setChatWidth],
  );

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDragging);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDragging);
    };
  }, [onPointerMove, stopDragging]);

  const startDragging = useCallback(() => {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const toggleChatFocus = useCallback(() => {
    setFocusMode(chatFocused ? "split" : "chat");
  }, [chatFocused, setFocusMode]);

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
        <ChatPanel sample={selectedSample} phase={activePhase} onFocusChat={toggleChatFocus} onPickView={showExtract} />
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
          onPointerDown={startDragging}
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
            sx={{
              width: 4,
              height: 36,
              borderRadius: 2,
              backgroundColor: INPUT_BORDER,
              transition: "background-color 120ms ease",
            }}
          />
        </Box>
      )}

      {/* Canvas pane */}
      {chatFocused ? null : (
        <Box sx={{ flex: 1, minWidth: 0, height: "100%" }}>
          <Canvas
            sample={selectedSample}
            phase={activePhase}
            category={category}
            hoveredField={hoveredField}
            onHoverField={setHoveredField}
            onSwitchSample={resetToIngest}
          />
        </Box>
      )}
    </Box>
  );
}

export default SplitLayout;
