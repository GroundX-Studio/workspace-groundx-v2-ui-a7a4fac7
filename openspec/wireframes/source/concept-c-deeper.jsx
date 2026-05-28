// Concept C · deeper — four explorations of the conversational-first space.
// Different entry framings, emergence patterns, proof models, and settled states.

function ConceptC_Intent() {
  return (
    <div className="ab">
      <Phases active={0} />
      <div className="ab-title">C · v2 — entry as an intent picker</div>
      <div className="ab-sub">Same conversational-first, but framing is structured. Less staring at a blank box.</div>
      <Frame url="app.groundx.ai">
        <MiniSidebar collapsed />
        <div style={{ flex: 1, padding: '32px 36px', background: '#fbfaf6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <div style={{ width: 640, maxWidth: '92%' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="wf-label wf-accent-text" style={{ color: 'var(--gx-coral)', marginBottom: 8 }}>FIRST RUN</div>
              <div className="wf-h" style={{ fontSize: 40, lineHeight: 1, color: 'var(--gx-navy)' }}>I'll get you to a real answer in 30 seconds.</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 14, color: 'rgba(41,51,92,0.7)', marginTop: 6 }}>
                Pick what you want to try first — I'll set up the rest.
              </div>
            </div>

            {/* 4-up intent picker cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 24 }}>
              {[
                { icon: '🔎', title: 'Ask a question', body: 'across a 88-page set of FDA labels', cta: 'try a sample question →', hot: true },
                { icon: '📊', title: 'Extract a table', body: 'pull structured data from 412-page filings', cta: 'see what comes out →' },
                { icon: '🧪', title: 'Inspect retrieval', body: 'see why GroundX picked these chunks', cta: 'open X-Ray demo →' },
                { icon: '📥', title: 'Upload my own doc', body: 'jump straight to your content', cta: 'sign in to upload →' },
              ].map((c, i) => (
                <div key={i} className="wf-box wf-rough-lite" style={{ padding: 14, background: c.hot ? 'var(--gx-tint)' : '#fff', cursor: 'pointer', position: 'relative' }}>
                  {c.hot && <div className="wf-anno" style={{ position: 'absolute', top: -9, right: 14, background: 'var(--gx-green)', border: '1.5px solid var(--gx-navy)', padding: '1px 8px', borderRadius: 99, fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700 }}>★ start here</div>}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <div style={{ fontSize: 22 }}>{c.icon}</div>
                    <div>
                      <div className="wf-h" style={{ fontSize: 22, lineHeight: 1, color: 'var(--gx-navy)' }}>{c.title}</div>
                      <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.7)', marginTop: 4 }}>{c.body}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'var(--gx-coral)', fontWeight: 700, marginTop: 10 }} className="wf-accent-text">
                    {c.cta}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ height: 14 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.6)' }}>
              <div className="wf-line dim" style={{ flex: 1 }} />
              <div>or just type what you need</div>
              <div className="wf-line dim" style={{ flex: 1 }} />
            </div>
            <div style={{ height: 8 }} />
            <ChatInput placeholder="e.g. 'I have 50 contracts I need to compare against a template'" />
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={28} width={150} rotate={-3}>
        same vibe, <b>less blank-canvas</b> anxiety
      </Sticky>
      <Sticky top={240} right={28} width={150} rotate={2}>
        each card <b>names a bucket</b> implicitly — no separate picker
      </Sticky>
      <Sticky bottom={28} left={210} width={170} rotate={1}>
        free-form input still there — power users find it
      </Sticky>
    </div>
  );
}

function ConceptC_Emergence() {
  // Compares 3 ways product surfaces after the user picks something.
  return (
    <div className="ab">
      <Phases active={1} />
      <div className="ab-title">C · v3 — three ways the workspace emerges</div>
      <div className="ab-sub">Same content, different motion. Which feels right after intent is picked?</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, height: 'calc(100% - 70px)' }}>
        {[
          { title: 'slide in from right', sub: 'chat compresses left' },
          { title: 'rise from below', sub: 'chat stays centered' },
          { title: 'frame around', sub: 'chat shrinks into corner' },
        ].map((m, i) => (
          <div key={i} className="wf-box wf-rough-lite" style={{ position: 'relative', overflow: 'hidden', background: '#fff' }}>
            <div style={{ padding: '10px 12px 8px', borderBottom: '1.2px solid rgba(41,51,92,0.15)' }}>
              <div className="wf-label">option {i + 1}</div>
              <div className="wf-h" style={{ fontSize: 20 }}>{m.title}</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)' }}>{m.sub}</div>
            </div>

            <div style={{ position: 'relative', height: 'calc(100% - 64px)', padding: 10, boxSizing: 'border-box' }}>
              {/* Mini browser */}
              <div className="wf-box" style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: '#fbfaf6' }}>
                {/* Option 1 — chat left, workspace sliding in from right */}
                {i === 0 && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
                    <div style={{ width: '38%', borderRight: '1px solid var(--gx-navy)', padding: 8, fontFamily: 'Kalam,cursive', fontSize: 10, background: '#fbfaf6' }}>
                      <div className="wf-av gx" style={{ width: 16, height: 16, fontSize: 9, marginBottom: 6 }}>G</div>
                      <div className="bub gx lead" style={{ fontSize: 10, padding: '4px 6px' }}>Got it — opening the bucket →</div>
                      <div className="bub me" style={{ fontSize: 10, padding: '4px 6px', marginTop: 4 }}>FDA Labels</div>
                    </div>
                    <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
                      <div style={{ padding: 8 }}>
                        <div className="wf-h" style={{ fontSize: 14 }}>FDA Drug Labels</div>
                        <div className="wf-line dim" style={{ marginTop: 6 }} />
                        <div className="wf-line dim" style={{ width: '70%' }} />
                        <div className="wf-line dim" />
                      </div>
                      {/* arrow indicating slide in */}
                      <svg width="40" height="14" style={{ position: 'absolute', right: 8, top: 4 }}>
                        <path d="M 4 7 L 36 7" stroke="var(--gx-coral)" strokeWidth="1.4" fill="none" />
                        <path d="M 30 3 L 36 7 L 30 11" stroke="var(--gx-coral)" strokeWidth="1.4" fill="none" />
                      </svg>
                    </div>
                  </div>
                )}
                {/* Option 2 — chat top centered, workspace sliding up from below */}
                {i === 1 && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: '0 0 38%', padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#fbfaf6' }}>
                      <div className="wf-av gx" style={{ width: 18, height: 18, fontSize: 10 }}>G</div>
                      <div className="bub gx lead" style={{ fontSize: 10, padding: '4px 8px' }}>Opening 88 docs ↓</div>
                    </div>
                    <div style={{ flex: 1, background: '#fff', borderTop: '1px solid var(--gx-navy)', padding: 8 }}>
                      <div className="wf-h" style={{ fontSize: 14 }}>FDA Drug Labels</div>
                      <div className="wf-line dim" style={{ marginTop: 6 }} />
                      <div className="wf-line dim" style={{ width: '60%' }} />
                      <div className="wf-line dim" />
                      {/* up arrow */}
                      <svg width="14" height="36" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
                        <path d="M 7 32 L 7 4" stroke="var(--gx-coral)" strokeWidth="1.4" fill="none" />
                        <path d="M 3 10 L 7 4 L 11 10" stroke="var(--gx-coral)" strokeWidth="1.4" fill="none" />
                      </svg>
                    </div>
                  </div>
                )}
                {/* Option 3 — chat shrinks into corner, workspace fills */}
                {i === 2 && (
                  <div style={{ position: 'absolute', inset: 0, background: '#fff', padding: 8 }}>
                    <div className="wf-h" style={{ fontSize: 14 }}>FDA Drug Labels</div>
                    <div className="wf-line dim" style={{ marginTop: 6 }} />
                    <div className="wf-line dim" style={{ width: '70%' }} />
                    <div className="wf-line dim" />
                    <div className="wf-line dim" style={{ width: '60%' }} />
                    <div className="wf-line dim" />
                    <div className="wf-line dim" style={{ width: '50%' }} />
                    {/* chat puck in corner */}
                    <div className="wf-box" style={{ position: 'absolute', bottom: 8, right: 8, padding: 6, display: 'flex', alignItems: 'center', gap: 4, background: 'var(--gx-navy)', color: '#fff', borderColor: 'var(--gx-navy)' }}>
                      <div className="wf-av gx" style={{ width: 14, height: 14, fontSize: 9, borderColor: '#fff' }}>G</div>
                      <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10 }}>chat ↘</div>
                    </div>
                  </div>
                )}
              </div>

              {/* tradeoff note */}
              <div style={{ position: 'absolute', bottom: 6, left: 10, right: 10, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.7)' }}>
                {i === 0 && <><b>Pros:</b> settles into A. <b>Cons:</b> chat shrinks fast.</>}
                {i === 1 && <><b>Pros:</b> chat stays prominent. <b>Cons:</b> workspace feels small.</>}
                {i === 2 && <><b>Pros:</b> max product real estate. <b>Cons:</b> chat feels demoted.</>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Sticky top={72} right={32} width={170} rotate={2}>
        same content, <b>different motion</b> — pick by what we want users to feel
      </Sticky>
    </div>
  );
}

