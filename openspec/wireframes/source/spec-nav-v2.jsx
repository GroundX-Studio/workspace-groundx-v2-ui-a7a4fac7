// spec-nav-v2.jsx — new top-of-nav journey:
// Ingest → Understand → Studio (Extract · Interact · Report) → Integrate.
// All copy / proof anchored in groundx-studio-harness:product-brand-gtm.
// User constraint: F1 (Ingest landing) is NOT a chat surface yet — direct
// the user to pick a sample, upload, or connect. Chat arrives at F2 once a
// source is chosen.

// ── F1 · Ingest landing ──
// Canvas-only (no chat panel). 4 paths in: sample · upload · connect · email.
function Canvas_Ingest() {
  // Step strip — 4 main slots; slot 3 (Analyze) is a bracket containing 3 capability pills
  const STEPS = [
    { key: 'ingest', n: 1, label: 'Ingest' },
    { key: 'understand', n: 2, label: 'Understand' },
    { key: 'analyze', n: 3, label: 'Analyze', isAnalyzeGroup: true, subs: [
      { key: 'extract', label: 'Extract' },
      { key: 'interact', label: 'Interact' },
      { key: 'report', label: 'Report' },
    ] },
    { key: 'integrate', n: 4, label: 'Integrate' },
  ];
  const currentStepIdx = 0;
  const activeSubKey = null;

  // Capability badges — show which Studio capabilities each scenario demonstrates
  const CapBadges = ({ chapters }) => {
    const caps = [
      { key: 'extract', letter: 'E', name: 'Extract' },
      { key: 'interact', letter: 'I', name: 'Interact' },
      { key: 'report', letter: 'R', name: 'Report' },
    ];
    return (
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        {caps.map((c) => {
          const live = (chapters || {})[c.key] === 'live';
          return (
            <div key={c.key} title={c.name + (live ? ' · live in this sample' : ' · not in this sample')} className={live ? 'wf-accent-bg' : ''} style={{
              width: 18, height: 18, borderRadius: 4,
              fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: live ? 'var(--gx-green)' : '#fff',
              border: `1.5px solid ${live ? 'var(--gx-navy)' : 'rgba(41,51,92,0.25)'}`,
              color: live ? 'var(--gx-navy)' : 'rgba(41,51,92,0.4)',
            }}>{c.letter}</div>
          );
        })}
      </div>
    );
  };

  // Stylized brand glyphs for connectors (inline SVG · no trademarks)
  const Glyph = ({ kind }) => {
    if (kind === 'sharepoint') return (
      <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="9" cy="12" r="6" fill="#036ac4"/><circle cx="15" cy="12" r="4.5" fill="#1a93eb" fillOpacity="0.85"/></svg>
    );
    if (kind === 'onedrive') return (
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 16c-2 0-3-1.5-3-3.2 0-1.8 1.3-3 3-3.2.4-2.4 2.4-4 4.8-4 1.8 0 3.3 1 4 2.4.6-.4 1.4-.7 2.2-.7 2 0 3.6 1.3 3.9 3 1.6.1 2.6 1.4 2.6 2.9 0 1.5-1.2 2.8-2.8 2.8H5z" fill="#0364b8"/></svg>
    );
    if (kind === 'gdrive') return (
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 17l3-5h12l-3 5H3z" fill="#0f9d58"/><path d="M9 4l-6 13h6l6-13H9z" fill="#1da462"/><path d="M15 4l6 13h-6L9 4h6z" fill="#fbbc04"/></svg>
    );
    if (kind === 'dropbox') return (
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 4L1 7l5 3 5-3-5-3zm12 0l-5 3 5 3 5-3-5-3zM1 13l5 3 5-3-5-3-5 3zm17-3l-5 3 5 3 5-3-5-3zM6 18l5 3 5-3-5-3-5 3z" fill="#0061fe"/></svg>
    );
    if (kind === 'box') return (
      <svg viewBox="0 0 24 24" width="22" height="22"><rect x="2" y="6" width="20" height="13" rx="2" fill="#0061d5"/><text x="12" y="16" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff" fontFamily="sans-serif">BOX</text></svg>
    );
    if (kind === 's3') return (
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 5l7-2 7 2v14l-7 2-7-2V5z" fill="#e25444"/><path d="M5 5l7 2v14l-7-2V5z" fill="#7b1d13" fillOpacity="0.7"/></svg>
    );
    if (kind === 'slack') return (
      <svg viewBox="0 0 24 24" width="22" height="22"><rect x="5" y="10" width="6" height="4" fill="#36c5f0"/><rect x="13" y="10" width="6" height="4" fill="#2eb67d"/><rect x="10" y="5" width="4" height="6" fill="#ecb22e"/><rect x="10" y="13" width="4" height="6" fill="#e01e5a"/></svg>
    );
    if (kind === 'notion') return (
      <svg viewBox="0 0 24 24" width="22" height="22"><rect x="3" y="3" width="18" height="18" rx="2" fill="#fff" stroke="#000" strokeWidth="1.5"/><path d="M8 7v10M8 7l8 10M16 7v10" stroke="#000" strokeWidth="1.5" fill="none"/></svg>
    );
    return null;
  };

  return (
    <div className="ab">
      <div className="ab-title">F1 · Ingest · pick a source</div>
      <div className="ab-sub">
        First screen. Canvas-only — chat opens at F2 once a source is chosen. Step 1 of the 4-step journey visible at the top.
        <br/><br/>
        <b>Sign-up behaviour (applies everywhere, called out here because F1 is where it first surfaces):</b> the four <i>Sign up · …</i> CTAs in <b>BRING YOUR OWN</b> don't open a separate auth page. Tapping any of them triggers the <b>F1 → F2 transition animation</b> (nav + chat slide in) <i>and</i> loads the <b>F6 sign-up experience inline in the new chat</b>. Same three doors as F6 (email · SSO · book a call), context-aware preamble ("upload your docs · sign up first" etc.). The same pattern is used anywhere sign-up is required later in the flow — sign-up is always a chat moment, never a modal.
      </div>

      <div className="ab-stage" style={{ background: '#fff' }}>
        <div className="ab-chrome">
          <i></i><i></i><i></i>
          <span>app.groundx.ai/ingest</span>
        </div>
        <div className="ab-body" style={{ display: 'flex' }}>
          {/* F1: nav HIDDEN entirely — no sidebar so the demo gets the full width.
              Once user picks a source (F2), the nav + chat slide in from the left. */}
          <div style={{ flex: 1, padding: '20px 26px', height: '100%', boxSizing: 'border-box', overflow: 'auto', background: '#fff' }}>

          {/* Step strip — 4 slots; Analyze slot is a bracket containing 3 capability pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 18 }}>
            {STEPS.map((s, i) => {
              const done = i < currentStepIdx;
              const current = i === currentStepIdx;
              const todo = i > currentStepIdx;
              // Analyze slot: dashed bracket containing 3 sub-pills + "ANALYZE" label
              if (s.isAnalyzeGroup) {
                return (
                  <React.Fragment key={s.key}>
                    <div style={{
                      position: 'relative', padding: '14px 14px 6px',
                      border: '1.5px dashed rgba(41,51,92,0.4)', borderRadius: 14,
                      background: 'rgba(193,232,238,0.18)',
                      display: 'flex', gap: 4, alignItems: 'center',
                    }}>
                      <div style={{
                        position: 'absolute', top: -8, left: 12,
                        background: '#fff', padding: '0 8px',
                        fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700,
                        letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gx-navy)',
                      }}>ANALYZE</div>
                      {s.subs.map((sub) => {
                        const active = sub.key === activeSubKey;
                        const disabled = !active;
                        return (
                          <div key={sub.key} title={disabled ? 'Available after sign-in' : undefined} style={{
                            padding: '4px 12px',
                            background: active ? 'var(--gx-green)' : '#f7f6f1',
                            border: `1.5px dashed ${active ? 'var(--gx-navy)' : 'rgba(41,51,92,0.25)'}`,
                            borderStyle: active ? 'solid' : 'dashed',
                            borderRadius: 99,
                            fontFamily: 'Kalam,cursive', fontSize: 11.5,
                            color: active ? 'var(--gx-navy)' : 'rgba(41,51,92,0.45)',
                            fontWeight: active ? 700 : 500,
                            opacity: disabled ? 0.75 : 1,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }} className={active ? 'wf-accent-bg' : ''}>{sub.label}</div>
                        );
                      })}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div style={{ width: 16, height: 1.5, background: todo ? 'rgba(41,51,92,0.2)' : 'var(--gx-navy)' }} />
                    )}
                  </React.Fragment>
                );
              }
              // Normal step pill
              return (
                <React.Fragment key={s.key}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 14px',
                    background: current ? 'var(--gx-green)' : done ? 'var(--gx-tint)' : '#fff',
                    border: `1.5px solid ${todo ? 'rgba(41,51,92,0.25)' : 'var(--gx-navy)'}`,
                    borderRadius: 99,
                    color: todo ? 'rgba(41,51,92,0.5)' : 'var(--gx-navy)',
                    fontFamily: 'Kalam,cursive', fontSize: 12,
                    fontWeight: current ? 700 : 500,
                  }} className={current ? 'wf-accent-bg' : ''}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 99,
                      background: done || current ? 'var(--gx-navy)' : 'transparent',
                      color: '#fff', fontSize: 11, fontWeight: 700,
                      border: todo ? '1px solid rgba(41,51,92,0.4)' : 'none',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{done ? '✓' : s.n}</span>
                    {s.label}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ width: 16, height: 1.5, background: todo ? 'rgba(41,51,92,0.2)' : 'var(--gx-navy)' }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Header */}
          <div className="wf-h" style={{ fontSize: 34, color: 'var(--gx-navy)', lineHeight: 1 }}>Connect your data to GroundX.</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 14, color: 'rgba(41,51,92,0.7)', marginTop: 6 }}>
            GroundX works on the docs that break general-purpose AI — contracts, claims, policies, forms, technical diagrams. Try a sample, or bring your own (sign-up required).
          </div>

          {/* SAMPLES — with capability badges */}
          <div className="wf-label" style={{ marginTop: 22, marginBottom: 8 }}>TRY A SAMPLE · NO SIGN-UP</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[SCENARIOS.utility, SCENARIOS.loan, SCENARIOS.solar].map((s, i) => (
              <div key={s.key} className="wf-box wf-rough-lite" style={{
                padding: 12, background: '#fff',
                borderWidth: i === 0 ? 2 : 1.5,
                cursor: 'pointer', position: 'relative',
                minHeight: 118, boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column',
              }}>
                {i === 0 && (
                  <div className="wf-anno wf-accent-bg" style={{
                    position: 'absolute', top: -10, right: 12,
                    background: 'var(--gx-green)', border: '1.5px solid var(--gx-navy)',
                    padding: '1px 8px', borderRadius: 99,
                    fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700,
                  }}>★ start here</div>
                )}
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1, minHeight: 0 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Doc w={36} h={46} />
                    <div className="wf-accent-bg" style={{
                      position: 'absolute', bottom: -6, right: -6,
                      background: 'var(--gx-cyan)', border: '1.5px solid var(--gx-navy)',
                      borderRadius: 99, padding: '1px 6px',
                      fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700,
                    }}>{s.docCount}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="wf-h" style={{ fontSize: 17, lineHeight: 1.05, color: 'var(--gx-navy)' }}>{s.name}</div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, color: 'rgba(41,51,92,0.65)', marginTop: 2, lineHeight: 1.3 }}>{s.shortDesc}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'var(--gx-coral)', fontWeight: 700, flex: 1, lineHeight: 1.3 }}>
                    {s.demonstrates}
                  </div>
                  <CapBadges chapters={s.chapters} />
                </div>
              </div>
            ))}
          </div>

          {/* Cap legend */}
          <div style={{ marginTop: 8, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.65)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, color: 'rgba(41,51,92,0.75)' }}>capabilities demonstrated:</span>
            {[['E', 'Extract'], ['I', 'Interact'], ['R', 'Report']].map(([letter, name]) => (
              <span key={letter} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="wf-accent-bg" style={{
                  width: 14, height: 14, borderRadius: 3,
                  background: 'var(--gx-green)', border: '1.2px solid var(--gx-navy)',
                  fontSize: 8, fontWeight: 700, color: 'var(--gx-navy)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{letter}</span>
                {name}
              </span>
            ))}
            <span style={{ color: 'rgba(41,51,92,0.5)', fontStyle: 'italic' }}>hollow = not in this sample</span>
          </div>

          {/* BRING YOUR OWN — fully gated, with creative unlock CTAs */}
          <div style={{ marginTop: 22, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="wf-label" style={{ color: 'rgba(41,51,92,0.5)', margin: 0 }}>
              🔒 BRING YOUR OWN — SIGN UP FREE TO UNLOCK
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 9px',
              background: 'var(--gx-green)',
              border: '1.5px solid var(--gx-navy)',
              borderRadius: 99,
              fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700,
              color: 'var(--gx-navy)',
            }} className="wf-accent-bg" title="See ab-sub above for the full behaviour">
              <span>↳</span>
              <span>Sign up triggers F1→F2 transition + loads F6 gate inline in chat</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, position: 'relative' }}>
            {/* Diagonal stripe overlay to read as "disabled section" */}
            <div style={{
              position: 'absolute', inset: -4, pointerEvents: 'none',
              backgroundImage: 'repeating-linear-gradient(45deg, transparent 0, transparent 12px, rgba(41,51,92,0.04) 12px, rgba(41,51,92,0.04) 14px)',
              borderRadius: 6, zIndex: 0,
            }} />

            {/* Upload */}
            <div style={{
              padding: 12, height: 134, boxSizing: 'border-box',
              border: '2px dashed rgba(41,51,92,0.25)', borderRadius: 4,
              background: 'rgba(248,247,242,0.7)', cursor: 'not-allowed',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              position: 'relative', zIndex: 1,
              filter: 'grayscale(0.4)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 42, borderRadius: 4,
                  background: '#fff', border: '1.5px dashed rgba(41,51,92,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Kalam,cursive', fontSize: 18, fontWeight: 700, color: 'rgba(41,51,92,0.45)',
                }}>↑</div>
                <div>
                  <div className="wf-h" style={{ fontSize: 17, color: 'rgba(41,51,92,0.65)', lineHeight: 1.05 }}>Upload files</div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, color: 'rgba(41,51,92,0.5)', marginTop: 2 }}>
                    drag &amp; drop · PDF · DOCX · XLSX
                  </div>
                </div>
              </div>
              <div className="wf-btn wf-accent-stroke" style={{ fontSize: 11, justifyContent: 'center', padding: '5px 10px', background: '#fff', border: '1.5px solid var(--gx-green)', color: 'var(--gx-navy)' }}>
                <span className="wf-accent-text" style={{ color: 'var(--gx-green)' }}>↑</span>
                Sign up · upload your docs
              </div>
            </div>

            {/* Connectors */}
            <div style={{
              padding: 12, height: 134, boxSizing: 'border-box',
              border: '1.5px solid rgba(41,51,92,0.25)', borderRadius: 4,
              background: 'rgba(248,247,242,0.7)', cursor: 'not-allowed',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              position: 'relative', zIndex: 1,
              filter: 'grayscale(0.4)',
            }}>
              <div>
                <div className="wf-h" style={{ fontSize: 17, color: 'rgba(41,51,92,0.65)', lineHeight: 1.05 }}>Connect a source</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, color: 'rgba(41,51,92,0.5)', marginTop: 2 }}>
                  sync from where your docs live
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap', opacity: 0.7 }}>
                  {['sharepoint', 'onedrive', 'gdrive', 'dropbox', 'box', 's3', 'slack', 'notion'].map((k) => (
                    <div key={k} style={{
                      width: 24, height: 24, borderRadius: 4,
                      background: '#fff', border: '1px solid rgba(41,51,92,0.18)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Glyph kind={k} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="wf-btn wf-accent-stroke" style={{ fontSize: 11, justifyContent: 'center', padding: '5px 10px', background: '#fff', border: '1.5px solid var(--gx-green)', color: 'var(--gx-navy)' }}>
                <span className="wf-accent-text" style={{ color: 'var(--gx-green)' }}>⚡</span>
                Sign up · connect your sources
              </div>
            </div>
            {/* Email */}
            <div style={{
              padding: 12, height: 134, boxSizing: 'border-box',
              border: '1.5px solid rgba(41,51,92,0.25)', borderRadius: 4,
              background: 'rgba(248,247,242,0.7)', cursor: 'not-allowed',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              position: 'relative', zIndex: 1,
              filter: 'grayscale(0.4)',
            }}>
              <div>
                <div className="wf-h" style={{ fontSize: 17, color: 'rgba(41,51,92,0.65)', lineHeight: 1.05 }}>Email it in</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, color: 'rgba(41,51,92,0.5)', marginTop: 2 }}>
                  forward any doc · ingests itself
                </div>
                <div style={{
                  marginTop: 8, padding: '3px 8px',
                  background: 'rgba(255,255,255,0.7)',
                  border: '1px dashed rgba(41,51,92,0.3)',
                  fontFamily: '"JetBrains Mono", monospace', fontSize: 10, fontWeight: 700,
                  color: 'rgba(41,51,92,0.55)',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <span>✉</span> ingest@groundx.ai
                </div>
              </div>
              <div className="wf-btn wf-accent-stroke" style={{ fontSize: 11, justifyContent: 'center', padding: '5px 10px', background: '#fff', border: '1.5px solid var(--gx-green)', color: 'var(--gx-navy)' }}>
                <span className="wf-accent-text" style={{ color: 'var(--gx-green)' }}>✉</span>
                Sign up · email your docs
              </div>
            </div>

          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>
            <span style={{ fontSize: 14 }}>🔒</span>
            <span>Your docs are yours. GroundX never trains on uploaded content. Air-gapped on-prem available for regulated buyers.</span>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── F7 · Integrate landing ──
// Two entry paths:
//   (1) From F5 — user dismissed gate, clicked "Integrate" in the nav anyway.
//       Most actions locked; unlock banner pinned at top.
//   (2) From F6 — user signed in, gate dismissed, lands here as next-up.
//       Fully active. (Future logged-in variant lives in parking lot.)
// This wireframe shows path (1) — logged-out preview, locked affordances visible.
function Canvas_Integrate() {
  return (
    <div className="ab">
      <div className="ab-title">F7 · Integrate · wire GroundX into your stack</div>
      <div className="ab-sub">
        <b>How users get here:</b>
        <br/>· <b>From F4 / F5 / F6</b> — once the user has reached Extract, the onboarding step strip lights up Integrate as a clickable pill. Tapping it lands here at any time.
        <br/>· <b>Logged-out</b> (the only path specced for now) — they explored the demo, hit Integrate from the step strip without signing in. Lands here with most actions locked + unlock banner pinned. Extract + Interact show as ✓ traversed; Report stays disabled (never visited in this flow).
        <br/>· <b>Two doors:</b> API (curl + SDKs) · Agent plugins (Claude / Gemini / OpenAI / Cursor).
      </div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={320} focus="split">
        <>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
              <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Conversation</div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10 }}>
              <span style={{ color: 'rgba(41,51,92,0.5)' }}>sample:</span>
              <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>Utility Bill</span>
              <span className="wf-link" style={{ color: 'rgba(41,51,92,0.55)' }}>switch ▾</span>
            </div>
          </div>
          <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
            <div style={{
              padding: '6px 10px', margin: '0 0 10px', textAlign: 'center',
              fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.5)',
              borderTop: '1px dashed rgba(41,51,92,0.2)', borderBottom: '1px dashed rgba(41,51,92,0.2)',
            }}>
              <span className="wf-link">▾ earlier turns (reading · meters · 2 questions)</span>
            </div>
            <Bubble who="me">how do I run this from my own code?</Bubble>
            <Bubble who="gx" lead>
              <b>Two doors</b> on the right — pick the one that fits your stack.
              <div style={{ marginTop: 4, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>
                Code? <b>API</b>. Agent? <b>Plugins</b>.
              </div>
            </Bubble>
            <Bubble who="gx">
              Most actions need a sign-in. The <span className="wf-link">unlock everything</span> banner above the doors gets you there in one click.
            </Bubble>
          </div>
          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="ask anything…" />
          </div>
        </>

        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {/* Onboarding step strip — Integrate is the current step; Extract + Interact traversed, Report never reached */}
          <div style={{ padding: '10px 14px 12px', background: '#fafaf6', borderRadius: 6, marginBottom: 10 }}>
            <OnboardingStepStrip currentStepKey="integrate" doneSubKeys={['extract', 'interact']} />
          </div>

          {/* Unlock banner pinned at top (logged-out path) */}
          <div className="wf-box wf-rough-lite" style={{ marginBottom: 12, padding: 10, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gx-tint)' }}>
            <div style={{ fontSize: 14 }}>🔒</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700, flex: 1, color: 'var(--gx-navy)' }}>
              Locked behind sign-in:
              <span style={{ fontWeight: 400, color: 'rgba(41,51,92,0.75)', marginLeft: 6 }}>
                API key · plugin downloads · workspace
              </span>
            </div>
            <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 12 }}>unlock everything →</div>
          </div>

          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, minHeight: 0 }}>
            {/* 1 · API */}
            <div className="wf-box wf-rough-lite" style={{ padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
              <div className="wf-label" style={{ color: 'var(--gx-coral)' }}>1 · API</div>
              <div className="wf-h" style={{ fontSize: 18, color: 'var(--gx-navy)', lineHeight: 1, marginTop: 2 }}>Call it directly</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, color: 'rgba(41,51,92,0.65)', marginTop: 4 }}>REST + Python / TypeScript SDKs</div>
              <div className="wf-box" style={{ padding: '8px 10px', background: 'var(--gx-tint)', fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5, lineHeight: 1.45, color: 'var(--gx-navy)', marginTop: 10 }}>
                <span style={{ color: 'rgba(41,51,92,0.55)' }}># utility bill, your bucket</span><br/>
                from groundx import GroundX<br/>
                gx = GroundX(api_key=KEY)<br/>
                <b>gx.extract(</b>bucket="utility-bill"<b>)</b>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <div className="wf-btn ghost" style={{ fontSize: 10 }}>copy curl</div>
                <div className="wf-btn ghost" style={{ fontSize: 10 }}>Python</div>
                <div className="wf-btn ghost" style={{ fontSize: 10 }}>TS</div>
              </div>
              {/* API key · locked */}
              <div style={{ marginTop: 10, padding: 8, background: '#fafaf6', border: '1px dashed rgba(41,51,92,0.2)', borderRadius: 4, opacity: 0.7, filter: 'grayscale(0.3)' }}>
                <div className="wf-label" style={{ fontSize: 9, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  YOUR API KEY <span style={{ fontSize: 10 }}>🔒</span>
                </div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'rgba(41,51,92,0.45)' }}>
                  ███████████████████
                </div>
                <div style={{ marginTop: 4, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'var(--gx-coral)', fontWeight: 700 }}>sign in to reveal →</div>
              </div>
            </div>

            {/* 2 · Agent plugins */}
            <div className="wf-box wf-rough-lite" style={{ padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
              <div className="wf-label" style={{ color: 'var(--gx-coral)' }}>2 · AGENT PLUGINS</div>
              <div className="wf-h" style={{ fontSize: 18, color: 'var(--gx-navy)', lineHeight: 1, marginTop: 2 }}>Drop into your agent</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, color: 'rgba(41,51,92,0.65)', marginTop: 4 }}>MCP-based · zero-config tool calls</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
                {[
                  { name: 'Claude (Code / Cowork)', size: '2.1 MB' },
                  { name: 'OpenAI ChatGPT', size: '2.0 MB' },
                  { name: 'Gemini / Antigravity', size: '2.1 MB' },
                  { name: 'Cursor · Replit · OpenCode', size: '1.9 MB' },
                ].map((p, i) => (
                  <div key={i} className="wf-box wf-rough-lite" style={{
                    padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8,
                    background: '#fff', opacity: 0.7, filter: 'grayscale(0.3)', cursor: 'not-allowed',
                  }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: 'var(--gx-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: 'rgba(41,51,92,0.55)' }}>zip</div>
                    <div style={{ flex: 1, fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'rgba(41,51,92,0.65)' }}>{p.name}</div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.5)' }}>{p.size}</div>
                    <div style={{ fontSize: 10, color: 'rgba(41,51,92,0.4)' }}>🔒</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'var(--gx-coral)', fontWeight: 700 }}>sign in to download →</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'rgba(41,51,92,0.6)', marginTop: 6 }}>
                Each ships with a <span className="wf-link">Studio Harness</span> skill set.
              </div>
            </div>

            {/* 3 · Saved artifacts — removed; conversation belongs to the session, not a buyable artifact */}
          </div>

          {/* On-prem reminder */}
          <div className="wf-box wf-rough-lite" style={{ marginTop: 10, padding: 10, background: 'var(--gx-tint)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 16 }}>⛏</div>
            <div style={{ flex: 1, fontFamily: 'Kalam,cursive', fontSize: 11.5, color: 'var(--gx-navy)' }}>
              <b>Running on-prem or air-gapped?</b> GroundX deploys via Helm with a Red Hat OpenShift AI quickstart. <span className="wf-link">See the deployment guide</span>.
            </div>
          </div>
        </div>
      </AppShell>
    </div>
  );
}

