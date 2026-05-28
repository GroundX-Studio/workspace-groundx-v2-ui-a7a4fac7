// spec-widgets.jsx — anatomy diagrams for the key widgets.
// Each frame: the widget rendered in its states, with parts labelled for engineering.

// helper — small two-column widget anatomy frame
function _AnatomyFrame({ title, sub, children }) {
  return (
    <div className="ab" style={{ padding: '22px 26px' }}>
      <div className="ab-title" style={{ fontSize: 24 }}>{title}</div>
      <div className="ab-sub" style={{ marginBottom: 14 }}>{sub}</div>
      {children}
    </div>
  );
}

// ── 1 · Citation chip + anchored peek anatomy ──
function Widget_Citation() {
  return (
    <_AnatomyFrame
      title="Widget · citation chip + anchored peek"
      sub="The spine of the proof model. Same chip lives in chat bubbles, Schema Editor field rows (F3a / S1), Report Builder section previews (S3 / S3a), and answer-canvas risk rows (S2). Hover → connector lights up across every view that shares the citation number. Click → peek opens anchored to the chip."
    >
      <div className="wf-label" style={{ marginBottom: 6 }}>CHIP STATES</div>
      <div style={{ display: 'flex', gap: 18, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', padding: '14px 6px' }}>
          <CiteChip n={1} page={2} doc="utility-letter" />
          <StateLabel top={-2} left={0} kind="default">default</StateLabel>
        </div>
        <div style={{ position: 'relative', padding: '14px 6px' }}>
          <span className="wf-box wf-rough-lite" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '1px 7px', fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700,
            borderRadius: 99, marginLeft: 4, marginRight: 2,
            background: 'var(--gx-cyan)', color: 'var(--gx-navy)',
            borderColor: 'var(--gx-navy)', boxShadow: '0 0 0 3px rgba(193,232,238,0.5)',
          }}>[1] utility-letter p.2</span>
          <StateLabel top={-2} left={0} kind="hover">hover · connector lit</StateLabel>
        </div>
        <div style={{ position: 'relative', padding: '14px 6px' }}>
          <CiteChip n={1} page={2} doc="utility-letter" expanded />
          <StateLabel top={-2} left={0} kind="active">expanded · peek open</StateLabel>
        </div>
        <div style={{ position: 'relative', padding: '14px 6px' }}>
          <CiteChip n={3} page={11} doc="lease-2024" color="coral" />
          <StateLabel top={-2} left={0} kind="default">warning · anomaly</StateLabel>
        </div>
      </div>

      <div className="wf-label" style={{ marginBottom: 6 }}>PEEK PANEL ANATOMY (F4 expanded view)</div>
      <div style={{ position: 'relative' }}>
        <CitePeek
          n={1} page={1} doc="utility-bill.pdf"
          quote="Meter #3 · peak demand · 16.2 kW · $412.80"
          why="dosing table layout, 'METER 3' header, kW units, dollar regex."
          confidence="98%"
        />
      </div>

      <CalloutList items={[
        { n: 1, title: 'caret', body: 'anchors peek to the chip in the bubble above' },
        { n: 2, title: 'chip · expanded state', body: 'navy fill, white text — visible bound while peek is open' },
        { n: 3, title: 'open full doc', body: 'opens source in workspace at the cited page · F4 surface' },
        { n: 4, title: 'collapse', body: 'closes the peek; chip returns to default' },
        { n: 5, title: 'source snippet', body: 'rendered page with the matched region highlighted (green = positive, coral = warning / anomaly)' },
        { n: 6, title: 'matched object + why', body: 'the semantic object extracted, plus the heuristic that located it (label, layout, regex)' },
        { n: 7, title: 'cross-view connector', body: 'hovering any [N] chip lights up every other [N] in the session — chat citation, doc row in workspace, table cell in Results, section preview in S3 — they\'re the same proof' },
        { n: 8, title: 'warning state', body: 'coral chip + coral region · used for anomalies (unmatched deposit, low-confidence field, missing required value)' },
      ]} />
    </_AnatomyFrame>
  );
}

