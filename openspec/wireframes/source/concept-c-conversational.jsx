// Concept C — Conversational-first: chat starts large/centered, product emerges
// as a worktop on the right that grows with the conversation. Buckets pop in
// as cards inline; X-Ray is an always-visible split next to the answer.

function ConceptC_Entry() {
  return (
    <div className="ab">
      <Phases active={0} />
      <div className="ab-title">C · Conversational-first — product emerges</div>
      <div className="ab-sub">Chat dominates first contact. Product surfaces grow into view as you go.</div>
      <Frame url="app.groundx.ai">
        <MiniSidebar collapsed />
        <div style={{ flex: 1, padding: '36px 36px 18px', background: '#fbfaf6', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
          {/* faint product silhouette behind */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.35, pointerEvents: 'none', padding: 36 }}>
            <RBox w="100%" h="60%" dashed>
              <div style={{ padding: 16, color: 'rgba(41,51,92,0.4)', fontFamily: 'Kalam,cursive', fontSize: 12, textAlign: 'center', marginTop: 80 }}>
                workspace fills in as we go →
              </div>
            </RBox>
          </div>

          <div style={{ width: 580, maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 1 }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div className="wf-h" style={{ fontSize: 38, color: 'var(--gx-navy)', lineHeight: 1 }}>What do you want GroundX to do?</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, color: 'rgba(41,51,92,0.65)', marginTop: 4 }}>
                We've preloaded 4 document sets. Try one — no setup.
              </div>
            </div>

            <Bubble who="gx" lead>
              Tell me what you want to try and I'll set everything up.
            </Bubble>

            {/* Bucket suggestion cards inline in the chat — clickable */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SAMPLE_BUCKETS.map((b, i) => (
                <Bucket key={b.name} {...b} recommended={i === 1} />
              ))}
            </div>

            <div style={{ height: 6 }} />
            <ChatInput placeholder="…or describe your use case (RFP, contracts, research)" />
            <div style={{ textAlign: 'center', fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)' }}>
              quick try: <span className="wf-link">extract a table</span> · <span className="wf-link">ask a question</span> · <span className="wf-link">upload my doc →</span>
            </div>
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={24} width={170} rotate={-3}>
        no app chrome yet — chat is the <b>front door</b>
      </Sticky>
      <Sticky top={120} right={26} width={150} rotate={2.5}>
        ghost workspace hints what's <b>about to appear</b>
      </Sticky>
      <Sticky bottom={28} left={130} width={150} rotate={1}>
        bucket cards are <b>inside the chat</b> — one surface
      </Sticky>
    </div>
  );
}

function ConceptC_Emerge() {
  return (
    <div className="ab">
      <Phases active={1} />
      <div className="ab-title">C · Workspace fades in</div>
      <div className="ab-sub">User picks a bucket. Chat slides left; the product worktop materializes on the right.</div>
      <Frame url="app.groundx.ai/b/fda-labels">
        <MiniSidebar collapsed />
        <div style={{ width: 340, height: '100%', borderRight: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <Bubble who="me">FDA Drug Labels</Bubble>
          <Bubble who="gx" lead>
            <b>Got it.</b> I opened <span className="wf-link">88 docs</span> on the right.
            Let's run something concrete.
          </Bubble>
          <Bubble who="gx" opts={[
            { label: 'Ask a question', hot: true },
            { label: 'Extract a table' },
            { label: 'Compare 2 drugs' },
            { label: 'Skip — let me browse' },
          ]}>
            What's first?
          </Bubble>
          <div style={{ flex: 1 }} />
          <ChatInput />
        </div>
        <div style={{ flex: 1, padding: 16, position: 'relative', background: '#fff' }}>
          {/* directional animation hint */}
          <div className="wf-anno" style={{ position: 'absolute', top: 12, left: 16, fontFamily: 'Caveat,cursive', fontSize: 16, color: 'rgba(41,51,92,0.55)' }}>
            ↘ fade-in
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, opacity: 0.95 }}>
            <div className="wf-h" style={{ fontSize: 22 }}>FDA Drug Labels</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)' }}>88 docs · indexed</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, opacity: 0.9 }}>
            {['ibuprofen.pdf', 'warfarin.pdf', 'metformin.pdf', 'atorvastatin.pdf', '+84'].map((d, i) => (
              <div key={i} className="wf-box wf-rough-lite" style={{ padding: '4px 8px', fontFamily: 'Kalam,cursive', fontSize: 11 }}>{d}</div>
            ))}
          </div>
          <RBox w="100%" h={300} fill="fill" style={{ opacity: 0.92 }}>
            <div style={{ padding: 16 }}>
              <div className="wf-h" style={{ fontSize: 18 }}>IBUPROFEN · drug label</div>
              <div className="wf-line" style={{ width: '60%', marginTop: 8 }} />
              <div className="wf-line" />
              <div className="wf-line" style={{ width: '85%' }} />
              <div className="wf-line dim" />
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <RBox w={150} h={70} fill="fill"><div style={{ padding: 8, fontSize: 10, fontFamily: 'Kalam,cursive', color: 'rgba(41,51,92,0.6)' }}>table · dosing</div></RBox>
                <RBox w={150} h={70} fill="fill"><div style={{ padding: 8, fontSize: 10, fontFamily: 'Kalam,cursive', color: 'rgba(41,51,92,0.6)' }}>fig · adverse rx</div></RBox>
                <RBox w={150} h={70} fill="fill"><div style={{ padding: 8, fontSize: 10, fontFamily: 'Kalam,cursive', color: 'rgba(41,51,92,0.6)' }}>list · interactions</div></RBox>
              </div>
            </div>
          </RBox>
        </div>
      </Frame>

      <Sticky top={70} left={356} width={150} rotate={-3}>
        chat <b>compresses</b>, workspace appears
      </Sticky>
      <Sticky bottom={26} right={28} width={150} rotate={2}>
        same scaffold as A/B — just <b>earned</b> by conversation
      </Sticky>
    </div>
  );
}

