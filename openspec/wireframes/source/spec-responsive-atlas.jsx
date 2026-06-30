// spec-responsive-atlas.jsx — per-screen/widget responsive comparison frames.
// Apply Claude design principles (calm, restrained, type-led, full-bleed mobile
// sheets, 44px touch targets, bottom-anchored input, no drop shadows, subtle
// motion). Grounded in groundx-wireframes/inbound-outbound-visitor-journey.md
// (sandbox = real product, same device day 1 & day 2).

// ── Viewport frame primitive: phone / tablet / desktop chrome ──
function ViewportFrame({ kind, label, w, h, children, sub }) {
  // kind: 'desktop' | 'tablet' | 'mobile'
  const radius = kind === 'mobile' ? 22 : kind === 'tablet' ? 12 : 6;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div className="wf-label" style={{ color: 'var(--gx-coral)' }}>{kind}</div>
        <div className="wf-h" style={{ fontSize: 18, color: 'var(--gx-navy)', lineHeight: 1 }}>{label}</div>
      </div>
      {sub && <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)' }}>{sub}</div>}
      <div className="wf-box wf-rough-lite" style={{
        width: w, height: h, background: '#fff',
        borderRadius: radius, overflow: 'hidden', position: 'relative',
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Generic phone status bar (Claude-style: minimal, type-only) ──
function PhoneHeader({ title, back, more = true, height = 36 }) {
  return (
    <div style={{
      height, padding: '0 12px', boxSizing: 'border-box',
      borderBottom: '1px solid rgba(41,51,92,0.12)',
      background: '#fff',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {back ? (
        <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, fontWeight: 700, color: 'var(--gx-navy)' }}>‹</div>
      ) : (
        <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, fontWeight: 700 }}>≡</div>
      )}
      <div style={{ flex: 1, textAlign: 'center', fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700, color: 'var(--gx-navy)' }}>{title}</div>
      {more && <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, fontWeight: 700 }}>•••</div>}
    </div>
  );
}

// ── 44px-tall touch button (mobile) ──
function TouchBtn({ children, kind = 'ghost', full, style }) {
  const kinds = {
    primary: { bg: 'var(--gx-green)', fg: 'var(--gx-navy)' },
    coral: { bg: 'var(--gx-coral)', fg: '#fff' },
    ghost: { bg: '#fff', fg: 'var(--gx-navy)' },
  };
  const k = kinds[kind] || kinds.ghost;
  return (
    <div className="wf-accent-bg" style={{
      height: 44, padding: '0 14px',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      border: '1.5px solid var(--gx-navy)', borderRadius: 99,
      background: k.bg, color: k.fg,
      fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 13,
      width: full ? '100%' : 'auto',
      flexShrink: 0,
      ...style,
    }}>{children}</div>
  );
}

// ── Bottom-anchored input (Claude-style) ──
function BottomInput({ placeholder = 'ask anything…' }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: 10, paddingBottom: 14,
      background: '#fff', borderTop: '1px solid rgba(41,51,92,0.1)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div className="wf-box" style={{
        flex: 1, height: 40, padding: '0 14px',
        display: 'flex', alignItems: 'center',
        fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.55)',
        borderRadius: 99,
      }}>{placeholder}</div>
      <div className="wf-accent-bg" style={{
        width: 40, height: 40, borderRadius: 99,
        background: 'var(--gx-green)', border: '1.5px solid var(--gx-navy)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 14, color: 'var(--gx-navy)',
      }}>↑</div>
    </div>
  );
}

// ── Sheet handle bar (Claude/iOS pattern, indicates drag-to-dismiss) ──
function SheetHandle() {
  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '6px 0 4px' }}>
      <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(41,51,92,0.25)' }} />
    </div>
  );
}

// ── Atlas frame layout: header + 3 viewports side-by-side + notes ──
function AtlasFrame({ title, sub, principles, children }) {
  return (
    <div className="ab" style={{ padding: '22px 26px' }}>
      <div className="ab-title">{title}</div>
      <div className="ab-sub">{sub}</div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>{children}</div>
      {principles && (
        <div className="wf-box wf-rough-lite" style={{ padding: '8px 12px', marginTop: 16, background: 'var(--gx-tint)', fontFamily: 'Kalam,cursive', fontSize: 11, color: 'var(--gx-navy)' }}>
          <span className="wf-label" style={{ marginRight: 8 }}>CLAUDE PRINCIPLE</span>
          {principles}
        </div>
      )}
    </div>
  );
}