// ── 2 · Phase strip ──
function Widget_PhaseStrip() {
  return (
    <_AnatomyFrame
      title="Widget · onboarding step strip"
      sub="Bracketed 4-step journey pinned at the top of the workspace. Shows traversal, drives orientation. Pills become navigable once Extract is reached."
    >
      <div className="wf-label" style={{ marginBottom: 8 }}>FULL STRIP · FOUR FLOW STAGES</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
        {[
          { label: 'F1 · Ingest', strip: { currentStepKey: 'ingest' } },
          { label: 'F2 · Understand', strip: { currentStepKey: 'understand' } },
          { label: 'F3 · Analyze · Extract', strip: { currentStepKey: 'analyze', activeSubKey: 'extract' } },
          { label: 'F4–F6 · Analyze · Interact (Extract traversed)', strip: { currentStepKey: 'analyze', activeSubKey: 'interact', doneSubKeys: ['extract'] } },
          { label: 'F7 · Integrate (Extract + Interact done · Report disabled)', strip: { currentStepKey: 'integrate', doneSubKeys: ['extract', 'interact'] } },
        ].map((row) => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)', width: 280, flexShrink: 0 }}>{row.label}</div>
            <OnboardingStepStrip {...row.strip} />
          </div>
        ))}
      </div>

      <div className="wf-label" style={{ marginBottom: 8 }}>SUB-PILL STATES · INSIDE ANALYZE</div>
      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', padding: '14px 0' }}>
          <StateLabel top={-4} left={0} kind="active">active</StateLabel>
          <OnboardingStepStrip currentStepKey="analyze" activeSubKey="extract" />
          <div style={{ marginTop: 4, fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'rgba(41,51,92,0.55)' }}>green fill · solid border · bold</div>
        </div>
        <div style={{ position: 'relative', padding: '14px 0' }}>
          <StateLabel top={-4} left={0} kind="default">done · traversed</StateLabel>
          <OnboardingStepStrip currentStepKey="analyze" activeSubKey="interact" doneSubKeys={['extract']} />
          <div style={{ marginTop: 4, fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'rgba(41,51,92,0.55)' }}>tint fill · solid border · ✓ badge</div>
        </div>
        <div style={{ position: 'relative', padding: '14px 0' }}>
          <StateLabel top={-4} left={0} kind="default">disabled</StateLabel>
          <OnboardingStepStrip currentStepKey="analyze" activeSubKey="interact" />
          <div style={{ marginTop: 4, fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'rgba(41,51,92,0.55)' }}>muted gray · dashed border · not yet reached</div>
        </div>
      </div>

      <CalloutList columns={2} items={[
        { n: 1, title: 'four top-level steps', body: 'Ingest · Understand · Analyze (bracketed group) · Integrate. Same strip everywhere — orientation never changes shape.' },
        { n: 2, title: 'Analyze bracket', body: 'dashed-outline group containing 3 sub-pills (Extract · Interact · Report). The bracket itself is the "current" step when any sub is active.' },
        { n: 3, title: 'sub-pill traversal', body: 'a sub gets a ✓ badge once visited (passed in doneSubKeys). Subs not visited stay disabled — Report stays disabled on F7 because the canonical flow never visits it.' },
        { n: 4, title: 'reachable vs locked', body: 'once Extract is reached (currentStepKey is analyze or later), all top-level pills render in the navigable state — clickable, solid border, filled number badge. Before that, future steps are locked (dashed border, hollow badge).' },
        { n: 5, title: 'connector lines', body: 'short bar between pills — navy when both adjacent steps are reachable; gray while the next step is still locked.' },
        { n: 6, title: 'replaces the legacy PhaseStrip', body: 'the old 6-pill PhaseStrip (pick/explore/ask/proof/extract/save) is deprecated. OnboardingStepStrip is the single source of progress orientation.' },
      ]} />
    </_AnatomyFrame>
  );
}

