// C → A hybrid — conversational-first entry that "settles" into the split layout.
// Four time-slices: cold open, intent picked (transition mid-flight), settled split, power-user focus.

function HybridCA_Open() {
  return (
    <div className="ab">
      <Phases active={0} />
      <div className="ab-title">C→A · 1 · Cold open · chat owns the frame</div>
      <div className="ab-sub">Identical entry to C. Conversational, low-pressure.</div>
      <Frame url="app.groundx.ai">
        <MiniSidebar collapsed />
        <div style={{ flex: 1, padding: '36px 40px 18px', background: '#fbfaf6', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

          {/* Future-state hint: faint outline of the split layout it'll become */}
          <div className="wf-anno" style={{ position: 'absolute', inset: 30, opacity: 0.15, display: 'flex', pointerEvents: 'none' }}>
            <div className="wf-box-dashed" style={{ width: 240, marginRight: 12, borderRadius: 4 }} />
            <div className="wf-box-dashed" style={{ flex: 1, borderRadius: 4 }} />
          </div>

          <div style={{ width: 600, maxWidth: '92%', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 1 }}>
            <div style={{ textAlign: 'center' }}>
              <div className="wf-label" style={{ color: 'var(--gx-coral)', marginBottom: 6 }}>FIRST SESSION · 0:00</div>
              <div className="wf-h" style={{ fontSize: 38, lineHeight: 1, color: 'var(--gx-navy)' }}>What do you want GroundX to do?</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, color: 'rgba(41,51,92,0.65)', marginTop: 4 }}>
                We've preloaded 4 document sets. Try one — no setup, no sign-in.
              </div>
            </div>
            <Bubble who="gx" lead>
              Tell me what you want to try and I'll open the right bucket on the right.
            </Bubble>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SAMPLE_BUCKETS.slice(0, 4).map((b, i) => (
                <Bucket key={b.name} {...b} recommended={i === 1} />
              ))}
            </div>
            <ChatInput placeholder="…or describe your use case" />
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={28} width={170} rotate={-3}>
        <b>chat is the front door</b> — no app chrome shouting
      </Sticky>
      <Sticky top={140} right={26} width={170} rotate={2}>
        ghost outline = the layout this <b>will become</b>
      </Sticky>
    </div>
  );
}