// ── Shared OnboardingStepStrip · the bracketed 4-step journey
//    Use the same strip across F1 (Ingest), F2 (Understand), etc. so the user
//    sees consistent progress + capability surface throughout onboarding.
function OnboardingStepStrip({ currentStepKey = 'ingest', activeSubKey = null, doneSubKeys = [] }) {
  const STEPS = [
    { key: 'ingest', n: 1, label: 'Ingest' },
    { key: 'understand', n: 2, label: 'Understand' },
    { key: 'analyze', n: 3, label: 'Analyze', isAnalyzeGroup: true, subs: [
      { key: 'extract', label: 'Extract' },
      { key: 'interact', label: 'Interact' },
      { key: 'report', label: 'Report' },
    ] },
    { key: 'integrate', n: 4, label: 'Integrate' },
  ];
  const currentStepIdx = STEPS.findIndex((s) => s.key === currentStepKey);
  // Once Extract has been reached (user is in Analyze or later) every top-level
  // step in the nav becomes navigable — they can jump to Integrate from F4–F6,
  // back to Ingest, etc.
  const analyzeIdx = STEPS.findIndex((s) => s.isAnalyzeGroup);
  const navReachable = currentStepIdx >= analyzeIdx;
  // Sub-state for the Analyze subs is explicit only — Report never auto-checks
  // just because the user moved past Analyze, since this flow never visits it.
  const effectiveDoneSubs = new Set(doneSubKeys);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {STEPS.map((s, i) => {
        const done = i < currentStepIdx;
        const current = i === currentStepIdx;
        const todo = i > currentStepIdx;
        if (s.isAnalyzeGroup) {
          const groupActive = current;
          return (
            <React.Fragment key={s.key}>
              <div style={{
                position: 'relative', padding: '14px 14px 6px',
                border: `1.5px dashed ${groupActive ? 'var(--gx-navy)' : 'rgba(41,51,92,0.4)'}`,
                borderRadius: 14,
                background: groupActive ? 'rgba(193,232,238,0.4)' : 'rgba(193,232,238,0.18)',
                display: 'flex', gap: 4, alignItems: 'center',
              }}>
                <div style={{
                  position: 'absolute', top: -8, left: 12,
                  background: '#fff', padding: '0 8px',
                  fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700,
                  letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gx-navy)',
                }}>ANALYZE</div>
                {s.subs.map((sub) => {
                  const active = sub.key === activeSubKey;
                  const subDone = effectiveDoneSubs.has(sub.key) && !active;
                  const disabled = !active && !subDone;
                  return (
                    <div key={sub.key} title={disabled ? 'Available after sign-in' : subDone ? 'Traversed' : undefined} style={{
                      padding: '4px 10px 4px ' + (subDone ? '8px' : '12px'),
                      background: active ? 'var(--gx-green)' : subDone ? 'var(--gx-tint)' : '#f7f6f1',
                      border: '1.5px ' + (active || subDone ? 'solid var(--gx-navy)' : 'dashed rgba(41,51,92,0.25)'),
                      borderRadius: 99,
                      fontFamily: 'Kalam,cursive', fontSize: 11.5,
                      color: active || subDone ? 'var(--gx-navy)' : 'rgba(41,51,92,0.45)',
                      fontWeight: active ? 700 : subDone ? 600 : 500,
                      opacity: disabled ? 0.75 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }} className={active ? 'wf-accent-bg' : ''}>
                      {subDone && (
                        <span style={{
                          width: 14, height: 14, borderRadius: 99,
                          background: 'var(--gx-navy)', color: '#fff',
                          fontSize: 9, fontWeight: 700,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          lineHeight: 1,
                        }}>✓</span>
                      )}
                      {sub.label}
                    </div>
                  );
                })}
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 16, height: 1.5, background: todo ? 'rgba(41,51,92,0.2)' : 'var(--gx-navy)' }} />
              )}
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={s.key}>
            <div title={todo && navReachable ? 'Jump to ' + s.label : undefined} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px',
              background: current ? 'var(--gx-green)' : done ? 'var(--gx-tint)' : '#fff',
              border: `1.5px solid ${todo && !navReachable ? 'rgba(41,51,92,0.25)' : 'var(--gx-navy)'}`,
              borderRadius: 99,
              color: todo && !navReachable ? 'rgba(41,51,92,0.5)' : 'var(--gx-navy)',
              fontFamily: 'Kalam,cursive', fontSize: 12,
              fontWeight: current ? 700 : 500,
              cursor: todo && navReachable ? 'pointer' : todo ? 'not-allowed' : 'default',
            }} className={current ? 'wf-accent-bg' : ''}>
              <span style={{
                width: 20, height: 20, borderRadius: 99,
                background: done || current || (todo && navReachable) ? 'var(--gx-navy)' : 'transparent',
                color: '#fff', fontSize: 11, fontWeight: 700,
                border: todo && !navReachable ? '1px solid rgba(41,51,92,0.4)' : 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{done ? '✓' : s.n}</span>
              {s.label}
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 16, height: 1.5, background: todo && !navReachable ? 'rgba(41,51,92,0.2)' : 'var(--gx-navy)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

Object.assign(window, { Canvas_Ingest, Canvas_Integrate, Canvas_Transition, Canvas_TransitionToExtract, Canvas_TransitionToField, OnboardingStepStrip });

// ── F3→F4 transition · breadcrumb appears, panes shrink to make room ──
// User clicks a field card (peak_demand_kw) on F3 → F4 expanded view opens.
// Choreography:
//   1. Field card on F3 pulses (acks the click)
//   2. Breadcrumb row "← all fields › meters · #3 › peak_demand_kw" + collapse/open-doc
//      buttons slide DOWN into place above the panes (24px tall)
//   3. PDF viewer + provenance panel compress vertically to fit
//   4. The selected demand-summary region animates to the lit/98% state inside the PDF
//   5. Provenance panel content cross-fades from "fields list" to "field detail"
function Canvas_TransitionToField() {
  return (
    <div className="ab">
      <div className="ab-title">F3 → F4 · transition · question lands, breadcrumb drops in</div>
      <div className="ab-sub">
        User asks <code>"how did you get 16.2 kW?"</code> in chat — the <b>step strip flips from Extract to Interact</b> here, because the first chat question after extraction is what transitions the user from "looking at structured data" to "asking grounded questions." The assistant's answer triggers F4. Field click is a secondary entry.
      </div>

      <div className="ab-stage" style={{ background: '#fff' }}>
        <div className="ab-chrome">
          <i></i><i></i><i></i>
          <span>app.groundx.ai/analyze/extract → /analyze/extract/peak_demand_kw</span>
        </div>
        <div className="ab-body" style={{ display: 'flex' }}>
          <MiniNav navState="full" navActive={null} accountState="loggedOut" />
          <div style={{ width: 280, borderRight: '1.5px solid var(--gx-navy)', background: '#fbfaf6', padding: 14, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            <div className="wf-h" style={{ fontSize: 14 }}>Conversation</div>
            <div style={{
              padding: '6px 10px', margin: '6px 0 8px', textAlign: 'center',
              fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.5)',
              borderTop: '1px dashed rgba(41,51,92,0.2)', borderBottom: '1px dashed rgba(41,51,92,0.2)',
            }}>▾ earlier turns (reading · 6 thinking notes · Done · meters)</div>
            <div className="bub me" style={{ marginTop: 8, fontSize: 11 }}>meters</div>
            <div className="bub gx lead" style={{ marginTop: 4, fontSize: 11 }}>8 meters · 10 fields each. Hover a meter on the right → I'll light up its rows on the doc.</div>
            <div className="bub gx" style={{ marginTop: 6, fontSize: 11 }}>
              Or another view: <span className="opt">statement</span> <span className="opt">charges</span> <span className="opt">compare two meters</span> <span className="opt">edit schema</span>
            </div>
            <div style={{
              padding: '4px 8px', marginTop: 6, textAlign: 'center',
              fontFamily: 'Caveat,cursive', fontSize: 12,
              color: 'var(--gx-coral)', opacity: 0.7,
            }}>↻ chips animating out…</div>
            <div className="bub me" style={{ marginTop: 8, fontSize: 11 }}>how did you get 16.2 kW?</div>
            <div className="bub gx lead" style={{ marginTop: 4, fontSize: 11, opacity: 0.65 }}>
              <b>Pulled from the demand summary box on page 1.</b>…
            </div>
          </div>

          {/* Canvas — mid-transition */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
            {/* Step strip pinned at top */}
            <div style={{ padding: '10px 18px 12px', background: '#fafaf6', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
              <OnboardingStepStrip currentStepKey="analyze" activeSubKey="extract" />
            </div>

            {/* Breadcrumb · mid-slide-down */}
            <div style={{
              padding: '6px 18px',
              display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: 'Kalam,cursive', fontSize: 11,
              background: 'rgba(241,239,233,0.6)',
              borderBottom: '1px solid rgba(41,51,92,0.08)',
              transform: 'translateY(-30%)',
              opacity: 0.6,
              transition: 'transform 0.22s ease-out, opacity 0.22s ease-out',
            }}>
              <span className="wf-link" style={{ color: 'rgba(41,51,92,0.7)' }}>← all fields</span>
              <span style={{ color: 'rgba(41,51,92,0.4)' }}>›</span>
              <span style={{ color: 'rgba(41,51,92,0.7)' }}>meters · #3</span>
              <span style={{ color: 'rgba(41,51,92,0.4)' }}>›</span>
              <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>peak_demand_kw</span>
              <div style={{ flex: 1 }} />
              <div className="wf-btn ghost" style={{ fontSize: 10 }}>▴ collapse</div>
              <div className="wf-btn ghost" style={{ fontSize: 10 }}>↗ open full doc</div>
            </div>

            {/* Two-pane mid-shrink */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12, padding: 12, height: 'calc(100% - 110px)', boxSizing: 'border-box' }}>
              {/* PDF viewer · shrinking vertically · the region pulses */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 14px',
                  background: 'var(--gx-navy)', color: '#fff',
                  borderRadius: '4px 4px 0 0',
                  fontFamily: 'Kalam,cursive', fontSize: 11,
                }}>
                  <span style={{ fontWeight: 700 }}>utility-bill.pdf</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ opacity: 0.65 }}>‹</span>
                  <span style={{ fontWeight: 700 }}>page 1 of 3</span>
                  <span style={{ opacity: 0.65 }}>›</span>
                </div>
                <div style={{
                  flex: 1, background: '#fff',
                  border: '1.5px solid var(--gx-navy)', borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  padding: 22, boxSizing: 'border-box',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ height: 12, width: '32%', background: 'rgba(41,51,92,0.65)', borderRadius: 2 }} />
                    <div style={{ height: 8, width: '20%', background: 'rgba(41,51,92,0.25)', borderRadius: 2 }} />
                  </div>
                  <div style={{ height: 4, width: '60%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 4 }} />
                  <div style={{ height: 4, width: '70%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 10 }} />

                  {/* Region · pulsing into the lit 98% state */}
                  <div style={{
                    padding: 8, background: 'var(--gx-green)',
                    border: '2px solid var(--gx-navy)',
                    boxShadow: '0 0 0 6px rgba(161,236,131,0.55)',
                    position: 'relative', marginBottom: 10,
                    animation: 'regionPulse 1.2s ease-out',
                  }} className="wf-accent-bg">
                    <div className="wf-label" style={{ position: 'absolute', top: -8, left: 8, background: '#fff', padding: '0 4px', fontSize: 9 }}>match · 98%</div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700, color: 'var(--gx-navy)' }}>METER 3 · DEMAND SUMMARY</div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'var(--gx-navy)', marginTop: 2 }}>
                      Peak kW · <b>16.2</b>
                    </div>
                  </div>

                  <div style={{ height: 4, width: '55%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 4 }} />
                  <div style={{ height: 4, width: '75%', background: 'rgba(41,51,92,0.15)', borderRadius: 99 }} />
                </div>
              </div>

              {/* Right panel · cross-fade · 50% fields list / 50% provenance */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px',
                  background: 'var(--gx-navy)', color: '#fff',
                  borderRadius: '4px 4px 0 0',
                  fontFamily: 'Kalam,cursive', fontSize: 11,
                }}>
                  <span style={{ fontWeight: 700 }}>Field provenance</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ opacity: 0.65 }}>peak_demand_kw</span>
                </div>
                <div style={{
                  flex: 1, background: '#fff',
                  border: '1.5px solid var(--gx-navy)', borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* Fading-out: fields list */}
                  <div style={{
                    position: 'absolute', inset: 0, padding: 12,
                    opacity: 0.45,
                    transition: 'opacity 0.22s ease-out',
                  }}>
                    {['meter_id', 'service_type', 'peak_demand_kw', 'energy_on_peak_kwh'].map((k, i) => (
                      <div key={k} className="wf-box wf-rough-lite" style={{ padding: '5px 8px', marginBottom: 4, background: k === 'peak_demand_kw' ? 'var(--gx-green)' : '#fff' }}>
                        <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.3, textTransform: 'uppercase' }}>{k}</div>
                      </div>
                    ))}
                  </div>
                  {/* Fading-in: field detail */}
                  <div style={{
                    position: 'absolute', inset: 0, padding: 14,
                    opacity: 0.55,
                    transition: 'opacity 0.22s ease-out',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <div style={{ fontSize: 9, color: 'rgba(41,51,92,0.5)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive' }}>FIELD</div>
                      <div className="wf-h" style={{ fontSize: 14, color: 'var(--gx-navy)' }}>peak_demand_kw</div>
                    </div>
                    <div className="wf-h" style={{ fontSize: 32, color: 'var(--gx-navy)', lineHeight: 1, marginTop: 6 }}>16.2</div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.7)', marginTop: 2 }}>kW · float</div>
                  </div>
                </div>
              </div>

              {/* Annotation arrows */}
              <svg className="wf-anno" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }} width="100%" height="100%">
                <defs>
                  <marker id="trans2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                    <path d="M0,0 L9,5 L0,10 z" fill="var(--gx-coral)" />
                  </marker>
                </defs>
                {/* breadcrumb slides down */}
                <g>
                  <text x="40%" y="14%" fontFamily="Caveat,cursive" fontSize="13" fontWeight="700" fill="var(--gx-coral)">breadcrumb slides down ↓</text>
                  <path d="M 56% 17% L 56% 24%" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" markerEnd="url(#trans2-arr)" />
                </g>
                {/* region pulses */}
                <g>
                  <text x="22%" y="55%" fontFamily="Caveat,cursive" fontSize="13" fontWeight="700" fill="var(--gx-coral)">region pulses to 98%</text>
                </g>
                {/* right panel cross-fades */}
                <g>
                  <text x="74%" y="55%" fontFamily="Caveat,cursive" fontSize="13" fontWeight="700" fill="var(--gx-coral)" textAnchor="middle">fields → detail · cross-fade</text>
                </g>
              </svg>

              <style>{`
                @keyframes regionPulse {
                  0% { box-shadow: 0 0 0 0 rgba(161,236,131,0); }
                  60% { box-shadow: 0 0 0 8px rgba(161,236,131,0.7); }
                  100% { box-shadow: 0 0 0 6px rgba(161,236,131,0.55); }
                }
              `}</style>
            </div>
          </div>
        </div>
      </div>

      {/* Timing notes */}
      <div className="wf-box wf-rough-lite" style={{ marginTop: 14, padding: 12, background: '#fff' }}>
        <div className="wf-label" style={{ marginBottom: 6 }}>TIMING + BEHAVIOR</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontFamily: 'Kalam,cursive', fontSize: 11.5, lineHeight: 1.4 }}>
          <div>
            <div className="wf-h" style={{ fontSize: 14 }}>Beat 1 · Answer streams</div>
            <div>user types "how did you get 16.2 kW?" · assistant bubble streams in · the answer carries a reference to <code>peak_demand_kw</code> that drives the next two beats</div>
          </div>
          <div>
            <div className="wf-h" style={{ fontSize: 14 }}>Beat 2 · Breadcrumb drops in</div>
            <div>new ~32px row slides in from <code>translateY(-100%)</code> → <code>0</code> above the panes · 220ms ease-out · panes shrink vertically to compensate</div>
          </div>
          <div>
            <div className="wf-h" style={{ fontSize: 14 }}>Beat 3 · Region + panel sync</div>
            <div>page region pulses to lit 98% state (1.2s) · right panel cross-fades from fields-list to field-detail (220ms) · breadcrumb finishes settle</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── F2→F3 transition · scan completes, PDF shrinks, fields slide in ──
