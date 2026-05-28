// Concept D — Bottom dock: command-bar-style chat at the bottom.
// Product fills the full screen. Power-user feel. Suggestions chip-up from the dock.
// Proof: inline expandable. Gate: pill-shaped reminder pinned to the dock.

function ConceptD_Entry() {
  return (
    <div className="ab">
      <Phases active={0} />
      <div className="ab-title">D · Bottom dock — command-bar feel</div>
      <div className="ab-sub">Chat collapses to a dock. Product is the canvas. Power-user energy.</div>
      <Frame url="app.groundx.ai">
        <MiniSidebar />
        <div style={{ flex: 1, position: 'relative', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          {/* main canvas */}
          <div style={{ padding: 16, flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
              <div className="wf-h" style={{ fontSize: 22 }}>Preloaded sandboxes</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)' }}>pick one — or just type below</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              {SAMPLE_BUCKETS.map((b, i) => (
                <Bucket key={b.name} {...b} recommended={i === 1} />
              ))}
            </div>
            <div style={{ marginTop: 14, fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.7)' }}>
              Recent: <span className="wf-link">last week's RFP demo</span> · <span className="wf-link">my upload</span>
            </div>
          </div>

          {/* DOCK */}
          <div style={{ borderTop: '1.5px solid var(--gx-navy)', background: 'var(--gx-navy)', color: '#fff', padding: '10px 14px 14px', position: 'relative' }} className="wf-accent-bg">
            {/* Suggestion chips rise above the dock */}
            <div style={{ position: 'absolute', bottom: '100%', left: 14, right: 14, padding: '0 0 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11 }}>↑ try: ask a question about FDA labels</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>↑ extract dosing tables</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>↑ compare 2 drugs</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>↑ upload my doc</div>
            </div>
            {/* dock row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="wf-av gx" style={{ borderColor: '#fff' }}>G</div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: 4, padding: '8px 12px', fontFamily: 'Kalam,cursive', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                Welcome. Type what you want to do — or click a suggestion above. Try: "what's the max ibuprofen dose?"
              </div>
              <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 12 }}>↑ Run</div>
            </div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
              <span style={{ marginRight: 8 }}>⌘K to focus</span><span style={{ marginRight: 8 }}>/ for slash commands</span><span>shift+? help</span>
            </div>
          </div>
        </div>
      </Frame>

      <Sticky top={64} left={26} width={170} rotate={-3}>
        product is <b>fully visible</b> from second one
      </Sticky>
      <Sticky top={260} right={28} width={150} rotate={2}>
        suggestions <b>float up</b> from the dock — peripheral, not blocking
      </Sticky>
      <Sticky bottom={28} left={130} width={150} rotate={1}>
        keyboard cues (⌘K, /) <b>set the vibe</b>: this is a tool
      </Sticky>
    </div>
  );
}

function ConceptD_Action() {
  return (
    <div className="ab">
      <Phases active={2} />
      <div className="ab-title">D · Result lands inline. Dock keeps prompting next.</div>
      <div className="ab-sub">No chat history — last assistant move = chip suggestions above the dock.</div>
      <Frame url="app.groundx.ai/b/fda-labels/ask">
        <MiniSidebar />
        <div style={{ flex: 1, position: 'relative', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 16, flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <div className="wf-h" style={{ fontSize: 20 }}>FDA Drug Labels · Ask</div>
              <div style={{ flex: 1 }} />
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>history</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>switch bucket</div>
            </div>

            {/* User q as a typed line */}
            <div className="wf-box wf-rough-lite" style={{ padding: '8px 12px', fontFamily: '"JetBrains Mono", "Kalam", monospace', fontSize: 12, color: 'rgba(41,51,92,0.85)', background: '#f8f7f2', marginBottom: 10 }}>
              <span style={{ color: 'rgba(41,51,92,0.45)', marginRight: 6 }}>?</span>
              What is max daily dose of ibuprofen?
            </div>

            {/* Answer card */}
            <RBox w="100%" h={110} fill="cyan">
              <div style={{ padding: 14 }}>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, lineHeight: 1.4 }}>
                  <b>Max OTC: 1,200 mg/day</b>, divided into 3–4 doses (200 mg q4–6h) <Cite n={1} page={3} />.
                  Rx ceiling: <b>3,200 mg/day</b> under physician care <Cite n={2} page={12} />.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <div className="wf-btn ghost" style={{ fontSize: 11 }}>▾ expand evidence</div>
                  <div className="wf-btn ghost" style={{ fontSize: 11 }}>copy</div>
                  <div className="wf-btn coral wf-accent-bg" style={{ fontSize: 11 }}>save · sign in</div>
                </div>
              </div>
            </RBox>

            {/* Expanded evidence (always expanded in this state) */}
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <RBox w="100%" h={130} fill="fill">
                <div style={{ padding: 10, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                  <div className="wf-label">[1] ibuprofen.pdf p.3</div>
                  <div className="wf-line dim" style={{ marginTop: 6 }} />
                  <div style={{ marginTop: 6, padding: 6, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)', fontSize: 11, fontWeight: 700 }} className="wf-accent-bg">
                    200 mg q4–6h, max 1,200/day
                  </div>
                  <div className="wf-line dim" style={{ marginTop: 8, width: '70%' }} />
                </div>
              </RBox>
              <RBox w="100%" h={130} fill="fill">
                <div style={{ padding: 10, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                  <div className="wf-label">[2] ibuprofen.pdf p.12</div>
                  <div className="wf-line dim" style={{ marginTop: 6 }} />
                  <div style={{ marginTop: 6, padding: 6, background: 'var(--gx-coral)', color: '#fff', border: '1.5px dashed var(--gx-navy)', fontSize: 11, fontWeight: 700 }} className="wf-accent-bg">
                    Rx ceiling 3,200 mg/day
                  </div>
                  <div className="wf-line dim" style={{ marginTop: 8, width: '60%' }} />
                </div>
              </RBox>
            </div>
          </div>

          {/* DOCK */}
          <div style={{ borderTop: '1.5px solid var(--gx-navy)', background: 'var(--gx-navy)', color: '#fff', padding: '10px 14px 14px', position: 'relative' }} className="wf-accent-bg">
            <div style={{ position: 'absolute', bottom: '100%', left: 14, right: 14, padding: '0 0 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11 }}>↑ extract this as a table across all drugs</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>↑ open X-Ray</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>↑ ask about pediatric dosing</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="wf-av gx" style={{ borderColor: '#fff' }}>G</div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: 4, padding: '8px 12px', fontFamily: 'Kalam,cursive', fontSize: 13, color: '#fff' }}>
                Want me to <b>extract that across all 88 drugs</b>? Or ask a follow-up.
              </div>
              <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 12 }}>↑ Run</div>
            </div>
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={28} width={170} rotate={-2}>
        <b>typed-question echo</b> — feels like a notebook cell
      </Sticky>
      <Sticky top={210} right={26} width={150} rotate={2}>
        evidence <b>expanded by default</b> — proof always visible
      </Sticky>
      <Sticky bottom={28} right={170} width={150} rotate={-1.5}>
        dock <b>follows up</b> with the smart-next move
      </Sticky>
    </div>
  );
}

function ConceptD_Proof() {
  return (
    <div className="ab">
      <Phases active={3} />
      <div className="ab-title">D · X-Ray on the page</div>
      <div className="ab-sub">Hovering a citation expands a peek over the doc. Click to lock open.</div>
      <Frame url="app.groundx.ai/xray">
        <MiniSidebar />
        <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 16, flex: 1, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
              <div className="wf-h" style={{ fontSize: 20 }}>ibuprofen.pdf</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)' }}>page 3 of 24</div>
              <div style={{ flex: 1 }} />
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>page ‹ ›</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>chunks (2)</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>close ←</div>
            </div>
            <RBox w="100%" h={320} fill="fill">
              <div style={{ padding: 16, position: 'relative' }}>
                <div className="wf-line" />
                <div className="wf-line" style={{ width: '85%' }} />
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '70%' }} />
                <div style={{ marginTop: 10, padding: 8, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
                  <div className="wf-line" style={{ background: 'rgba(41,51,92,0.55)' }} />
                  <div className="wf-line" style={{ background: 'rgba(41,51,92,0.55)', width: '55%' }} />
                </div>
                <div className="wf-line dim" style={{ marginTop: 10 }} />
                <div className="wf-line dim" style={{ width: '70%' }} />
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '50%' }} />

                {/* Hover tooltip / peek panel */}
                <div className="wf-box wf-rough-lite" style={{ position: 'absolute', right: 28, top: 102, width: 250, padding: 12, background: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }}>
                  <div className="wf-label" style={{ color: 'var(--gx-coral)' }} >[1] · 98% confidence</div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, marginTop: 6, lineHeight: 1.3 }}>
                    <b>200 mg every 4–6 hours; max 1,200 mg/day.</b>
                  </div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, marginTop: 8, color: 'rgba(41,51,92,0.7)' }}>
                    <b>Why this match:</b> dosing table, "DOSAGE" header, regex on units.
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <div className="wf-btn ghost" style={{ fontSize: 11 }}>open trace</div>
                    <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11 }}>📌 pin</div>
                  </div>
                  {/* arrow tail */}
                  <svg width="36" height="20" style={{ position: 'absolute', left: -34, top: 14 }} className="wf-anno">
                    <path d="M 34 6 Q 16 10 4 8" fill="none" stroke="var(--gx-navy)" strokeWidth="1.6" filter="url(#wf-rough-lite)" />
                  </svg>
                </div>
              </div>
            </RBox>
          </div>
          {/* DOCK */}
          <div style={{ borderTop: '1.5px solid var(--gx-navy)', background: 'var(--gx-navy)', color: '#fff', padding: '10px 14px 14px' }} className="wf-accent-bg">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="wf-av gx" style={{ borderColor: '#fff' }}>G</div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: 4, padding: '8px 12px', fontFamily: 'Kalam,cursive', fontSize: 13, color: '#fff' }}>
                You're inside the X-Ray. Try <b>hovering the coral region</b> below for chunk [2].
              </div>
              <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 12 }}>↑</div>
            </div>
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={28} width={150} rotate={-2}>
        proof = the <b>document itself</b>, not a separate screen
      </Sticky>
      <Sticky top={240} left={210} width={150} rotate={2.5}>
        peek panel <b>explains the match</b>, not just shows it
      </Sticky>
    </div>
  );
}