// Atlas 0 · principles overview
function Atlas_Principles() {
  return (
    <div className="ab" style={{ padding: '28px 32px' }}>
      <div className="ab-title">Responsive · principles</div>
      <div className="ab-sub">How tablet & mobile decisions are made when this spec is silent. Guided by Claude's design ethos.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {[
          { t: 'Restraint > completeness', body: 'Mobile shows fewer surfaces at once. A "chat + workspace" split is a desktop privilege.' },
          { t: 'Type-led hierarchy', body: 'No drop shadows, no elevated cards. Weight and size do the work. Same on every breakpoint.' },
          { t: 'Touch targets ≥ 44 × 44', body: 'Every interactive thing on tablet/mobile is at least 44px on its smallest axis. Pills, not icons-on-paint.' },
          { t: 'Full-bleed sheets, not modals', body: 'Citation peeks, gates, settings — on mobile they take the whole screen and dismiss with a drag handle at the top.' },
          { t: 'Bottom-anchored input', body: 'The chat input always sits on the bottom edge on touch devices. Reachable by the thumb. No floating composer.' },
          { t: 'Quiet motion', body: '150–200ms fade + small slide. No spring, no bounce, no rotation. Matches the harness easing curve.' },
          { t: 'Plain failure language', body: '"Couldn\'t reach the project — retry." Never "Oops!" Never apologetic. Mirrors Claude\'s tone for errors.' },
          { t: 'One job per screen', body: 'On mobile, the screen has one job: read the answer, see the page, fill the gate. Switching is a deliberate gesture (back, tabs).' },
        ].map((p, i) => (
          <div key={i} className="wf-box wf-rough-lite" style={{ padding: 12, background: '#fff' }}>
            <div className="wf-h" style={{ fontSize: 19, color: 'var(--gx-navy)' }}>{i + 1}. {p.t}</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12.5, color: 'rgba(41,51,92,0.8)', marginTop: 4, lineHeight: 1.35 }}>{p.body}</div>
          </div>
        ))}
      </div>

      <div className="wf-box wf-rough-lite" style={{ padding: 12, background: 'var(--gx-tint)', marginTop: 14 }}>
        <div className="wf-label" style={{ marginBottom: 4 }}>WHEN THE SPEC IS SILENT</div>
        <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'var(--gx-navy)' }}>
          Apply the above. If still ambiguous: prefer the calmer, simpler, more readable option. Cut the chrome before cutting the content.
        </div>
      </div>
    </div>
  );
}