function HybridCA_Transition() {
  // The transition moment — mid-animation. Chat sliding left, workspace materializing right.
  return (
    <div className="ab">
      <Phases active={1} />
      <div className="ab-title">C→A · 2 · Transition · "let me open that for you"</div>
      <div className="ab-sub">User picks a bucket. Chat slides left over ~400ms; workspace fades in.</div>
      <Frame url="app.groundx.ai/b/fda-labels">
        <MiniSidebar collapsed />

        {/* Chat panel mid-slide-left — starts wide, ending at A's 280px */}
        <div style={{ width: 420, height: '100%', borderRight: '1.5px dashed var(--gx-coral)', padding: 16, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <Bubble who="me">FDA Drug Labels</Bubble>
          <Bubble who="gx" lead>
            <b>Got it.</b> Opening <span className="wf-link">88 docs</span> on the right →
            Then I'll suggest a first question.
          </Bubble>
          <Bubble who="gx">
            Walk me through, or take the wheel — your choice.
          </Bubble>

          <div style={{ flex: 1 }} />
          <ChatInput />

          {/* Motion indicator */}
          <svg className="wf-anno" width="60" height="20" style={{ position: 'absolute', top: '50%', right: -32, transform: 'translateY(-50%)' }}>
            <path d="M 56 10 L 6 10" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" filter="url(#wf-rough-lite)" />
            <path d="M 12 5 L 6 10 L 12 15" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" />
          </svg>
        </div>

        {/* Workspace mid-fade-in (opacity 0.65) */}
        <div style={{ flex: 1, padding: 16, background: '#fff', position: 'relative', opacity: 0.65 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <div className="wf-h" style={{ fontSize: 22 }}>FDA Drug Labels</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.5)' }}>indexing… 88 docs ✓</div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {['ibuprofen.pdf', 'warfarin.pdf', 'metformin.pdf', 'atorvastatin.pdf', '+84'].map((d, i) => (
              <div key={i} className="wf-box wf-rough-lite" style={{ padding: '4px 8px', fontFamily: 'Kalam,cursive', fontSize: 11 }}>{d}</div>
            ))}
          </div>
          <RBox w="100%" h={280} fill="fill">
            <div style={{ padding: 16 }}>
              <div className="wf-h" style={{ fontSize: 18 }}>IBUPROFEN</div>
              <div className="wf-line dim" style={{ marginTop: 8 }} />
              <div className="wf-line dim" style={{ width: '70%' }} />
              <div className="wf-line dim" />
              <div className="wf-line dim" style={{ width: '60%' }} />
            </div>
          </RBox>

          {/* "fade in" badge */}
          <div className="wf-anno" style={{ position: 'absolute', top: 12, right: 14, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)', background: '#fff', padding: '2px 6px', border: '1px dashed rgba(41,51,92,0.3)' }}>
            ↘ fade in 400ms
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={28} width={170} rotate={-3}>
        chat slides from <b>centered → left rail</b>, doesn't disappear
      </Sticky>
      <Sticky bottom={28} left={150} width={150} rotate={1.5}>
        <b>dashed</b> border = mid-animation, settles to solid
      </Sticky>
      <Sticky bottom={70} right={26} width={140} rotate={-1}>
        workspace at <b>~65% opacity</b> mid-transition
      </Sticky>
    </div>
  );
}

function HybridCA_Settled() {
  return (
    <div className="ab">
      <Phases active={3} />
      <div className="ab-title">C→A · 3 · Settled · split layout, conversation preserved</div>
      <div className="ab-sub">A few minutes in. Layout is A-shaped now; the chat history shows where the user came from.</div>
      <Frame url="app.groundx.ai/b/fda-labels">
        <MiniSidebar />
        <div style={{ width: 300, height: '100%', borderRight: '1.5px solid var(--gx-navy)', padding: 14, boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div className="wf-av gx" style={{ width: 18, height: 18, fontSize: 11 }}>G</div>
            <div className="wf-h" style={{ fontSize: 17, lineHeight: 1 }}>Conversation</div>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} title="re-open chat-first">↗</div>
          </div>

          {/* compressed transcript */}
          <div className="wf-label" style={{ color: 'rgba(41,51,92,0.5)', marginBottom: 6 }}>0:00 INTRO</div>
          <div className="bub gx" style={{ fontSize: 11, padding: '4px 8px', marginBottom: 4 }}>What do you want GroundX to do?</div>
          <div className="bub me" style={{ fontSize: 11, padding: '4px 8px', marginBottom: 4 }}>FDA Labels</div>

          <div className="wf-label" style={{ color: 'rgba(41,51,92,0.5)', marginTop: 8, marginBottom: 6 }}>0:30 FIRST Q</div>
          <Bubble who="me">max ibuprofen dose?</Bubble>
          <Bubble who="gx" lead>
            <b>1,200 mg OTC; 3,200 Rx.</b> <Cite n={1} page={3} /><Cite n={2} page={12} />
          </Bubble>

          <div className="wf-label" style={{ color: 'rgba(41,51,92,0.5)', marginTop: 6, marginBottom: 6 }}>0:55 NOW</div>
          <Bubble who="me">pediatric?</Bubble>
          <Bubble who="gx" lead>
            <b>10 mg/kg q6–8h</b>, max 40 mg/kg/day. <Cite n={3} page={5} />
          </Bubble>

          <div style={{ flex: 1 }} />
          <ChatInput placeholder="next question…" />
        </div>

        <div style={{ flex: 1, padding: 16, background: '#fff', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <div className="wf-h" style={{ fontSize: 22 }}>Answer · pediatric dosing</div>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 11 }}>extract this</div>
            <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11 }}>save · sign in</div>
          </div>

          <RBox w="100%" h={110} fill="cyan">
            <div style={{ padding: 12 }}>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, lineHeight: 1.4 }}>
                <b>Pediatric ibuprofen:</b> 10 mg/kg every 6–8 hours. Max 40 mg/kg/day, not to exceed adult max <Cite n={3} page={5} />.
              </div>
              <div style={{ marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>
                weight-adjusted dosing — different from adult OTC of 1,200/day.
              </div>
            </div>
          </RBox>

          <div style={{ height: 14 }} />
          <div className="wf-label" style={{ marginBottom: 6 }}>SOURCE</div>
          <RBox w="100%" h={210} fill="fill">
            <div style={{ padding: 14, position: 'relative' }}>
              <div className="wf-h" style={{ fontSize: 16 }}>ibuprofen-pediatric.pdf · p.5</div>
              <div className="wf-line" style={{ marginTop: 8, width: '80%' }} />
              <div className="wf-line dim" style={{ width: '70%' }} />
              <div style={{ marginTop: 10, padding: 8, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
                <div className="wf-line" style={{ background: 'rgba(41,51,92,0.55)' }} />
                <div className="wf-line" style={{ background: 'rgba(41,51,92,0.55)', width: '50%' }} />
              </div>
              <div className="wf-line dim" style={{ marginTop: 8 }} />
              <div className="wf-line dim" style={{ width: '60%' }} />
            </div>
          </RBox>
        </div>
      </Frame>

      <Sticky top={70} left={336} width={160} rotate={-3}>
        history is <b>timestamped</b> — the user can see how they got here
      </Sticky>
      <Sticky top={180} right={26} width={150} rotate={2}>
        answer + source = <b>A-style split</b>. earned, not imposed.
      </Sticky>
      <Sticky bottom={30} left={336} width={150} rotate={1}>
        small <b>↗</b> in chat header → re-opens chat-first focus mode
      </Sticky>
    </div>
  );
}

function HybridCA_Focus() {
  // User clicks "↗" in chat header to refocus conversational mode mid-session
  return (
    <div className="ab">
      <Phases active={2} />
      <div className="ab-title">C→A · 4 · Focus mode · zoom chat back up anytime</div>
      <div className="ab-sub">User taps "↗" to re-center the chat. Workspace dims behind. Two-way switch.</div>
      <Frame url="app.groundx.ai/b/fda-labels?focus=chat">
        <MiniSidebar collapsed />
        <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
          {/* Dimmed workspace behind */}
          <div style={{ position: 'absolute', inset: 0, padding: 16, opacity: 0.32 }}>
            <div className="wf-h" style={{ fontSize: 22 }}>Answer · pediatric dosing</div>
            <RBox w="100%" h={110} fill="cyan" style={{ marginTop: 12 }}>
              <div style={{ padding: 12 }}>
                <div className="wf-line" />
                <div className="wf-line" style={{ width: '80%' }} />
                <div className="wf-line dim" />
              </div>
            </RBox>
            <RBox w="100%" h={200} fill="fill" style={{ marginTop: 14 }}>
              <div style={{ padding: 14 }}>
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '70%' }} />
                <div className="wf-line dim" />
              </div>
            </RBox>
          </div>

          {/* Floating modal-like chat centered */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
            <div className="wf-box wf-rough-lite" style={{ width: 540, maxWidth: '95%', background: '#fbfaf6', padding: 18, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div className="wf-av gx">G</div>
                <div className="wf-h" style={{ fontSize: 20 }}>Let's take a step back.</div>
                <div style={{ flex: 1 }} />
                <div className="wf-btn ghost" style={{ fontSize: 11 }}>↙ back to workspace</div>
              </div>

              <Bubble who="gx" lead>
                We've covered: <b>max adult dose</b>, <b>pediatric dose</b>, <b>2 sources cited</b>.
                What do you want to explore next?
              </Bubble>

              <Bubble who="gx" opts={[
                { label: 'Compare against a different drug class', hot: true },
                { label: 'Extract dosing across all 88 drugs' },
                { label: 'Try my own contract / upload' },
                { label: 'See how X-Ray finds these' },
              ]}>
              </Bubble>

              <div style={{ height: 8 }} />
              <ChatInput placeholder="or say what you want to try next…" />

              <div style={{ marginTop: 10, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)', textAlign: 'center' }}>
                Esc · click outside · or <span className="wf-link">↙ back to workspace</span> to dismiss
              </div>
            </div>
          </div>
        </div>
      </Frame>

      <Sticky top={70} left={28} width={150} rotate={-2}>
        same chat persona — just <b>brought back to focus</b>
      </Sticky>
      <Sticky top={240} right={26} width={140} rotate={2}>
        big buttons because the user is <b>between actions</b>
      </Sticky>
      <Sticky bottom={36} left={170} width={170} rotate={-1.5}>
        keeps the <b>"have a conversation"</b> escape hatch in A's body
      </Sticky>
    </div>
  );
}

function HybridCA_Storyboard() {
  // Single frame that explains the temporal arc.
  return (
    <div className="ab">
      <div className="ab-title">C→A · the arc, on one frame</div>
      <div className="ab-sub">Four moments, one layout that transforms. Read left → right.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, height: 'calc(100% - 70px)' }}>
        {[
          { t: '0:00', title: 'chat owns the frame', sub: '"What do you want to do?"' },
          { t: '0:05', title: 'workspace fades in', sub: 'chat slides left' },
          { t: '0:30', title: 'settled split (A)', sub: 'chat as rail, history visible' },
          { t: 'any', title: 'focus chat again', sub: 'workspace dims, big buttons' },
        ].map((step, i) => (
          <div key={i} className="wf-box wf-rough-lite" style={{ background: '#fff', position: 'relative', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1.2px solid rgba(41,51,92,0.15)' }}>
              <div className="wf-label" style={{ color: i === 3 ? 'var(--gx-coral)' : 'var(--gx-navy)' }}>{step.t}</div>
              <div className="wf-h" style={{ fontSize: 20, lineHeight: 1 }}>{step.title}</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>{step.sub}</div>
            </div>

            {/* Stage diagrams */}
            <div style={{ height: 'calc(100% - 70px)', padding: 12 }}>
              <div className="wf-box" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#fbfaf6' }}>
                {/* i=0: chat dominates, centered */}
                {i === 0 && (
                  <div style={{ position: 'absolute', inset: 8 }}>
                    <div className="wf-box-dashed" style={{ width: '100%', height: '100%', borderRadius: 4 }} />
                    <div className="wf-box wf-rough-lite" style={{ position: 'absolute', inset: '15% 12%', background: '#fff', padding: 8 }}>
                      <div className="wf-h" style={{ fontSize: 13, textAlign: 'center' }}>chat</div>
                      <div className="wf-line dim" style={{ marginTop: 6 }} />
                      <div className="wf-line dim" style={{ width: '70%' }} />
                      <div className="wf-line dim" />
                    </div>
                  </div>
                )}
                {/* i=1: mid-transition; chat shrinking left, workspace coming in */}
                {i === 1 && (
                  <div style={{ position: 'absolute', inset: 8, display: 'flex' }}>
                    <div className="wf-box wf-rough-lite" style={{ width: '50%', background: 'var(--gx-tint)', padding: 8, marginRight: 4 }}>
                      <div className="wf-h" style={{ fontSize: 12 }}>chat</div>
                      <div className="wf-line dim" style={{ marginTop: 6, width: '70%' }} />
                    </div>
                    <div className="wf-box-dashed" style={{ flex: 1, borderRadius: 4, opacity: 0.6, padding: 6 }}>
                      <div className="wf-h" style={{ fontSize: 12, color: 'rgba(41,51,92,0.6)' }}>workspace ↘</div>
                      <div className="wf-line dim" style={{ marginTop: 4 }} />
                    </div>
                    {/* arrow */}
                    <svg width="20" height="14" style={{ position: 'absolute', left: '52%', top: 14 }}>
                      <path d="M 0 7 L 18 7" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" />
                      <path d="M 12 3 L 18 7 L 12 11" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" />
                    </svg>
                  </div>
                )}
                {/* i=2: settled — A-style split */}
                {i === 2 && (
                  <div style={{ position: 'absolute', inset: 8, display: 'flex', gap: 4 }}>
                    <div className="wf-box wf-rough-lite" style={{ width: '34%', background: 'var(--gx-tint)', padding: 6 }}>
                      <div className="wf-label" style={{ fontSize: 9 }}>HISTORY</div>
                      <div className="wf-line dim" style={{ marginTop: 4, width: '70%' }} />
                      <div className="wf-line dim" style={{ width: '50%' }} />
                      <div className="wf-line dim" style={{ width: '80%' }} />
                    </div>
                    <div className="wf-box wf-rough-lite" style={{ flex: 1, padding: 6 }}>
                      <div className="wf-label" style={{ fontSize: 9 }}>ANSWER + SRC</div>
                      <div className="wf-line dim" style={{ marginTop: 4 }} />
                      <div className="wf-line dim" style={{ width: '80%' }} />
                      <div style={{ marginTop: 6, height: 26, background: 'var(--gx-green)', border: '1px dashed var(--gx-navy)' }} />
                    </div>
                  </div>
                )}
                {/* i=3: focus mode — chat re-centered, workspace dimmed */}
                {i === 3 && (
                  <div style={{ position: 'absolute', inset: 8 }}>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 4, opacity: 0.3 }}>
                      <div className="wf-box-dashed" style={{ width: '34%' }} />
                      <div className="wf-box-dashed" style={{ flex: 1 }} />
                    </div>
                    <div className="wf-box wf-rough-lite" style={{ position: 'absolute', inset: '12% 8%', background: '#fff', padding: 8 }}>
                      <div className="wf-h" style={{ fontSize: 13, textAlign: 'center' }}>chat (focus)</div>
                      <div className="wf-line dim" style={{ marginTop: 6 }} />
                      <div className="wf-line dim" style={{ width: '60%' }} />
                      <div className="wf-line dim" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { HybridCA_Open, HybridCA_Transition, HybridCA_Settled, HybridCA_Focus, HybridCA_Storyboard });