function ConceptC_Proof() {
  return (
    <div className="ab">
      <Phases active={3} />
      <div className="ab-title">C · Answer + evidence always together</div>
      <div className="ab-sub">No drawer. The proof lives next to the answer at all times.</div>
      <Frame url="app.groundx.ai/ask">
        <MiniSidebar collapsed />
        <div style={{ width: 320, height: '100%', borderRight: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <Bubble who="me">What is max daily dose of ibuprofen?</Bubble>
          <Bubble who="gx" lead>
            <b>Max OTC: 1,200 mg/day.</b> Rx ceiling 3,200 mg/day. See chunks →
            <div style={{ marginTop: 6, fontSize: 11 }}><Cite n={1} page={3} /><Cite n={2} page={12} /></div>
          </Bubble>
          <Bubble who="gx">Follow up, or ask about another drug.</Bubble>
          <div style={{ flex: 1 }} />
          <ChatInput />
        </div>
        <div style={{ flex: 1, padding: 14, background: '#fff', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <div className="wf-h" style={{ fontSize: 20 }}>Evidence</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)' }}>always visible · maps to citations in chat</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: 320 }}>
            <RBox w="100%" h="100%" fill="fill">
              <div style={{ padding: 12 }}>
                <div className="wf-label" style={{ marginBottom: 4 }}>[1] ibuprofen.pdf · p.3</div>
                <div className="wf-line" />
                <div className="wf-line" style={{ width: '88%' }} />
                <div style={{ marginTop: 10, padding: 8, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700 }}>200 mg every 4–6 h · max 1,200/day</div>
                </div>
                <div className="wf-line dim" style={{ marginTop: 10 }} />
                <div className="wf-line dim" style={{ width: '60%' }} />
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '70%' }} />
              </div>
            </RBox>
            <RBox w="100%" h="100%" fill="fill">
              <div style={{ padding: 12 }}>
                <div className="wf-label" style={{ marginBottom: 4 }}>[2] ibuprofen.pdf · p.12</div>
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '70%' }} />
                <div style={{ marginTop: 10, padding: 8, background: 'var(--gx-coral)', border: '1.5px dashed var(--gx-navy)', color: '#fff' }} className="wf-accent-bg">
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700 }}>Rx ceiling: 3,200 mg/day under MD</div>
                </div>
                <div className="wf-line dim" style={{ marginTop: 10 }} />
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '50%' }} />
              </div>
            </RBox>
          </div>
          <div style={{ marginTop: 10, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)' }}>
            hover a citation in chat → highlights here. click → opens full page.
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={340} width={150} rotate={-2}>
        proof is <b>built into the layout</b>, not a button away
      </Sticky>
      <Sticky bottom={70} right={26} width={150} rotate={2}>
        <b>green = supporting</b>, coral = qualifier. same palette throughout.
      </Sticky>
    </div>
  );
}

function ConceptC_Gate() {
  return (
    <div className="ab">
      <Phases active={4} />
      <div className="ab-title">C · Gate as a chat turn</div>
      <div className="ab-sub">Upload trigger collapses workspace back; chat handles the gate.</div>
      <Frame url="app.groundx.ai/me/upload">
        <MiniSidebar collapsed />
        <div style={{ flex: 1, padding: '36px 36px 18px', background: '#fbfaf6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', position: 'relative' }}>
          <div style={{ width: 600, maxWidth: '95%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Bubble who="me">Upload my own contract</Bubble>
            <Bubble who="gx" lead>
              <b>Easy.</b> To put your docs into your own bucket, I just need an email — and I'll handle the rest in 60 seconds.
            </Bubble>

            {/* Gate card */}
            <div className="wf-box wf-rough-lite" style={{ padding: 16, background: 'var(--gx-tint)' }}>
              <div className="wf-label" style={{ marginBottom: 8 }}>Continue with…</div>
              <div className="wf-box" style={{ padding: '8px 10px', fontSize: 13, marginBottom: 8, background: '#fff' }}>name@company.com</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div className="wf-btn primary wf-accent-bg" style={{ flex: 1, justifyContent: 'center' }}>Send magic link →</div>
                <div className="wf-btn ghost">SSO</div>
                <div className="wf-btn ghost">Google</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.7)' }}>
                <div className="wf-line dim" style={{ flex: 1 }} />
                <div>or</div>
                <div className="wf-line dim" style={{ flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
                <div className="wf-btn coral wf-accent-bg" style={{ fontSize: 12 }}>📅 Book a 30-min demo</div>
                <div className="wf-btn ghost" style={{ fontSize: 12 }}>← keep exploring samples</div>
              </div>
            </div>

            <Bubble who="gx">
              Up to <b>5 docs</b> + <b>100 pages</b> free per account. No credit card.
            </Bubble>

            <ChatInput placeholder="ask anything else…" />
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={28} width={150} rotate={-3}>
        workspace <b>retreats</b>; chat hosts the gate
      </Sticky>
      <Sticky top={216} right={28} width={150} rotate={2}>
        free limits stated <b>plainly</b> — no surprise paywall
      </Sticky>
      <Sticky bottom={32} right={56} width={150} rotate={-1}>
        <b>three doors</b>: email · demo · keep exploring
      </Sticky>
    </div>
  );
}

Object.assign(window, { ConceptC_Entry, ConceptC_Emerge, ConceptC_Proof, ConceptC_Gate });
