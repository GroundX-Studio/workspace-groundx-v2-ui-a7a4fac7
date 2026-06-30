// spec-app.jsx — mounts the consolidated Onboarding Spec on a design canvas.

const { useTweaks, TweaksPanel, TweakSection, TweakToggle } = window;

const SPEC_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "annotations": true,
  "bw": false
}/*EDITMODE-END*/;

// Brief / cover frame — what this document is
function SpecCover() {
  return (
    <div className="ab" style={{ padding: '40px 44px', background: '#fafaf6' }}>
      <div className="wf-label" style={{ color: 'var(--gx-coral)', marginBottom: 10 }}>ONBOARDING SPEC · v1</div>
      <div className="wf-h" style={{ fontSize: 46, lineHeight: 1, color: 'var(--gx-navy)' }}>Chat-driven onboarding.</div>
      <div className="wf-h" style={{ fontSize: 46, lineHeight: 1, color: 'rgba(41,51,92,0.55)', marginBottom: 16 }}>Wireframes for engineering.</div>

      <div style={{ fontFamily: 'Kalam,cursive', fontSize: 15, color: 'var(--gx-navy)', maxWidth: 760, lineHeight: 1.4 }}>
        <b>Chat owns the first frame; the workspace settles in on the right; both can take focus.</b>
        Citations live in the chat and expand inline to source. Extraction runs against a saved schema; the result renders as table / JSON / grid. Reports are templates built from pinned chat answers. The sign-in gate appears only after the user has felt the value — a chat moment with three options (email, SSO, book an engineer call), never a modal.
      </div>

      <div style={{ height: 24 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {[
          { title: 'Flow', body: 'Utility Bill · ingest → understand → analyze (extract / interact) → gate → integrate' },
          { title: 'Scenarios', body: 'Loan JSON · Solar Portfolio · Solar IC brief · Report builder · lifecycle · back-out audit' },
          { title: 'Layout', body: 'Nav structure · split default · drag-to-resize · focus modes · nav binary' },
          { title: 'Widgets', body: 'Citation chip + peek · step strip · earlier turns · gate · drag handle · table render · extract behaviour · report behaviour' },
          { title: 'Responsive', body: 'Overview + atlas · desktop / tablet / mobile per screen' },
        ].map((s, i) => (
          <div key={i} className="wf-box wf-rough-lite" style={{ padding: 12, background: '#fff' }}>
            <div className="wf-h" style={{ fontSize: 22, color: 'var(--gx-navy)' }}>{i + 1}. {s.title}</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.75)', marginTop: 4 }}>{s.body}</div>
          </div>
        ))}
      </div>

      <div style={{ height: 18 }} />

      <div className="wf-box wf-rough-lite" style={{ padding: 14, background: 'var(--gx-tint)' }}>
        <div className="wf-label" style={{ marginBottom: 6 }}>FROM THE CONVERSATION</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontFamily: 'Kalam,cursive', fontSize: 13, lineHeight: 1.35 }}>
          <div>✓ Chat-first → settles into split</div>
          <div>✓ Bidirectional focus (chat + workspace)</div>
          <div>✓ Drag-to-resize w/ snap-to-focus</div>
          <div>✓ Nav binary collapse</div>
          <div>✓ Anchored citations across chat + canvas + Results</div>
          <div>✓ open full doc + collapse affordances</div>
          <div>✓ Schema editor with per-field prompts (Neil pattern)</div>
          <div>✓ Onboarding step strip · Analyze bracket</div>
          <div>✓ Gate: email · SSO · book engineer call · keep exploring</div>
          <div>✓ Results render: table · JSON · grid</div>
          <div>✓ Report templates: pin Q&amp;A from chat as sections</div>
          <div>✓ Mobile = first-class consumption (Claude design)</div>
          <div>✓ Free tier: 100 pages OR 20 actions</div>
          <div>✓ Sample switch = mode switch, not destructive</div>
        </div>
      </div>

      <div style={{ height: 18 }} />
      <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.65)' }}>
        Pan + zoom the canvas. Click any frame's ↗ to focus it. Open <b>Tweaks</b> ↘ to hide annotations or go b&amp;w.
      </div>
    </div>
  );
}

