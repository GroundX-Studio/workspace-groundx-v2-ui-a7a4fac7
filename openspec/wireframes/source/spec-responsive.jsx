// spec-responsive.jsx — responsive system across viewports.
// Grounded in May 20 framing: "the sandbox should be the real product experience"
// (groundx-wireframes/inbound-outbound-visitor-journey.md, 00:38:36) — so layout
// must work end-to-end on the same device a customer would use day 2.

// ── 1 · Breakpoint overview: 4 viewports side by side ──
function Responsive_Overview() {
  return (
    <div className="ab" style={{ padding: '22px 26px' }}>
      <div className="ab-title">Responsive · breakpoint overview</div>
      <div className="ab-sub">Four canonical viewports. Same data model, layout shape changes. Drag-handle disappears below tablet landscape; focus modes do its job below that.</div>

      {/* Visual proportional comparison */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 18, height: 240 }}>
        {/* Ultrawide 1920+ */}
        <div className="wf-box wf-rough-lite" style={{ width: 280, height: 158, position: 'relative', overflow: 'hidden', background: '#fff' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            <div style={{ width: 30, background: '#f8f7f2', borderRight: '1px solid var(--gx-navy)' }} />
            <div style={{ width: 90, background: '#fbfaf6', borderRight: '1px solid var(--gx-navy)' }}>
              <div style={{ padding: 4, fontFamily: 'Kalam,cursive', fontSize: 8 }}>chat</div>
            </div>
            <div style={{ flex: 1, background: '#fff', padding: 6 }}>
              <div className="wf-h" style={{ fontSize: 10 }}>workspace</div>
              <div className="wf-line dim" style={{ marginTop: 4 }} />
              <div className="wf-line dim" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
        {/* Desktop 1280 */}
        <div className="wf-box wf-rough-lite" style={{ width: 200, height: 125, position: 'relative', overflow: 'hidden', background: '#fff' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            <div style={{ width: 16, background: '#f8f7f2', borderRight: '1px solid var(--gx-navy)' }} />
            <div style={{ width: 70, background: '#fbfaf6', borderRight: '1px solid var(--gx-navy)' }}>
              <div style={{ padding: 4, fontFamily: 'Kalam,cursive', fontSize: 8 }}>chat</div>
            </div>
            <div style={{ flex: 1, background: '#fff', padding: 6 }}>
              <div className="wf-h" style={{ fontSize: 10 }}>workspace</div>
              <div className="wf-line dim" style={{ marginTop: 4 }} />
            </div>
          </div>
        </div>
        {/* Tablet portrait 768 */}
        <div className="wf-box wf-rough-lite" style={{ width: 120, height: 168, position: 'relative', overflow: 'hidden', background: '#fff' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 14, background: '#f0eee9', borderBottom: '1px solid var(--gx-navy)', display: 'flex', alignItems: 'center', padding: '0 4px', gap: 3 }}>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 7, fontWeight: 700, background: 'var(--gx-green)', padding: '0 4px', borderRadius: 99 }} className="wf-accent-bg">chat</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 7, color: 'rgba(41,51,92,0.5)' }}>workspace</div>
            </div>
            <div style={{ flex: 1, background: '#fbfaf6', padding: 4 }}>
              <div className="wf-line dim" style={{ marginTop: 4 }} />
              <div className="wf-line dim" style={{ width: '70%' }} />
              <div className="wf-line dim" style={{ width: '50%' }} />
            </div>
          </div>
        </div>
        {/* Mobile 375 */}
        <div className="wf-box wf-rough-lite" style={{ width: 64, height: 130, position: 'relative', overflow: 'hidden', background: '#fff' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 12, background: '#f0eee9', borderBottom: '1px solid var(--gx-navy)', display: 'flex', alignItems: 'center', padding: '0 3px' }}>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 6, fontWeight: 700 }}>≡</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 6, fontWeight: 700 }}>⤢</div>
            </div>
            <div style={{ flex: 1, background: '#fbfaf6', padding: 3 }}>
              <div className="wf-line dim" style={{ marginTop: 3, height: 3 }} />
              <div className="wf-line dim" style={{ width: '70%', height: 3 }} />
            </div>
            <div style={{ height: 16, background: '#fff', borderTop: '1px solid var(--gx-navy)', padding: 3 }}>
              <div className="wf-line dim" style={{ height: 3 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Labels under each */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {[
          { w: 280, name: 'Ultrawide', range: '≥ 1600 px', sample: '1920 · 2560 · 3840' },
          { w: 200, name: 'Desktop', range: '1280–1599 px', sample: '1280 · 1366 · 1440 · 1536' },
          { w: 120, name: 'Tablet', range: '768–1023 px', sample: 'iPad portrait · Surface' },
          { w: 64, name: 'Mobile', range: '< 768 px', sample: '375 · 390 · 414' },
        ].map((b, i) => (
          <div key={i} style={{ width: b.w, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
            <div className="wf-h" style={{ fontSize: 18, color: 'var(--gx-navy)' }}>{b.name}</div>
            <div style={{ color: 'var(--gx-coral)', fontWeight: 700 }}>{b.range}</div>
            <div style={{ color: 'rgba(41,51,92,0.65)' }}>{b.sample}</div>
          </div>
        ))}
      </div>

      {/* Behavior matrix */}
      <div className="wf-label" style={{ marginTop: 22, marginBottom: 8 }}>BEHAVIOR MATRIX</div>
      <div className="wf-box wf-rough-lite" style={{ padding: 12, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr 1fr', gap: 8, paddingBottom: 6, borderBottom: '1.2px solid var(--gx-navy)', fontWeight: 700 }}>
          <div></div><div>Ultrawide</div><div>Desktop</div><div>Tablet</div><div>Mobile</div>
        </div>
        {[
          ['Default layout', 'split, chat 360', 'split, chat 320', 'tabs (chat | ws)', 'chat full-screen'],
          ['Nav default', 'expanded 180', 'minimal 48', 'minimal 48 (drawer)', 'sheet from ☰'],
          ['Drag handle', 'yes · 280↔720', 'yes · 280↔640', 'no — tab switch', 'no — toggle'],
          ['Focus chat', '⌥-1', '⌥-1', 'tab active', 'default state'],
          ['Focus workspace', '⌥-2', '⌥-2', 'tab active', '⤢ button (full-bleed)'],
          ['Citation peek', 'inline in chat', 'inline in chat', 'inline (compact)', 'opens bottom sheet'],
          ['Workspace max width', '1240 (centered)', 'flex', 'flex', 'full-bleed sheet'],
          ['Step strip', 'pinned at top', 'pinned at top', 'compact (icons + tip)', 'collapsed pill'],
          ['Results render', 'table · JSON · grid', 'table · JSON · grid', 'table → 4 cols + scroll', '2 cols + card mode'],
          ['Gate', 'inline in chat', 'inline in chat', 'modal sheet', 'full-screen sheet'],
        ].map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr 1fr', gap: 8, padding: '5px 0', borderBottom: '1px dashed rgba(41,51,92,0.15)' }}>
            <div style={{ fontWeight: 700 }}>{row[0]}</div>
            {row.slice(1).map((c, j) => <div key={j} style={{ color: 'rgba(41,51,92,0.85)' }}>{c}</div>)}
          </div>
        ))}
      </div>

    </div>
  );
}

// ── 2 · Ultrawide detail ──
function Responsive_Ultrawide() {
  return (
    <div className="ab">
      <div className="ab-title">Responsive · ultrawide ≥ 1600px</div>
      <div className="ab-sub">Don't let the workspace go edge-to-edge — long lines kill readability. Center extraction tables &amp; doc view at max 1240px.</div>

      <div className="ab-stage" style={{ background: '#fff' }}>
        <div className="ab-chrome">
          <i></i><i></i><i></i>
          <span>app.groundx.ai · 1920×1080</span>
        </div>
        <div className="ab-body" style={{ display: 'flex' }}>
          {/* Expanded nav by default on ultrawide */}
          <div style={{ width: 180, height: '100%', borderRight: '1.5px solid var(--gx-navy)', background: '#f8f7f2', padding: '12px 14px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 22, height: 22, fontSize: 13 }}>G</div>
              <div className="wf-h" style={{ fontSize: 18, lineHeight: 1 }}>GroundX</div>
            </div>
            <div style={{ height: 1, background: 'rgba(41,51,92,0.12)', margin: '4px 0' }} />
            {[...NAV_TOP, null, ...navBottomFor('loggedOut')].map((it, i) => {
              if (!it) return <div key="sep" style={{ flex: 1 }} />;
              const isActive = it.key === 'workspaces';
              const isCallCta = it.kind === 'call';
              if (isCallCta) {
                return (
                  <div key={it.key} className="wf-accent-stroke" style={{
                    padding: '8px 10px', background: '#fff',
                    border: '1.5px solid var(--gx-green)', borderRadius: 4,
                    fontFamily: 'Kalam,cursive', color: 'var(--gx-navy)',
                  }}>
                    <div className="wf-accent-text" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gx-green)', marginBottom: 3 }}>NEED HELP?</div>
                    <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.15, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>{it.label}</span>
                      <span className="wf-accent-text" style={{ color: 'var(--gx-green)' }}>→</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(41,51,92,0.6)', marginTop: 2, lineHeight: 1.2 }}>{it.subLabel}</div>
                  </div>
                );
              }
              return (
                <div key={it.key} style={{
                  padding: '6px 10px',
                  fontFamily: 'Kalam,cursive', fontSize: 12,
                  background: isActive ? 'var(--gx-cyan)' : 'transparent',
                  border: isActive ? '1px solid rgba(41,51,92,0.3)' : '1px solid transparent',
                  borderRadius: 4, color: 'var(--gx-navy)',
                  fontWeight: isActive ? 700 : 400,
                }}>
                  {it.label}
                </div>
              );
            })}
          </div>

          {/* Chat panel — slightly wider on ultrawide */}
          <div style={{ width: 360, height: '100%', boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
              <Bubble who="me">Extract every charge by meter</Bubble>
              <Bubble who="gx" lead>
                <b>56 charges, 8 meters.</b> Highest demand <b>Meter #3 ($412.80)</b>{' '}
                <CiteChip n={1} page={1} doc="utility-bill" />.
              </Bubble>
            </div>
            <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
              <ChatInput placeholder="ask anything…" />
            </div>
          </div>
          <DragHandle orient="v" />

          {/* Workspace — content centered with max-width */}
          <div style={{ flex: 1, height: '100%', background: '#fff', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
            <div style={{ width: '100%', maxWidth: 1240, padding: 22, boxSizing: 'border-box', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
                <div className="wf-h" style={{ fontSize: 22 }}>Reading <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>utility-bill · meters</span></div>
                <span style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)' }}>v2 · saved</span>
                <div style={{ flex: 1 }} />
                <div className="wf-btn ghost" style={{ fontSize: 12 }}>↻ rerun</div>
                <div className="wf-btn ghost" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>export <span style={{ opacity: 0.55, fontSize: 10 }}>▾</span> 🔒</div>
                <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 12 }}>✎ edit schema ▾</div>
                <div className="wf-btn coral wf-accent-bg" style={{ fontSize: 12 }}>💾 Save 🔒</div>
              </div>
              <RBox w="100%" h={420} fill="fill">
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.9fr 0.9fr 0.9fr 0.7fr', gap: 10, fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700, paddingBottom: 8, borderBottom: '1.4px solid var(--gx-navy)' }}>
                    <div>Charge</div><div>Meter</div><div>Units</div><div>Rate</div><div>Amount</div><div>Cite</div>
                  </div>
                  {[
                    ['Demand · peak', '#3', '16.2 kW', '$25.48/kW', '$412.80', '[1]'],
                    ['Energy · on-peak', '#3', '892 kWh', '$0.301/kWh', '$268.41', '[1]'],
                    ['Demand · peak', '#1', '12.1 kW', '$25.71/kW', '$311.05', '[4]'],
                    ['Energy · base', '#1', '728 kWh', '$0.251/kWh', '$182.30', '[4]'],
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.9fr 0.9fr 0.9fr 0.7fr', gap: 10, fontFamily: 'Kalam,cursive', fontSize: 12, padding: '6px 0', borderBottom: '1px dashed rgba(41,51,92,0.15)' }}>
                      <div style={{ fontWeight: 700 }}>{r[0]}</div><div>{r[1]}</div><div>{r[2]}</div><div>{r[3]}</div><div style={{ fontWeight: 700 }}>{r[4]}</div><div style={{ color: 'var(--gx-coral)', fontWeight: 700 }}>{r[5]}</div>
                    </div>
                  ))}
                </div>
              </RBox>
              <div className="wf-anno" style={{ position: 'absolute', top: 12, right: -16, transform: 'translateX(100%)', fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)', maxWidth: 140 }}>
                ← gutter fills with breathing room, not more table
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── 3 · Tablet portrait ──
function Responsive_Tablet() {
  return (
    <div className="ab">
      <div className="ab-title">Responsive · tablet portrait 768–1023px</div>
      <div className="ab-sub">No drag handle — both panes can't live on one screen meaningfully. Tabs are the switch; phase strip compacts.</div>

      <div style={{ display: 'flex', gap: 16, height: 'calc(100% - 60px)' }}>
        {/* tablet 1 — chat tab */}
        <div className="wf-box wf-rough-lite" style={{ width: 420, height: 640, background: '#fff', overflow: 'hidden', position: 'relative' }}>
          <div className="ab-chrome">
            <i></i><i></i><i></i>
            <span>iPad portrait · 820×1180 (chat tab)</span>
          </div>
          {/* top bar with tab switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '8px 10px', borderBottom: '1.5px solid var(--gx-navy)', background: '#f8f7f2' }}>
            <div className="wf-btn ghost" style={{ fontSize: 12, padding: '4px 8px' }}>☰</div>
            <div style={{ flex: 1, display: 'flex', gap: 6, justifyContent: 'center' }}>
              <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11 }}>💬 Chat</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>📄 Workspace</div>
            </div>
            <div className="wf-btn ghost" style={{ fontSize: 12, padding: '4px 8px' }}>?</div>
          </div>
          {/* step strip compact */}
          <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, height: 4, background: 'rgba(41,51,92,0.15)', borderRadius: 99, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '60%', background: 'var(--gx-green)', borderRadius: 99 }} className="wf-accent-bg" />
              </div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: 'var(--gx-navy)' }}>3 / 4 · Analyze · Extract</div>
            </div>
          </div>
          {/* chat content */}
          <div style={{ padding: 12 }}>
            <Bubble who="me">Extract every charge by meter</Bubble>
            <Bubble who="gx" lead>
              <b>56 charges, 8 meters.</b> Highest demand <b>Meter #3 ($412.80)</b>{' '}
              <CiteChip n={1} page={1} doc="utility-bill" />.
            </Bubble>
            <Bubble who="gx">
              Tap <CiteChip n={1} page={1} doc="utility-bill" /> → peek opens in chat.<br />
              Tap "📄 Workspace" → switch tabs to see the source.
            </Bubble>
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, borderTop: '1px solid rgba(41,51,92,0.1)', background: '#fbfaf6' }}>
            <ChatInput />
          </div>
        </div>

        {/* tablet 2 — workspace tab */}
        <div className="wf-box wf-rough-lite" style={{ width: 420, height: 640, background: '#fff', overflow: 'hidden', position: 'relative' }}>
          <div className="ab-chrome">
            <i></i><i></i><i></i>
            <span>iPad portrait · 820×1180 (workspace tab)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '8px 10px', borderBottom: '1.5px solid var(--gx-navy)', background: '#f8f7f2' }}>
            <div className="wf-btn ghost" style={{ fontSize: 12, padding: '4px 8px' }}>☰</div>
            <div style={{ flex: 1, display: 'flex', gap: 6, justifyContent: 'center' }}>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>💬 Chat <span style={{ background: 'var(--gx-coral)', color: '#fff', borderRadius: 99, fontSize: 9, padding: '0 4px', marginLeft: 4 }} className="wf-accent-bg">1</span></div>
              <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11 }}>📄 Workspace</div>
            </div>
            <div className="wf-btn ghost" style={{ fontSize: 12, padding: '4px 8px' }}>?</div>
          </div>
          {/* workspace content */}
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <div className="wf-h" style={{ fontSize: 18 }}>Utility Bill</div>
              <div style={{ flex: 1 }} />
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>↻ rerun</div>
            </div>
            <RBox w="100%" h={400} fill="fill">
              <div style={{ padding: 12 }}>
                <div className="wf-h" style={{ fontSize: 14 }}>UTILITY BILL · PAGE 1/3</div>
                <div className="wf-line" style={{ marginTop: 6 }} />
                <div className="wf-line" style={{ width: '70%' }} />
                <div style={{ marginTop: 8, padding: 6, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700 }}>Meter #3 · 16.2 kW · $412.80</div>
                </div>
                <div className="wf-line dim" style={{ marginTop: 8 }} />
                <div className="wf-line dim" style={{ width: '60%' }} />
              </div>
            </RBox>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── 4 · Mobile ──