// ── 3 · History widget ──
function Widget_History() {
  const EarlierTurns = ({ label }) => (
    <div style={{
      padding: '6px 10px', textAlign: 'center',
      fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.5)',
      borderTop: '1px dashed rgba(41,51,92,0.2)', borderBottom: '1px dashed rgba(41,51,92,0.2)',
    }}>
      <span className="wf-link">▾ {label}</span>
    </div>
  );
  return (
    <_AnatomyFrame
      title="Widget · collapsed earlier turns"
      sub="Conversation history affordance. Once a session has >1 turn, prior turns collapse into a single dashed strip at the top of the chat panel. One click expands the strip; turns scroll back in chronological order. Lives in every F-series chat and every S-series chat."
    >
      <div className="wf-label" style={{ marginBottom: 6 }}>STATES</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)', marginBottom: 4 }}>default · collapsed</div>
          <EarlierTurns label="8 earlier turns (extract · field detail)" />
        </div>
        <div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)', marginBottom: 4 }}>hover · link underlined</div>
          <div style={{
            padding: '6px 10px', textAlign: 'center',
            fontFamily: 'Kalam,cursive', fontSize: 10, color: 'var(--gx-navy)',
            borderTop: '1px dashed rgba(41,51,92,0.4)', borderBottom: '1px dashed rgba(41,51,92,0.4)',
            background: 'rgba(193,232,238,0.25)',
          }}>
            <span className="wf-link" style={{ fontWeight: 700, textDecoration: 'underline' }}>▾ 8 earlier turns (extract · field detail)</span>
          </div>
        </div>
      </div>

      <div className="wf-label" style={{ marginBottom: 6 }}>EXAMPLE LABELS (live in the spec)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {[
          'F4 · "▾ 8 earlier turns (extract · field detail)"',
          'F5 · "▾ earlier turns (reading · 6 thinking notes · Done · meters)"',
          'F6 · "▾ earlier turns (reading · meters · 2 questions)"',
          'F7 · "▾ earlier turns (reading · meters · 2 questions)"',
          'S2 · "▾ 6 earlier turns (3 risks pinned · cordoba comparison)"',
          'S3 · "▾ 3 earlier turns (lease exposure · cordoba comparison · sundance risk)"',
        ].map((s) => (
          <div key={s} className="wf-box wf-rough-lite" style={{ padding: '5px 10px', fontFamily: 'Kalam,cursive', fontSize: 10.5, background: '#fff', color: 'rgba(41,51,92,0.75)' }}>{s}</div>
        ))}
      </div>

      <CalloutList columns={2} items={[
        { n: 1, title: 'where it lives', body: 'top of the chat panel, between the chat header (G · Conversation) and the most recent user message. Always above the current focal turn.' },
        { n: 2, title: 'label format', body: '▾ {count} earlier turns ({short summary of what they covered}). Summary is 2–4 nouns: "meters · 2 questions" / "3 risks pinned · cordoba comparison".' },
        { n: 3, title: 'click → expand', body: 'strip lifts; prior turns render in full above the focal turn, scrollable. Click ▴ collapse to re-stack. Citations stay anchored.' },
        { n: 4, title: 'always shown after warmup', body: 'first 2 turns render in full. Once a third turn arrives, the oldest collapses into the strip. The strip itself never collapses to zero — even one prior turn shows here.' },
        { n: 5, title: 'replaces legacy HistoryWidget', body: 'the older multi-row HistoryWidget (timestamped rows in the sidebar) is deprecated. The collapsed strip + scroll-on-expand is the canonical history affordance — present in every F- and S-series chat.' },
      ]} />
    </_AnatomyFrame>
  );
}

// ── 4 · Gate panel ──
function Widget_Gate() {
  return (
    <_AnatomyFrame
      title="Widget · sign-in gate panel"
      sub="Rendered inline in chat whenever the user crosses a 🔒 boundary — Save, Export, BYO upload / connect / email, or hitting the free-tier ceiling. Three options: email magic link, SSO, or book a 15-min engineer call. Never blocks the canvas; the user can always dismiss and keep exploring."
    >
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 30, alignItems: 'flex-start' }}>
        <div style={{ position: 'relative' }}>
          <div className="wf-label" style={{ marginBottom: 8 }}>RENDERED · INLINE IN CHAT</div>
          <div className="wf-box wf-rough-lite" style={{ padding: 12, background: 'var(--gx-tint)' }}>
            <div className="wf-label" style={{ marginBottom: 6 }}>continue with…</div>
            <div className="wf-box" style={{ padding: '7px 10px', fontSize: 13, fontFamily: 'Kalam,cursive', color: 'rgba(41,51,92,0.6)', marginBottom: 8 }}>name@company.com</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <div className="wf-btn primary wf-accent-bg" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>→ send magic link</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>SSO</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)' }}>
              <div className="wf-line dim" style={{ flex: 1 }} />
              <div>or</div>
              <div className="wf-line dim" style={{ flex: 1 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <div className="wf-btn coral wf-accent-bg" style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>📅 book 15-min engineer call</div>
            </div>
            <div className="wf-line dim" style={{ marginTop: 10, width: '100%' }} />
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)', marginTop: 6, textAlign: 'center' }}>
              <span className="wf-link">keep exploring samples →</span>
            </div>
          </div>
        </div>
        <CalloutList columns={1} items={[
          { n: 1, title: 'option 1 · email magic link', body: 'sends a one-click link · returns to the same session with all work preserved. SSO is the secondary control on the same row.' },
          { n: 2, title: 'option 2 · book 15-min engineer call', body: 'calendar embed, not a contact form. Coral background — high-intent path for enterprise buyers.' },
          { n: 3, title: 'option 3 · keep exploring samples', body: 'low-friction exit. Critical invariant: the gate never blocks the canvas — the user can always dismiss and continue on the sample.' },
          { n: 4, title: 'trigger points', body: '🔒 Save (any artifact) · 🔒 Export (PDF / CSV / JSON / YAML) · BYO sign-up CTAs in F1 · hitting the free-tier ceiling (100 pages or 20 actions).' },
          { n: 5, title: 'F1 special case', body: 'tapping any "Sign up · …" CTA in the F1 BYO section triggers the F1 → F2 transition (nav + chat slide in) AND loads this gate inline in the new chat. Same panel, context-aware preamble ("upload your docs · sign up first").' },
          { n: 6, title: 'free-tier preamble', body: 'when shown above the free-tier ceiling, panel header reads "you\'ve used 100 of 100 sample pages — sign in to keep going" instead of the generic "continue with…".' },
        ]} />
      </div>
    </_AnatomyFrame>
  );
}

