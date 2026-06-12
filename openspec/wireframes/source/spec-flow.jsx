// spec-flow.jsx — the actual onboarding flow, end-to-end.
// 6 frames using the Utility Bill scenario. All on the standard AppShell.

// Onboarding phases used in the PhaseStrip
const ONBOARDING_PHASES = [
  { key: 'pick', label: 'Pick a scenario' },
  { key: 'explore', label: 'Explore docs' },
  { key: 'ask', label: 'Ask grounded' },
  { key: 'proof', label: 'See evidence' },
  { key: 'extract', label: 'Extract data' },
  { key: 'save', label: 'Save / sign in' },
];

// Helper: chat header without redundant phase strip (chapters are the
// canonical progress indicator, rendered in the canvas)
function ChatHeader({ phase, turns = 0 }) {
  return (
    <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
        <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Conversation</div>
        <div style={{ flex: 1 }} />
        {turns > 0 && <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>{turns} turns</div>}
        <div className="wf-btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} title="focus chat">↗</div>
      </div>
    </div>
  );
}

// ── 1 · Entry / cold open ──
function Flow_Entry() {
  return (
    <div className="ab">
      <div className="ab-title">Flow · 1 · Entry · pick a scenario</div>
      <div className="ab-sub">First load. Chat dominates. Three preloaded scenarios as project cards inside the chat. No nav selection needed yet.</div>

      <div className="ab-stage" style={{ background: '#fff' }}>
        <div className="ab-chrome">
          <i></i><i></i><i></i>
          <span>app.groundx.ai</span>
        </div>
        <div className="ab-body" style={{ display: 'flex' }}>
          {/* sidebar */}
          <MiniNav navState="full" navActive="projects" accountState="loggedOut" />

          {/* Chat-dominant entry — no workspace yet */}
          <div style={{ flex: 1, padding: '24px 36px', background: '#fbfaf6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {/* faint outline of future split */}
            <div className="wf-anno" style={{ position: 'absolute', inset: 22, opacity: 0.12, display: 'flex', gap: 8, pointerEvents: 'none' }}>
              <div className="wf-box-dashed" style={{ width: 280, borderRadius: 4 }} />
              <div className="wf-box-dashed" style={{ flex: 1, borderRadius: 4 }} />
            </div>

            <div style={{ width: 640, maxWidth: '92%', position: 'relative', zIndex: 1 }}>
              {/* Phase strip pinned above the conversation */}
              <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
                <PhaseStrip phases={ONBOARDING_PHASES} current="pick" />
              </div>

              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div className="wf-h" style={{ fontSize: 36, lineHeight: 1, color: 'var(--gx-navy)' }}>What do you want GroundX to do?</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, color: 'rgba(41,51,92,0.7)', marginTop: 4 }}>
                  Pick a scenario — each one's a real document set you can try. No sign-in.
                </div>
              </div>

              <Bubble who="gx" lead>
                Tell me which problem looks like yours — or drop your own docs.
              </Bubble>

              {/* Scenario picker — 4 equal tiles in a 2×2 grid (all 92px tall) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <ScenarioCard scenario={SCENARIOS.utility} recommended compact style={{ height: 92, minHeight: 92 }} />
                <ScenarioCard scenario={SCENARIOS.loan} compact style={{ height: 92, minHeight: 92 }} />
                <ScenarioCard scenario={SCENARIOS.solar} compact style={{ height: 92, minHeight: 92 }} />
                <AddYourOwnTile compact style={{ height: 92, minHeight: 92 }} />
              </div>

              <div style={{ height: 10 }} />
              <ChatInput placeholder="…or describe what you want to do" />
            </div>
          </div>
        </div>
      </div>

      <Callout n={1} top={88} left="50%" style={{ marginLeft: -180 }} />
      <Callout n={2} top={158} left={232} />
      <Callout n={3} top={306} right={134} />
      <Callout n={4} bottom={64} right={134} />
    </div>
  );
}

// ── 2 · Scenario picked, transition complete ──
function Flow_Bucket() {
  const utilityHistory = [
    { time: '0:08', q: 'opened Utility Bill', ans: null, active: true },
  ];
  return (
    <div className="ab">
      <div className="ab-title">Flow · 2 · Scenario opened · split layout settles</div>
      <div className="ab-sub">User taps Utility Bill. <b>Understand</b> just finished — the chapter strip is the user's "what's next" affordance. Clicking a <b>grayed</b> chapter opens an inline explainer ("here's what Report does — try it after sign-in").</div>

      <AppShell navState="full" navActive="projects" accountState="loggedOut" chatWidth={340} focus="split">
        {/* Chat panel */}
        <>
          <ChatHeader phase="explore" turns={1} />
          <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
            <Bubble who="me">Utility Bill</Bubble>
            <Bubble who="gx" lead>
              <b>Read it.</b> 3 pages, 8 meters, ~20 statement fields, 56 charges.
              <div style={{ marginTop: 4, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>
                Pick a chapter on the right — or ask anything.
              </div>
            </Bubble>
            <Bubble who="gx">
              Suggested:
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                <div className="wf-link">▸ Extract every charge by meter (Chapter 2)</div>
                <div className="wf-link">▸ Which meter has the highest demand? (Chapter 3)</div>
                <div className="wf-link">▸ Reconcile the total against line items (Chapter 3)</div>
              </div>
            </Bubble>
          </div>
          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="ask anything…" />
          </div>
        </>

        {/* Canvas */}
        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <div className="wf-h" style={{ fontSize: 22 }}>Utility Bill · 8 meters</div>
            <div className="wf-btn ghost" style={{ fontSize: 11 }}>change project</div>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 11 }} title="focus canvas">⤢</div>
          </div>

          {/* Chapter strip — drives next action */}
          <div style={{ padding: 10, background: '#fafaf6', borderRadius: 6, marginBottom: 10 }}>
            <ChapterStrip scenario={SCENARIOS.utility} activeKey="extract" progress={{ extract: 0.0 }} compact />
          </div>

          {/* Raw bill — not extracted yet */}
          <RBox w="100%" h={280} fill="fill">
            <div style={{ padding: 14 }}>
              <div className="wf-h" style={{ fontSize: 14 }}>UTILITY BILL — JAN · ACCT 88293-A · page 1/3</div>
              <div className="wf-line" style={{ marginTop: 8, width: '50%' }} />
              <div className="wf-line" style={{ width: '70%' }} />
              <div className="wf-line dim" />
              <div className="wf-line dim" style={{ width: '60%' }} />
              {/* table region (compact) */}
              <div style={{ marginTop: 10, padding: 8, border: '1.5px dashed rgba(41,51,92,0.3)', background: '#fff' }}>
                <div className="wf-line" style={{ width: '80%' }} />
                <div className="wf-line" style={{ width: '70%' }} />
                <div className="wf-line dim" style={{ width: '85%' }} />
                <div className="wf-line dim" style={{ width: '50%' }} />
                <div className="wf-line dim" style={{ width: '65%' }} />
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)', marginTop: 4 }}>… 8 meters · 56 charges across pages 1–3 …</div>
              </div>
              <div className="wf-line dim" style={{ marginTop: 8 }} />
              <div className="wf-line dim" style={{ width: '60%' }} />
            </div>
          </RBox>
        </div>
      </AppShell>

      <Callout n={1} top={92} left={68} />
      <Callout n={2} top={92} left={360} />
      <Callout n={3} top={180} right={250} />
      <Callout n={4} top={280} right={250} />
      <Callout n={5} bottom={50} right={140} />
    </div>
  );
}