// Open questions / next-up frame
function SpecOpenQuestions() {
  const open = [
    { t: 'Focus mode keybinds', body: 'Proposed ⌥-1 (focus chat) / ⌥-2 (focus canvas) / ⌥-3 (restore split). Confirm against existing harness keymap.', who: 'eng' },
    { t: 'Pin-to-report scope', body: 'When the user clicks 📌 on an assistant turn with no active template, what happens? Options: auto-create draft template · open template picker · land in S3a empty state with this section prefilled.', who: 'product' },
    { t: 'Variable inference', body: 'When pinning a question like "summarize risk across Project Sundance", the agent extracts {project}. What\'s the heuristic? Always proper nouns? User-confirmed each time? Inline edit?', who: 'product' },
    { t: 'Schema / template versioning UX', body: 'Each save bumps a version. How does the user browse versions, diff them, roll back? Drawer in the topbar, separate History tab, or only via API?', who: 'design' },
    { t: 'Render-mode default per category', body: 'Schema Editor Results — does the render mode persist per category? E.g. statement → JSON, charges → table, meters → grid. Or per-user preference only.', who: 'product' },
    { t: 'Free-tier preview boundaries', body: 'On Schema Results: pinned sample renders fully; additional docs blur. On Reports: pinned project renders fully; new projects gate. Confirm exact thresholds + which surfaces they apply to.', who: 'product' },
    { t: 'Solar hierarchy depth', body: 'Portfolio → Fund → Project — should Project drill further to asset / parcel for very large portfolios?', who: 'product' },
    { t: 'Account state source', body: 'Where does the nav read logged-out vs free vs paid from? Affects the CTA flip (Book engineer call ↔ Get support).', who: 'eng' },
    { t: 'Call CTA destination', body: 'Calendar embed (Cal / Calendly) seems right — confirm the engineer pool and time-slot logic.', who: 'product' },
    { t: 'Edit-template entry point from S3', body: 'Three entry paths spec\'d (topbar button, per-section ✎ edit §N, footer banner). Eng to confirm all three resolve to the same S3a state with the right section selected.', who: 'eng' },
    { t: 'F1 BYO sign-up flow', body: 'Tapping any "Sign up · …" in F1 BYO triggers F1→F2 transition + F6 gate inline. Confirm the chat preamble swaps per CTA (upload vs connect vs email).', who: 'design' },
    { t: 'Post-sign-in spec', body: 'Separate spec needed: what the user sees after magic-link / SSO returns them. This spec terminates at the gate CTA.', who: 'design' },
  ];

  return (
    <div className="ab" style={{ padding: '32px 40px', background: '#fafaf6' }}>
      <div className="ab-title">Open questions</div>
      <div className="ab-sub">Still open before engineering or the next design pass. Tag = owner.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        {open.map((q, i) => (
          <div key={i} className="wf-box wf-rough-lite" style={{ padding: 12, background: '#fff', position: 'relative' }}>
            <div className="wf-anno wf-accent-bg" style={{
              position: 'absolute', top: 8, right: 8,
              background: q.who === 'eng' ? 'var(--gx-cyan)' : q.who === 'product' ? 'var(--gx-green)' : 'var(--gx-coral)',
              color: q.who === 'design' ? '#fff' : 'var(--gx-navy)',
              border: '1px solid var(--gx-navy)',
              padding: '0 6px', borderRadius: 99,
              fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 0.3,
            }}>{q.who}</div>
            <div className="wf-h" style={{ fontSize: 17, color: 'var(--gx-navy)', paddingRight: 56, lineHeight: 1.05 }}>{q.t}</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.78)', marginTop: 6, lineHeight: 1.35 }}>{q.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpecApp() {
  const [t, setTweak] = useTweaks(SPEC_TWEAK_DEFAULTS);
  const rootCls = [
    t.annotations ? '' : 'wf-anno-hide',
    t.bw ? 'wf-bw' : '',
  ].filter(Boolean).join(' ');

  const W = 1280, H = 800;
  const Wsm = 880, Hsm = 580;

  return (
    <div className={rootCls}>
      <DesignCanvas>
        <DCSection id="cover" title="Onboarding Spec · cover" subtitle="What this document is and how to read it.">
          <DCArtboard id="cover" label="cover · what & how" width={1100} height={620}><SpecCover /></DCArtboard>
          <DCArtboard id="glossary" label="glossary · terms used in this spec" width={1100} height={1000}><Spec_Glossary /></DCArtboard>
        </DCSection>

        <DCSection id="flow" title="1 · Onboarding flow · one linear path" subtitle="Ingest → Understand → Analyze (Extract / Interact / Report) → Gate. F1 → F6 in scope; F7 is the post-gate landing.">
          <DCArtboard id="F1" label="F1 · Ingest · pick a source (no chat yet)" width={W} height={H}><Canvas_Ingest /></DCArtboard>
          <DCArtboard id="F1to2" label="F1→F2 · transition · nav + chat slide in" width={W} height={H}><Canvas_Transition /></DCArtboard>
          <DCArtboard id="F2" label="F2 · Understand · processing + education" width={W} height={H}><Flow_Processing /></DCArtboard>
          <DCArtboard id="F2to3" label="F2→F3 · transition · PDF compresses, fields slide in" width={W} height={H}><Canvas_TransitionToExtract /></DCArtboard>
          <DCArtboard id="F3" label="F3 · Extract · doc + fields side-by-side" width={W} height={H}><Flow_Peek /></DCArtboard>
          <DCArtboard id="F3a" label="F3a · Edit schema · refine + re-run (branch from F3 hamburger)" width={W} height={H}><Flow_EditSchema /></DCArtboard>
          <DCArtboard id="F3to4" label="F3→F4 · transition · breadcrumb drops in, region pulses" width={W} height={H}><Canvas_TransitionToField /></DCArtboard>
          <DCArtboard id="F4" label="F4 · Extract · expanded field citation" width={W} height={H}><Flow_Extract /></DCArtboard>
          <DCArtboard id="F5" label="F5 · Interact · grounded answer + anchored cites" width={W} height={H}><Flow_Answer /></DCArtboard>
          <DCArtboard id="F6" label="F6 · gate · sign in (or book a call)" width={W} height={H}><Flow_Gate /></DCArtboard>
          <DCArtboard id="F7" label="F7 · Integrate · API + agent plugins" width={W} height={H}><Canvas_Integrate /></DCArtboard>
        </DCSection>

        <DCSection id="scenarios" title="2 · Other scenarios · same flow, different payload" subtitle="The Utility Bill flow above is the canonical demo. Loan packet shapes JSON; Solar rolls up cross-document risk and ends in an IC brief.">
          <DCArtboard id="S1" label="S1 · Loan Eligibility · Extract output · JSON render (same chrome as F3a)" width={W} height={H}><Scenario_Loan /></DCArtboard>
          <DCArtboard id="S2" label="S2 · Solar Portfolio · cross-doc roll-up" width={W} height={H}><Scenario_Solar /></DCArtboard>
          <DCArtboard id="S3" label="S3 · Solar · IC brief · rendered from template" width={W} height={H}><Solar_EndState /></DCArtboard>
          <DCArtboard id="S3a" label="S3a · Solar · Report builder · IC brief template (branch from S3)" width={W} height={H}><Solar_ReportBuilder /></DCArtboard>
        </DCSection>

        <DCSection id="layout" title="3 · Layout system" subtitle="Split is the default. Drag the divider; either side can take focus. Nav splits content (top) from account (bottom).">
          <DCArtboard id="L0a" label="L0a · nav structure guidance" width={1180} height={620}><Nav_Guidance /></DCArtboard>
          <DCArtboard id="L1" label="L1 · default split" width={W} height={H}><LayoutSplit /></DCArtboard>
          <DCArtboard id="L2" label="L2 · drag-to-resize · snap zones" width={W} height={H}><LayoutDrag /></DCArtboard>
          <DCArtboard id="L3" label="L3 · focus chat" width={W} height={H}><LayoutFocusChat /></DCArtboard>
          <DCArtboard id="L4" label="L4 · focus canvas" width={W} height={H}><LayoutFocusWorkspace /></DCArtboard>
          <DCArtboard id="L5" label="L5 · nav binary" width={W} height={H}><LayoutNav /></DCArtboard>
        </DCSection>

        <DCSection id="lifecycles" title="4 · Lifecycles & back-out" subtitle="How the flow handles dismissal at every point. Reference material — not part of the linear story above.">
          <DCArtboard id="LC1" label="LC1 · capabilities demonstrated per scenario" width={1200} height={680}><Flow_Chapters /></DCArtboard>
          <DCArtboard id="LC2" label="LC2 · back-out paths from the gate" width={W} height={H}><Flow_BackOut /></DCArtboard>
          <DCArtboard id="LC3" label="LC3 · gate lifecycle (state machine)" width={1100} height={620}><Flow_BackOut_Lifecycle /></DCArtboard>
          <DCArtboard id="LC4" label="LC4 · scenario lifecycle (state machine)" width={1340} height={620}><Lifecycle_Scenario /></DCArtboard>
          <DCArtboard id="LC5" label="LC5 · back-out audit · every exit" width={1200} height={680}><BackOut_Audit /></DCArtboard>
        </DCSection>

        <DCSection id="widgets" title="5 · Widget anatomy" subtitle="Engineer-readable reference. States, parts labelled, behaviors in the callout list under each.">
          <DCArtboard id="W1" label="W1 · citation chip + peek" width={Wsm} height={780}><Widget_Citation /></DCArtboard>
          <DCArtboard id="W2" label="W2 · onboarding step strip" width={1100} height={1040}><Widget_PhaseStrip /></DCArtboard>
          <DCArtboard id="W3" label="W3 · history widget" width={Wsm} height={Hsm}><Widget_History /></DCArtboard>
          <DCArtboard id="W4" label="W4 · gate panel" width={Wsm} height={Hsm}><Widget_Gate /></DCArtboard>
          <DCArtboard id="W5" label="W5 · drag handle · snap map" width={Wsm} height={680}><Widget_DragHandle /></DCArtboard>
          <DCArtboard id="W6" label="W6 · Results · table render cell anatomy" width={Wsm} height={720}><Widget_ExtractTable /></DCArtboard>
          <DCArtboard id="W7" label="W7 · Extract behavior · schema-driven dev spec" width={1100} height={1040}><Widget_ExtractBehavior /></DCArtboard>
          <DCArtboard id="W8" label="W8 · Report behavior · template-driven dev spec" width={1100} height={1040}><Widget_ReportBehavior /></DCArtboard>
        </DCSection>

        <DCSection id="responsive" title="6 · Responsive system" subtitle="Same data model · layout shape changes per viewport. Drag-handle disappears below tablet landscape; focus modes & tabs take over.">
          <DCArtboard id="R1" label="R1 · breakpoint overview" width={1240} height={760}><Responsive_Overview /></DCArtboard>
          <DCArtboard id="R2" label="R2 · ultrawide ≥1600" width={1480} height={H}><Responsive_Ultrawide /></DCArtboard>
          <DCArtboard id="R3" label="R3 · tablet portrait 768–1023" width={1000} height={760}><Responsive_Tablet /></DCArtboard>
          <DCArtboard id="R4" label="R4 · mobile <768" width={1100} height={680}><Responsive_Mobile /></DCArtboard>
        </DCSection>

        <DCSection id="atlas" title="7 · Responsive atlas · per screen & widget" subtitle="Each screen on desktop / tablet / mobile, side-by-side. Mobile follows Claude design ethos: full-bleed sheets, 44px touch targets, bottom-anchored input.">
          <DCArtboard id="A0" label="A0 · responsive principles" width={1100} height={620}><Atlas_Principles /></DCArtboard>
          <DCArtboard id="A1" label="A1 · scenario picker (entry)" width={1100} height={560}><Atlas_Entry /></DCArtboard>
          <DCArtboard id="A2" label="A2 · conversation + cites" width={1100} height={560}><Atlas_Conversation /></DCArtboard>
          <DCArtboard id="A3" label="A3 · citation peek" width={1100} height={560}><Atlas_Peek /></DCArtboard>
          <DCArtboard id="A4" label="A4 · extract table" width={1140} height={560}><Atlas_Extract /></DCArtboard>
          <DCArtboard id="A5" label="A5 · gate" width={1100} height={560}><Atlas_Gate /></DCArtboard>
          <DCArtboard id="A6" label="A6 · solar hierarchy" width={1140} height={560}><Atlas_Solar /></DCArtboard>
        </DCSection>

        <DCSection id="next" title="8 · Open questions · next up" subtitle="Things to nail before engineering picks this up.">
          <DCArtboard id="N1" label="open questions" width={1100} height={780}><SpecOpenQuestions /></DCArtboard>
        </DCSection>

        <DCSection id="parking" title="9 · Parking lot · post-signup frames" subtitle="Out of current scope. These are draft frames for the post-signup spec.">
          <DCArtboard id="P1" label="P1 · welcome · 'Before your first project'" width={W} height={H}><Workspace_Welcome /></DCArtboard>
          <DCArtboard id="P2" label="P2 · set up your workspace" width={W} height={H}><Workspace_Setup /></DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Display">
          <TweakToggle label="Annotations" value={t.annotations} onChange={(v) => setTweak('annotations', v)} hint="callouts, dimensions, sticky notes" />
          <TweakToggle label="B&W mode" value={t.bw} onChange={(v) => setTweak('bw', v)} hint="strip brand accents — pure low-fi" />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<SpecApp />);