// ── 5 · Drag-handle anatomy ──
function Widget_DragHandle() {
  return (
    <_AnatomyFrame
      title="Widget · drag handle (chat ↔ workspace)"
      sub="6px hit target. Cursor changes on hover. Snap thresholds collapse one side to focus mode."
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 18 }}>
        {[
          { state: 'default', kind: 'default', body: '6px rail, 25%-navy fill. Cursor reads col-resize on hover.' },
          { state: 'hover', kind: 'hover', body: 'fill darkens to 50%-navy. No tooltip — the cursor is the affordance.' },
          { state: 'drag', kind: 'active', body: 'fill turns brand-green for the duration of the gesture. Live preview of column widths.' },
        ].map((s, i) => (
          <div key={i} className="wf-box wf-rough-lite" style={{ background: '#fff', padding: 12, position: 'relative' }}>
            <StateLabel top={8} right={8} kind={s.kind}>{s.state}</StateLabel>
            <div style={{ height: 120, display: 'flex', alignItems: 'stretch' }}>
              <div style={{ width: 60, background: 'var(--gx-tint)', borderRadius: 3 }} />
              <DragHandle orient="v" state={s.state} />
              <div style={{ flex: 1, background: '#f8f7f2', borderRadius: 3 }} />
            </div>
            <div style={{ marginTop: 10, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.75)', lineHeight: 1.3 }}>{s.body}</div>
          </div>
        ))}
      </div>

      <div className="wf-label" style={{ marginBottom: 8 }}>SNAP MAP · chat width</div>
      <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff', position: 'relative' }}>
        <div style={{ position: 'relative', height: 44 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 20, height: 4, background: 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
          <div style={{ position: 'absolute', left: 0, width: '14%', top: 16, bottom: 16, background: 'var(--gx-coral)', borderRadius: 4, opacity: 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: '#fff' }} className="wf-accent-bg">
            &lt; 200 → workspace focus
          </div>
          <div style={{ position: 'absolute', left: '14%', width: '60%', top: 16, bottom: 16, background: 'var(--gx-green)', borderRadius: 4, opacity: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'var(--gx-navy)' }} className="wf-accent-bg">
            live · 280px ↔ 640px · persisted to localStorage
          </div>
          <div style={{ position: 'absolute', right: 0, width: '26%', top: 16, bottom: 16, background: 'var(--gx-coral)', borderRadius: 4, opacity: 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: '#fff' }} className="wf-accent-bg">
            &gt; 720 → chat focus
          </div>
          <div style={{ position: 'absolute', left: 'calc(14% + 12%)', top: 4, bottom: 4, width: 6, background: 'var(--gx-navy)', borderRadius: 99, border: '1.5px solid #fff' }} />
          <div style={{ position: 'absolute', left: 'calc(14% + 12%)', transform: 'translateX(-50%)', top: -14, fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: 'var(--gx-navy)' }}>handle</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.7)' }}>
          <span>0</span><span>200</span><span>280 (min)</span><span>640 (max)</span><span>720</span><span>100%</span>
        </div>
      </div>

      <CalloutList columns={2} items={[
        { n: 1, title: 'min chat width 280px', body: 'below 280, drag stops resisting; below 200 we snap closed → focus workspace. Restore via puck.' },
        { n: 2, title: 'max chat width 640px', body: 'above 640, drag resists; past 720 we snap → focus chat. Workspace dims to 35% behind.' },
        { n: 3, title: 'persistence', body: 'last live width saved to localStorage(\'gx.layout.chatWidth\'). New sessions hydrate from there.' },
        { n: 4, title: 'keyboard equivalents', body: '⌥-1 = focus chat · ⌥-2 = focus workspace · ⌥-3 = restore split.' },
      ]} />
    </_AnatomyFrame>
  );
}