// ── Atlas 1 · Scenario picker (entry) ──
function Atlas_Entry() {
  return (
    <AtlasFrame
      title="Atlas · entry · scenario picker"
      sub="Same three preloaded scenarios. Desktop centres them inside chat-dominant. Tablet stacks them tighter. Mobile gives each card a full row + 44px tap target."
      principles="Restraint + one-job-per-screen — mobile dropped the long 'best for' line and the freeform input to keep the picker scannable."
    >
      {/* Desktop */}
      <ViewportFrame kind="desktop" label="1280" w={440} h={300}>
        <div style={{ height: 18, borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#f0eee9' }} />
        <div style={{ padding: 14, height: 'calc(100% - 18px)', boxSizing: 'border-box', background: '#fbfaf6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <div className="wf-h" style={{ fontSize: 16, color: 'var(--gx-navy)' }}>What do you want GroundX to do?</div>
          <div style={{ width: '90%', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ScenarioCard scenario={SCENARIOS.utility} recommended compact />
            <ScenarioCard scenario={SCENARIOS.loan} compact />
            <ScenarioCard scenario={SCENARIOS.solar} compact />
          </div>
        </div>
      </ViewportFrame>

      {/* Tablet */}
      <ViewportFrame kind="tablet" label="820" w={300} h={400}>
        <PhoneHeader title="Pick a scenario" back={false} />
        <div style={{ padding: 12, background: '#fbfaf6', height: 'calc(100% - 36px)', boxSizing: 'border-box', overflow: 'hidden' }}>
          <div className="wf-h" style={{ fontSize: 18, color: 'var(--gx-navy)', textAlign: 'center', marginBottom: 4 }}>What do you want to try?</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.7)', textAlign: 'center', marginBottom: 10 }}>Three preloaded scenarios.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ScenarioCard scenario={SCENARIOS.utility} recommended />
            <ScenarioCard scenario={SCENARIOS.loan} />
            <ScenarioCard scenario={SCENARIOS.solar} />
          </div>
        </div>
      </ViewportFrame>

      {/* Mobile */}
      <ViewportFrame kind="mobile" label="375" w={216} h={460}>
        <PhoneHeader title="Pick a scenario" back={false} more={false} height={32} />
        <div style={{ padding: '10px 12px 80px', background: '#fbfaf6', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
          <div className="wf-h" style={{ fontSize: 19, color: 'var(--gx-navy)', textAlign: 'left', marginBottom: 8, lineHeight: 1.05 }}>What do you want to try?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ScenarioCard scenario={SCENARIOS.utility} recommended compact />
            <ScenarioCard scenario={SCENARIOS.loan} compact />
            <ScenarioCard scenario={SCENARIOS.solar} compact />
          </div>
        </div>
        <BottomInput placeholder="describe your use case…" />
      </ViewportFrame>
    </AtlasFrame>
  );
}

// ── Atlas 2 · Conversation + citation chips ──
function Atlas_Conversation() {
  return (
    <AtlasFrame
      title="Atlas · conversation · grounded answer"
      sub="Same answer, same citation chips. Desktop pairs chat with workspace; tablet uses tabs; mobile is chat-first with a ⤢ to open the doc."
      principles="Quiet motion + one-job-per-screen — tapping a citation on mobile slides up a peek sheet, doesn't try to show the doc behind a tiny chat."
    >
      <ViewportFrame kind="desktop" label="1280" w={440} h={300}>
        <div style={{ height: 18, borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#f0eee9' }} />
        <div style={{ display: 'flex', height: 'calc(100% - 18px)' }}>
          <div style={{ width: 18, borderRight: '1px solid var(--gx-navy)', background: '#f8f7f2' }} />
          <div style={{ width: 152, background: '#fbfaf6', padding: 10, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Bubble who="me">extract by meter</Bubble>
            <Bubble who="gx" lead>56 charges, 8 meters. Highest demand <CiteChip n={1} page={1} doc="bill" /></Bubble>
          </div>
          <DragHandle orient="v" />
          <div style={{ flex: 1, padding: 10, background: '#fff' }}>
            <div className="wf-h" style={{ fontSize: 12 }}>Utility Bill</div>
            <div className="wf-line dim" style={{ marginTop: 6 }} />
            <div style={{ marginTop: 6, padding: 4, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700 }}>Meter #3 · $412.80</div>
            </div>
          </div>
        </div>
      </ViewportFrame>

      <ViewportFrame kind="tablet" label="820" w={300} h={400}>
        <PhoneHeader title="Utility Bill" back={false} />
        <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#fff', justifyContent: 'center' }}>
          <div className="wf-accent-bg" style={{ height: 32, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 4, border: '1.5px solid var(--gx-navy)', borderRadius: 99, background: 'var(--gx-green)', fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 11 }}>💬 Chat</div>
          <div style={{ height: 32, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 4, border: '1.5px solid var(--gx-navy)', borderRadius: 99, background: '#fff', fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 11 }}>📄 Workspace</div>
        </div>
        <div style={{ padding: 12, background: '#fbfaf6', height: 'calc(100% - 76px)', overflow: 'hidden' }}>
          <Bubble who="me">extract by meter</Bubble>
          <Bubble who="gx" lead>
            <b>56 charges, 8 meters.</b> Highest demand <b>Meter #3 ($412.80)</b><CiteChip n={1} page={1} doc="bill" />.
          </Bubble>
          <Bubble who="gx">tap citation → peek opens · tap "📄 Workspace" → see source</Bubble>
        </div>
        <BottomInput />
      </ViewportFrame>

      <ViewportFrame kind="mobile" label="375" w={216} h={460}>
        <div style={{ height: 32, padding: '0 12px', borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, fontWeight: 700 }}>≡</div>
          <div style={{ flex: 1, fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700, color: 'var(--gx-navy)' }}>Utility Bill</div>
          <div className="wf-accent-bg" style={{ width: 32, height: 32, borderRadius: 99, background: 'var(--gx-green)', border: '1.5px solid var(--gx-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 12 }}>⤢</div>
        </div>
        <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#fff' }}>
          <div className="wf-accent-bg" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', borderRadius: 99, background: 'var(--gx-green)', border: '1.2px solid var(--gx-navy)', fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700 }}>Analyze · Extract</div>
        </div>
        <div style={{ padding: 10, background: '#fbfaf6', height: 'calc(100% - 130px)', overflow: 'hidden' }}>
          <Bubble who="me">extract by meter</Bubble>
          <Bubble who="gx" lead>
            <b>56 charges, 8 meters.</b> Highest demand: <b>#3 ($412.80)</b>
            <div style={{ marginTop: 4 }}><CiteChip n={1} page={1} doc="bill" /></div>
          </Bubble>
          <Bubble who="gx">tap any cite to peek →</Bubble>
        </div>
        <BottomInput placeholder="ask…" />
      </ViewportFrame>
    </AtlasFrame>
  );
}

// ── Atlas 3 · Citation peek ──
function Atlas_Peek() {
  return (
    <AtlasFrame
      title="Atlas · citation peek"
      sub="Desktop peek is inline under the chat bubble. Tablet keeps it inline but compact. Mobile is a bottom sheet with a drag handle — the answer stays visible above."
      principles="Full-bleed sheets — on mobile the peek doesn't try to be a tooltip. It's a sheet you pull up, read, and pull down. ESC equivalent: swipe down."
    >
      <ViewportFrame kind="desktop" label="1280" w={440} h={300}>
        <div style={{ height: 18, borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#f0eee9' }} />
        <div style={{ display: 'flex', height: 'calc(100% - 18px)' }}>
          <div style={{ width: 220, background: '#fbfaf6', padding: 10, boxSizing: 'border-box', borderRight: '1px solid var(--gx-navy)' }}>
            <Bubble who="gx" lead>Highest <CiteChip n={1} page={1} doc="bill" expanded /></Bubble>
            {/* peek panel anchored under chip */}
            <div className="wf-box wf-rough-lite" style={{ padding: 6, marginTop: 4, background: '#fff', position: 'relative' }}>
              <svg width="10" height="6" style={{ position: 'absolute', left: 28, top: -6 }}>
                <path d="M 5 0 L 5 6" stroke="var(--gx-navy)" strokeWidth="1.4" fill="none" />
              </svg>
              <div className="wf-label" style={{ fontSize: 8 }}>p.1 · 98%</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700, color: 'var(--gx-navy)', marginTop: 3 }}>Meter #3 · $412.80</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 8, marginTop: 3, color: 'rgba(41,51,92,0.6)' }}>open doc ↗ · collapse ▴</div>
            </div>
          </div>
          <div style={{ flex: 1, padding: 8, background: '#fff' }}>
            <div className="wf-line dim" />
            <div style={{ marginTop: 6, padding: 4, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700 }}>$412.80</div>
            </div>
          </div>
        </div>
      </ViewportFrame>

      <ViewportFrame kind="tablet" label="820" w={300} h={400}>
        <PhoneHeader title="Utility Bill" />
        <div style={{ padding: 12, background: '#fbfaf6', height: 'calc(100% - 36px)' }}>
          <Bubble who="gx" lead>
            Highest demand: <b>Meter #3 ($412.80)</b> <CiteChip n={1} page={1} doc="bill" expanded />
          </Bubble>
          {/* compact inline peek */}
          <div className="wf-box wf-rough-lite" style={{ padding: 10, marginTop: 4, background: '#fff', position: 'relative' }}>
            <svg width="14" height="8" style={{ position: 'absolute', left: 40, top: -8 }}>
              <path d="M 7 0 L 7 8" stroke="var(--gx-navy)" strokeWidth="1.4" fill="none" />
            </svg>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="wf-label" style={{ fontSize: 9 }}>p.1 · 98%</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'var(--gx-coral)', fontWeight: 700 }}>open ↗</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)' }}>▴</div>
            </div>
            <RBox w="100%" h={84} fill="fill" style={{ marginTop: 6 }}>
              <div style={{ padding: 6 }}>
                <div style={{ padding: 4, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)', fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700 }} className="wf-accent-bg">Meter #3 · 16.2 kW · $412.80</div>
              </div>
            </RBox>
          </div>
        </div>
      </ViewportFrame>

      <ViewportFrame kind="mobile" label="375" w={216} h={460}>
        {/* Dimmed chat behind */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.4 }}>
          <PhoneHeader title="Utility Bill" />
          <div style={{ padding: 10, background: '#fbfaf6' }}>
            <Bubble who="gx" lead>Highest demand: <b>Meter #3 ($412.80)</b> <CiteChip n={1} page={1} doc="bill" /></Bubble>
          </div>
        </div>
        {/* Bottom sheet */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: '#fff',
          borderTop: '1.5px solid var(--gx-navy)',
          borderRadius: '14px 14px 0 0',
          padding: 0,
          height: 280,
        }}>
          <SheetHandle />
          <div style={{ padding: '0 14px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CiteChip n={1} page={1} doc="bill" expanded />
              <div className="wf-h" style={{ fontSize: 14 }}>page 1</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>98%</div>
            </div>
            <RBox w="100%" h={130} fill="fill" style={{ marginTop: 8 }}>
              <div style={{ padding: 8 }}>
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '70%' }} />
                <div style={{ marginTop: 6, padding: 5, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)', fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700 }} className="wf-accent-bg">Meter #3 · 16.2 kW · $412.80</div>
                <div className="wf-line dim" style={{ marginTop: 6 }} />
                <div className="wf-line dim" style={{ width: '50%' }} />
              </div>
            </RBox>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <TouchBtn full kind="primary">↗ open full doc</TouchBtn>
            </div>
          </div>
        </div>
      </ViewportFrame>
    </AtlasFrame>
  );
}

// ── Atlas 4 · Extract table ──
function Atlas_Extract() {
  return (
    <AtlasFrame
      title="Atlas · extract table"
      sub="Desktop is the canonical 5-column table. Tablet shrinks to 4 + horizontal scroll. Mobile abandons the grid — cards, one per row, key facts surface."
      principles="One-job-per-screen — mobile doesn't try to be a spreadsheet. Each row is a readable card; the citation is a tap target, not a column."
    >
      <ViewportFrame kind="desktop" label="1280" w={500} h={300}>
        <div style={{ height: 18, borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#f0eee9' }} />
        <div style={{ padding: 10, height: 'calc(100% - 18px)', background: '#fff' }}>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Results · table · 5 cols</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 0.9fr 0.9fr 0.6fr', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700, borderBottom: '1.2px solid var(--gx-navy)', paddingBottom: 3 }}>
            <div>Charge</div><div>Meter</div><div>Units</div><div>Amount</div><div>Cite</div>
          </div>
          {[
            ['Demand · peak', '#3', '16.2 kW', '$412.80', '[1]'],
            ['Energy · on-peak', '#3', '892 kWh', '$268.41', '[1]'],
            ['Demand · peak', '#1', '12.1 kW', '$311.05', '[4]'],
          ].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 0.9fr 0.9fr 0.6fr', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 9, padding: '4px 0', borderBottom: '1px dashed rgba(41,51,92,0.15)' }}>
              <div style={{ fontWeight: 700 }}>{r[0]}</div><div>{r[1]}</div><div>{r[2]}</div><div style={{ fontWeight: 700 }}>{r[3]}</div><div style={{ color: 'var(--gx-coral)', fontWeight: 700 }}>{r[4]}</div>
            </div>
          ))}
        </div>
      </ViewportFrame>

      <ViewportFrame kind="tablet" label="820" w={300} h={400}>
        <PhoneHeader title="Reading utility-bill · meters" />
        <div style={{ padding: 10, background: '#fff', height: 'calc(100% - 36px)' }}>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)', marginBottom: 6 }}>← horizontal scroll →</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.9fr 0.7fr', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, borderBottom: '1.2px solid var(--gx-navy)', paddingBottom: 4 }}>
            <div>Charge</div><div>Meter</div><div>Amount</div><div>Cite</div>
          </div>
          {[
            ['Demand · peak', '#3', '$412.80', '[1]'],
            ['Energy · on-peak', '#3', '$268.41', '[1]'],
            ['Demand · peak', '#1', '$311.05', '[4]'],
            ['Energy · base', '#1', '$182.30', '[4]'],
          ].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.9fr 0.7fr', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 11, padding: '6px 0', borderBottom: '1px dashed rgba(41,51,92,0.15)' }}>
              <div style={{ fontWeight: 700 }}>{r[0]}</div><div>{r[1]}</div><div style={{ fontWeight: 700 }}>{r[2]}</div><div style={{ color: 'var(--gx-coral)', fontWeight: 700 }}>{r[3]}</div>
            </div>
          ))}
        </div>
      </ViewportFrame>

      <ViewportFrame kind="mobile" label="375" w={216} h={460}>
        <PhoneHeader title="Results" />
        <div style={{ padding: 10, background: '#fff', height: 'calc(100% - 100px)', overflow: 'hidden' }}>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)', marginBottom: 8 }}>3 of 56 rows · sign in for all</div>
          {[
            { c: 'Demand · peak', m: '#3', a: '$412.80', u: '16.2 kW', cite: '[1] p.1' },
            { c: 'Energy · on-peak', m: '#3', a: '$268.41', u: '892 kWh', cite: '[1] p.1' },
            { c: 'Demand · peak', m: '#1', a: '$311.05', u: '12.1 kW', cite: '[4] p.1' },
          ].map((r, i) => (
            <div key={i} className="wf-box wf-rough-lite" style={{ padding: 8, marginBottom: 6, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <div className="wf-h" style={{ fontSize: 13 }}>{r.a}</div>
                <div style={{ flex: 1 }} />
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'var(--gx-coral)', fontWeight: 700 }}>{r.cite}</div>
              </div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.75)' }}>
                <b>{r.c}</b> · Meter {r.m} · {r.u}
              </div>
            </div>
          ))}
          {/* blurred */}
          <div className="wf-box wf-rough-lite" style={{ padding: 8, marginBottom: 6, filter: 'blur(2px)', opacity: 0.5 }}>
            <div className="wf-h" style={{ fontSize: 13 }}>██████</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10 }}>██████</div>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 56, left: 10, right: 10 }}>
          <TouchBtn full kind="primary">unlock all 56 →</TouchBtn>
        </div>
      </ViewportFrame>
    </AtlasFrame>
  );
}