function ConceptD_Gate() {
  return (
    <div className="ab">
      <Phases active={4} />
      <div className="ab-title">D · Gate pinned to the dock</div>
      <div className="ab-sub">Action remains attempted; a pill inside the dock unlocks it.</div>
      <Frame url="app.groundx.ai/extract">
        <MiniSidebar />
        <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 16, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <div className="wf-h" style={{ fontSize: 20 }}>Extracting dosing tables…</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)' }}>3 of 88 docs · preview only</div>
            </div>

            <RBox w="100%" h={200} fill="fill">
              <div style={{ padding: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.6fr', gap: 8, fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, paddingBottom: 6, borderBottom: '1.2px solid var(--gx-navy)' }}>
                  <div>Drug</div><div>Adult dose</div><div>Max daily</div><div>Cite</div>
                </div>
                {[
                  ['Ibuprofen', '200 mg q4–6h', '1,200 mg', '[1]'],
                  ['Acetaminophen', '500 mg q4–6h', '3,000 mg', '[7]'],
                  ['Naproxen', '220 mg q8–12h', '660 mg', '[3]'],
                ].map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.6fr', gap: 8, fontFamily: 'Kalam,cursive', fontSize: 12, padding: '6px 0', borderBottom: '1px dashed rgba(41,51,92,0.18)' }}>
                    <div style={{ fontWeight: 700 }}>{r[0]}</div><div>{r[1]}</div><div>{r[2]}</div><div style={{ color: 'rgba(41,51,92,0.6)' }}>{r[3]}</div>
                  </div>
                ))}
                {/* Locked rows */}
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={'l' + i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.6fr', gap: 8, fontFamily: 'Kalam,cursive', fontSize: 12, padding: '6px 0', borderBottom: '1px dashed rgba(41,51,92,0.18)', filter: 'blur(2px)', opacity: 0.5 }}>
                    <div style={{ fontWeight: 700 }}>████████</div><div>██████</div><div>██████</div><div>[•]</div>
                  </div>
                ))}
              </div>
            </RBox>

            <div style={{ marginTop: 12, fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.6)' }}>
              Preview shows first 3 rows. <b>85 more rows ready</b> — sign in to view + export.
            </div>
          </div>

          {/* DOCK — gate pill embedded */}
          <div style={{ borderTop: '1.5px solid var(--gx-navy)', background: 'var(--gx-navy)', color: '#fff', padding: '12px 14px 14px' }} className="wf-accent-bg">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Gate pill */}
              <div className="wf-box wf-rough-lite wf-accent-bg" style={{ background: 'var(--gx-green)', borderColor: '#fff', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gx-navy)' }}>
                <span>🔒</span>
                <span style={{ fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 12 }}>Sign in to unlock all 88 rows</span>
                <div className="wf-box" style={{ background: '#fff', padding: '3px 8px', fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                  email…
                </div>
                <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11, padding: '4px 10px' }}>→</div>
              </div>
              <div style={{ flex: 1 }} />
              <div className="wf-btn ghost" style={{ fontSize: 11, color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}>book demo</div>
              <div className="wf-btn ghost" style={{ fontSize: 11, color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}>keep exploring</div>
            </div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
              you've used 0/5 free actions · no card required
            </div>
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={26} width={170} rotate={-3}>
        first 3 rows real, rest <b>visibly blurred</b> — value already proven
      </Sticky>
      <Sticky bottom={70} left={160} width={160} rotate={2}>
        gate is a <b>pill in the dock</b> — same surface, never modal
      </Sticky>
      <Sticky bottom={28} right={36} width={140} rotate={-1}>
        free-action counter <b>builds trust</b> in the limit
      </Sticky>
    </div>
  );
}

Object.assign(window, { ConceptD_Entry, ConceptD_Action, ConceptD_Proof, ConceptD_Gate });