// ── 6 · Extract table cell + locked rows ──
function Widget_ExtractTable() {
  return (
    <_AnatomyFrame
      title="Widget · Results · table render · cell anatomy"
      sub="One of three render modes in the Schema Editor Results tab (table / JSON / grid). Cell is the unit of audit — every value carries a citation. On the free tier, unpinned rows blur until sign-in."
    >
      <div className="wf-label" style={{ marginBottom: 8 }}>CELL ANATOMY</div>
      <div className="wf-box wf-rough-lite" style={{ padding: 12, marginBottom: 18, position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 1fr 0.6fr', gap: 8, fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, paddingBottom: 6, borderBottom: '1.4px solid var(--gx-navy)' }}>
          <div>Charge</div><div>Meter</div><div>Units</div><div>Amount</div><div>Cite</div>
        </div>
        {/* row default */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 1fr 0.6fr', gap: 8,
          fontFamily: 'Kalam,cursive', fontSize: 13, padding: '8px 0',
          borderBottom: '1px dashed rgba(41,51,92,0.18)',
        }}>
          <div style={{ fontWeight: 700 }}>Demand · peak</div>
          <div>#3</div>
          <div>16.2 kW</div>
          <div style={{ fontWeight: 700 }}>$412.80</div>
          <div style={{ color: 'var(--gx-coral)', fontWeight: 700 }}>[1] p.1</div>
        </div>
        {/* row hover with cite peek */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 1fr 0.6fr', gap: 8,
          fontFamily: 'Kalam,cursive', fontSize: 13, padding: '8px 0',
          borderBottom: '1px dashed rgba(41,51,92,0.18)',
          background: 'var(--gx-tint)',
        }}>
          <div style={{ fontWeight: 700 }}>Energy · on-peak</div>
          <div>#3</div>
          <div>892 kWh</div>
          <div style={{ fontWeight: 700 }}>$268.41</div>
          <div style={{ color: 'var(--gx-coral)', fontWeight: 700 }}>[1] p.1</div>
        </div>
      </div>

      <div className="wf-label" style={{ marginBottom: 8 }}>LOCKED ROW STATES</div>
      <div className="wf-box wf-rough-lite" style={{ padding: 12, marginBottom: 14 }}>
        {[true, true, false, false].map((unlocked, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 1fr 0.6fr', gap: 8,
            fontFamily: 'Kalam,cursive', fontSize: 13, padding: '6px 0',
            borderBottom: '1px dashed rgba(41,51,92,0.15)',
            filter: unlocked ? 'none' : 'blur(2px)',
            opacity: unlocked ? 1 : 0.5,
          }}>
            <div style={{ fontWeight: 700 }}>{unlocked ? 'Demand · peak' : '████████'}</div>
            <div>{unlocked ? (i === 0 ? '#3' : '#1') : '██'}</div>
            <div>{unlocked ? (i === 0 ? '16.2 kW' : '12.1 kW') : '██████'}</div>
            <div style={{ fontWeight: 700 }}>{unlocked ? (i === 0 ? '$412.80' : '$311.05') : '██████'}</div>
            <div style={{ color: 'var(--gx-coral)', fontWeight: 700 }}>{unlocked ? (i === 0 ? '[1]' : '[4]') : '[•]'}</div>
          </div>
        ))}
      </div>

      <CalloutList columns={2} items={[
        { n: 1, title: 'primary value', body: 'bold 700; navy text. Click cell → opens cite peek anchored to it.' },
        { n: 2, title: 'numeric', body: 'tabular-nums for currency / units; right-align in production.' },
        { n: 3, title: 'cite tag', body: 'coral, bold. Hover any cite tag → workspace highlights the source region.' },
        { n: 4, title: 'row hover', body: 'tint background, no border change. Whole row is the click target.' },
        { n: 5, title: 'locked rows', body: '2px blur, 50% opacity. Real values withheld — never just dimmed (preserves the proof).' },
      ]} />
    </_AnatomyFrame>
  );
}

Object.assign(window, { Widget_Citation, Widget_PhaseStrip, Widget_History, Widget_Gate, Widget_DragHandle, Widget_ExtractTable });
