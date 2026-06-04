/**
 * Onboarding flow state.
 *
 * Holds where the user is in the P1 → P7 journey, which sample they picked, and
 * the layout chrome (nav expand/collapse, chat width, focus mode). This is the
 * pre-auth product surface, deliberately separate from the post-login welcome
 * wizard in contexts/OnboardingContext.
 */

import { createContext, FC, ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { CHAT_WIDTH_DEFAULT, CHAT_WIDTH_MAX, CHAT_WIDTH_MIN, FRAME_BY_STEP, STEP_PHASE } from "./flowData";
import { FieldCategoryId, Frame, FlowPhase, FlowStepId, FocusMode, SampleProject } from "./flowTypes";

export interface FlowContextValue {
  /** Current frame in the journey. */
  step: FlowStepId;
  /** UI frame derived from the step — the single value consumers switch on. */
  frame: Frame;
  /** Step-strip phase derived from the current step. */
  activePhase: FlowPhase;
  /** Sample the user is exploring, or null on P1 before a pick. */
  selectedSample: SampleProject | null;
  /** Whether the nav rail is expanded (true) or collapsed to the icon rail (false). */
  navExpanded: boolean;
  /** Chat panel width in px (split mode). */
  chatWidth: number;
  /** Which pane currently owns focus. */
  focusMode: FocusMode;
  /** The extracted-field category shown in the Extract canvas (P3). */
  view: FieldCategoryId;
  /** Field name currently hovered in the Extract panel, for doc provenance highlight. */
  hoveredField: string | null;
  /** Field opened into the provenance peek (P4), or null in the plain Extract list. */
  selectedField: string | null;
  /** P6 sign-in gate open as an inline chat overlay (canvas stays behind). */
  gateOpen: boolean;
  /** P6a book-a-call: canvas shows the Calendly embed, chat shows booking context. */
  booking: boolean;
  /** Pick a sample on P1 and advance into the split layout (P2). */
  selectSample: (sample: SampleProject) => void;
  /** Open the Extract view (P3) for a category — from P2's "Pick a view" or in-Extract switching. */
  showExtract: (view: FieldCategoryId) => void;
  /** Highlight (or clear) the doc region for a hovered field. */
  setHoveredField: (name: string | null) => void;
  /** Open a field's provenance peek (P4); flips the step strip to Interact. */
  selectField: (name: string) => void;
  /** Collapse the peek back to the Extract field list (P3). */
  clearField: () => void;
  /** Open the P5 cross-document comparison (a second grounded question). */
  compareMeters: () => void;
  /** Open the inline sign-in gate (P6). */
  openGate: () => void;
  /** Dismiss the gate / booking and return to exploring. */
  closeGate: () => void;
  /** From the gate, open the book-a-call Calendly view (P6a). */
  bookCall: () => void;
  /** From booking, return to the sign-in gate. */
  backToGate: () => void;
  /** Open the Integrate frame (P7) — from the step strip's Integrate pill. */
  showIntegrate: () => void;
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
  const [step, setStep] = useState<FlowStepId>("P1");
  const [selectedSample, setSelectedSample] = useState<SampleProject | null>(null);
  const [navExpanded, setNavExpanded] = useState(true);
  const [chatWidth, setChatWidthState] = useState(CHAT_WIDTH_DEFAULT);
  const [focusMode, setFocusMode] = useState<FocusMode>("split");
  const [view, setView] = useState<FieldCategoryId>("meters");
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [booking, setBooking] = useState(false);

  const selectSample = useCallback((sample: SampleProject) => {
    setSelectedSample(sample);
    setGateOpen(false);
    setBooking(false);
    setStep("P2");
    setFocusMode("split");
  }, []);

  const showExtract = useCallback((next: FieldCategoryId) => {
    setView(next);
    setHoveredField(null);
    setSelectedField(null);
    setStep("P3");
    setFocusMode("split");
  }, []);

  const selectField = useCallback((name: string) => {
    setSelectedField(name);
    setStep("P4");
  }, []);

  const clearField = useCallback(() => {
    setSelectedField(null);
    setStep("P3");
  }, []);

  const compareMeters = useCallback(() => {
    setSelectedField(null);
    setStep("P5");
  }, []);

  const openGate = useCallback(() => {
    setBooking(false);
    setGateOpen(true);
  }, []);

  const closeGate = useCallback(() => {
    setGateOpen(false);
    setBooking(false);
  }, []);

  const bookCall = useCallback(() => {
    setGateOpen(false);
    setBooking(true);
  }, []);

  const backToGate = useCallback(() => {
    setBooking(false);
    setGateOpen(true);
  }, []);

  const showIntegrate = useCallback(() => {
    setSelectedField(null);
    setGateOpen(false);
    setBooking(false);
    setStep("P7");
  }, []);

  const goToStep = useCallback((next: FlowStepId) => setStep(next), []);

  const resetToIngest = useCallback(() => {
    setSelectedSample(null);
    setHoveredField(null);
    setSelectedField(null);
    setView("meters");
    setGateOpen(false);
    setBooking(false);
    setStep("P1");
  }, []);

  const toggleNav = useCallback(() => setNavExpanded((open) => !open), []);

  const setChatWidth = useCallback((width: number) => setChatWidthState(clampChatWidth(width)), []);

  const value = useMemo<FlowContextValue>(
    () => ({
      step,
      frame: FRAME_BY_STEP[step],
      activePhase: STEP_PHASE[step],
      selectedSample,
      navExpanded,
      chatWidth,
      focusMode,
      view,
      hoveredField,
      selectedField,
      gateOpen,
      booking,
      selectSample,
      showExtract,
      setHoveredField,
      selectField,
      clearField,
      compareMeters,
      openGate,
      closeGate,
      bookCall,
      backToGate,
      showIntegrate,
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
      selectedField,
      gateOpen,
      booking,
      selectSample,
      showExtract,
      selectField,
      clearField,
      compareMeters,
      openGate,
      closeGate,
      bookCall,
      backToGate,
      showIntegrate,
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