function ConceptC_AnchoredProof() {
  return (
    <div className="ab">
      <Phases active={3} />
      <div className="ab-title">C · v4 — anchored citations (proof in the chat)</div>
      <div className="ab-sub">Alternative to side-by-side: hover/click a citation, document peeks open in place.</div>
      <Frame url="app.groundx.ai/ask">
        <MiniSidebar collapsed />
        <div style={{ flex: 1, padding: '20px 32px', background: '#fbfaf6', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 720, maxWidth: '95%', flex: 1, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12 }}>
            <Bubble who="me">What is max daily dose of ibuprofen?</Bubble>
            <Bubble who="gx" lead>
              <b>Max OTC: 1,200 mg/day</b> across 3–4 doses (200 mg q4–6h) <Cite n={1} page={3} />.
              Under physician care, the Rx ceiling is <b>3,200 mg/day</b> <Cite n={2} page={12} />.
              <div style={{ marginTop: 8, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)' }}>
                citation chips above are <b>live</b> — hover any of them
              </div>
            </Bubble>

            {/* expanded citation peek - anchored to citation [1] */}
            <div className="wf-box wf-rough-lite" style={{ padding: 12, marginLeft: 38, marginTop: -2, background: '#fff', position: 'relative' }}>
              <svg width="20" height="14" style={{ position: 'absolute', left: 18, top: -12 }}>
                <path d="M 10 0 L 10 12 M 10 12 L 4 12 M 10 12 L 16 12" stroke="var(--gx-navy)" strokeWidth="1.4" fill="none" />
              </svg>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Cite n={1} page={3} />
                <div className="wf-h" style={{ fontSize: 18 }}>ibuprofen.pdf · page 3</div>
                <div style={{ flex: 1 }} />
                <div className="wf-btn ghost" style={{ fontSize: 11 }}>open full doc ↗</div>
                <div className="wf-btn ghost" style={{ fontSize: 11 }}>collapse ▴</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginTop: 8 }}>
                <RBox w="100%" h={160} fill="fill">
                  <div style={{ padding: 10 }}>
                    <div className="wf-line" />
                    <div className="wf-line" style={{ width: '80%' }} />
                    <div style={{ marginTop: 8, padding: 6, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
                      <div className="wf-line" style={{ background: 'rgba(41,51,92,0.55)' }} />
                      <div className="wf-line" style={{ background: 'rgba(41,51,92,0.55)', width: '50%' }} />
                    </div>
                    <div className="wf-line dim" style={{ marginTop: 8 }} />
                    <div className="wf-line dim" style={{ width: '70%' }} />
                    <div className="wf-line dim" style={{ width: '60%' }} />
                  </div>
                </RBox>
                <div>
                  <div className="wf-label" style={{ marginBottom: 6 }}>extracted semantic object</div>
                  <div className="wf-box wf-rough-lite" style={{ padding: 8, background: 'var(--gx-cyan)' }}>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700 }}>
                      Adult OTC dose: 200 mg every 4–6 h.
                      <br />Max 1,200 mg/day across 3–4 doses.
                    </div>
                  </div>
                  <div className="wf-label" style={{ marginTop: 10, marginBottom: 6 }}>why this matched</div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, lineHeight: 1.4, color: 'rgba(41,51,92,0.85)' }}>
                    "DOSAGE" section header + dosing table + unit regex.
                    Confidence 98% · 2 alt chunks suppressed.
                  </div>
                </div>
              </div>
            </div>

            <Bubble who="gx">
              Try clicking citation <Cite n={2} page={12} /> — or ask a follow-up.
            </Bubble>
          </div>
          <ChatInput placeholder="ask about this answer…" width={720} />
        </div>
      </Frame>

      <Sticky top={80} left={28} width={150} rotate={-3}>
        proof is <b>inside the conversation</b>, no context switch
      </Sticky>
      <Sticky top={266} right={28} width={140} rotate={2}>
        page + chunk + <b>why-it-matched</b> all in one peek
      </Sticky>
      <Sticky bottom={70} left={130} width={160} rotate={1}>
        each citation can <b>expand inline</b> — collapse to dismiss
      </Sticky>
    </div>
  );
}

