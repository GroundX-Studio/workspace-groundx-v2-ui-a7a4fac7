// Concept B — Chat-as-driver: chat on RIGHT (medium), product on left fills.
// A default bucket is already open and the assistant is "narrating" what to do.
// X-Ray opens as a full overlay alongside the answer. Gate is a soft banner on action.

function ConceptB_Entry() {
  return (
    <div className="ab">
      <Phases active={0} />
      <div className="ab-title">B · Chat-as-driver — narrative</div>
      <div className="ab-sub">A bucket is already open. Chat narrates from the side.</div>
      <Frame url="app.groundx.ai">
        <MiniSidebar collapsed />
        {/* Product area (left, dominant) */}
        <div style={{ flex: 1, padding: 16, background: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <div className="wf-h" style={{ fontSize: 22 }}>FDA Drug Labels</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)' }}>88 docs · default sample</div>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 11 }}>switch ▾</div>
          </div>
          {/* Other available buckets as a quiet rail */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {SAMPLE_BUCKETS.map((b, i) => (
              <div key={b.name} className="wf-box wf-rough-lite" style={{ padding: '6px 10px', fontFamily: 'Kalam,cursive', fontSize: 11, background: i === 1 ? 'var(--gx-cyan)' : '#fff' }}>
                {b.name} <span style={{ opacity: 0.55 }}>· {b.pages}p</span>
              </div>
            ))}
          </div>
          {/* doc viewer + table preview */}
          <RBox w="100%" h={300} fill="fill">
            <div style={{ padding: 16 }}>
              <div className="wf-h" style={{ fontSize: 18 }}>IBUPROFEN · drug label</div>
              <div className="wf-line" style={{ width: '60%', marginTop: 8 }} />
              <div className="wf-line" />
              <div className="wf-line" style={{ width: '85%' }} />
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <RBox w="100%" h={90} fill="fill">
                  <div style={{ padding: 8, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.7)' }}>
                    <b>Dosing table</b>
                    <div className="wf-line dim" style={{ marginTop: 6 }} />
                    <div className="wf-line dim" style={{ width: '70%' }} />
                    <div className="wf-line dim" style={{ width: '85%' }} />
                  </div>
                </RBox>
                <RBox w="100%" h={90} fill="fill">
                  <div style={{ padding: 8, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.7)' }}>
                    <b>Adverse reactions</b>
                    <div className="wf-line dim" style={{ marginTop: 6 }} />
                    <div className="wf-line dim" style={{ width: '60%' }} />
                  </div>
                </RBox>
              </div>
              <div className="wf-line" style={{ marginTop: 12, width: '75%' }} />
            </div>
          </RBox>
        </div>
        {/* Chat panel on RIGHT */}
        <div style={{ width: 320, height: '100%', borderLeft: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div className="wf-av gx">G</div>
            <div>
              <div className="wf-h" style={{ fontSize: 18, lineHeight: 1 }}>GroundX</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)' }}>walking you in · 30s</div>
            </div>
          </div>
          <Bubble who="gx" lead>
            <b>Hi — let's just try it.</b>
            I opened the <span className="wf-link">FDA Drug Labels</span> bucket. It's a good demo of structured Q&A.
          </Bubble>
          <Bubble who="gx">
            I'll suggest a question. Click <span className="wf-link">"Run"</span> when ready,
            or pick a different bucket on the left.
          </Bubble>
          <Bubble who="gx" opts={[
            { label: '🔍 What is max daily dose of ibuprofen?', hot: true },
            { label: 'List warfarin contraindications' },
            { label: 'Surprise me' },
            { label: '✎ write my own' },
          ]}>
          </Bubble>
          <div style={{ flex: 1 }} />
          <ChatInput placeholder="reply, or ask anything…" />
        </div>
      </Frame>

      <Sticky top={56} left={30} width={170} rotate={-3}>
        product is the <b>main canvas</b>. chat <b>narrates</b>.
      </Sticky>
      <Sticky top={138} left={30} width={150} rotate={2}>
        bucket rail = quiet switchboard, not the main UI
      </Sticky>
      <Sticky top={120} right={356} width={130} rotate={-2}>
        first action recommendation is the <b>green chip</b>
      </Sticky>
    </div>
  );
}

function ConceptB_Action() {
  return (
    <div className="ab">
      <Phases active={2} />
      <div className="ab-title">B · Run → answer inline in product</div>
      <div className="ab-sub">Answer renders in the doc panel, citations inline. Chat takes a back seat.</div>
      <Frame url="app.groundx.ai">
        <MiniSidebar collapsed />
        <div style={{ flex: 1, padding: 16, background: '#fff', position: 'relative' }}>
          <div className="wf-h" style={{ fontSize: 22, marginBottom: 10 }}>Answer</div>
          <RBox w="100%" h={120} fill="cyan">
            <div style={{ padding: 14 }}>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, lineHeight: 1.4, color: 'var(--gx-navy)' }}>
                <b>Max OTC: 1,200 mg/day</b>, divided into 3–4 doses of 200 mg every 4–6 hours <Cite n={1} page={3} />.
                Under physician supervision, the prescription ceiling is <b>3,200 mg/day</b> <Cite n={2} page={12} />.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <div className="wf-btn ghost" style={{ fontSize: 11 }}>regenerate</div>
                <div className="wf-btn ghost" style={{ fontSize: 11 }}>copy</div>
                <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11 }}>see source ↗</div>
              </div>
            </div>
          </RBox>

          <div style={{ height: 12 }} />
          <div className="wf-label" style={{ color: 'rgba(41,51,92,0.7)', marginBottom: 6 }}>Source — ibuprofen.pdf · p.3</div>
          <RBox w="100%" h={195} fill="fill">
            <div style={{ padding: 14 }}>
              <div className="wf-line" />
              <div className="wf-line" style={{ width: '80%' }} />
              <div style={{ marginTop: 10, padding: 8, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
                <div className="wf-line" style={{ background: 'rgba(41,51,92,0.55)' }} />
                <div className="wf-line" style={{ background: 'rgba(41,51,92,0.55)', width: '55%' }} />
              </div>
              <div className="wf-line dim" style={{ marginTop: 10 }} />
              <div className="wf-line dim" style={{ width: '70%' }} />
              <div className="wf-line dim" style={{ width: '50%' }} />
            </div>
          </RBox>
        </div>
        <div style={{ width: 320, height: '100%', borderLeft: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <Bubble who="gx" lead>
            Done. <b>The number with the source</b> — that's the whole point.
          </Bubble>
          <Bubble who="gx">
            Next, want to:
          </Bubble>
          <Bubble who="gx" opts={[
            { label: '📊 Extract all dosing tables', hot: true },
            { label: '🔎 Inspect chunks (X-Ray)' },
            { label: '💬 Follow-up question' },
            { label: '📥 Upload your own doc' },
          ]}>
          </Bubble>
          <div style={{ flex: 1 }} />
          <ChatInput placeholder="follow-up…" />
        </div>
      </Frame>

      <Sticky top={60} left={28} width={160} rotate={-2}>
        answer + source live in the <b>product</b>, not the chat
      </Sticky>
      <Sticky top={246} left={28} width={140} rotate={2}>
        same green highlight as concept A — <b>shared visual language</b>
      </Sticky>
      <Sticky top={170} right={356} width={130} rotate={-1.5}>
        chat <b>summarizes</b>, recommends next move
      </Sticky>
    </div>
  );
}

function ConceptB_Proof() {
  return (
    <div className="ab">
      <Phases active={3} />
      <div className="ab-title">B · Full X-Ray overlay</div>
      <div className="ab-sub">User taps "see source" — chunks + page + reasoning side-by-side.</div>
      <Frame url="app.groundx.ai/xray">
        <div style={{ flex: 1, padding: 14, background: '#fbfaf6', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div className="wf-label">X-Ray</div>
            <div className="wf-h" style={{ fontSize: 18, color: 'var(--gx-navy)' }}>how I answered</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)' }}>2 chunks · 98% confidence</div>
            <div className="wf-btn ghost" style={{ fontSize: 11 }}>back ←</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.9fr', gap: 10, flex: 1, minHeight: 0 }}>
            {/* page */}
            <RBox w="100%" h="100%" fill="fill">
              <div style={{ padding: 12 }}>
                <div className="wf-label" style={{ marginBottom: 6 }}>ibuprofen.pdf · p.3</div>
                <div className="wf-line" />
                <div className="wf-line" style={{ width: '80%' }} />
                <div style={{ marginTop: 8, padding: 6, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
                  <div className="wf-line" style={{ background: 'rgba(41,51,92,0.5)' }} />
                  <div className="wf-line" style={{ background: 'rgba(41,51,92,0.5)', width: '60%' }} />
                </div>
                <div className="wf-line dim" style={{ marginTop: 8 }} />
                <div className="wf-line dim" style={{ width: '70%' }} />
                <div style={{ marginTop: 10, padding: 6, background: 'var(--gx-coral)', border: '1.5px dashed var(--gx-navy)', color: '#fff' }} className="wf-accent-bg">
                  <div className="wf-label" style={{ color: '#fff' }}>[2] match</div>
                  <div className="wf-line" style={{ background: 'rgba(255,255,255,0.7)', marginTop: 4 }} />
                  <div className="wf-line" style={{ background: 'rgba(255,255,255,0.7)', width: '55%' }} />
                </div>
              </div>
            </RBox>
            {/* extracted chunks list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <RBox w="100%" h={130} fill="cyan">
                <div style={{ padding: 10, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                  <div className="wf-label">[1] semantic object</div>
                  <div style={{ marginTop: 4, fontWeight: 700, fontSize: 13 }}>Adult OTC dose: 200 mg every 4–6 h, max 1,200 mg/day.</div>
                  <div className="wf-line dim" style={{ marginTop: 8 }} />
                  <div className="wf-line dim" style={{ width: '70%' }} />
                </div>
              </RBox>
              <RBox w="100%" h={130} fill="fill">
                <div style={{ padding: 10, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                  <div className="wf-label">[2] semantic object</div>
                  <div style={{ marginTop: 4, fontWeight: 700, fontSize: 13 }}>Prescription ceiling: 3,200 mg/day under physician care.</div>
                  <div className="wf-line dim" style={{ marginTop: 8 }} />
                  <div className="wf-line dim" style={{ width: '60%' }} />
                </div>
              </RBox>
            </div>
            {/* reasoning trace */}
            <RBox w="100%" h="100%" fill="fill">
              <div style={{ padding: 10, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                <div className="wf-label">Trace</div>
                <ol style={{ paddingLeft: 16, margin: '6px 0', lineHeight: 1.4 }}>
                  <li>parsed dosing table (p.3)</li>
                  <li>matched "max daily dose"</li>
                  <li>found Rx ceiling (p.12)</li>
                  <li>composed answer</li>
                </ol>
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '70%' }} />
                <div className="wf-btn ghost" style={{ marginTop: 10, fontSize: 11 }}>open full doc ↗</div>
              </div>
            </RBox>
          </div>
        </div>
        <div style={{ width: 320, height: '100%', borderLeft: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <Bubble who="gx" lead>
            This is the <b>proof moment</b>: 2 Semantic Objects, both cited, both linked back to the source.
          </Bubble>
          <Bubble who="gx">
            Try clicking a chunk — page jumps to its location.
          </Bubble>
          <div style={{ flex: 1 }} />
          <ChatInput placeholder="ask about this answer…" />
        </div>
      </Frame>

      <Sticky top={70} left={28} width={150} rotate={-3}>
        <b>full-stage</b> X-Ray, not a side drawer
      </Sticky>
      <Sticky bottom={28} left={280} width={150} rotate={2}>
        three columns: <b>page · chunks · trace</b>
      </Sticky>
    </div>
  );
}

function ConceptB_Gate() {
  return (
    <div className="ab">
      <Phases active={4} />
      <div className="ab-title">B · Soft banner on locked actions</div>
      <div className="ab-sub">Gate appears only where it has to. Everything else stays open.</div>
      <Frame url="app.groundx.ai/extract">
        <MiniSidebar collapsed />
        <div style={{ flex: 1, padding: 16, background: '#fff', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <div className="wf-h" style={{ fontSize: 22 }}>Extract — dosing tables</div>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 11 }}>filters</div>
            <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11 }}>Run extraction</div>
          </div>

          {/* table mock */}
          <RBox w="100%" h={170} fill="fill">
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
            </div>
          </RBox>

          {/* Action banner */}
          <div style={{ height: 14 }} />
          <div className="wf-box wf-rough-lite" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--gx-tint)' }}>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 14, fontWeight: 700, color: 'var(--gx-navy)', flex: 1 }}>
              <span style={{ marginRight: 8 }}>🔒</span>
              <b>Sign in to save or export</b> — you can keep extracting on samples without an account.
            </div>
            <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 12 }}>Save (email)</div>
            <div className="wf-btn ghost" style={{ fontSize: 12 }}>Book demo</div>
            <div className="wf-btn ghost" style={{ fontSize: 12 }}>Dismiss</div>
          </div>

          <div style={{ height: 10 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="wf-btn coral wf-accent-bg" style={{ fontSize: 12 }}>📥 Export CSV  <span style={{ opacity: 0.85 }}>· sign in</span></div>
            <div className="wf-btn coral wf-accent-bg" style={{ fontSize: 12 }}>📤 Share link  <span style={{ opacity: 0.85 }}>· sign in</span></div>
            <div className="wf-btn ghost" style={{ fontSize: 12 }}>👁 Preview  <span style={{ opacity: 0.6 }}>free</span></div>
          </div>
        </div>
        <div style={{ width: 320, height: '100%', borderLeft: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <Bubble who="gx" lead>
            Extraction works on samples — to <b>keep this CSV</b> I need an email or SSO.
          </Bubble>
          <Bubble who="gx">
            Not ready? <span className="wf-link">Keep poking</span> at the sample, no account needed.
          </Bubble>
          <div style={{ flex: 1 }} />
          <ChatInput />
        </div>
      </Frame>

      <Sticky top={70} left={28} width={150} rotate={-2}>
        only <b>export / save / share</b> ask for an account
      </Sticky>
      <Sticky bottom={30} left={120} width={170} rotate={2}>
        soft banner > modal — never block the canvas
      </Sticky>
    </div>
  );
}

Object.assign(window, { ConceptB_Entry, ConceptB_Action, ConceptB_Proof, ConceptB_Gate });