// Three-beat choreography:
//   1. Scan line completes its last sweep, the "thinking" notes finish,
//      "Done" bubble appears in chat.
//   2. PDF viewer compresses horizontally from full-width (or centered max
//      560px) to 1.2fr of a 2-col grid · 240ms ease-out
//   3. Fields panel slides in from the right edge · same 240ms · landing as
//      the 1fr column · field cards stagger-fade-in 60ms apart
function Canvas_TransitionToExtract() {
  return (
    <div className="ab">
      <div className="ab-title">F2 → F3 · transition · scan completes, PDF shrinks, fields appear</div>
      <div className="ab-sub">
        Three-beat choreography. <b>Beat 1:</b> scan line completes, "Done. 3 pages · 20 statement fields · 8 meters · 56 charges" lands in chat with a "pick a view" options row. <b>Beat 2:</b> user taps "meters" — the chips animate out (fade + slide-up, 200ms ease-out, collapsing the bubble); the progress bar collapses upward; PDF viewer rises + compresses horizontally. <b>Beat 3:</b> fields panel slides in from the right; cards stagger-fade-in 60ms apart.
        <br/><br/>
        <b>Universal behavior:</b> pick-a-view chip rows collapse the moment a pick is made. The picked label appears as a user bubble; the chip row fades out (200ms) and is removed from history. Subsequent "Or another view" rows behave the same way.
      </div>

      <div className="ab-stage" style={{ background: '#fff' }}>
        <div className="ab-chrome">
          <i></i><i></i><i></i>
          <span>app.groundx.ai/understand → /analyze/extract</span>
        </div>
        <div className="ab-body" style={{ display: 'flex' }}>
          <MiniNav navState="full" navActive={null} accountState="loggedOut" />
          {/* Chat rail – unchanged across the transition */}
          <div style={{ width: 280, borderRight: '1.5px solid var(--gx-navy)', background: '#fbfaf6', padding: 14, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            <div className="wf-h" style={{ fontSize: 14 }}>Conversation</div>
            <div className="bub gx lead" style={{ marginTop: 8, fontSize: 11 }}>
              <b>Done.</b> 3 pages · 20 statement fields · 8 meters · 56 charges. Ready to analyze.
            </div>
            <div className="bub gx" style={{ marginTop: 6, fontSize: 11 }}>
              Pick a view: <span className="opt">statement</span> <span className="opt hot">meters</span> <span className="opt">charges</span> <span className="opt">edit schema</span>
            </div>
            <div className="bub me" style={{ marginTop: 8, fontSize: 11 }}>meters</div>
            <div className="bub gx lead" style={{ marginTop: 8, fontSize: 11, opacity: 0.55 }}>
              <b>8 meters · 10 fields each.</b> Hover a meter on the right → I'll light up its rows on the doc.
            </div>
            <div style={{
              padding: '4px 8px', marginTop: 6, textAlign: 'center',
              fontFamily: 'Caveat,cursive', fontSize: 12,
              color: 'var(--gx-coral)', opacity: 0.7,
            }}>↻ pick-a-view chips animating out…</div>
          </div>

          {/* Canvas — mid-transition: PDF compressing left, fields sliding in right */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
            {/* Step strip pinned at top */}
            <div style={{ padding: '10px 18px 12px', background: '#fafaf6', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
              <OnboardingStepStrip currentStepKey="analyze" activeSubKey="extract" />
            </div>

            {/* Two-pane mid-flight */}
            <div style={{ display: 'flex', height: 'calc(100% - 70px)', padding: 12, gap: 12, boxSizing: 'border-box', position: 'relative' }}>
              {/* PDF viewer — mid-compress (between full-width and 1.2fr) */}
              <div style={{
                flex: '1.6 1 0', display: 'flex', flexDirection: 'column', minWidth: 0,
                transition: 'flex 0.24s ease-out',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px',
                  background: 'var(--gx-navy)', color: '#fff',
                  borderRadius: '4px 4px 0 0',
                  fontFamily: 'Kalam,cursive', fontSize: 11,
                }}>
                  <span style={{ fontWeight: 700 }}>utility-bill.pdf</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ opacity: 0.65 }}>‹</span>
                  <span style={{ fontWeight: 700 }}>page 1 of 3</span>
                  <span style={{ opacity: 0.65 }}>›</span>
                </div>
                <div style={{
                  flex: 1, background: '#fff',
                  border: '1.5px solid var(--gx-navy)', borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  padding: 22, boxSizing: 'border-box',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* Page content with scan animation completing */}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ height: 12, width: '32%', background: 'rgba(41,51,92,0.65)', borderRadius: 2 }} />
                    <div style={{ height: 8, width: '20%', background: 'rgba(41,51,92,0.25)', borderRadius: 2 }} />
                  </div>
                  <div style={{ height: 4, width: '60%', background: 'rgba(41,51,92,0.18)', borderRadius: 99, marginBottom: 4 }} />
                  <div style={{ height: 4, width: '70%', background: 'rgba(41,51,92,0.18)', borderRadius: 99, marginBottom: 12 }} />
                  <div style={{ border: '1px solid rgba(41,51,92,0.2)', padding: 6 }}>
                    {[0,1,2,3,4].map((row) => (
                      <div key={row} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                        <div style={{ height: 3, flex: 2, background: 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
                        <div style={{ height: 3, flex: 1, background: 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
                        <div style={{ height: 3, flex: 1, background: 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
                      </div>
                    ))}
                  </div>
                  {/* Faint cyan wash · entire page scanned */}
                  <div className="wf-accent-bg" style={{
                    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                    background: 'linear-gradient(180deg, rgba(193,232,238,0.18), rgba(193,232,238,0.06))',
                    pointerEvents: 'none',
                  }} />
                  {/* Scan line · at bottom of page · fading out */}
                  <div className="wf-accent-bg" style={{
                    position: 'absolute', left: 0, right: 0, top: '95%',
                    height: 2,
                    background: 'linear-gradient(90deg, transparent, var(--gx-green), var(--gx-cyan), var(--gx-green), transparent)',
                    boxShadow: '0 0 16px rgba(161,236,131,0.6)',
                    opacity: 0.6,
                  }} />
                </div>
              </div>

              {/* Fields panel — mid-slide in from the right */}
              <div style={{
                flex: '0.85 1 0', minWidth: 0,
                display: 'flex', flexDirection: 'column',
                transform: 'translateX(35%)',
                opacity: 0.4,
                transition: 'transform 0.24s ease-out, opacity 0.24s ease-out',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px',
                  background: 'var(--gx-navy)', color: '#fff',
                  borderRadius: '4px 4px 0 0',
                  fontFamily: 'Kalam,cursive', fontSize: 11,
                }}>
                  <span style={{ fontWeight: 700 }}>Extracted fields</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ opacity: 0.85, fontWeight: 700 }}>JSON ▾</span>
                </div>
                <div style={{
                  flex: 1, background: '#fff',
                  border: '1.5px solid var(--gx-navy)', borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  padding: 12,
                }}>
                  {/* Field cards · stagger-fade-in */}
                  {[
                    { k: 'meter_id', v: '#3', delay: 0 },
                    { k: 'service_type', v: 'commercial · TOU-B-3', delay: 60 },
                    { k: 'peak_demand_kw', v: '16.2', delay: 120 },
                    { k: 'energy_on_peak_kwh', v: '892', delay: 180 },
                    { k: 'energy_off_peak_kwh', v: '—', delay: 240 },
                  ].map((f, i) => (
                    <div key={i} className="wf-box wf-rough-lite" style={{
                      padding: '5px 8px', marginBottom: 4,
                      background: '#fff', opacity: i < 3 ? 1 : 0.35,
                    }}>
                      <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.3, textTransform: 'uppercase' }}>{f.k}</div>
                      <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700, color: 'var(--gx-navy)', marginTop: 1 }}>{f.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Annotation arrows · mid-flight indicators */}
              <svg className="wf-anno" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width="100%" height="100%">
                <defs>
                  <marker id="trans-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                    <path d="M0,0 L9,5 L0,10 z" fill="var(--gx-coral)" />
                  </marker>
                </defs>
                {/* PDF compresses left arrow */}
                <g>
                  <path d="M 56% 50% L 50% 50%" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" markerEnd="url(#trans-arr)" />
                  <text x="58%" y="45%" fontFamily="Caveat,cursive" fontSize="13" fontWeight="700" fill="var(--gx-coral)">PDF compresses ←</text>
                </g>
                {/* Fields slide in from right */}
                <g>
                  <path d="M 78% 30% L 65% 30%" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" markerEnd="url(#trans-arr)" />
                  <text x="65%" y="24%" fontFamily="Caveat,cursive" fontSize="13" fontWeight="700" fill="var(--gx-coral)">fields slide in ←</text>
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Timing notes */}
      <div className="wf-box wf-rough-lite" style={{ marginTop: 14, padding: 12, background: '#fff' }}>
        <div className="wf-label" style={{ marginBottom: 6 }}>TIMING + BEHAVIOR</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontFamily: 'Kalam,cursive', fontSize: 11.5, lineHeight: 1.4 }}>
          <div>
            <div className="wf-h" style={{ fontSize: 14 }}>Beat 1 · Scan completes</div>
            <div>last scan-line sweep · "Done. 3 pages · 20 statement fields · 8 meters · 56 charges" + options row land in chat · ~200ms</div>
          </div>
          <div>
            <div className="wf-h" style={{ fontSize: 14 }}>Beat 2 · PDF rises &amp; compresses</div>
            <div>progress bar collapses upward (was on F2, gone on F3) · PDF viewer slides up + shrinks from full-width centered to <code>flex: 1.2</code> · 240ms ease-out · faint cyan wash stays on the page</div>
          </div>
          <div>
            <div className="wf-h" style={{ fontSize: 14 }}>Beat 3 · Fields appear</div>
            <div>panel slides in from <code>translateX(100%)</code> → <code>0</code> · 240ms · field cards stagger-fade-in 60ms apart as each value lands</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── F1→F2 transition · nav + chat slide open ──
// Mid-animation snapshot: user just picked a sample on F1. Nav slides in from
// the left at the same time the chat panel slides in from the right. Both
// arrive together; the canvas content (was full-width) compresses to make room.
function Canvas_Transition() {
  return (
    <div className="ab">
      <div className="ab-title">F1 → F2 · transition · nav expands, then chat, then canvas reveals</div>
      <div className="ab-sub">Three-beat choreography: <b>1.</b> nav slides in from the left (180px). <b>2.</b> chat slides in beyond it (320px). <b>3.</b> canvas content fades up as the model starts to comprehend the doc — page silhouette appears first, then Semantic Object regions light up sequentially, then the educational bullets stream in.</div>

      <div className="ab-stage" style={{ background: '#fff' }}>
        <div className="ab-chrome">
          <i></i><i></i><i></i>
          <span>app.groundx.ai/ingest → /understand</span>
        </div>
        <div className="ab-body" style={{ display: 'flex', position: 'relative', overflow: 'hidden' }}>
          {/* Sidebar — sliding in from left, mid-animation (showing at ~50%) */}
          <div style={{
            width: 180, height: '100%',
            borderRight: '1.5px solid var(--gx-navy)',
            background: '#f8f7f2',
            transform: 'translateX(-50%)',
            opacity: 0.55,
            transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
          }}>
            <div style={{ padding: '12px 14px', fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)' }}>
              <div className="wf-h" style={{ fontSize: 14 }}>GroundX</div>
              <div style={{ marginTop: 10, fontSize: 10, opacity: 0.7 }}>· Workspaces 🔒</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>· Projects 🔒</div>
            </div>
          </div>

          {/* Chat panel — sliding in from LEFT (sits beside nav), mid-animation (~50%) */}
          <div style={{
            width: 320, height: '100%',
            borderRight: '1.5px solid var(--gx-navy)',
            background: '#fbfaf6',
            transform: 'translateX(-50%)',
            opacity: 0.55,
            transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
            padding: 14, boxSizing: 'border-box',
          }}>
            <div className="wf-h" style={{ fontSize: 14 }}>Conversation</div>
            <div className="bub gx lead" style={{ marginTop: 8, fontSize: 11 }}>
              Reading the bill — about 6 seconds.
            </div>
          </div>

          {/* Center canvas — Understand frame coming into focus */}
          <div style={{ flex: 1, padding: 16, background: '#fbfaf6', opacity: 0.85 }}>
            <div className="wf-h" style={{ fontSize: 20, color: 'var(--gx-navy)' }}>Utility Bill · understanding…</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)', marginTop: 4 }}>
              vision model · semantic objects · pixel-level provenance
            </div>
            <div style={{ marginTop: 14, height: 6, borderRadius: 99, background: 'rgba(41,51,92,0.12)', position: 'relative', overflow: 'hidden' }}>
              <div className="wf-accent-bg" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '35%', background: 'var(--gx-green)' }} />
            </div>
            <RBox w="100%" h={200} fill="fill" style={{ marginTop: 12 }}>
              <div style={{ padding: 12, opacity: 0.4 }}>
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '80%' }} />
                <div className="wf-line dim" />
              </div>
            </RBox>
          </div>

          {/* Chat panel relocated above — was here mistakenly */}

          {/* Annotation arrows — both slides come from the left */}
          <svg className="wf-anno" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width="100%" height="100%">
            <defs>
              <marker id="slide-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                <path d="M0,0 L9,5 L0,10 z" fill="var(--gx-coral)" />
              </marker>
            </defs>
            <g>
              <text x="22" y="40" fontFamily="Caveat,cursive" fontSize="16" fontWeight="700" fill="var(--gx-coral)">nav + chat slide in from the left →</text>
              <path d="M 20 60 L 480 60" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" markerEnd="url(#slide-arr)" />
            </g>
            <g opacity="0.6">
              <text x="72%" y="50%" textAnchor="middle" fontFamily="Caveat,cursive" fontSize="14" fill="var(--gx-coral)">canvas compresses ⇒</text>
            </g>
          </svg>
        </div>
      </div>

      {/* Timing + behavior notes */}
      <div className="wf-box wf-rough-lite" style={{ marginTop: 14, padding: 12, background: '#fff' }}>
        <div className="wf-label" style={{ marginBottom: 6 }}>TIMING + BEHAVIOR</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontFamily: 'Kalam,cursive', fontSize: 11.5, lineHeight: 1.4 }}>
          <div>
            <div className="wf-h" style={{ fontSize: 14 }}>Beat 1 · Nav</div>
            <div>slides from <code>translateX(-100%)</code> → <code>0</code> · 200ms ease-out · disabled top items (Workspaces / Projects) visible but locked</div>
          </div>
          <div>
            <div className="wf-h" style={{ fontSize: 14 }}>Beat 2 · Chat</div>
            <div>starts ~100ms after nav · slides from <code>translateX(-100%)</code> → <code>0</code> behind nav, lands at 320px next to it · 200ms ease-out</div>
          </div>
          <div>
            <div className="wf-h" style={{ fontSize: 14 }}>Beat 3 · Canvas reveal</div>
            <div>starts when chat lands · page silhouette fades in (150ms) → Semantic Object regions cascade-highlight one by one (80ms stagger) → educational bullets type in</div>
          </div>
        </div>
      </div>
    </div>
  );
}