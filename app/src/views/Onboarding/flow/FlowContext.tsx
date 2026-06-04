/**
 * Onboarding flow state.
 *
 * Holds where the user is in the F1 → F7 journey, which sample they picked, and
 * the layout chrome (nav expand/collapse, chat width, focus mode). This is the
 * pre-auth product surface, deliberately separate from the post-login welcome
 * wizard in contexts/OnboardingContext.
 */

import { createContext, FC, ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { CHAT_WIDTH_DEFAULT, CHAT_WIDTH_MAX, CHAT_WIDTH_MIN, STEP_PHASE } from "./flowData";
import { FieldCategoryId, FlowPhase, FlowStepId, FocusMode, SampleProject } from "./flowTypes";

export interface FlowContextValue {
  /** Current frame in the journey. */
  step: FlowStepId;
  /** Step-strip phase derived from the current step. */
  activePhase: FlowPhase;
  /** Sample the user is exploring, or null on F1 before a pick. */
  selectedSample: SampleProject | null;
  /** Whether the nav rail is expanded (true) or collapsed to the icon rail (false). */
  navExpanded: boolean;
  /** Chat panel width in px (split mode). */
  chatWidth: number;
  /** Which pane currently owns focus. */
  focusMode: FocusMode;
  /** The extracted-field category shown in the Extract canvas (F3). */
  view: FieldCategoryId;
  /** Field name currently hovered in the Extract panel, for doc provenance highlight. */
  hoveredField: string | null;
  /** Pick a sample on F1 and advance into the split layout (F2). */
  selectSample: (sample: SampleProject) => void;
  /** Open the Extract view (F3) for a category — from F2's "Pick a view" or in-Extract switching. */
  showExtract: (view: FieldCategoryId) => void;
  /** Highlight (or clear) the doc region for a hovered field. */
  setHoveredField: (name: string | null) => void;
  /** Jump to a specific frame. */
  goToStep: (step: FlowStepId) => void;
  /** Return to the full-width ingest screen. */
  resetToIngest: () => void;
  toggleNav: () => void;
  setChatWidth: (width: number) => void;
  setFocusMode: (mode: FocusMode) => void;
}

const FlowContext = createContext<FlowContextValue | undefined>(undefined);

const clampChatWidth = (width: number) => Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, width));

export const FlowProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [step, setStep] = useState<FlowStepId>("F1");
  const [selectedSample, setSelectedSample] = useState<SampleProject | null>(null);
  const [navExpanded, setNavExpanded] = useState(true);
  const [chatWidth, setChatWidthState] = useState(CHAT_WIDTH_DEFAULT);
  const [focusMode, setFocusMode] = useState<FocusMode>("split");
  const [view, setView] = useState<FieldCategoryId>("meters");
  const [hoveredField, setHoveredField] = useState<string | null>(null);

  const selectSample = useCallback((sample: SampleProject) => {
    setSelectedSample(sample);
    setStep("F2");
    setFocusMode("split");
  }, []);

  const showExtract = useCallback((next: FieldCategoryId) => {
    setView(next);
    setHoveredField(null);
    setStep("F3");
    setFocusMode("split");
  }, []);

  const goToStep = useCallback((next: FlowStepId) => setStep(next), []);

  const resetToIngest = useCallback(() => {
    setSelectedSample(null);
    setHoveredField(null);
    setStep("F1");
  }, []);

  const toggleNav = useCallback(() => setNavExpanded((open) => !open), []);

  const setChatWidth = useCallback((width: number) => setChatWidthState(clampChatWidth(width)), []);

  const value = useMemo<FlowContextValue>(
    () => ({
      step,
      activePhase: STEP_PHASE[step],
      selectedSample,
      navExpanded,
      chatWidth,
      focusMode,
      view,
      hoveredField,
      selectSample,
      showExtract,
      setHoveredField,
      goToStep,
      resetToIngest,
      toggleNav,
      setChatWidth,
      setFocusMode,
    }),
    [
      step,
      selectedSample,
      navExpanded,
      chatWidth,
      focusMode,
      view,
      hoveredField,
      selectSample,
      showExtract,
      goToStep,
      resetToIngest,
      toggleNav,
      setChatWidth,
    ],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
};

export const useFlow = (): FlowContextValue => {
  const context = useContext(FlowContext);
  if (!context) throw new Error("useFlow must be used inside a FlowProvider");
  return context;
};
