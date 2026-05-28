// Concept A — Classic split: chat-left (narrow), product-right (wide).
// X-Ray opens as a side drawer over the product area. Gate is inline-in-chat.

function ConceptA_Entry() {
  return (
    <div className="ab">
      <Phases active={0} />
      <div className="ab-title">A · Split — chat left, product right</div>
      <div className="ab-sub">First-session entry. No empty state — buckets are preloaded.</div>
      <Frame url="app.groundx.ai/start">
        {/* Sidebar */}
        <MiniSidebar />
        {/* Chat panel */}
        <div style={{ width: 280, height: '100%', borderRight: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <div className="wf-label" style={{ color: 'var(--gx-navy)' }}>Assistant</div>
          <div style={{ height: 8 }} />
          <Bubble who="gx" lead>
            <b>Welcome.</b> Try GroundX right now — I've loaded a few document sets you can use.
          </Bubble>
          <Bubble who="gx" opts={[{ label: 'Explore a sample' }, { label: 'Ask a question', hot: true }, { label: 'Extract info' }, { label: 'Upload my own →' }]}>
            What do you want to do first?
          </Bubble>
          <div style={{ flex: 1 }} />
          <ChatInput placeholder="or type what you want to try…" />
        </div>
        {/* Product area */}
        <div style={{ flex: 1, padding: 16, overflow: 'hidden', position: 'relative', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="wf-h" style={{ fontSize: 24, color: 'var(--gx-navy)' }}>Preloaded buckets</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.6)' }}>4 ready · pick or let me suggest one</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {SAMPLE_BUCKETS.map((b, i) => (
              <Bucket key={b.name} {...b} recommended={i === 1} selected={false} />
            ))}
          </div>
        </div>
      </Frame>

      {/* Annotations */}
      <Sticky top={66} left={376} width={155} rotate={-3}>
        chat <b>opens first</b>, frames the choice — not a tutorial.
      </Sticky>
      <Sticky top={228} left={158} width={150} rotate={2}>
        recommendation chip is the green/<b>hot</b> option
      </Sticky>
      <Sticky bottom={28} right={36} width={170} rotate={1.5}>
        product area is <b>never empty</b> — buckets are the demo
      </Sticky>
    </div>
  );
}

