// spec-layout.jsx — Engineer-grade layout system frames.
// Shows the bidirectional focus states, drag-to-resize behavior, and nav binary.

// Shared chat content used across layout frames (just placeholder structure)
function _placeholderChat({ minimal } = {}) {
  return (
    <div style={{ padding: 14, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div className="wf-av gx" style={{ width: 18, height: 18, fontSize: 11 }}>G</div>
        <div className="wf-h" style={{ fontSize: 17, lineHeight: 1 }}>Conversation</div>
        <div style={{ flex: 1 }} />
        <div className="wf-btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} title="focus chat">↗</div>
      </div>
      {!minimal && <>
        <Bubble who="me">Extract every charge by meter</Bubble>
        <Bubble who="gx" lead>
          <b>56 charges, 8 meters.</b> Highest demand: <b>Meter #3 ($412.80)</b>.{' '}
          <CiteChip n={1} page={2} doc="utility-bill" />
        </Bubble>
      </>}
      <div style={{ flex: 1 }} />
      <ChatInput placeholder="next question…" />
    </div>
  );
}

function _placeholderWorkspace() {
  return (
    <div style={{ padding: 16, height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <div className="wf-h" style={{ fontSize: 20 }}>Utility Bill · 8 meters</div>
        <div style={{ flex: 1 }} />
        <div className="wf-btn ghost" style={{ fontSize: 11 }}>extract this</div>
        <div className="wf-btn ghost" style={{ fontSize: 11 }}>save · sign in</div>
        <div className="wf-btn ghost" style={{ fontSize: 11 }} title="focus workspace">⤢</div>
      </div>
      <RBox w="100%" h={300} fill="fill">
        <div style={{ padding: 14 }}>
          <div className="wf-h" style={{ fontSize: 14 }}>UTILITY BILL · PAGE 1/3</div>
          <div className="wf-line" style={{ marginTop: 6 }} />
          <div className="wf-line" style={{ width: '70%' }} />
          <div style={{ marginTop: 10, padding: 8, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
            <div className="wf-line" style={{ background: 'rgba(41,51,92,0.5)' }} />
            <div className="wf-line" style={{ background: 'rgba(41,51,92,0.5)', width: '60%' }} />
          </div>
          <div className="wf-line dim" style={{ marginTop: 8 }} />
          <div className="wf-line dim" />
        </div>
      </RBox>
    </div>
  );
}

// 1 · Default split layout — fully labelled
function LayoutSplit() {
  return (
    <div className="ab">
      <div className="ab-title">Layout · default split</div>
      <div className="ab-sub">Three regions: nav (binary, top=content / bottom=account), chat panel, canvas. Drag handle resizes chat ↔ canvas.</div>

      <AppShell navState="full" chatWidth={320} focus="split">
        {_placeholderChat()}
        {_placeholderWorkspace()}
      </AppShell>


      {/* Dimension lines · sit below the layout so labels don't overlap chat header text */}
      <Dimension orient="h" length={48} bottom={28} left={64} label="48px" />
      <Dimension orient="h" length={272} bottom={28} left={120} label="320px (default)" />
      <Dimension orient="h" length={350} bottom={28} right={36} label="flex" />
    </div>
  );
}

// 2 · Drag-to-resize behavior with snap zones
function LayoutDrag() {
  return (
    <div className="ab">
      <div className="ab-title">Layout · drag-to-resize</div>
      <div className="ab-sub">User grabs the handle; chat and canvas negotiate. Past snap thresholds, either collapses to a focus state.</div>

      {/* Mini-frame at top showing the three resize regions */}
      <div className="wf-box wf-rough-lite" style={{ padding: 12, marginBottom: 12, background: '#fff' }}>
        <div className="wf-label" style={{ marginBottom: 6 }}>resize map · chat width</div>
        <div style={{ position: 'relative', height: 36 }}>
          {/* main bar */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 16, height: 4, background: 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
          {/* snap zones */}
          <div style={{ position: 'absolute', left: 0, width: '14%', top: 12, bottom: 12, background: 'var(--gx-coral)', borderRadius: 4, opacity: 0.85, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: '#fff' }}>
            snap → canvas focus
          </div>
          <div style={{ position: 'absolute', left: '14%', width: '62%', top: 12, bottom: 12, background: 'var(--gx-green)', borderRadius: 4, opacity: 0.7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: 'var(--gx-navy)' }}>
            live drag · 280px ↔ 640px
          </div>
          <div style={{ position: 'absolute', right: 0, width: '24%', top: 12, bottom: 12, background: 'var(--gx-coral)', borderRadius: 4, opacity: 0.85, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: '#fff' }}>
            snap → chat focus
          </div>
          {/* current handle position */}
          <div style={{ position: 'absolute', left: '28%', top: 0, bottom: 0, width: 6, background: 'var(--gx-navy)', borderRadius: 99, border: '1.5px solid #fff' }} />
          <div style={{ position: 'absolute', left: '28%', transform: 'translateX(-50%)', top: -16, fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: 'var(--gx-navy)' }}>320px</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.7)' }}>
          <span>0</span><span>240 (snap)</span><span>280 (min)</span><span>640 (max)</span><span>100%</span>
        </div>
      </div>

      <AppShell navState="full" chatWidth={380} focus="split" dragHandleState="drag">
        {_placeholderChat()}
        {_placeholderWorkspace()}
      </AppShell>

      {/* States bubble */}
      <StateLabel top={372} left={416} kind="active">drag</StateLabel>

    </div>
  );
}

// 3 · Focus chat (canvas dims behind)
function LayoutFocusChat() {
  return (
    <div className="ab">
      <div className="ab-title">Layout · focus chat (⌥-1 or click ↗)</div>
      <div className="ab-sub">Canvas dims to 35% opacity. Chat takes 50–60% width. Click outside or ↙ to exit.</div>

      <div className="ab-stage" style={{ background: '#fff' }}>
        <div className="ab-chrome">
          <i></i><i></i><i></i>
          <span>app.groundx.ai/?focus=chat</span>
        </div>
        <div className="ab-body" style={{ display: 'flex', position: 'relative' }}>
          {/* sidebar */}
          <MiniNav navState="full" navActive="projects" dimmed />

          {/* dimmed canvas */}
          <div style={{ flex: 1, opacity: 0.32, padding: 16, pointerEvents: 'none' }}>
            <div className="wf-h" style={{ fontSize: 20 }}>Utility Bill · 8 meters</div>
            <RBox w="100%" h={130} fill="cyan" style={{ marginTop: 10 }}>
              <div style={{ padding: 10 }}>
                <div className="wf-line" />
                <div className="wf-line" style={{ width: '80%' }} />
              </div>
            </RBox>
            <RBox w="100%" h={180} fill="fill" style={{ marginTop: 10 }}>
              <div style={{ padding: 14 }}>
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '70%' }} />
              </div>
            </RBox>
          </div>

          {/* chat centered card */}
          <div style={{ position: 'absolute', top: 30, bottom: 30, left: '50%', transform: 'translateX(-50%)', width: '52%' }}>
            <div className="wf-box wf-rough-lite" style={{
              width: '100%', height: '100%',
              background: '#fbfaf6', padding: 18, boxSizing: 'border-box',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div className="wf-av gx">G</div>
                <div className="wf-h" style={{ fontSize: 20 }}>Conversation · focus mode</div>
                <div style={{ flex: 1 }} />
                <div className="wf-btn ghost" style={{ fontSize: 11 }}>↙ back to split</div>
              </div>

              <Bubble who="me">Extract every charge by meter</Bubble>
              <Bubble who="gx" lead>
                <b>56 charges, 8 meters.</b> The highest demand charge is on <b>Meter #3 at $412.80</b>{' '}
                <CiteChip n={1} page={2} doc="utility-bill" />.
              </Bubble>
              <Bubble who="gx" opts={[
                { label: 'Show me the full table', hot: true },
                { label: 'Which meter had the lowest?' },
                { label: 'Reconcile against the total' },
              ]}>What's next?</Bubble>
              <div style={{ flex: 1 }} />
              <ChatInput placeholder="ask anything…" />
              <div style={{ marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)', textAlign: 'center' }}>
                Esc · click outside · or ↙ to dismiss
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// 4 · Focus canvas (chat collapses to a small puck on the side)
function LayoutFocusWorkspace() {
  return (
    <div className="ab">
      <div className="ab-title">Layout · focus canvas (⌥-2 or click ⤢)</div>
      <div className="ab-sub">Chat collapses to a side puck. Click puck or ⌥-2 again to expand.</div>

      <div className="ab-stage" style={{ background: '#fff' }}>
        <div className="ab-chrome">
          <i></i><i></i><i></i>
          <span>app.groundx.ai/?focus=canvas</span>
        </div>
        <div className="ab-body" style={{ display: 'flex' }}>
          {/* sidebar */}
          <MiniNav navState="full" navActive="projects" />

          {/* canvas at full width */}
          <div style={{ flex: 1, padding: 18, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <div className="wf-h" style={{ fontSize: 24 }}>Utility Bill · 8 meters</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>change project</div>
              <div style={{ flex: 1 }} />
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>extract this</div>
              <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11 }}>save · sign in</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }} title="exit focus">↙ split</div>
            </div>

            <RBox w="100%" h={120} fill="cyan">
              <div style={{ padding: 12 }}>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, lineHeight: 1.4 }}>
                  <b>56 charges, 8 meters.</b> Highest demand on <b>Meter #3 ($412.80)</b>; lowest on <b>Meter #7 ($14.20)</b>.{' '}
                  <CiteChip n={1} page={2} doc="utility-bill" /><CiteChip n={2} page={3} doc="utility-bill" />
                </div>
              </div>
            </RBox>

            <div style={{ height: 14 }} />
            <RBox w="100%" h={300} fill="fill">
              <div style={{ padding: 14 }}>
                <div className="wf-h" style={{ fontSize: 16 }}>utility-bill.pdf · page 2/3</div>
                <div className="wf-line" style={{ marginTop: 8 }} />
                <div className="wf-line" style={{ width: '80%' }} />
                <div className="wf-line dim" />
                <div style={{ marginTop: 8, padding: 8, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
                  <div className="wf-line" style={{ background: 'rgba(41,51,92,0.5)' }} />
                  <div className="wf-line" style={{ background: 'rgba(41,51,92,0.5)', width: '70%' }} />
                </div>
                <div className="wf-line dim" style={{ marginTop: 8 }} />
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '60%' }} />
              </div>
            </RBox>

            {/* Chat puck pinned to right */}
            <div style={{
              position: 'absolute', right: 18, bottom: 18,
              display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end',
            }}>
              <div className="wf-box wf-rough-lite" style={{
                padding: '8px 12px 8px 8px', display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--gx-navy)', color: '#fff', borderColor: 'var(--gx-navy)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              }} className="wf-accent-bg">
                <div className="wf-av gx" style={{ width: 22, height: 22, fontSize: 13, borderColor: '#fff' }}>G</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, fontWeight: 700 }}>Chat · 3 turns</div>
                <div className="wf-btn ghost" style={{ fontSize: 11, color: '#fff', borderColor: 'rgba(255,255,255,0.5)', padding: '2px 8px' }}>↗ open</div>
              </div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)' }}>
                ⌥-2 to expand · drag to reposition
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// 5 · Nav binary states comparison
function LayoutNav() {
  const bottom = navBottomFor('loggedOut'); // [cta, docs, api, settings]
  const cta = bottom[0];
  const rest = bottom.slice(1); // docs, api, settings
  return (
    <div className="ab">
      <div className="ab-title">Layout · nav binary (collapsed ↔ expanded)</div>
      <div className="ab-sub">Single toggle. Top = primary content (Workspaces, Projects). Bottom = account (engineer call CTA, Docs, API Keys, Settings). 48px ↔ 180px.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, height: 'calc(100% - 70px)' }}>
        {/* Minimal */}
        <div className="wf-box wf-rough-lite" style={{ background: '#fff', overflow: 'hidden', position: 'relative' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1.2px solid rgba(41,51,92,0.15)' }}>
            <div className="wf-label">state · minimal</div>
            <div className="wf-h" style={{ fontSize: 20 }}>48px · initials</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>default for first-run / focus modes</div>
          </div>
          <div style={{ display: 'flex', height: 'calc(100% - 64px)' }}>
            <div style={{ width: 48, height: '100%', borderRight: '1.5px solid var(--gx-navy)', background: '#f8f7f2', padding: '10px 6px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="wf-av gx" style={{ width: 22, height: 22, fontSize: 13 }}>G</div>
              <div style={{ height: 1, background: 'rgba(41,51,92,0.12)', margin: '6px 0' }} />
              {NAV_TOP.map((it) => (
                <div key={it.key} style={{
                  textAlign: 'center', padding: '6px 4px',
                  fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700,
                  background: it.key === 'workspaces' ? 'var(--gx-cyan)' : 'transparent',
                  border: it.key === 'workspaces' ? '1px solid rgba(41,51,92,0.3)' : '1px solid transparent',
                  borderRadius: 4, color: it.key === 'workspaces' ? 'var(--gx-navy)' : 'rgba(41,51,92,0.55)',
                }}>{it.initial}</div>
              ))}
              <div style={{ flex: 1 }} />
              <div style={{ height: 1, background: 'rgba(41,51,92,0.12)', margin: '2px 0' }} />
              <div className="wf-accent-bg" style={{
                textAlign: 'center', padding: '6px 4px',
                fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700,
                border: '1px solid var(--gx-green)', borderRadius: 4,
                color: 'var(--gx-navy)', background: '#fff',
              }}>★</div>
              {rest.map((it) => (
                <div key={it.key} style={{
                  textAlign: 'center', padding: '6px 4px',
                  fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.55)',
                }}>{it.initial}</div>
              ))}
              <div style={{
                fontFamily: 'Kalam,cursive', fontSize: 14, color: 'rgba(41,51,92,0.45)',
                textAlign: 'center', cursor: 'pointer', padding: '4px 6px',
                borderTop: '1px solid rgba(41,51,92,0.1)', marginTop: 4,
              }}>»</div>
            </div>
            <div style={{ flex: 1, padding: 14, fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.55)' }}>
              canvas fills more · best for focused work or small windows
            </div>
          </div>
          <Dimension orient="h" length={48} top={70} left={14} label="48px" />
        </div>

        {/* Expanded */}
        <div className="wf-box wf-rough-lite" style={{ background: '#fff', overflow: 'hidden', position: 'relative' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1.2px solid rgba(41,51,92,0.15)' }}>
            <div className="wf-label">state · expanded</div>
            <div className="wf-h" style={{ fontSize: 20 }}>180px · labels</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>opt-in; persists in localStorage</div>
          </div>
          <div style={{ display: 'flex', height: 'calc(100% - 64px)' }}>
            <div style={{ width: 180, height: '100%', borderRight: '1.5px solid var(--gx-navy)', background: '#f8f7f2', padding: '12px 14px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="wf-av gx" style={{ width: 22, height: 22, fontSize: 13 }}>G</div>
                <div className="wf-h" style={{ fontSize: 18, lineHeight: 1 }}>GroundX</div>
              </div>
              <div style={{ height: 1, background: 'rgba(41,51,92,0.12)', margin: '6px 0' }} />
              <div className="wf-label" style={{ color: 'rgba(41,51,92,0.5)', fontSize: 9, marginBottom: 2 }}>CONTENT</div>
              {NAV_TOP.map((it) => (
                <div key={it.key} style={{
                  padding: '6px 10px',
                  fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: it.key === 'workspaces' ? 700 : 400,
                  background: it.key === 'workspaces' ? 'var(--gx-cyan)' : 'transparent',
                  border: it.key === 'workspaces' ? '1px solid rgba(41,51,92,0.3)' : '1px solid transparent',
                  borderRadius: 4, color: it.key === 'workspaces' ? 'var(--gx-navy)' : 'rgba(41,51,92,0.7)',
                }}>{it.label}</div>
              ))}
              <div style={{ flex: 1 }} />
              <div className="wf-label" style={{ color: 'rgba(41,51,92,0.5)', fontSize: 9, marginBottom: 2 }}>ACCOUNT</div>
              <div className="wf-accent-stroke" style={{
                padding: '8px 10px',
                fontFamily: 'Kalam,cursive',
                background: '#fff',
                border: '1.5px solid var(--gx-green)',
                borderRadius: 4, color: 'var(--gx-navy)',
              }}>
                <div className="wf-accent-text" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gx-green)', marginBottom: 3 }}>NEED HELP?</div>
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.15, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{cta.label}</span>
                  <span className="wf-accent-text" style={{ color: 'var(--gx-green)' }}>→</span>
                </div>
                <div style={{ fontSize: 10, color: 'rgba(41,51,92,0.6)', marginTop: 2, lineHeight: 1.2 }}>{cta.subLabel}</div>
              </div>
              {rest.map((it) => (
                <div key={it.key} style={{
                  padding: '6px 10px',
                  fontFamily: 'Kalam,cursive', fontSize: 12,
                  color: 'rgba(41,51,92,0.7)',
                }}>{it.label}</div>
              ))}
              <div style={{
                fontFamily: 'Kalam,cursive', fontSize: 14, color: 'rgba(41,51,92,0.45)',
                textAlign: 'right', cursor: 'pointer', padding: '4px 6px',
                borderTop: '1px solid rgba(41,51,92,0.1)', marginTop: 6,
              }}>«</div>
            </div>
            <div style={{ flex: 1, padding: 14, fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.55)' }}>
              canvas narrower · best for new users / power navigation
            </div>
          </div>
          <Dimension orient="h" length={180} top={70} left={14} label="180px" />
        </div>
      </div>

    </div>
  );
}

Object.assign(window, { LayoutSplit, LayoutDrag, LayoutFocusChat, LayoutFocusWorkspace, LayoutNav });
