/** Per-phase chat content. Each renders the turns for one frame; ChatPanel picks
 *  which one based on the flow frame. */

import { Fragment } from "react";

import { AnswerSegment, UNDERSTAND_SUMMARY } from "../../flow/extractionData";
import { FieldCategoryId } from "../../flow/flowTypes";
import { CitationChip } from "../CitationChip";
import { AssistantBubble, EarlierTurns, ThinkingNotes, UserBubble, ViewChips } from "./parts";

export const UnderstandChat = ({ onPickView }: { onPickView?: (v: FieldCategoryId) => void }) => (
  <>
    <ThinkingNotes />
    <AssistantBubble>Done. {UNDERSTAND_SUMMARY}</AssistantBubble>
    <ViewChips label="Pick a view:" onPick={onPickView} />
  </>
);

export const ExtractChat = ({ onPickView, onCompare }: { onPickView?: (v: FieldCategoryId) => void; onCompare?: () => void }) => (
  <>
    <EarlierTurns label="thinking notes (reading · identifying fields · anchoring citations…)" />
    <AssistantBubble>Done. {UNDERSTAND_SUMMARY}</AssistantBubble>
    <AssistantBubble>
      8 meters · 10 fields each. Hover a field on the right to highlight its rows on the doc; click one to see why it matched.
    </AssistantBubble>
    <ViewChips
      label="Or another view:"
      onPick={onPickView}
      extra={[{ label: "compare two meters", onClick: onCompare }, { label: "edit schema" }]}
    />
  </>
);

export const PeekChat = ({ value, citation }: { value?: string; citation?: string }) => (
  <>
    <EarlierTurns label="earlier turns (reading · thinking notes · extract)" />
    <UserBubble>how did you get {value ?? "that value"}?</UserBubble>
    <AssistantBubble>
      Pulled from the demand summary box on page 1 — the source region is shown on the doc, with full provenance on the right.
      {citation ? <CitationChip label={citation} inline /> : null}
    </AssistantBubble>
    <AssistantBubble>Open another field to inspect it, or ▴ collapse to return to all fields.</AssistantBubble>
  </>
);

export const CompareChat = ({
  question,
  answer,
  onPickView,
}: {
  question: string;
  answer: AnswerSegment[];
  onPickView?: (v: FieldCategoryId) => void;
}) => (
  <>
    <EarlierTurns label="earlier turns (extract · field detail)" />
    <UserBubble>{question}</UserBubble>
    <AssistantBubble>
      {answer.map((segment, i) =>
        typeof segment === "string" ? (
          <Fragment key={i}>{segment}</Fragment>
        ) : (
          <CitationChip key={i} label={segment.cite} inline />
        ),
      )}
    </AssistantBubble>
    <AssistantBubble>Each citation is anchored to its region on the doc on the right.</AssistantBubble>
    <ViewChips label="Or another view:" onPick={onPickView} />
  </>
);

export const IntegrateChat = () => (
  <>
    <EarlierTurns label="earlier turns (extract · interact · gate offered)" />
    <UserBubble>how do I run this from my own code?</UserBubble>
    <AssistantBubble>Two doors on the right — pick the one that fits your stack. Code? API. Agent? Plugins.</AssistantBubble>
    <AssistantBubble>
      Most actions need a sign-in. The &ldquo;unlock everything&rdquo; banner above the doors gets you there in one click.
    </AssistantBubble>
  </>
);

export const ComingSoonChat = ({ sampleName }: { sampleName: string }) => (
  <AssistantBubble>
    Analysis for {sampleName} is coming soon. Try the Utility Bill for the full walkthrough.
  </AssistantBubble>
);