function ConceptA_Bucket() {
  return (
    <div className="ab">
      <Phases active={1} />
      <div className="ab-title">A · Bucket selected</div>
      <div className="ab-sub">User accepts the recommendation. Chat pivots to first action.</div>
      <Frame url="app.groundx.ai/b/fda-labels">
        <MiniSidebar />
        <div style={{ width: 280, height: '100%', borderRight: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <div className="wf-label">Assistant</div>
          <div style={{ height: 8 }} />
          <Bubble who="gx">Good pick. <b>FDA Drug Labels</b> — 88 pages, structured.</Bubble>
          <Bubble who="me">Ask a question</Bubble>
          <Bubble who="gx" lead opts={[
            { label: 'What is max daily dose of ibuprofen?', hot: true },
            { label: 'List contraindications for warfarin' },
            { label: 'Write your own ↓' },
          ]}>
            Try one of these — I'll show you the answer with the source.
          </Bubble>
          <div style={{ flex: 1 }} />
          <ChatInput />
        </div>
        <div style={{ flex: 1, padding: 16, position: 'relative', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div className="wf-h" style={{ fontSize: 22 }}>FDA Drug Labels</div>
            <div className="wf-btn ghost" style={{ padding: '2px 8px', fontSize: 11 }}>change bucket</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)' }}>88 docs · indexed</div>
          </div>
          {/* doc preview rows */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {['ibuprofen.pdf', 'warfarin.pdf', 'metformin.pdf', 'atorvastatin.pdf', '+84'].map((d, i) => (
              <div key={i} className="wf-box wf-rough-lite" style={{ padding: 6, fontFamily: 'Kalam,cursive', fontSize: 11, background: i === 0 ? 'var(--gx-cyan)' : '#fff' }}>{d}</div>
            ))}
          </div>
          {/* doc viewer placeholder */}
          <RBox w="100%" h={278} fill="fill">
            <div style={{ padding: 16 }}>
              <div className="wf-h" style={{ fontSize: 18 }}>IBUPROFEN · drug label</div>
              <div className="wf-line" style={{ width: '60%', marginTop: 8 }} />
              <div className="wf-line" />
              <div className="wf-line" style={{ width: '85%' }} />
              <div className="wf-line dim" style={{ width: '70%' }} />
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <RBox w={130} h={70} fill="fill">
                  <div style={{ padding: 6, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)' }}>table · dosing</div>
                </RBox>
                <RBox w={130} h={70} fill="fill">
                  <div style={{ padding: 6, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)' }}>fig · adverse rx</div>
                </RBox>
              </div>
              <div className="wf-line" style={{ marginTop: 14 }} />
              <div className="wf-line" style={{ width: '75%' }} />
            </div>
          </RBox>
        </div>
      </Frame>

      <Sticky top={64} left={376} width={160} rotate={-2.5}>
        chat <b>pivots</b> to next action — no second tutorial step.
      </Sticky>
      <Sticky top={300} right={26} width={160} rotate={2}>
        product area updates to show <b>what was picked</b>.
      </Sticky>
    </div>
  );
}

function ConceptA_Action() {
  return (
    <div className="ab">
      <Phases active={3} />
      <div className="ab-title">A · Grounded answer + X-Ray drawer</div>
      <div className="ab-sub">Proof moment. Source opens as a side drawer over the doc.</div>
      <Frame url="app.groundx.ai/b/fda-labels/ask">
        <MiniSidebar />
        <div style={{ width: 280, height: '100%', borderRight: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <div className="wf-label">Assistant</div>
          <div style={{ height: 8 }} />
          <Bubble who="me">What is max daily dose of ibuprofen?</Bubble>
          <Bubble who="gx" lead>
            <b>Max OTC: 1,200 mg/day</b> across 3–4 doses (200 mg each, every 4–6 h).
            Rx ceiling: 3,200 mg/day under physician care. <Cite n={1} page={3} /><Cite n={2} page={12} />
          </Bubble>
          <Bubble who="gx">
            Want to <span className="wf-link">see the page</span> I pulled this from?
          </Bubble>
          <div style={{ flex: 1 }} />
          <ChatInput placeholder="follow-up…" />
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
          <div style={{ padding: 16, position: 'absolute', inset: 0 }}>
            <div className="wf-h" style={{ fontSize: 18, marginBottom: 6 }}>ibuprofen.pdf — page 3</div>
            <RBox w="100%" h={310} fill="fill">
              <div style={{ padding: 16 }}>
                <div className="wf-line" />
                <div className="wf-line" style={{ width: '88%' }} />
                <div className="wf-line" style={{ width: '76%' }} />
                <div className="wf-line dim" />
                {/* highlighted region */}
                <div style={{ marginTop: 12, padding: 8, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)', position: 'relative' }} className="wf-accent-bg">
                  <div className="wf-label" style={{ position: 'absolute', top: -8, left: 8, background: '#fff', padding: '0 4px' }}>[1] match</div>
                  <div className="wf-line" style={{ background: 'rgba(41,51,92,0.5)' }} />
                  <div className="wf-line" style={{ background: 'rgba(41,51,92,0.5)', width: '60%' }} />
                </div>
                <div className="wf-line dim" style={{ marginTop: 12 }} />
                <div className="wf-line dim" />
              </div>
            </RBox>
          </div>
          {/* X-Ray side drawer */}
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 240, borderLeft: '1.5px solid var(--gx-navy)', background: '#fbfaf6', padding: 12, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="wf-label">X-Ray</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 14, color: 'rgba(41,51,92,0.6)' }}>×</div>
            </div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.75)', marginBottom: 8 }}>2 chunks · 98% confidence</div>
            <RBox w="100%" h={70} fill="cyan">
              <div style={{ padding: 8, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                <div style={{ fontWeight: 700 }}>[1] p.3 — dosing table</div>
                <div className="wf-line" style={{ background: 'rgba(41,51,92,0.4)', marginTop: 4 }} />
                <div className="wf-line" style={{ background: 'rgba(41,51,92,0.4)', width: '70%' }} />
              </div>
            </RBox>
            <div style={{ height: 8 }} />
            <RBox w="100%" h={70} fill="fill">
              <div style={{ padding: 8, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                <div style={{ fontWeight: 700 }}>[2] p.12 — Rx ceiling</div>
                <div className="wf-line dim" style={{ marginTop: 4 }} />
                <div className="wf-line dim" style={{ width: '60%' }} />
              </div>
            </RBox>
            <div style={{ height: 10 }} />
            <div className="wf-btn ghost" style={{ padding: '4px 8px', fontSize: 11 }}>open full source →</div>
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={372} width={170} rotate={-2}>
        <b>specific number + citations</b> — not a vibe answer.
      </Sticky>
      <Sticky top={300} right={266} width={140} rotate={3}>
        green highlight maps citation <b>to the actual page</b>
      </Sticky>
      <Sticky bottom={20} right={26} width={150} rotate={-1.5}>
        X-Ray is a side drawer — closeable, non-modal.
      </Sticky>
    </div>
  );
}

function ConceptA_Gate() {
  return (
    <div className="ab">
      <Phases active={4} />
      <div className="ab-title">A · Account gate (only when needed)</div>
      <div className="ab-sub">User tries to upload their own doc. Gate appears inline in chat.</div>
      <Frame url="app.groundx.ai/b/fda-labels">
        <MiniSidebar />
        <div style={{ width: 280, height: '100%', borderRight: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <div className="wf-label">Assistant</div>
          <div style={{ height: 8 }} />
          <Bubble who="me">Can I try this on my own contract?</Bubble>
          <Bubble who="gx" lead>
            <b>Yes — one quick step.</b> To upload, save work, or export results, I need an email.
            Otherwise, keep exploring samples freely.
          </Bubble>
          <div className="wf-box wf-rough-lite" style={{ padding: 10, marginBottom: 8, background: 'var(--gx-tint)' }}>
            <div className="wf-label" style={{ marginBottom: 6 }}>Continue with…</div>
            <div className="wf-box" style={{ padding: '6px 10px', fontSize: 12, marginBottom: 6, background: '#fff' }}>you@work.com</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div className="wf-btn primary wf-accent-bg" style={{ flex: 1, justifyContent: 'center' }}>Send link</div>
              <div className="wf-btn ghost" style={{ padding: '6px 8px', fontSize: 11 }}>SSO</div>
            </div>
          </div>
          <Bubble who="gx">
            …or <span className="wf-link">book a 15-min demo</span> ·
            <span className="wf-link"> keep exploring</span> samples
          </Bubble>
          <div style={{ flex: 1 }} />
          <ChatInput />
        </div>
        <div style={{ flex: 1, padding: 16, background: '#fff', position: 'relative' }}>
          <div className="wf-h" style={{ fontSize: 22, marginBottom: 10 }}>Your bucket</div>
          {/* upload area dimmed */}
          <RBox w="100%" h={170} dashed>
            <div style={{ padding: 22, textAlign: 'center', fontFamily: 'Kalam,cursive', color: 'rgba(41,51,92,0.55)' }}>
              <div className="wf-h" style={{ fontSize: 22 }}>drop your PDFs here</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>locked — sign in to enable</div>
              <div className="wf-btn coral wf-accent-bg" style={{ marginTop: 12 }}>🔒 sign in to upload</div>
            </div>
          </RBox>
          <div style={{ height: 10 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {SAMPLE_BUCKETS.slice(0, 2).map((b) => <Bucket key={b.name} {...b} />)}
          </div>
        </div>
      </Frame>

      <Sticky top={60} left={376} width={160} rotate={-2}>
        gate is <b>inline in chat</b> — same surface, just one more turn
      </Sticky>
      <Sticky top={216} right={170} width={150} rotate={2}>
        only the <b>upload</b> is locked — sample work stays open
      </Sticky>
      <Sticky bottom={28} left={400} width={170} rotate={1}>
        always offer: email · demo · <b>keep exploring</b>
      </Sticky>
    </div>
  );
}

Object.assign(window, { ConceptA_Entry, ConceptA_Bucket, ConceptA_Action, ConceptA_Gate });