// ── 3 · First grounded answer with anchored citations ──
function Flow_Answer() {
  return (
    <div className="ab">
      <div className="ab-title">Flow · 5 · Interact · second question across the doc</div>
      <div className="ab-sub">Second Interact turn after the transition from Extract. Synthesis question across multiple meters. Answer streams in chat with inline citation chips; each chip maps to a highlighted region on the doc. <b>Why the "unlock everything" banner appears:</b> the user has now done extract + 2 questions on a sample. Saving the conversation, exporting the extraction, or uploading their own docs all require sign-in. The banner makes that boundary visible before the user hits a wall.</div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={340} focus="split">
        <>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
              <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Conversation</div></div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10 }}>
              <span style={{ color: 'rgba(41,51,92,0.5)' }}>sample:</span>
              <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>Utility Bill</span>
              <span className="wf-link" style={{ color: 'rgba(41,51,92,0.55)' }}>switch ▾</span>
            </div>
          </div>
          <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
            {/* Continuing chat history · F2-F4 compressed */}
            <Bubble who="me">Utility Bill</Bubble>
            <Bubble who="gx" lead>
              <b>Reading utility-bill.pdf now.</b>
            </Bubble>
            <div style={{
              padding: '6px 10px', margin: '6px 0 10px', textAlign: 'center',
              fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.5)',
              borderTop: '1px dashed rgba(41,51,92,0.2)', borderBottom: '1px dashed rgba(41,51,92,0.2)',
            }}>
              <span className="wf-link">▾ 8 earlier turns (extract · field detail)</span>
            </div>

            {/* New for F5 · the synthesis question */}
            <Bubble who="me">How does meter #3 compare to the others?</Bubble>
            <Bubble who="gx" lead>
              <b>Meter #3 is the heaviest single load on this bill.</b> Its peak demand of <b>16.2 kW</b>{' '}
              <CiteChip n={1} page={1} doc="bill" /> is <b>34% higher</b> than the next, Meter #1 at 12.1 kW{' '}
              <CiteChip n={2} page={1} doc="bill" />. On-peak energy mirrors that: 892 kWh vs 728 kWh{' '}
              <CiteChip n={3} page={2} doc="bill" />. Of the 8 meters, only #3 and #1 land above 10 kW peak; the other six combined contribute less than #3 alone{' '}
              <CiteChip n={4} page={3} doc="bill" color="coral" />.
            </Bubble>
            <Bubble who="gx">
              Tap any citation chip → I'll light up the source region on the doc.
            </Bubble>
          </div>
          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="follow-up…" />
          </div>
        </>

        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {/* Onboarding step strip · Interact sub-pill active */}
          <div style={{ padding: '10px 14px 12px', background: '#fafaf6', borderRadius: 6, marginBottom: 10 }}>
            <OnboardingStepStrip currentStepKey="analyze" activeSubKey="interact" doneSubKeys={['extract']} />
          </div>

          {/* PDF viewer · same chrome as F2/F3/F4 · multiple regions lit to match citation chips */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 14px',
              background: 'var(--gx-navy)', color: '#fff',
              borderRadius: '4px 4px 0 0',
              fontFamily: 'Kalam,cursive', fontSize: 11,
            }}>
              <span style={{ fontWeight: 700 }}>utility-bill.pdf</span>
              <div style={{ flex: 1 }} />
              <span style={{ opacity: 0.65 }}>‹</span>
              <span style={{ fontWeight: 700 }}>page 1 of 3</span>
              <span style={{ opacity: 0.65 }}>›</span>
              <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.2)' }} />
              <span style={{ opacity: 0.65 }}>−</span>
              <span style={{ fontWeight: 700 }}>100%</span>
              <span style={{ opacity: 0.65 }}>+</span>
            </div>
            <div style={{
              flex: 1, background: '#fff',
              border: '1.5px solid var(--gx-navy)', borderTop: 'none',
              borderRadius: '0 0 4px 4px',
              padding: 28, boxSizing: 'border-box',
              position: 'relative', overflow: 'auto',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ height: 14, width: '32%', background: 'rgba(41,51,92,0.65)', borderRadius: 2 }} />
                <div style={{ height: 8, width: '20%', background: 'rgba(41,51,92,0.25)', borderRadius: 2 }} />
              </div>
              <div style={{ height: 5, width: '60%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
              <div style={{ height: 5, width: '70%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 14 }} />

              {/* Citation [1] · Meter #3 peak · green */}
              <div style={{
                padding: 8, background: 'var(--gx-green)',
                border: '1.5px solid var(--gx-navy)',
                position: 'relative', marginBottom: 6,
              }} className="wf-accent-bg">
                <div className="wf-label" style={{ position: 'absolute', top: -8, left: 6, background: '#fff', padding: '0 4px', fontSize: 9 }}>[1] meter #3 · peak 16.2 kW</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: 'var(--gx-navy)' }}>Meter #3 · 16.2 kW peak</div>
              </div>

              {/* Citation [2] · Meter #1 peak · cyan */}
              <div style={{
                padding: 8, background: 'var(--gx-cyan)',
                border: '1.5px solid var(--gx-navy)',
                position: 'relative', marginBottom: 10,
              }} className="wf-accent-bg">
                <div className="wf-label" style={{ position: 'absolute', top: -8, left: 6, background: '#fff', padding: '0 4px', fontSize: 9 }}>[2] meter #1 · peak 12.1 kW</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: 'var(--gx-navy)' }}>Meter #1 · 12.1 kW peak</div>
              </div>

              <div style={{ height: 5, width: '55%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
              <div style={{ height: 5, width: '45%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 10 }} />

              {/* Citation [3] · on-peak energy comparison · cyan */}
              <div style={{
                padding: 8, background: 'var(--gx-cyan)',
                border: '1.5px solid var(--gx-navy)',
                position: 'relative', marginBottom: 10,
              }} className="wf-accent-bg">
                <div className="wf-label" style={{ position: 'absolute', top: -8, left: 6, background: '#fff', padding: '0 4px', fontSize: 9 }}>[3] on-peak energy · pages 1–2</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: 'var(--gx-navy)' }}>892 kWh (#3) vs 728 kWh (#1)</div>
              </div>

              <div style={{ height: 5, width: '50%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
              <div style={{ height: 5, width: '60%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 10 }} />

              {/* Citation [4] · summary block · coral · highlights anomaly */}
              <div style={{
                padding: 8, background: 'var(--gx-coral)',
                border: '1.5px solid var(--gx-navy)', color: '#fff',
                position: 'relative',
              }} className="wf-accent-bg">
                <div className="wf-label" style={{ position: 'absolute', top: -8, left: 6, background: '#fff', padding: '0 4px', color: 'var(--gx-coral)', fontSize: 9 }}>[4] page 3 summary</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700 }}>6 small meters combined &lt; #3 alone</div>
              </div>

              {/* faint cyan wash · fully scanned */}
              <div className="wf-accent-bg" style={{
                position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                background: 'linear-gradient(180deg, rgba(193,232,238,0.10), rgba(193,232,238,0.04))',
                pointerEvents: 'none',
              }} />
            </div>
          </div>

          {/* Unlock everything CTA — same banner pattern as F3, drives F6 gate */}
          <div className="wf-box wf-rough-lite" style={{ marginTop: 10, padding: 10, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gx-tint)' }}>
            <div style={{ fontSize: 14 }}>🔒</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700, flex: 1, color: 'var(--gx-navy)' }}>
              Locked behind sign-in:
              <span style={{ fontWeight: 400, color: 'rgba(41,51,92,0.75)', marginLeft: 6 }}>
                3 / 10 fields on each meter · CSV / JSON export · save this conversation · upload your own docs
              </span>
            </div>
            <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 12 }}>unlock everything →</div>
          </div>
        </div>
      </AppShell>
    </div>
  );
}

// ── 4 · Extract view · doc + fields side-by-side ──
// Chapter 2 (Extract) is the active chapter. Workspace pivots from raw doc
// view to a two-pane: doc on the left with regions lit up, fields list on
// the right. Each field hover → highlights its source region. Cell click →
// drills into F5 (expanded field citation).
function Flow_Peek() {
  return (
    <div className="ab">
      <div className="ab-title">Flow · 3 · Extract · doc + fields side-by-side</div>
      <div className="ab-sub">First capability demo after Understand finishes. <b>Goal:</b> deliver the "aha" — turn an unreadable bill into structured, citable fields. The two-pane layout lets the user verify every value traces back to its page region.</div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={340} focus="split">
        <>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
              <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Conversation</div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10 }}>
              <span style={{ color: 'rgba(41,51,92,0.5)' }}>sample:</span>
              <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>Utility Bill</span>
              <span className="wf-link" style={{ color: 'rgba(41,51,92,0.55)' }}>switch ▾</span>
            </div>
          </div>
          <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
            {/* Continuing from F2 — collapsed read-of-doc history */}
            <Bubble who="me">Utility Bill</Bubble>
            <Bubble who="gx" lead>
              <b>Reading utility-bill.pdf now.</b>
            </Bubble>
            <div style={{
              padding: '6px 10px', margin: '6px 0 10px', textAlign: 'center',
              fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.5)',
              borderTop: '1px dashed rgba(41,51,92,0.2)', borderBottom: '1px dashed rgba(41,51,92,0.2)',
            }}>
              <span className="wf-link">▾ 6 thinking notes (closing the comprehension gap…)</span>
            </div>
            <Bubble who="gx">
              <b>Done.</b> 3 pages · 20 statement fields · 8 meters · 56 charges. Ready to analyze.
            </Bubble>
            {/* New for F3 — picked options collapse into the user bubble */}
            <Bubble who="me">meters</Bubble>
            <Bubble who="gx" lead>
              <b>8 meters · 10 fields each.</b> Hover a meter on the right → I'll light up its rows on the doc.
            </Bubble>
            <Bubble who="gx" opts={[
              { label: 'statement' },
              { label: 'charges' },
              { label: 'compare two meters' },
              { label: 'edit schema' },
            ]}>
              Or another view:
            </Bubble>
          </div>
          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="ask anything…" />
          </div>
        </>

        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>

          {/* Onboarding step strip — Extract is the active sub-capability */}
          <div style={{ padding: '10px 14px 12px', background: '#fafaf6', borderRadius: 6, marginBottom: 10 }}>
            <OnboardingStepStrip currentStepKey="analyze" activeSubKey="extract" />
          </div>

          {/* Two-pane: PDF viewer | fields panel · matching F2 PDF viewer chrome */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, flex: 1, minHeight: 0 }}>
            {/* PDF viewer · same chrome as F2 */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {/* Toolbar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 14px',
                background: 'var(--gx-navy)', color: '#fff',
                borderRadius: '4px 4px 0 0',
                fontFamily: 'Kalam,cursive', fontSize: 11,
              }}>
                <span style={{ fontWeight: 700 }}>utility-bill.pdf</span>
                <div style={{ flex: 1 }} />
                <span style={{ opacity: 0.65 }}>‹</span>
                <span style={{ fontWeight: 700 }}>page 1 of 3</span>
                <span style={{ opacity: 0.65 }}>›</span>
                <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.2)' }} />
                <span style={{ opacity: 0.65 }}>−</span>
                <span style={{ fontWeight: 700 }}>100%</span>
                <span style={{ opacity: 0.65 }}>+</span>
              </div>
              {/* Page · same silhouette as F2 + meter #3 highlight overlay */}
              <div style={{
                flex: 1, background: '#fff',
                border: '1.5px solid var(--gx-navy)', borderTop: 'none',
                borderRadius: '0 0 4px 4px',
                padding: 28, boxSizing: 'border-box',
                position: 'relative', overflow: 'auto',
              }}>
                {/* faint page content — looks like a bill (matches F2) */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ height: 14, width: '32%', background: 'rgba(41,51,92,0.65)', borderRadius: 2 }} />
                  <div style={{ height: 8, width: '20%', background: 'rgba(41,51,92,0.25)', borderRadius: 2 }} />
                </div>
                <div style={{ height: 5, width: '60%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
                <div style={{ height: 5, width: '70%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
                <div style={{ height: 5, width: '40%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 14 }} />

                {/* table — meter rows with row 3 highlighted */}
                <div style={{ border: '1px solid rgba(41,51,92,0.2)', padding: 8, marginBottom: 14, position: 'relative' }}>
                  {[0,1,2,3,4,5,6,7].map((row) => {
                    const isMeter3 = row === 2; // visually 3rd row (meter #3)
                    return (
                      <div key={row} style={{
                        display: 'flex', gap: 8, marginBottom: 4,
                        background: isMeter3 ? 'var(--gx-green)' : 'transparent',
                        boxShadow: isMeter3 ? '0 0 0 3px rgba(161,236,131,0.4)' : 'none',
                        border: isMeter3 ? '1.5px solid var(--gx-navy)' : 'none',
                        padding: isMeter3 ? '4px 6px' : '0',
                        position: 'relative',
                        marginLeft: isMeter3 ? -6 : 0,
                        marginRight: isMeter3 ? -6 : 0,
                      }} className={isMeter3 ? 'wf-accent-bg' : ''}>
                        {isMeter3 && (
                          <div className="wf-label" style={{
                            position: 'absolute', top: -8, left: 6,
                            background: '#fff', padding: '0 4px', fontSize: 9,
                          }}>meter_id #3 · hovered field →</div>
                        )}
                        <div style={{ height: 4, flex: 2, background: isMeter3 ? 'rgba(41,51,92,0.55)' : 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
                        <div style={{ height: 4, flex: 1, background: isMeter3 ? 'rgba(41,51,92,0.55)' : 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
                        <div style={{ height: 4, flex: 1, background: isMeter3 ? 'rgba(41,51,92,0.55)' : 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
                        <div style={{ height: 4, flex: 1, background: isMeter3 ? 'rgba(41,51,92,0.55)' : 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
                      </div>
                    );
                  })}
                </div>

                <div style={{ height: 5, width: '55%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
                <div style={{ height: 5, width: '75%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
                <div style={{ height: 5, width: '45%', background: 'rgba(41,51,92,0.15)', borderRadius: 99 }} />

                {/* faint cyan wash · fully scanned (same as end of F2) */}
                <div className="wf-accent-bg" style={{
                  position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                  background: 'linear-gradient(180deg, rgba(193,232,238,0.10), rgba(193,232,238,0.04))',
                  pointerEvents: 'none',
                }} />
              </div>
            </div>

            {/* Fields panel · matching toolbar treatment */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
              {/* Toolbar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px',
                background: 'var(--gx-navy)', color: '#fff',
                borderRadius: '4px 4px 0 0',
                fontFamily: 'Kalam,cursive', fontSize: 11,
              }}>
                <span style={{ fontWeight: 700 }}>Extracted fields</span>
                <div style={{ flex: 1 }} />
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.35)',
                  fontWeight: 700, fontSize: 13, lineHeight: 1,
                }} title="open: filter · export · copy schema · save (sign in)">≡</div>
              </div>

              {/* Spec-only · open menu showing what the hamburger contains.
                  Floats above the body so reviewers can see the actions without
                  hovering. Mark clearly as a spec annotation, not real UI. */}
              <div style={{
                position: 'absolute', top: 30, right: 0, zIndex: 5,
                width: 220,
                background: '#fff',
                border: '1.5px solid var(--gx-navy)',
                borderRadius: 4,
                boxShadow: '3px 3px 0 rgba(41,51,92,0.12)',
                padding: '6px 0',
                fontFamily: 'Kalam,cursive', fontSize: 11,
                color: 'var(--gx-navy)',
              }}>
                <div style={{
                  position: 'absolute', top: -10, right: 10,
                  padding: '1px 7px', borderRadius: 99,
                  background: 'var(--gx-coral)', color: '#fff',
                  fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700,
                  letterSpacing: 0.5, textTransform: 'uppercase',
                }}>menu · open for spec</div>
                {[
                  { label: 'Save schema…', sub: 'YAML · the main outcome of this view · reuse on new docs', lock: true, primary: true },
                  { label: 'Edit schema…', sub: 'add / remove / retype fields · refine the prompts', lock: true },
                  { label: 'Export CSV', sub: 'current tab · all visible fields', lock: true },
                  { label: 'Export JSON', sub: 'preserves nesting (per-meter arrays)', lock: true },
                  { label: 'Filter fields…', sub: 'show / hide by name, group, confidence', lock: false },
                  { label: 'Group by', sub: 'flat · by source page · by meter (current)', lock: false },
                ].map((it, i) => (
                  <div key={i} style={{
                    padding: '5px 10px',
                    borderTop: i === 0 ? 'none' : '1px dashed rgba(41,51,92,0.12)',
                    opacity: it.lock ? 0.75 : 1,
                    display: 'flex', alignItems: 'flex-start', gap: 6,
                    background: it.primary ? 'var(--gx-tint)' : 'transparent',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, lineHeight: 1.15, color: it.primary ? 'var(--gx-coral)' : 'var(--gx-navy)' }}>{it.label}</div>
                      <div style={{ fontSize: 9.5, color: 'rgba(41,51,92,0.6)', lineHeight: 1.2, marginTop: 1 }}>{it.sub}</div>
                    </div>
                    {it.lock && (
                      <span style={{
                        fontSize: 9, padding: '1px 5px',
                        background: it.primary ? '#fff' : 'var(--gx-tint)', borderRadius: 99,
                        fontWeight: 700, color: 'var(--gx-coral)',
                        whiteSpace: 'nowrap',
                      }}>🔒 sign in</span>
                    )}
                  </div>
                ))}
              </div>
              {/* Body */}
              <div style={{
                flex: 1, background: '#fff',
                border: '1.5px solid var(--gx-navy)', borderTop: 'none',
                borderRadius: '0 0 4px 4px',
                padding: 12, boxSizing: 'border-box',
                overflow: 'auto',
              }}>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                  <div className="wf-box wf-rough-lite" style={{ padding: '3px 8px', fontFamily: 'Kalam,cursive', fontSize: 10, background: '#fff' }}>statement · 20</div>
                  <div className="wf-box wf-rough-lite" style={{ padding: '3px 8px', fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, background: 'var(--gx-cyan)' }}>
              meter #3 · 10
              <span style={{ marginLeft: 6, color: 'rgba(41,51,92,0.55)', fontWeight: 400 }}>3 of 10 fields locked 🔒</span>
            </div>
                  <div className="wf-box wf-rough-lite" style={{ padding: '3px 8px', fontFamily: 'Kalam,cursive', fontSize: 10, background: '#fff' }}>+7 more</div>
                </div>
                {[
                  { k: 'meter_id', v: '#3', cite: 'p.1', active: true },
                  { k: 'service_type', v: 'commercial · TOU-B-3', cite: 'p.1' },
                  { k: 'peak_demand_kw', v: '16.2', cite: 'p.1' },
                  { k: 'energy_on_peak_kwh', v: '892', cite: 'p.1' },
                  { k: 'energy_off_peak_kwh', v: '410', cite: 'p.1' },
                  { k: 'energy_base_kwh', v: '90', cite: 'p.2' },
                  { k: 'demand_charge', v: '$412.80', cite: 'p.1' },
                ].map((f, i) => (
                  <div key={i} className="wf-box wf-rough-lite" style={{ padding: '5px 8px', marginBottom: 4, background: f.active ? 'var(--gx-green)' : '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.3, textTransform: 'uppercase' }}>{f.k}</div>
                      <div style={{ flex: 1 }} />
                      <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'var(--gx-coral)', fontWeight: 700 }}>[{i+1}] {f.cite}</div>
                    </div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700, color: 'var(--gx-navy)', marginTop: 1 }}>{f.v}</div>
                  </div>
                ))}
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)', marginTop: 6 }}>3 more fields locked · sign in</div>
              </div>
            </div>
          </div>

          <div className="wf-box wf-rough-lite" style={{ marginTop: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gx-tint)' }}>
            <div style={{ fontSize: 14 }}>🔒</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700, flex: 1, color: 'var(--gx-navy)' }}>
              Preview · 8 meters and 3 statement fields are signed-in-only.
            </div>
            <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 12 }}>unlock everything →</div>
          </div>
        </div>
      </AppShell>
    </div>
  );
}

// ── 5 · Expanded field citation · anchored to a single extracted field ──
// User clicks a field card on F4. A peek opens with the doc source on the
// left (region lit + connector to the field) and the full provenance on the
// right (value, confidence, why-it-matched, neighbors).
function Flow_Extract() {
  return (
    <div className="ab">
      <div className="ab-title">Flow · 4 · Expanded field citation · doc source + provenance</div>
      <div className="ab-sub">User asks <code>"how did you get 16.2 kW?"</code> in chat — the <b>first Interact moment</b>, which is why the step strip flips from Extract to Interact here. Source region lights up on the doc; full provenance opens on the right.</div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={340} focus="split">
        <>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
              <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Conversation</div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10 }}>
              <span style={{ color: 'rgba(41,51,92,0.5)' }}>sample:</span>
              <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>Utility Bill</span>
              <span className="wf-link" style={{ color: 'rgba(41,51,92,0.55)' }}>switch ▾</span>
            </div>
          </div>
          <div style={{ padding: 14, flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            {/* Collapsed earlier turns — keeps the answer + citations near the bottom */}
            <div style={{
              padding: '6px 10px', margin: '0 0 12px', textAlign: 'center',
              fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.5)',
              borderTop: '1px dashed rgba(41,51,92,0.2)', borderBottom: '1px dashed rgba(41,51,92,0.2)',
            }}>
              <span className="wf-link">▾ earlier turns (reading · 6 thinking notes · Done · meters)</span>
            </div>
            <Bubble who="me">how did you get 16.2 kW?</Bubble>
            <Bubble who="gx" lead>
              <b>Pulled from the demand summary box on page 1.</b> Source region's lit on the doc · full provenance on the right.
              <div style={{ marginTop: 6 }}>
                <CiteChip n={1} page={1} doc="utility-bill" />
              </div>
            </Bubble>
            <Bubble who="gx">
              Tap <span className="wf-link">↗ open full doc</span> to scroll, or <span className="wf-link">▴ collapse</span> to return to all fields.
            </Bubble>
          </div>
          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="follow-up…" />
          </div>
        </>

        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {/* Onboarding step strip */}
          <div style={{ padding: '10px 14px 12px', background: '#fafaf6', borderRadius: 6, marginBottom: 10 }}>
            <OnboardingStepStrip currentStepKey="analyze" activeSubKey="interact" doneSubKeys={['extract']} />
          </div>

          {/* Breadcrumb back to F3 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Kalam,cursive', fontSize: 11, marginBottom: 10 }}>
            <span className="wf-link" style={{ color: 'rgba(41,51,92,0.7)' }}>← all fields</span>
            <span style={{ color: 'rgba(41,51,92,0.4)' }}>›</span>
            <span style={{ color: 'rgba(41,51,92,0.7)' }}>meters · #3</span>
            <span style={{ color: 'rgba(41,51,92,0.4)' }}>›</span>
            <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>peak_demand_kw</span>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 10 }}>▴ collapse</div>
            <div className="wf-btn ghost" style={{ fontSize: 10 }}>↗ open full doc</div>
          </div>

          {/* Two-pane: PDF viewer | provenance panel · matching F2/F3 chrome */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12, flex: 1, minHeight: 0 }}>
            {/* PDF viewer */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 14px',
                background: 'var(--gx-navy)', color: '#fff',
                borderRadius: '4px 4px 0 0',
                fontFamily: 'Kalam,cursive', fontSize: 11,
              }}>
                <span style={{ fontWeight: 700 }}>utility-bill.pdf</span>
                <div style={{ flex: 1 }} />
                <span style={{ opacity: 0.65 }}>‹</span>
                <span style={{ fontWeight: 700 }}>page 1 of 3</span>
                <span style={{ opacity: 0.65 }}>›</span>
                <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.2)' }} />
                <span style={{ opacity: 0.65 }}>−</span>
                <span style={{ fontWeight: 700 }}>100%</span>
                <span style={{ opacity: 0.65 }}>+</span>
              </div>
              <div style={{
                flex: 1, background: '#fff',
                border: '1.5px solid var(--gx-navy)', borderTop: 'none',
                borderRadius: '0 0 4px 4px',
                padding: 28, boxSizing: 'border-box',
                position: 'relative', overflow: 'auto',
              }}>
                {/* page silhouette · matches F2/F3 */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ height: 14, width: '32%', background: 'rgba(41,51,92,0.65)', borderRadius: 2 }} />
                  <div style={{ height: 8, width: '20%', background: 'rgba(41,51,92,0.25)', borderRadius: 2 }} />
                </div>
                <div style={{ height: 5, width: '60%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
                <div style={{ height: 5, width: '70%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 12 }} />

                {/* the lit region · demand summary box · 98% match */}
                <div style={{
                  padding: 10, background: 'var(--gx-green)',
                  border: '2px solid var(--gx-navy)',
                  boxShadow: '0 0 0 4px rgba(161,236,131,0.4)',
                  position: 'relative', marginBottom: 14,
                }} className="wf-accent-bg">
                  <div className="wf-label" style={{ position: 'absolute', top: -8, left: 10, background: '#fff', padding: '0 5px' }}>match · 98%</div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'var(--gx-navy)' }}>METER 3 · DEMAND SUMMARY</div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'var(--gx-navy)', marginTop: 4 }}>
                    Peak kW · <b>16.2</b><br />
                    Off-peak kW · 9.4
                  </div>
                </div>

                <div style={{ height: 5, width: '55%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
                <div style={{ height: 5, width: '75%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
                <div style={{ height: 5, width: '45%', background: 'rgba(41,51,92,0.15)', borderRadius: 99 }} />

                {/* faint cyan wash · fully scanned */}
                <div className="wf-accent-bg" style={{
                  position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                  background: 'linear-gradient(180deg, rgba(193,232,238,0.10), rgba(193,232,238,0.04))',
                  pointerEvents: 'none',
                }} />
              </div>
            </div>

            {/* Provenance panel · matching toolbar */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px',
                background: 'var(--gx-navy)', color: '#fff',
                borderRadius: '4px 4px 0 0',
                fontFamily: 'Kalam,cursive', fontSize: 11,
              }}>
                <span style={{ fontWeight: 700 }}>Field provenance</span>
                <div style={{ flex: 1 }} />
                <span style={{ opacity: 0.65 }}>peak_demand_kw</span>
              </div>
              <div style={{
                flex: 1, background: '#fff',
                border: '1.5px solid var(--gx-navy)', borderTop: 'none',
                borderRadius: '0 0 4px 4px',
                padding: 14, boxSizing: 'border-box', overflow: 'auto',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontSize: 9, color: 'rgba(41,51,92,0.5)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive' }}>FIELD</div>
                  <div className="wf-h" style={{ fontSize: 16, color: 'var(--gx-navy)' }}>peak_demand_kw</div>
                </div>
                <div className="wf-h" style={{ fontSize: 38, color: 'var(--gx-navy)', lineHeight: 1, marginTop: 6 }}>16.2</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.7)', marginTop: 2 }}>kW · float</div>

                <div style={{ height: 1, background: 'rgba(41,51,92,0.15)', marginTop: 14 }} />

                <div className="wf-label" style={{ marginTop: 10, marginBottom: 4 }}>SOURCE</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'var(--gx-navy)' }}>
                  <b>utility-bill.pdf</b> · page 1 · region (520, 380) → (740, 460)
                </div>

                <div className="wf-label" style={{ marginTop: 10, marginBottom: 4 }}>WHY MATCHED</div>
                <ul style={{ paddingLeft: 16, margin: 0, fontFamily: 'Kalam,cursive', fontSize: 11, lineHeight: 1.45, color: 'rgba(41,51,92,0.85)' }}>
                  <li>"METER 3" header anchors scope to meter #3</li>
                  <li>"DEMAND SUMMARY" label disambiguates from energy</li>
                  <li>"Peak kW" row · unit normalized · float parse</li>
                </ul>

                <div className="wf-label" style={{ marginTop: 10, marginBottom: 4 }}>CONFIDENCE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(41,51,92,0.12)', position: 'relative', overflow: 'hidden' }}>
                    <div className="wf-accent-bg" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '98%', background: 'var(--gx-green)' }} />
                  </div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'var(--gx-navy)' }}>98%</div>
                </div>

                <div className="wf-label" style={{ marginTop: 10, marginBottom: 4 }}>NEIGHBORS</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.65)' }}>
                  off_peak_demand_kw · 9.4<br />
                  on_peak_kwh · 892<br />
                  off_peak_kwh · 410
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </div>
  );
}

// ── 6 · Gate ──
function Flow_Gate() {
  return (
    <div className="ab">
      <div className="ab-title">Flow · 6 · Gate · sign in (or book an engineer call)</div>
      <div className="ab-sub">User taps the <b>"unlock everything →"</b> banner from F5 (or hits a metered ceiling, free · 100 pages). Gate opens inline in chat with three options: <b>email · SSO</b>, <b>book a 30-min engineer call</b>, or <b>keep exploring</b>. Canvas stays open behind; nothing is lost. After sign in: F7 welcome → F8 workspace setup → back here with full output unlocked.</div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={360} focus="split">
        <>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
              <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Conversation</div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10 }}>
              <span style={{ color: 'rgba(41,51,92,0.5)' }}>sample:</span>
              <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>Utility Bill</span>
              <span className="wf-link" style={{ color: 'rgba(41,51,92,0.55)' }}>switch ▾</span>
            </div>
          </div>
          <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
            {/* Collapsed earlier turns */}
            <div style={{
              padding: '6px 10px', margin: '0 0 10px', textAlign: 'center',
              fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.5)',
              borderTop: '1px dashed rgba(41,51,92,0.2)', borderBottom: '1px dashed rgba(41,51,92,0.2)',
            }}>
              <span className="wf-link">▾ earlier turns (reading · meters · 2 questions)</span>
            </div>
            <Bubble who="me">unlock everything</Bubble>
            <Bubble who="gx" lead>
              <b>One quick step.</b> Sign in to unlock the full demo.
              <div style={{ marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.75)' }}>
                <b>What you'll get:</b>
                <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
                  <li>All 10 fields per meter (3 currently locked each)</li>
                  <li>CSV / JSON export of extractions</li>
                  <li>Save this conversation + replay against new docs</li>
                  <li>Upload your own docs (sample stays free either way)</li>
                </ul>
                <b>Free tier:</b> 100 pages parsed. No credit card.
              </div>
            </Bubble>

            <div className="wf-box wf-rough-lite" style={{ padding: 12, background: 'var(--gx-tint)', marginBottom: 8, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 6, right: 8, fontFamily: 'Kalam,cursive', fontSize: 16, fontWeight: 700, color: 'rgba(41,51,92,0.6)', cursor: 'pointer', lineHeight: 1 }} title="dismiss · ESC">×</div>
              <div className="wf-label" style={{ marginBottom: 6 }}>continue with…</div>
              <div className="wf-box" style={{ padding: '7px 10px', fontSize: 13, fontFamily: 'Kalam,cursive', color: 'rgba(41,51,92,0.6)', marginBottom: 8 }}>name@company.com</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <div className="wf-btn primary wf-accent-bg" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>→ send magic link</div>
                <div className="wf-btn ghost" style={{ fontSize: 11 }}>SSO</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)', marginBottom: 8 }}>
                <div className="wf-line dim" style={{ flex: 1 }} />
                <div>or, not ready?</div>
                <div className="wf-line dim" style={{ flex: 1 }} />
              </div>
              <div className="wf-accent-stroke" style={{
                padding: '8px 10px', background: '#fff',
                border: '1.5px solid var(--gx-green)', borderRadius: 4,
                fontFamily: 'Kalam,cursive', color: 'var(--gx-navy)',
              }}>
                <div className="wf-accent-text" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gx-green)', marginBottom: 2 }}>NEED HELP?</div>
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.15, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Book a call</span>
                  <span className="wf-accent-text" style={{ color: 'var(--gx-green)' }}>→</span>
                </div>
                <div style={{ fontSize: 10, color: 'rgba(41,51,92,0.6)', marginTop: 1, lineHeight: 1.2 }}>30 min with an engineer</div>
              </div>
            </div>

            <Bubble who="gx">
              Or <span className="wf-link">keep exploring samples</span> — what you've done stays free. The chat, the extractions, the citations from this session all live in the browser until you decide to save them.
              <div style={{ marginTop: 4, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>
                press <b>ESC</b> · tap <b>×</b> · or just keep chatting — your session is preserved
              </div>
            </Bubble>
          </div>
          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="…" />
          </div>
        </>

        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {/* Onboarding step strip — Interact still active (the F5 state behind the gate) */}
          <div style={{ padding: '10px 14px 12px', background: '#fafaf6', borderRadius: 6, marginBottom: 10 }}>
            <OnboardingStepStrip currentStepKey="analyze" activeSubKey="interact" doneSubKeys={['extract']} />
          </div>

          {/* F5 canvas snapshot · dimmed · same PDF viewer chrome */}
          <div style={{ flex: 1, opacity: 0.5, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 14px',
              background: 'var(--gx-navy)', color: '#fff',
              borderRadius: '4px 4px 0 0',
              fontFamily: 'Kalam,cursive', fontSize: 11,
            }}>
              <span style={{ fontWeight: 700 }}>utility-bill.pdf</span>
              <div style={{ flex: 1 }} />
              <span style={{ opacity: 0.65 }}>‹</span>
              <span style={{ fontWeight: 700 }}>page 1 of 3</span>
              <span style={{ opacity: 0.65 }}>›</span>
              <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.2)' }} />
              <span style={{ opacity: 0.65 }}>−</span>
              <span style={{ fontWeight: 700 }}>100%</span>
              <span style={{ opacity: 0.65 }}>+</span>
            </div>
            <div style={{
              flex: 1, background: '#fff',
              border: '1.5px solid var(--gx-navy)', borderTop: 'none',
              borderRadius: '0 0 4px 4px',
              padding: 22, boxSizing: 'border-box',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ height: 12, width: '32%', background: 'rgba(41,51,92,0.65)', borderRadius: 2 }} />
                <div style={{ height: 8, width: '20%', background: 'rgba(41,51,92,0.25)', borderRadius: 2 }} />
              </div>
              <div style={{ height: 4, width: '60%', background: 'rgba(41,51,92,0.18)', borderRadius: 99, marginBottom: 4 }} />
              <div style={{ height: 4, width: '70%', background: 'rgba(41,51,92,0.18)', borderRadius: 99, marginBottom: 14 }} />
              <div style={{ padding: 8, background: 'var(--gx-green)', border: '1.5px solid var(--gx-navy)', marginBottom: 6 }} className="wf-accent-bg">
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700 }}>[1] meter #3 · 16.2 kW peak</div>
              </div>
              <div style={{ padding: 8, background: 'var(--gx-cyan)', border: '1.5px solid var(--gx-navy)', marginBottom: 10 }} className="wf-accent-bg">
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700 }}>[2] meter #1 · 12.1 kW peak</div>
              </div>
              <div style={{ height: 4, width: '55%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 4 }} />
              <div style={{ height: 4, width: '75%', background: 'rgba(41,51,92,0.15)', borderRadius: 99 }} />
            </div>
          </div>
        </div>
      </AppShell>
    </div>
  );
}