function Responsive_Mobile() {
  return (
    <div className="ab">
      <div className="ab-title">Responsive · mobile &lt; 768px</div>
      <div className="ab-sub">Chat is the default surface — mobile is mostly a follow-up / preview device, not a primary work device. Workspace opens as a full-screen sheet.</div>

      <div style={{ display: 'flex', gap: 18, height: 'calc(100% - 60px)' }}>
        {/* mobile 1 — chat default */}
        <div className="wf-box wf-rough-lite" style={{ width: 240, height: 540, background: '#fff', overflow: 'hidden', position: 'relative', borderRadius: 18 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1.5px solid var(--gx-navy)', background: '#f8f7f2', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 12 }}>☰</div>
            <div style={{ flex: 1, fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'var(--gx-navy)' }}>Utility Bill</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 12 }} title="open workspace">⤢</div>
          </div>
          <div style={{ padding: '4px 10px', borderBottom: '1px solid rgba(41,51,92,0.1)', background: '#fff' }}>
            <div className="wf-box wf-rough-lite" style={{ padding: '2px 6px', fontFamily: 'Kalam,cursive', fontSize: 9, background: 'var(--gx-green)', display: 'inline-flex', alignItems: 'center', gap: 4 }} className="wf-accent-bg">
              <span style={{ width: 12, height: 12, borderRadius: 99, background: 'var(--gx-navy)', color: '#fff', fontSize: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>3</span>
              Analyze · Extract
            </div>
          </div>
          <div style={{ padding: 8 }}>
            <Bubble who="me">extract by meter</Bubble>
            <Bubble who="gx" lead>
              <b>56 charges, 8 meters.</b> Highest demand: <b>#3 ($412.80)</b>
              <div style={{ marginTop: 4 }}>
                <CiteChip n={1} page={1} doc="bill" /> <CiteChip n={2} page={2} doc="bill" />
              </div>
            </Bubble>
            <Bubble who="gx">tap any cite to peek →</Bubble>
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, borderTop: '1px solid rgba(41,51,92,0.1)', background: '#fbfaf6' }}>
            <ChatInput placeholder="ask…" />
          </div>
        </div>

        {/* mobile 2 — workspace as sheet */}
        <div className="wf-box wf-rough-lite" style={{ width: 240, height: 540, background: '#fff', overflow: 'hidden', position: 'relative', borderRadius: 18 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1.5px solid var(--gx-navy)', background: '#f8f7f2', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 12 }}>‹ chat</div>
            <div style={{ flex: 1, fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'var(--gx-navy)', textAlign: 'center' }}>utility-bill · p.1</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 12 }}>•••</div>
          </div>
          <div style={{ padding: 10 }}>
            <RBox w="100%" h={380} fill="fill">
              <div style={{ padding: 8 }}>
                <div className="wf-h" style={{ fontSize: 11 }}>UTILITY BILL · P.1</div>
                <div className="wf-line" style={{ marginTop: 6 }} />
                <div className="wf-line" style={{ width: '70%' }} />
                <div style={{ marginTop: 6, padding: 5, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700 }}>Meter #3 · $412.80</div>
                </div>
                <div className="wf-line dim" style={{ marginTop: 6 }} />
                <div className="wf-line dim" style={{ width: '60%' }} />
              </div>
            </RBox>
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, borderTop: '1px solid rgba(41,51,92,0.1)', background: '#fff', display: 'flex', gap: 6 }}>
            <div className="wf-btn ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>‹ back to chat</div>
            <div className="wf-btn ghost" style={{ fontSize: 11 }}>↗ pin</div>
          </div>
        </div>

        {/* mobile 3 — gate as full screen sheet */}
        <div className="wf-box wf-rough-lite" style={{ width: 240, height: 540, background: '#fff', overflow: 'hidden', position: 'relative', borderRadius: 18 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1.5px solid var(--gx-navy)', background: '#f8f7f2', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'var(--gx-navy)' }}>Unlock all</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 14 }}>×</div>
          </div>
          <div style={{ padding: 14 }}>
            <div className="wf-h" style={{ fontSize: 20, color: 'var(--gx-navy)' }}>One quick step.</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.7)', marginTop: 4 }}>
              Email to unlock all 56 rows, save your work, and export. Free: 5 docs · 100 pages.
            </div>
            <div style={{ height: 12 }} />
            <div className="wf-box" style={{ padding: '8px 10px', fontSize: 12, fontFamily: 'Kalam,cursive', color: 'rgba(41,51,92,0.6)', marginBottom: 8 }}>you@work.com</div>
            <div className="wf-btn primary wf-accent-bg" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}>→ send magic link</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <div className="wf-btn ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>SSO</div>
              <div className="wf-btn ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>Google</div>
            </div>
            <div style={{ height: 12 }} />
            <div className="wf-btn coral wf-accent-bg" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}>📅 book 15-min engineer call</div>
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, borderTop: '1px solid rgba(41,51,92,0.1)', background: '#fff' }}>
            <div style={{ textAlign: 'center', fontFamily: 'Kalam,cursive', fontSize: 11, color: 'var(--gx-navy)' }}>
              <span className="wf-link">← keep exploring</span>
            </div>
          </div>
        </div>

        {/* Notes column */}
        <div style={{ flex: 1, padding: 8 }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>MOBILE NOTES</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, lineHeight: 1.4, color: 'var(--gx-navy)' }}>
            <p style={{ margin: '4px 0' }}>Mobile is <b>not the primary work device</b>. It's the device a user reaches when a teammate shares a link, or to peek at extracted data mid-meeting.</p>
            <p style={{ margin: '4px 0' }}>The workspace renders read-only on mobile: <b>view + scroll + tap</b>. Editing extractions / changing scenario / uploading happens on desktop.</p>
            <p style={{ margin: '4px 0' }}>Chat fills the screen. Workspace opens as a full-bleed sheet from the ⤢ button or any citation tap.</p>
            <p style={{ margin: '4px 0' }}>Step strip becomes a single compact <b>3/4 · Analyze · Extract</b> pill — tap to expand vertically.</p>
            <p style={{ margin: '4px 0' }}>Gate is a <b>full-screen sheet</b> with × close — back-out always available.</p>
            <p style={{ margin: '4px 0', color: 'var(--gx-coral)' }}><b>Open Q:</b> can mobile run extractions, or read-only? Recommend: <b>read-only at MVP</b>.</p>
          </div>
        </div>
      </div>

    </div>
  );
}

Object.assign(window, { Responsive_Overview, Responsive_Ultrawide, Responsive_Tablet, Responsive_Mobile });
