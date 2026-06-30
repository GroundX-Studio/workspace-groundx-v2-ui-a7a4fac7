// spec-primitives.jsx — engineer-grade annotation primitives for the Onboarding Spec.
// Lower-fi than production but higher-fi than the loose wireframes — measurable, named states.

// ── Numbered callout (red pill linked to a list below the artboard) ──
function Callout({ n, top, left, right, bottom, style }) {
  return (
    <div className="wf-anno" style={{
      position: 'absolute', top, left, right, bottom,
      width: 22, height: 22, borderRadius: 99,
      background: 'var(--gx-coral)', color: '#fff',
      border: '1.5px solid var(--gx-navy)',
      fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 13,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      zIndex: 6,
      ...style,
    }}>{n}</div>
  );
}

// ── Measurement / dimension annotation: arrow with label ──
function Dimension({ orient = 'h', length, label, top, left, right, bottom, style }) {
  // orient: 'h' or 'v'
  const isH = orient === 'h';
  return (
    <div className="wf-anno" style={{
      position: 'absolute', top, left, right, bottom,
      width: isH ? length : 14, height: isH ? 14 : length,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}>
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        {isH ? (
          <>
            <line x1="0" y1="7" x2="100%" y2="7" stroke="var(--gx-coral)" strokeWidth="1.2" />
            <line x1="0" y1="2" x2="0" y2="12" stroke="var(--gx-coral)" strokeWidth="1.2" />
            <line x1="100%" y1="2" x2="100%" y2="12" stroke="var(--gx-coral)" strokeWidth="1.2" />
          </>
        ) : (
          <>
            <line x1="7" y1="0" x2="7" y2="100%" stroke="var(--gx-coral)" strokeWidth="1.2" />
            <line x1="2" y1="0" x2="12" y2="0" stroke="var(--gx-coral)" strokeWidth="1.2" />
            <line x1="2" y1="100%" x2="12" y2="100%" stroke="var(--gx-coral)" strokeWidth="1.2" />
          </>
        )}
      </svg>
      <div style={{
        position: 'absolute',
        background: '#fff', padding: '0 4px',
        fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700,
        color: 'var(--gx-coral)', whiteSpace: 'nowrap',
        border: '1px solid var(--gx-coral)', borderRadius: 3,
      }}>{label}</div>
    </div>
  );
}

// ── State label badge: "default" / "hover" / "active" / "disabled" ──
function StateLabel({ children, top, left, right, bottom, kind = 'default', style }) {
  const kinds = {
    default: { bg: '#fff', fg: 'var(--gx-navy)', border: 'var(--gx-navy)' },
    hover: { bg: 'var(--gx-cyan)', fg: 'var(--gx-navy)', border: 'var(--gx-navy)' },
    active: { bg: 'var(--gx-green)', fg: 'var(--gx-navy)', border: 'var(--gx-navy)' },
    focus: { bg: 'var(--gx-green)', fg: 'var(--gx-navy)', border: 'var(--gx-navy)' },
    disabled: { bg: '#f2f4f5', fg: 'rgba(41,51,92,0.4)', border: 'rgba(41,51,92,0.3)' },
  };
  const k = kinds[kind] || kinds.default;
  return (
    <div className="wf-anno" style={{
      position: 'absolute', top, left, right, bottom,
      background: k.bg, color: k.fg,
      border: `1px solid ${k.border}`,
      fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 10,
      letterSpacing: 0.4, textTransform: 'uppercase',
      padding: '2px 6px', borderRadius: 99,
      ...style,
    }}>{children}</div>
  );
}

// ── Drag handle (4px vertical/horizontal grab bar with hover affordance) ──
function DragHandle({ orient = 'v', state = 'default' }) {
  // orient: 'v' = vertical bar (between cols); 'h' = horizontal bar
  const isV = orient === 'v';
  const w = isV ? 6 : '100%';
  const h = isV ? '100%' : 6;
  const bg = state === 'drag' ? 'var(--gx-green)' : state === 'hover' ? 'rgba(41,51,92,0.25)' : 'rgba(41,51,92,0.12)';
  return (
    <div style={{
      width: w, height: h, background: bg,
      position: 'relative', cursor: isV ? 'col-resize' : 'row-resize',
      flexShrink: 0,
    }}>
      {/* grip dots */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: isV ? 'column' : 'row', gap: 3,
      }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            width: 2, height: 2, borderRadius: 99,
            background: state === 'default' ? 'rgba(41,51,92,0.55)' : 'var(--gx-navy)',
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Phase pill strip (the shaded onboarding bubbles user wanted) ──
function PhaseStrip({ phases, current }) {
  // phases: array of {label, key}; current = key currently active
  // earlier phases get filled (✓), current gets accent, later get hollow
  const ci = phases.findIndex((p) => p.key === current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
      {phases.map((p, i) => {
        const state = i < ci ? 'done' : i === ci ? 'current' : 'todo';
        const isLast = i === phases.length - 1;
        return (
          <React.Fragment key={p.key}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px',
              background: state === 'current' ? 'var(--gx-green)' : state === 'done' ? 'var(--gx-tint)' : '#fff',
              border: `1.5px solid ${state === 'todo' ? 'rgba(41,51,92,0.25)' : 'var(--gx-navy)'}`,
              borderRadius: 99,
              color: state === 'todo' ? 'rgba(41,51,92,0.5)' : 'var(--gx-navy)',
              fontWeight: state === 'current' ? 700 : 500,
            }}>
              <span style={{
                width: 16, height: 16, borderRadius: 99,
                background: state === 'done' ? 'var(--gx-navy)' : state === 'current' ? 'var(--gx-navy)' : 'transparent',
                color: '#fff', border: state === 'todo' ? '1px solid rgba(41,51,92,0.4)' : 'none',
                fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {state === 'done' ? '✓' : i + 1}
              </span>
              {p.label}
            </div>
            {!isLast && (
              <div style={{
                width: 14, height: 1.5,
                background: state === 'todo' ? 'rgba(41,51,92,0.2)' : 'var(--gx-navy)',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Scenario bucket card — uniform layout across all 3 scenarios.
// Same height, same icon weight, same content slots regardless of doc count.
function ScenarioCard({ scenario, recommended, selected, compact, style }) {
  const s = scenario;
  return (
    <div className="wf-box wf-rough-lite" style={{
      padding: compact ? 10 : 12,
      background: selected ? 'var(--gx-tint)' : '#fff',
      borderWidth: selected ? 2 : 1.5,
      position: 'relative',
      cursor: 'pointer',
      minHeight: compact ? 76 : 92,
      boxSizing: 'border-box',
      ...style,
    }}>
      {recommended && (
        <div className="wf-anno wf-accent-bg" style={{
          position: 'absolute', top: -10, right: 12,
          background: 'var(--gx-green)', border: '1.5px solid var(--gx-navy)',
          padding: '1px 8px', borderRadius: 99,
          fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700,
        }}>
          ★ start here
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {/* One representative thumbnail + doc-count badge */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Doc w={compact ? 32 : 38} h={compact ? 40 : 48} />
          <div style={{
            position: 'absolute', bottom: -6, right: -6,
            background: 'var(--gx-cyan)', border: '1.5px solid var(--gx-navy)',
            borderRadius: 99, padding: '1px 6px',
            fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700,
            color: 'var(--gx-navy)', whiteSpace: 'nowrap',
          }} className="wf-accent-bg">
            {s.docCount}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="wf-h" style={{ fontSize: compact ? 16 : 19, lineHeight: 1.05, color: 'var(--gx-navy)' }}>{s.name}</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: compact ? 11 : 12, color: 'rgba(41,51,92,0.7)', marginTop: 3 }}>
            {s.shortDesc}
          </div>
          {!compact && (
            <div style={{ marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'var(--gx-coral)', fontWeight: 700 }}>
              {s.demonstrates}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── The 3 canonical scenarios from preloaded-content-scenarios.md ──
const SCENARIOS = {
  utility: {
    key: 'utility',
    name: 'Utility Bill',
    shortDesc: 'a single billing statement with 8 meters and 56 charges across 3 pages',
    demonstrates: 'messy layout → clean extraction',
    docCount: '1 doc',
    docs: ['utility-bill.pdf'],
    chapters: { understand: 'live', extract: 'live', interact: 'live', report: 'grayed' },
    primaryCapability: 'extract',
    sampleQs: [
      'Extract every charge by meter.',
      'Which meter had the highest demand charge?',
      'Reconcile the total against all line items.',
      'Show me where each charge came from.',
    ],
  },
  loan: {
    key: 'loan',
    name: 'Loan Eligibility Packet',
    shortDesc: 'paystubs, W-2, bank statements, employment letter — the bundle an underwriter reviews',
    demonstrates: 'docs → structured JSON for workflows',
    docCount: '12 docs',
    docs: ['paystub-jan.pdf', 'paystub-feb.pdf', 'paystub-mar.pdf', 'w2-2024.pdf', 'employment-letter.pdf', 'bank-stmt-q1.pdf'],
    chapters: { understand: 'live', extract: 'live', interact: 'live', report: 'grayed' },
    primaryCapability: 'extract',
    sampleQs: [
      'Extract income, DTI, employer, employment length, anomalies.',
      'Create a JSON output for a loan approval workflow.',
      'Identify gaps in employment or unexplained deposits.',
      'Show citations for every eligibility field.',
    ],
  },
  solar: {
    key: 'solar',
    name: 'Solar Project Portfolio',
    shortDesc: 'agreements, leases, permits, engineering studies — a whole fund\'s worth of project diligence',
    demonstrates: 'cross-document intelligence at scale',
    docCount: '142 docs',
    docs: ['ppa-vendor.pdf', 'permit-county.pdf', 'engineering-study.pdf', 'lease-2024.pdf', 'interconnection.pdf', 'financial-model.xlsx'],
    chapters: { understand: 'live', extract: 'grayed', interact: 'live', report: 'live' },
    primaryCapability: 'report',
    sampleQs: [
      'Summarize risk across this project.',
      'Which projects have the highest lease exposure?',
      'What documents support the current NPV?',
      'Generate an investment committee brief with citations.',
    ],
  },
};

// ── Citation chip that opens an inline peek panel (C·v4 affordance) ──
function CiteChip({ n, page, doc = 'doc.pdf', expanded, onClick, color = 'cyan' }) {
  const bg = color === 'green' ? 'var(--gx-green)' : color === 'coral' ? 'var(--gx-coral)' : 'var(--gx-cyan)';
  const fg = color === 'coral' ? '#fff' : 'var(--gx-navy)';
  return (
    <span onClick={onClick} className="wf-box wf-rough-lite" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 7px',
      fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700,
      borderRadius: 99, marginLeft: 4, marginRight: 2,
      background: expanded ? 'var(--gx-navy)' : bg,
      color: expanded ? '#fff' : fg,
      borderColor: 'var(--gx-navy)',
      cursor: 'pointer',
    }}>
      [{n}] {doc.replace('.pdf', '')} p.{page}
    </span>
  );
}

// ── Citation peek panel (anchored under a citation, expand inline) ──
function CitePeek({ n, page, doc, quote, why, confidence = '98%', children }) {
  return (
    <div className="wf-box wf-rough-lite" style={{ padding: 12, marginLeft: 38, marginTop: -2, marginBottom: 8, background: '#fff', position: 'relative' }}>
      <svg width="20" height="14" style={{ position: 'absolute', left: 18, top: -12 }}>
        <path d="M 10 0 L 10 12 M 10 12 L 4 12 M 10 12 L 16 12" stroke="var(--gx-navy)" strokeWidth="1.4" fill="none" />
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CiteChip n={n} page={page} doc={doc} expanded />
        <div className="wf-h" style={{ fontSize: 16 }}>{doc} · page {page}</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>confidence {confidence}</div>
        <div className="wf-btn ghost" style={{ fontSize: 10, padding: '3px 8px' }}>open full doc ↗</div>
        <div className="wf-btn ghost" style={{ fontSize: 10, padding: '3px 8px' }}>collapse ▴</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12, marginTop: 8 }}>
        <RBox w="100%" h={130} fill="fill">
          <div style={{ padding: 10 }}>
            <div className="wf-line" />
            <div className="wf-line" style={{ width: '85%' }} />
            <div className="wf-line dim" />
            <div style={{ marginTop: 6, padding: 6, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'var(--gx-navy)' }}>{quote}</div>
            </div>
            <div className="wf-line dim" style={{ marginTop: 6 }} />
            <div className="wf-line dim" style={{ width: '60%' }} />
          </div>
        </RBox>
        <div>
          <div className="wf-label" style={{ marginBottom: 4 }}>extracted semantic object</div>
          <div className="wf-box wf-rough-lite" style={{ padding: 7, background: 'var(--gx-cyan)' }}>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700 }}>{quote}</div>
          </div>
          <div className="wf-label" style={{ marginTop: 8, marginBottom: 4 }}>why matched</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, lineHeight: 1.4, color: 'rgba(41,51,92,0.85)' }}>{why}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Nav schema (used by AppShell + LayoutNav + responsive variants) ──
// Top half = primary nav. Bottom half = reference / account.
//
// During onboarding (logged out): the workflow steps live in the on-canvas
// "step strip" — NOT in the side nav. The side nav top is empty so the demo
// can use the side nav for nothing distracting. Once signed in, the side nav
// gets the actual product surfaces (Workspaces / Projects).
//
// Studio capability names match harness: **Extract / Interact / Report** (not Chat).
// Per product-brand-gtm/SKILL.md pre-return checklist: "Studio use-case names.
// Extract / Interact / Report. Do not invent alternates."
function navTopFor(state) {
  // Logged-out: show Workspaces / Projects as DISABLED hints — visual scaffolding
  // for what's there once signed in. Active state: 'disabled'.
  if (state === 'loggedOut') return [
    { key: 'workspaces', label: 'Workspaces', initial: 'W', disabled: true },
    { key: 'projects', label: 'Projects', initial: 'P', disabled: true },
  ];
  return [
    { key: 'workspaces', label: 'Workspaces', initial: 'W' },
    { key: 'projects', label: 'Projects', initial: 'P' },
  ];
}
// Kept for backwards-compat with frames that still read NAV_TOP directly;
// reflects the logged-in state.
const NAV_TOP = navTopFor('free');

function navBottomFor(state) {
  // accountState: 'loggedOut' | 'free' | 'paid'
  // Logged out: only the consultative CTA + public Docs (no API Keys / Settings yet).
  // Free or paid: full set, with CTA flipping (sales call → support).
  const cta = (state === 'paid')
    ? { key: 'support', label: 'Get support', subLabel: 'docs · chat', initial: '?', kind: 'support' }
    : { key: 'call', label: 'Book a call', subLabel: '30 min with an engineer', initial: '★', kind: 'call', eyebrow: 'NEED HELP?' };
  const publicItems = [
    cta,
    { key: 'docs', label: 'Docs', initial: 'D' },
  ];
  if (state === 'loggedOut') return publicItems;
  return [
    ...publicItems,
    { key: 'settings', label: 'Settings', initial: '⚙' },
  ];
}

// ── Standalone MiniNav · used by frames that render their own ab-stage
// without AppShell. Keeps the nav consistent across every frame.
function MiniNav({ navState = 'minimal', navActive = 'workspaces', accountState = 'loggedOut', dimmed = false }) {
  const navWidth = navState === 'minimal' ? 48 : 180;
  const bottom = navBottomFor(accountState);
  const renderItem = (it) => {
    // Section header (small caps, no interaction)
    if (it.kind === 'section') {
      if (navState === 'minimal') {
        // Render as a small divider with an optional initial-style label tag
        return (
          <div key={it.key} style={{
            height: it.label ? 14 : 4, margin: '4px 0 2px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Kalam,cursive', fontSize: 8, fontWeight: 700,
            letterSpacing: 0.5, color: 'rgba(41,51,92,0.4)',
            borderTop: it.label ? 'none' : '1px solid rgba(41,51,92,0.12)',
          }}>{it.label}</div>
        );
      }
      return (
        <div key={it.key} style={{
          padding: it.label ? '6px 10px 2px' : '6px 0',
          fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700,
          letterSpacing: 0.5, color: 'rgba(41,51,92,0.5)',
          borderTop: it.label ? 'none' : '1px solid rgba(41,51,92,0.12)',
        }}>{it.label}</div>
      );
    }
    const isActive = it.key === navActive;
    const isCallCta = it.kind === 'call';
    const isDisabled = it.disabled;
    if (navState === 'minimal') {
      return (
        <div key={it.key} title={isDisabled ? 'Sign in to use' : undefined} className={isCallCta ? 'wf-accent-bg' : ''} style={{
          textAlign: 'center', padding: '6px 4px',
          fontFamily: 'Kalam,cursive', fontSize: 12,
          fontWeight: isActive || isCallCta ? 700 : 400,
          background: isActive ? 'var(--gx-cyan)' : isCallCta ? '#fff' : 'transparent',
          border: isActive ? '1px solid rgba(41,51,92,0.3)' : isCallCta ? '1px solid var(--gx-green)' : '1px solid transparent',
          borderRadius: 4,
          color: isCallCta ? 'var(--gx-navy)' : isDisabled ? 'rgba(41,51,92,0.3)' : isActive ? 'var(--gx-navy)' : 'rgba(41,51,92,0.55)',
          opacity: isDisabled ? 0.55 : 1,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
        }}>{it.initial}</div>
      );
    }
    if (isCallCta) {
      return (
        <div key={it.key} className="wf-accent-stroke" style={{
          padding: '8px 10px', fontFamily: 'Kalam,cursive',
          background: '#fff', border: '1.5px solid var(--gx-green)',
          borderRadius: 4, color: 'var(--gx-navy)',
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
      <div key={it.key} title={it.disabled ? 'Sign in to use' : undefined} style={{
        padding: '6px 10px',
        fontFamily: 'Kalam,cursive', fontSize: 12,
        fontWeight: isActive ? 700 : 400,
        background: isActive ? 'var(--gx-cyan)' : 'transparent',
        border: isActive ? '1px solid rgba(41,51,92,0.3)' : '1px solid transparent',
        borderRadius: 4,
        color: isActive ? 'var(--gx-navy)' : it.disabled ? 'rgba(41,51,92,0.35)' : 'rgba(41,51,92,0.7)',
        opacity: it.disabled ? 0.7 : 1,
        cursor: it.disabled ? 'not-allowed' : 'pointer',
        marginLeft: it.grouped ? 8 : 0,
        borderLeft: it.grouped ? '2px solid var(--gx-cyan)' : (isActive ? '1px solid rgba(41,51,92,0.3)' : '1px solid transparent'),
        paddingLeft: it.grouped ? 8 : 10,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {it.disabled && <span style={{ fontSize: 9, opacity: 0.6 }}>🔒</span>}
        {it.label}
      </div>
    );
  };
  return (
    <div style={{
      width: navWidth, height: '100%',
      borderRight: '1.5px solid var(--gx-navy)',
      background: '#f8f7f2',
      padding: navState === 'minimal' ? '10px 6px' : '12px 14px',
      boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 4,
      opacity: dimmed ? 0.5 : 1,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div className="wf-av gx" style={{ width: 22, height: 22, fontSize: 13 }}>G</div>
        {navState === 'full' && <div className="wf-h" style={{ fontSize: 18, lineHeight: 1 }}>GroundX</div>}
      </div>
      <div style={{ height: 1, background: 'rgba(41,51,92,0.12)', margin: '4px 0' }} />
      {navTopFor(accountState).map(renderItem)}
      <div style={{ flex: 1 }} />
      <div style={{ height: 1, background: 'rgba(41,51,92,0.12)', margin: '2px 0' }} />
      {bottom.map(renderItem)}
      {/* nav collapse toggle — matches AppShell */}
      <div style={{ paddingTop: 4 }}>
        <div style={{
          fontFamily: 'Kalam,cursive', fontSize: 14, color: 'rgba(41,51,92,0.45)',
          textAlign: navState === 'minimal' ? 'center' : 'right',
          cursor: 'pointer', padding: '4px 6px',
          borderTop: '1px solid rgba(41,51,92,0.1)',
        }}>
          {navState === 'minimal' ? '»' : '«'}
        </div>
      </div>
    </div>
  );
}

// ── App shell: sidebar + chat panel + canvas pane, drag-resizable. ──
// The right pane is the "canvas" — where docs, extractions, and briefs render.
// "Workspace" is no longer a nav label; it's the colloquial name for the
// whole app surface.
function AppShell({ navState = 'minimal', navActive = 'workspaces', accountState = 'loggedOut', chatWidth = 320, focus = 'split', children, dragHandleState }) {
  // focus: 'split' | 'chat' | 'canvas'  (legacy: 'workspace' alias accepted)
  const [chatNode, canvasNode] = React.Children.toArray(children);
  const navWidth = navState === 'minimal' ? 48 : 180;
  const focusEffective = focus === 'workspace' ? 'canvas' : focus;
  const navBottom = navBottomFor(accountState);

  const renderItem = (it) => {
    // Section header (small caps, no interaction)
    if (it.kind === 'section') {
      if (navState === 'minimal') {
        return (
          <div key={it.key} style={{
            height: it.label ? 14 : 4, margin: '4px 0 2px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Kalam,cursive', fontSize: 8, fontWeight: 700,
            letterSpacing: 0.5, color: 'rgba(41,51,92,0.4)',
            borderTop: it.label ? 'none' : '1px solid rgba(41,51,92,0.12)',
          }}>{it.label}</div>
        );
      }
      return (
        <div key={it.key} style={{
          padding: it.label ? '6px 10px 2px' : '6px 0',
          fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700,
          letterSpacing: 0.5, color: 'rgba(41,51,92,0.5)',
          borderTop: it.label ? 'none' : '1px solid rgba(41,51,92,0.12)',
        }}>{it.label}</div>
      );
    }
    const isActive = it.key === navActive;
    const isCallCta = it.kind === 'call';
    const isSupportCta = it.kind === 'support';
    const isCta = isCallCta || isSupportCta;

    // Consultative CTA (Chris mock framing): eyebrow + label + subLabel + arrow
    if (isCallCta && navState === 'full') {
      return (
        <div key={it.key} style={{
          padding: '8px 10px',
          background: '#fff',
          border: '1.5px solid var(--gx-green)',
          borderRadius: 4,
          fontFamily: 'Kalam,cursive',
          color: 'var(--gx-navy)',
          position: 'relative',
        }} className="wf-accent-stroke">
          {it.eyebrow && (
            <div style={{
              fontSize: 9, fontWeight: 700,
              letterSpacing: 0.6, textTransform: 'uppercase',
              color: 'var(--gx-green)',
              marginBottom: 3,
            }} className="wf-accent-text">{it.eyebrow}</div>
          )}
          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.15, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{it.label}</span>
            <span style={{ color: 'var(--gx-green)', fontSize: 11 }} className="wf-accent-text">→</span>
          </div>
          {it.subLabel && (
            <div style={{ fontSize: 10, color: 'rgba(41,51,92,0.6)', marginTop: 2, lineHeight: 1.2 }}>{it.subLabel}</div>
          )}
        </div>
      );
    }

    return (
      <div key={it.key} style={{
        fontFamily: 'Kalam,cursive', fontSize: 12,
        color: isActive ? 'var(--gx-navy)' : isSupportCta ? 'var(--gx-navy)' : 'rgba(41,51,92,0.65)',
        fontWeight: isActive ? 700 : 400,
        background: isActive ? 'var(--gx-cyan)' : 'transparent',
        padding: navState === 'minimal' ? '6px 4px' : '6px 10px',
        borderRadius: 4,
        textAlign: navState === 'minimal' ? 'center' : 'left',
        border: isActive ? '1px solid rgba(41,51,92,0.3)' : '1px solid transparent',
        minWidth: 0, position: 'relative',
      }}>
        {isSupportCta && navState === 'full' && (
          <span style={{
            fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700,
            color: 'rgba(41,51,92,0.55)', display: 'inline-block', marginRight: 4,
          }}>◇</span>
        )}
        {isCallCta && navState === 'minimal' && (
          <span className="wf-accent-text" style={{ color: 'var(--gx-green)', fontWeight: 700 }}>{it.initial}</span>
        )}
        {!(isCallCta && navState === 'minimal') && (navState === 'minimal' ? it.initial : it.label)}
      </div>
    );
  };

  return (
    <div className="ab-stage" style={{ background: '#fff' }}>
      <div className="ab-chrome">
        <i></i><i></i><i></i>
        <span>app.groundx.ai</span>
      </div>
      <div className="ab-body" style={{ display: 'flex' }}>
        {/* Sidebar nav — top:content / bottom:account */}
        <div style={{
          width: navWidth, height: '100%',
          borderRight: '1.5px solid var(--gx-navy)',
          background: '#f8f7f2',
          padding: navState === 'minimal' ? '10px 6px' : '12px 14px',
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: 4,
          transition: 'width 0.2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div className="wf-av gx" style={{ width: 22, height: 22, fontSize: 13 }}>G</div>
            {navState === 'full' && <div className="wf-h" style={{ fontSize: 18, lineHeight: 1 }}>GroundX</div>}
          </div>
          <div style={{ height: 1, background: 'rgba(41,51,92,0.12)', margin: '4px 0' }} />
          {/* PRIMARY — top (only when signed in) */}
          {navTopFor(accountState).map(renderItem)}
          {/* Flex spacer pushes the bottom group down */}
          <div style={{ flex: 1 }} />
          {/* ACCOUNT — bottom */}
          <div style={{ height: 1, background: 'rgba(41,51,92,0.12)', margin: '2px 0' }} />
          {navBottom.map(renderItem)}
          {/* nav collapse toggle — small icon */}
          <div style={{ paddingTop: 4 }}>
            <div style={{
              fontFamily: 'Kalam,cursive', fontSize: 14, color: 'rgba(41,51,92,0.45)',
              textAlign: navState === 'minimal' ? 'center' : 'right',
              cursor: 'pointer', padding: '4px 6px',
              borderTop: '1px solid rgba(41,51,92,0.1)',
            }}>
              {navState === 'minimal' ? '»' : '«'}
            </div>
          </div>
        </div>

        {/* Chat panel */}
        {focusEffective !== 'canvas' && (
          <>
            <div style={{
              width: focusEffective === 'chat' ? '50%' : chatWidth,
              height: '100%',
              boxSizing: 'border-box',
              background: '#fbfaf6',
              display: 'flex', flexDirection: 'column',
              minWidth: 0,
            }}>
              {chatNode}
            </div>
            <DragHandle orient="v" state={dragHandleState || 'default'} />
          </>
        )}

        {/* Canvas — right pane */}
        {focusEffective !== 'chat' && (
          <div style={{ flex: 1, height: '100%', background: '#fff', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {canvasNode}
          </div>
        )}
      </div>
    </div>
  );
}

// ── History widget (from C·v5) ──
function HistoryWidget({ items }) {
  return (
    <div>
      <div className="wf-label" style={{ marginBottom: 6 }}>HISTORY ({items.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => (
          <div key={i} className="wf-box wf-rough-lite" style={{
            padding: '5px 8px',
            background: it.active ? 'var(--gx-tint)' : '#fff',
            fontFamily: 'Kalam,cursive', fontSize: 11,
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ color: 'rgba(41,51,92,0.5)', fontSize: 10 }}>{it.time}</span>
              <span style={{ flex: 1, color: 'var(--gx-navy)' }}>{it.q}</span>
            </div>
            {it.ans && <div style={{ fontWeight: 700, marginTop: 2, color: 'var(--gx-navy)', fontSize: 11 }}>→ {it.ans}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Annotation list helper to put under an artboard inside the design canvas ──
// (Just a styled list of numbered callouts with explanations)
function CalloutList({ items, columns = 2 }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '8px 18px',
      padding: '14px 28px 20px', fontFamily: 'Kalam,cursive', fontSize: 12, color: 'var(--gx-navy)',
    }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{
            flexShrink: 0,
            width: 20, height: 20, borderRadius: 99,
            background: 'var(--gx-coral)', color: '#fff',
            border: '1.5px solid var(--gx-navy)',
            fontWeight: 700, fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{it.n}</div>
          <div style={{ lineHeight: 1.35 }}>
            <b>{it.title}.</b> {it.body}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  Callout, Dimension, StateLabel, DragHandle, PhaseStrip, ScenarioCard, SCENARIOS,
  CiteChip, CitePeek, AppShell, MiniNav, HistoryWidget, CalloutList,
  NAV_TOP, navTopFor, navBottomFor,
});