Object.assign(window, { Flow_Entry, Flow_Bucket, Flow_Answer, Flow_Peek, Flow_Extract, Flow_Gate, Flow_EditSchema });

// ── F3a · Edit schema · refine the extraction + re-run ──
// Triggered from F3's hamburger menu (Save schema… / Edit schema…). Side-branch
// from the main flow — the user dropped into the schema editor to add fields,
// retype, or toggle required-ness. The whole purpose of doing extraction on the
// sample is to leave with a *reusable schema*; this screen is where it gets
// shaped before it's used against real docs.
function Flow_EditSchema() {
  // Models the harness schema model:
  //   schema → categories (statement / charges / meters) → fields
  //   each field has: name, type, description prompt, identifiers, instructions
  // UI follows Neil's Batch E · Schema Editor · Fields tab — pinned samples on
  // top, sub-tabs (Design / Fields / Results), field rows with type chip + the
  // prompt description shown inline, plus accept/dismiss proposal cards for the
  // agent's most recent additions.
  const ACCEPTED = [
    { k: 'meter_id', t: 'STRING', p: '"The meter identifier as printed on the statement (e.g. METER 1, METER 3)."' },
    { k: 'service_type', t: 'STRING', p: '"Service classification — typically commercial · residential · industrial — plus the rate code (e.g. TOU-B-3)."' },
    { k: 'peak_demand_kw', t: 'NUMBER', p: '"Peak demand for this meter, in kW. Found in the DEMAND SUMMARY box on page 1, Peak kW row. Not the off-peak row."', edited: true, editing: true },
    { k: 'energy_on_peak_kwh', t: 'NUMBER', p: '"On-peak energy usage in kWh for the billing period, from the usage table."' },
    { k: 'energy_off_peak_kwh', t: 'NUMBER', p: '"Off-peak energy usage in kWh for the billing period."' },
    { k: 'energy_base_kwh', t: 'NUMBER', p: '"Base / shoulder energy usage in kWh. May be absent on TOU-2 rates — return null if not present."' },
    { k: 'demand_charge', t: 'NUMBER', p: '"Demand charge for this meter in USD. Strip currency symbols."' },
  ];
  return (
    <div className="ab">
      <div className="ab-title">Flow · 3a · Edit schema · field prompts + re-run</div>
      <div className="ab-sub">
        <b>Entry:</b> F3 fields panel hamburger → <i>Save schema…</i> or <i>Edit schema…</i>. Still inside Analyze · Extract.
        <b style={{ marginLeft: 10 }}>What a schema is:</b> a list of fields in three categories — <i>statement</i> / <i>charges</i> / <i>meters</i> — each field defined by a name, type, and a natural-language prompt the model follows. UI pattern matches Neil's Schema Editor · Fields tab — accepted fields above, agent proposals as accept/dismiss cards below.
      </div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={320} focus="split">
        <>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
              <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Schema Agent</div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10 }}>
              <span style={{ color: 'rgba(41,51,92,0.5)' }}>sample:</span>
              <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>Utility Bill</span>
              <span className="wf-link" style={{ color: 'rgba(41,51,92,0.55)' }}>switch ▾</span>
            </div>
          </div>

          <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
            <div style={{
              padding: '6px 10px', margin: '0 0 10px', textAlign: 'center',
              fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.5)',
              borderTop: '1px dashed rgba(41,51,92,0.2)', borderBottom: '1px dashed rgba(41,51,92,0.2)',
            }}>
              <span className="wf-link">▾ earlier turns (3 proposals · 11 fields accepted)</span>
            </div>

            <Bubble who="me">tighten the peak demand prompt — sometimes it's pulling the off-peak number</Bubble>
            <Bubble who="gx" lead>
              Updated <b>peak_demand_kw</b>. Anchored the prompt to the <i>"Peak kW"</i> row inside the <i>DEMAND SUMMARY</i> box so it can't grab the off-peak row.
              <div style={{ marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>
                Re-ran on the sample: <b style={{ color: 'var(--gx-green)' }}>16.2 kW</b> · confidence 0.98 ↑ from 0.83.
              </div>
            </Bubble>
            <Bubble who="gx">
              Also <b>proposing</b> a <code>total_kwh</code> field (sum of on/off/base). Accept it on the right, or tell me to compute it differently.
            </Bubble>
          </div>

          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="ask the agent to add, edit, or split a field…" />
          </div>
        </>

        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {/* Onboarding step strip — still inside Analyze · Extract */}
          <div style={{ padding: '8px 14px 10px', background: '#fafaf6', borderRadius: 6, marginBottom: 8 }}>
            <OnboardingStepStrip currentStepKey="analyze" activeSubKey="extract" />
          </div>

          {/* Schema topbar · matches Neil's editbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(41,51,92,0.12)' }}>
            <span className="wf-link" style={{ fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>← back</span>
            <div style={{
              padding: '3px 8px', background: '#fff',
              border: '1.5px solid var(--gx-navy)', borderRadius: 4,
              fontFamily: 'Kalam,cursive', fontSize: 13, fontWeight: 700, color: 'var(--gx-navy)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Designing <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>utility-bill · meters</span>
              <span style={{ width: 1, height: 12, background: 'rgba(41,51,92,0.2)' }} />
              <span style={{ fontWeight: 400, fontSize: 10.5, color: 'rgba(41,51,92,0.6)' }}>v2 · draft</span>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Export the schema — sign-in required">export <span style={{ opacity: 0.55, fontSize: 9 }}>▾ JSON · CSV · YAML</span> 🔒</div>
            <div className="wf-btn ghost" style={{ fontSize: 10 }}>↻ rerun</div>
            <div className="wf-btn coral wf-accent-bg" style={{ fontSize: 10 }} title="Save the schema — sign-in opens here so it persists to your workspace">💾 Save 🔒</div>
          </div>

          {/* Pinned samples row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>PINNED <span style={{ opacity: 0.55 }}>1/3</span></span>
            <span className="wf-box wf-rough-lite" style={{ padding: '2px 8px', background: 'rgba(193,232,238,0.5)', fontFamily: 'Kalam,cursive', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              utility-bill.pdf <span style={{ color: 'rgba(41,51,92,0.55)' }}>· 3 pages</span> <span style={{ color: 'rgba(41,51,92,0.4)' }}>×</span>
            </span>
            <span className="wf-link" style={{ fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>+ pin another sample</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'rgba(41,51,92,0.55)' }}>category: <b style={{ color: 'var(--gx-navy)' }}>meters</b></span>
          </div>

          {/* Subseg tabs — match Neil */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
            <div className="wf-box wf-rough-lite" style={{ padding: '3px 12px', background: '#fff' }}>Design</div>
            <div className="wf-box wf-rough-lite wf-accent-bg" style={{ padding: '3px 12px', background: 'var(--gx-cyan)', fontWeight: 700 }}>Fields <span style={{ opacity: 0.65, fontWeight: 400 }}>· 7</span></div>
            <div className="wf-box wf-rough-lite" style={{ padding: '3px 12px', background: '#fff' }}>Results</div>
          </div>

          {/* Fields list */}
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingRight: 4 }}>
            <div style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Existing fields · 7 accepted</span>
              <span style={{ color: 'var(--gx-coral)' }}>● 3 unsaved</span>
            </div>
            {ACCEPTED.map((f) => (
              <React.Fragment key={f.k}>
                <div className="wf-box wf-rough-lite" style={{
                  padding: '6px 10px',
                  marginBottom: f.editing ? 0 : 4,
                  background: f.editing ? 'var(--gx-tint)' : f.edited ? 'rgba(193,232,238,0.35)' : '#fff',
                  borderBottomLeftRadius: f.editing ? 0 : undefined,
                  borderBottomRightRadius: f.editing ? 0 : undefined,
                  borderBottom: f.editing ? 'none' : undefined,
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5, fontWeight: 700, color: 'var(--gx-navy)' }}>{f.k}</span>
                      <span style={{
                        fontFamily: 'Kalam,cursive', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5,
                        padding: '0 5px', background: 'var(--gx-tint)', color: 'var(--gx-navy)',
                        borderRadius: 3,
                      }}>{f.t}</span>
                      {f.edited && !f.editing && <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'var(--gx-coral)', fontWeight: 700 }}>● just edited</span>}
                      {f.editing && <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'var(--gx-coral)', fontWeight: 700 }}>✎ editing</span>}
                    </div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, fontStyle: 'italic', color: 'rgba(41,51,92,0.7)', marginTop: 2, lineHeight: 1.3 }}>{f.p}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>
                    {!f.editing && <span className="wf-link">Edit</span>}
                    {f.editing && <span style={{ color: 'rgba(41,51,92,0.4)' }}>↓ open</span>}
                    <span className="wf-link" style={{ color: 'rgba(41,51,92,0.4)' }}>Remove</span>
                  </div>
                </div>

                {/* Expanded edit state · clicking Edit on a field unfolds this
                    inline editor underneath the row. Shows all the harness
                    schema-design fields: description prompt, type, identifiers,
                    instructions, format. */}
                {f.editing && (
                  <div className="wf-box wf-rough-lite" style={{
                    padding: 10, marginBottom: 4,
                    background: '#fff',
                    border: '1.5px solid var(--gx-coral)',
                    borderTop: 'none',
                    borderTopLeftRadius: 0, borderTopRightRadius: 0,
                    boxShadow: 'inset 3px 0 0 var(--gx-coral)',
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>name (yaml key)</span>
                        <div style={{ padding: '3px 7px', border: '1.5px solid var(--gx-navy)', borderRadius: 3, fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 700, background: 'rgba(193,232,238,0.4)' }}>peak_demand_kw</div>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>type</span>
                        <div style={{ padding: '3px 7px', border: '1.5px solid var(--gx-navy)', borderRadius: 3, background: '#fff', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontFamily: 'Kalam,cursive' }}>
                          NUMBER <span style={{ flex: 1 }} /> <span style={{ opacity: 0.5 }}>▾</span>
                        </div>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>format <span style={{ fontWeight: 400 }}>(opt)</span></span>
                        <div style={{ padding: '3px 7px', border: '1.5px solid rgba(41,51,92,0.4)', borderRadius: 3, background: '#fff', fontSize: 10.5, fontFamily: 'Kalam,cursive', color: 'rgba(41,51,92,0.6)' }}>
                          float · kW
                        </div>
                      </label>
                    </div>

                    {/* Description / prompt — the heart of the edit */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>description</span>
                        <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.5)' }}>· what the field represents</span>
                        <div style={{ flex: 1 }} />
                        <span className="wf-link" style={{ fontSize: 9 }}>✨ rewrite with agent</span>
                      </div>
                      <div style={{
                        padding: '6px 8px', border: '1.5px solid var(--gx-navy)', borderRadius: 3,
                        background: 'rgba(193,232,238,0.35)',
                        fontFamily: 'Kalam,cursive', fontSize: 11, lineHeight: 1.4, color: 'var(--gx-navy)', fontStyle: 'italic',
                      }}>
                        "Peak demand for this meter, in kW. Found in the <b style={{ background: 'var(--gx-green)' }}>DEMAND SUMMARY</b> box on page 1, <b style={{ background: 'var(--gx-green)' }}>Peak kW</b> row. Not the off-peak row."
                      </div>
                    </div>

                    {/* Identifiers + Instructions side-by-side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700, marginBottom: 2 }}>identifiers <span style={{ fontWeight: 400 }}>· labels nearby</span></div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: 5, border: '1.5px solid rgba(41,51,92,0.4)', borderRadius: 3, background: '#fff' }}>
                          {['Peak kW', 'Peak Demand', 'DEMAND SUMMARY'].map((h) => (
                            <span key={h} className="wf-box wf-rough-lite" style={{ padding: '1px 6px', fontSize: 9.5, fontFamily: 'Kalam,cursive', background: 'var(--gx-tint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {h} <span style={{ color: 'rgba(41,51,92,0.4)' }}>×</span>
                            </span>
                          ))}
                          <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.5)', alignSelf: 'center' }}>+ add</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700, marginBottom: 2 }}>instructions <span style={{ fontWeight: 400 }}>· one rule per line</span></div>
                        <div style={{
                          padding: '5px 7px', border: '1.5px solid rgba(41,51,92,0.4)', borderRadius: 3, background: '#fff',
                          fontFamily: 'Kalam,cursive', fontSize: 10, lineHeight: 1.4, color: 'var(--gx-navy)',
                        }}>
                          - Return the numeric value only · strip "kW"<br/>
                          - Do <b>not</b> use the off-peak row (separate field: energy_off_peak_kwh)<br/>
                          - If multiple meters: scope to the meter block this row belongs to<br/>
                          <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.5)' }}>+ add rule</span>
                        </div>
                      </div>
                    </div>

                    {/* Preview value + actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '3px 8px', background: 'var(--gx-green)', borderRadius: 3, border: '1.5px solid var(--gx-navy)' }} className="wf-accent-bg">
                        <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.6)' }}>preview on meter #3</span>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 700 }}>16.2 kW</span>
                        <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.6)' }}>conf 0.98 ↑ 0.83</span>
                      </div>
                      <div style={{ flex: 1 }} />
                      <div className="wf-btn ghost" style={{ fontSize: 10 }}>cancel</div>
                      <div className="wf-btn ghost" style={{ fontSize: 10 }}>↻ rerun</div>
                      <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 10 }}>save field</div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}

            {/* Proposal card */}
            <div style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700, marginTop: 12, marginBottom: 5 }}>
              Proposed fields · 1 from the latest agent turn
            </div>
            <div className="wf-box wf-rough-lite" style={{ padding: 10, background: 'rgba(247,209,108,0.18)', border: '1.5px dashed var(--gx-coral)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  padding: '1px 6px', background: 'var(--gx-coral)', color: '#fff',
                  fontFamily: 'Kalam,cursive', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5,
                  borderRadius: 3,
                }}>PROPOSAL</span>
                <span style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'var(--gx-navy)' }}>Add 1 field</span>
                <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.55)' }}>proposal_v1 · envelope verified</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5, fontWeight: 700, color: 'var(--gx-navy)' }}>total_kwh</span>
                    <span style={{
                      fontFamily: 'Kalam,cursive', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5,
                      padding: '0 5px', background: 'var(--gx-tint)', color: 'var(--gx-navy)',
                      borderRadius: 3,
                    }}>NUMBER</span>
                    <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.6)' }}>· derived: sum(on + off + base)</span>
                  </div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, fontStyle: 'italic', color: 'rgba(41,51,92,0.7)', marginTop: 2, lineHeight: 1.3 }}>
                    "Total energy used across all rate periods, in kWh. Sum of energy_on_peak_kwh, energy_off_peak_kwh, and energy_base_kwh."
                  </div>
                  <div style={{ marginTop: 4, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>
                    Preview on sample meter #3: <b style={{ color: 'var(--gx-navy)' }}>1,392 kWh</b>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 10, padding: '3px 10px' }}>Accept</div>
                  <div className="wf-btn ghost" style={{ fontSize: 10, padding: '3px 10px' }}>Dismiss</div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer · re-run mechanics */}
          <div style={{ marginTop: 6, padding: '4px 6px', fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'rgba(41,51,92,0.6)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span><b style={{ color: 'var(--gx-navy)' }}>Re-run:</b> editing a prompt re-evaluates that field on pinned samples instantly.</span>
            <span><b style={{ color: 'var(--gx-navy)' }}>↻ rerun</b> · full pass on the pinned doc (free).</span>
            <span><b style={{ color: 'var(--gx-navy)' }}>💾 Save</b> · opens the sign-in flow, persists the schema, and drops the user into the F1 ingest surface with it pre-attached.</span>
          </div>
        </div>
      </AppShell>
    </div>
  );
}