function ConceptC_Settled() {
  return (
    <div className="ab">
      <Phases active={2} />
      <div className="ab-title">C · v5 — what C looks like after warmup</div>
      <div className="ab-sub">Once user has run a few queries, the layout locks in. C "settles" into something closer to A.</div>
      <Frame url="app.groundx.ai/b/fda-labels">
        <MiniSidebar />
        <div style={{ width: 320, height: '100%', borderRight: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div className="wf-av gx" style={{ width: 18, height: 18, fontSize: 11 }}>G</div>
            <div className="wf-h" style={{ fontSize: 17 }}>Conversation</div>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 10, padding: '2px 6px' }}>↗ expand</div>
          </div>
          <div className="wf-label" style={{ color: 'rgba(41,51,92,0.5)', marginBottom: 6 }}>EARLIER ↑</div>
          <div className="bub gx" style={{ fontSize: 11, padding: '4px 8px', marginBottom: 4 }}>Welcome message…</div>
          <div className="bub me" style={{ fontSize: 11, padding: '4px 8px', marginBottom: 4 }}>FDA Labels</div>
          <div className="bub gx" style={{ fontSize: 11, padding: '4px 8px', marginBottom: 8 }}>Try a question…</div>
          <Bubble who="me">max ibuprofen dose</Bubble>
          <Bubble who="gx" lead>
            <b>1,200 mg/day OTC; 3,200 Rx.</b> <Cite n={1} page={3} /><Cite n={2} page={12} />
          </Bubble>
          <Bubble who="me">what about pediatric?</Bubble>
          <Bubble who="gx" lead>
            <b>10 mg/kg q6–8h</b>, max 40 mg/kg/day. <Cite n={3} page={5} />
          </Bubble>
          <div style={{ flex: 1 }} />
          <ChatInput placeholder="next question…" />
        </div>
        <div style={{ flex: 1, padding: 16, background: '#fff', position: 'relative' }}>
          {/* "you're now in workspace mode" tiny breadcrumb */}
          <div className="wf-anno" style={{ position: 'absolute', top: 14, right: 16, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>
            ↘ locked layout
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <div className="wf-h" style={{ fontSize: 22 }}>Latest answer</div>
            <div className="wf-btn ghost" style={{ fontSize: 11 }}>history</div>
            <div className="wf-btn ghost" style={{ fontSize: 11 }}>extract this</div>
            <div style={{ flex: 1 }} />
            <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11 }}>save · sign in</div>
          </div>
          <RBox w="100%" h={130} fill="cyan">
            <div style={{ padding: 12 }}>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, lineHeight: 1.4 }}>
                <b>Pediatric ibuprofen: 10 mg/kg every 6–8 hours.</b> Max 40 mg/kg/day, not to exceed adult max <Cite n={3} page={5} />.
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <div className="wf-btn ghost" style={{ fontSize: 11 }}>copy</div>
                <div className="wf-btn ghost" style={{ fontSize: 11 }}>compare to adult</div>
                <div className="wf-btn ghost" style={{ fontSize: 11 }}>see source</div>
              </div>
            </div>
          </RBox>

          <div style={{ height: 12 }} />
          <div className="wf-label" style={{ marginBottom: 6 }}>EVIDENCE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <RBox w="100%" h={160} fill="fill">
              <div style={{ padding: 10 }}>
                <div className="wf-label">[3] ibuprofen-pediatric.pdf p.5</div>
                <div className="wf-line" style={{ marginTop: 6 }} />
                <div style={{ marginTop: 8, padding: 6, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700 }}>10 mg/kg every 6–8 hours</div>
                </div>
                <div className="wf-line dim" style={{ marginTop: 8 }} />
                <div className="wf-line dim" style={{ width: '60%' }} />
              </div>
            </RBox>
            <RBox w="100%" h={160} fill="fill">
              <div style={{ padding: 10 }}>
                <div className="wf-label">history (3)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                  <div className="wf-box wf-rough-lite" style={{ padding: '4px 8px' }}>· what is max daily ibuprofen → <b>1,200 mg</b></div>
                  <div className="wf-box wf-rough-lite" style={{ padding: '4px 8px' }}>· compare warfarin & ibuprofen → <b>2 risks</b></div>
                  <div className="wf-box wf-rough-lite" style={{ padding: '4px 8px', background: 'var(--gx-tint)' }}>· pediatric ibuprofen → <b>10 mg/kg</b></div>
                </div>
              </div>
            </RBox>
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={336} width={150} rotate={-2}>
        chat is <b>still left</b>, but compacted — history visible at a glance
      </Sticky>
      <Sticky bottom={28} right={26} width={150} rotate={2}>
        running history makes <b>future answers more credible</b>
      </Sticky>
      <Sticky bottom={30} left={336} width={140} rotate={-1}>
        small "↗ expand" button → goes <b>back to conversational</b>
      </Sticky>
    </div>
  );
}

Object.assign(window, { ConceptC_Intent, ConceptC_Emergence, ConceptC_AnchoredProof, ConceptC_Settled });