// ── Atlas 5 · Gate ──
function Atlas_Gate() {
  return (
    <AtlasFrame
      title="Atlas · gate"
      sub="Desktop: inline in chat panel. Tablet: full-width sheet over canvas. Mobile: full-screen sheet with × close in the header — work is preserved behind."
      principles="Plain failure language + full-bleed sheets — mobile gate is its own screen, not a popup. × always top-right. 'Keep exploring' lives bottom, away from the commit buttons."
    >
      <ViewportFrame kind="desktop" label="1280" w={440} h={300}>
        <div style={{ height: 18, borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#f0eee9' }} />
        <div style={{ display: 'flex', height: 'calc(100% - 18px)' }}>
          <div style={{ width: 18, borderRight: '1px solid var(--gx-navy)', background: '#f8f7f2' }} />
          <div style={{ width: 180, background: '#fbfaf6', padding: 10, boxSizing: 'border-box', borderRight: '1px solid var(--gx-navy)' }}>
            <div className="wf-box wf-rough-lite" style={{ padding: 8, background: 'var(--gx-tint)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 4, right: 6, fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: 'rgba(41,51,92,0.6)' }}>×</div>
              <div className="wf-label" style={{ fontSize: 8 }}>continue with…</div>
              <div className="wf-box" style={{ padding: '3px 6px', fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.55)', marginTop: 4 }}>name@company.com</div>
              <div className="wf-accent-bg" style={{ background: 'var(--gx-green)', border: '1px solid var(--gx-navy)', padding: '3px 6px', borderRadius: 99, marginTop: 4, fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700, textAlign: 'center' }}>→ link</div>
            </div>
          </div>
          <div style={{ flex: 1, background: '#fff', opacity: 0.4 }} />
        </div>
      </ViewportFrame>

      <ViewportFrame kind="tablet" label="820" w={300} h={400}>
        <PhoneHeader title="Unlock everything" />
        <div style={{ background: 'rgba(0,0,0,0.05)', height: 40 }} />
        <div className="wf-box wf-rough-lite" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', padding: 16, borderRadius: '14px 14px 0 0', borderTop: '1.5px solid var(--gx-navy)' }}>
          <SheetHandle />
          <div className="wf-h" style={{ fontSize: 20, color: 'var(--gx-navy)', marginBottom: 4 }}>One quick step.</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.7)', marginBottom: 12 }}>Email to unlock all rows. Free: 5 docs · 100 pages.</div>
          <div className="wf-box" style={{ padding: '10px 12px', fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.55)', marginBottom: 8 }}>name@company.com</div>
          <TouchBtn full kind="primary">→ send magic link</TouchBtn>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <TouchBtn full>SSO</TouchBtn>
            <TouchBtn full>Google</TouchBtn>
          </div>
          <div style={{ height: 8 }} />
          <TouchBtn full kind="coral">📅 book 30-min engineer call</TouchBtn>
          <div style={{ textAlign: 'center', fontFamily: 'Kalam,cursive', fontSize: 11, color: 'var(--gx-navy)', marginTop: 10 }}>
            <span className="wf-link">← keep exploring</span>
          </div>
        </div>
      </ViewportFrame>

      <ViewportFrame kind="mobile" label="375" w={216} h={460}>
        <div style={{ height: 38, padding: '0 12px', borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontFamily: 'Kalam,cursive', fontSize: 13, fontWeight: 700 }}>Unlock everything</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 16, fontWeight: 700, color: 'rgba(41,51,92,0.6)' }}>×</div>
        </div>
        <div style={{ padding: 14, height: 'calc(100% - 90px)', overflow: 'hidden' }}>
          <div className="wf-h" style={{ fontSize: 22, color: 'var(--gx-navy)', lineHeight: 1 }}>One quick step.</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.7)', marginTop: 6, marginBottom: 14 }}>
            Email to unlock all 56 rows. Free: 5 docs · 100 pages.
          </div>
          <div className="wf-box" style={{ padding: '10px 12px', fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.55)', marginBottom: 10 }}>name@company.com</div>
          <TouchBtn full kind="primary">→ send magic link</TouchBtn>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <TouchBtn full>SSO</TouchBtn>
            <TouchBtn full>Google</TouchBtn>
          </div>
          <div style={{ height: 10 }} />
          <TouchBtn full kind="coral">📅 book engineer call</TouchBtn>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, borderTop: '1px solid rgba(41,51,92,0.1)', textAlign: 'center', fontFamily: 'Kalam,cursive', fontSize: 12 }}>
          <span className="wf-link">← keep exploring</span>
        </div>
      </ViewportFrame>
    </AtlasFrame>
  );
}

// ── Atlas 6 · Solar hierarchy ──
function Atlas_Solar() {
  return (
    <AtlasFrame
      title="Atlas · solar portfolio hierarchy"
      sub="Desktop shows portfolio → fund → project as breadcrumb + two-pane (sources + risk). Tablet collapses to a single pane with a sticky breadcrumb. Mobile flattens to a list."
      principles="Restraint — mobile doesn't try to show breadcrumb + sources + risks at once. Each level is its own screen with a back button."
    >
      <ViewportFrame kind="desktop" label="1280" w={500} h={300}>
        <div style={{ height: 18, borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#f0eee9' }} />
        <div style={{ padding: 10, height: 'calc(100% - 18px)', background: '#fff' }}>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.55)' }}>Portfolio › Fund › <b>Sundance</b></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8, marginTop: 8, height: 'calc(100% - 28px)' }}>
            <RBox w="100%" h="100%" fill="fill">
              <div style={{ padding: 6, fontFamily: 'Kalam,cursive', fontSize: 9 }}>
                <div className="wf-label" style={{ fontSize: 8 }}>SOURCES · 11</div>
                {['PPA-vendor', 'utility-CA3', 'lease-2024'].map((d, i) => (
                  <div key={i} className="wf-box wf-rough-lite" style={{ padding: '3px 5px', marginTop: 3, background: i === 0 ? 'var(--gx-tint)' : '#fff' }}>{d}</div>
                ))}
              </div>
            </RBox>
            <RBox w="100%" h="100%" fill="fill">
              <div style={{ padding: 6, fontFamily: 'Kalam,cursive', fontSize: 9 }}>
                <div className="wf-label" style={{ fontSize: 8 }}>RISKS</div>
                {[
                  ['high', 'interconnect delay'],
                  ['med', 'lease escalator'],
                  ['med', 'O&M gap'],
                ].map(([sev, t], i) => (
                  <div key={i} className="wf-box wf-rough-lite" style={{ padding: '3px 5px', marginTop: 3, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: -1, top: 0, bottom: 0, width: 3, background: sev === 'high' ? 'var(--gx-coral)' : '#e3a514' }} className="wf-accent-bg" />
                    <div style={{ paddingLeft: 4, fontWeight: 700 }}>{t}</div>
                  </div>
                ))}
              </div>
            </RBox>
          </div>
        </div>
      </ViewportFrame>

      <ViewportFrame kind="tablet" label="820" w={300} h={400}>
        <PhoneHeader title="Sundance · risks" />
        <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#fff', fontFamily: 'Kalam,cursive', fontSize: 11 }}>
          <span style={{ color: 'rgba(41,51,92,0.55)' }}>Portfolio › Fund › </span>
          <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>Sundance</span>
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '1px solid rgba(41,51,92,0.12)' }}>
          <div className="wf-accent-bg" style={{ height: 28, padding: '0 10px', display: 'inline-flex', alignItems: 'center', border: '1.5px solid var(--gx-navy)', borderRadius: 99, background: 'var(--gx-green)', fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 10 }}>Risks (3)</div>
          <div style={{ height: 28, padding: '0 10px', display: 'inline-flex', alignItems: 'center', border: '1.5px solid var(--gx-navy)', borderRadius: 99, background: '#fff', fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 10 }}>Sources (11)</div>
        </div>
        <div style={{ padding: 10, height: 'calc(100% - 100px)', overflow: 'hidden' }}>
          {[
            ['high', 'Interconnection delay', 'utility CA-3 · 14 mo'],
            ['med', 'Lease escalator', '4.2% / yr after yr 5'],
            ['med', 'O&M assumption gap', '$0.6M vs $1.0M vendor'],
          ].map(([sev, t, m], i) => (
            <div key={i} className="wf-box wf-rough-lite" style={{ padding: 8, marginBottom: 6, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -1, top: 8, bottom: 8, width: 3, background: sev === 'high' ? 'var(--gx-coral)' : '#e3a514' }} className="wf-accent-bg" />
              <div style={{ paddingLeft: 6, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                <div style={{ fontWeight: 700 }}>{t}</div>
                <div style={{ color: 'rgba(41,51,92,0.7)' }}>{m}</div>
              </div>
            </div>
          ))}
        </div>
      </ViewportFrame>

      <ViewportFrame kind="mobile" label="375" w={216} h={460}>
        <div style={{ height: 38, padding: '0 12px', borderBottom: '1px solid rgba(41,51,92,0.12)', background: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 14, fontWeight: 700 }}>‹</div>
          <div style={{ flex: 1, fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>Sundance</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 14, fontWeight: 700 }}>•••</div>
        </div>
        <div style={{ padding: 10, height: 'calc(100% - 38px)', overflow: 'hidden' }}>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)', marginBottom: 8 }}>
            Portfolio › Fund › <b style={{ color: 'var(--gx-navy)' }}>Sundance</b>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            <div className="wf-accent-bg" style={{ height: 32, padding: '0 10px', display: 'inline-flex', alignItems: 'center', border: '1.5px solid var(--gx-navy)', borderRadius: 99, background: 'var(--gx-green)', fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 10 }}>Risks</div>
            <div style={{ height: 32, padding: '0 10px', display: 'inline-flex', alignItems: 'center', border: '1.5px solid var(--gx-navy)', borderRadius: 99, background: '#fff', fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 10 }}>Sources</div>
          </div>
          {[
            ['high', 'Interconnection delay'],
            ['med', 'Lease escalator'],
            ['med', 'O&M gap'],
          ].map(([sev, t], i) => (
            <div key={i} className="wf-box wf-rough-lite" style={{ padding: 10, marginBottom: 6, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -1, top: 8, bottom: 8, width: 3, background: sev === 'high' ? 'var(--gx-coral)' : '#e3a514' }} className="wf-accent-bg" />
              <div style={{ paddingLeft: 6, fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700 }}>{t}</div>
            </div>
          ))}
        </div>
      </ViewportFrame>
    </AtlasFrame>
  );
}

Object.assign(window, {
  Atlas_Principles, Atlas_Entry, Atlas_Conversation, Atlas_Peek, Atlas_Extract, Atlas_Gate, Atlas_Solar,
  ViewportFrame, PhoneHeader, TouchBtn, BottomInput, SheetHandle, AtlasFrame,
});
