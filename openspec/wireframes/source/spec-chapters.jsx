// spec-chapters.jsx — capability chapter system (per Matt mock).
// 4 chapters: Understand → Extract → Chat → Report. "Understand" is the
// processing/educational phase. The other 3 are the core capabilities we
// highlight throughout the experience. Each scenario marks which chapters
// are live vs grayed — establishing the upgrade surface.

// ── Capability data ──
const CAPABILITIES = [
  {
    key: 'understand',
    n: 1, name: 'Understand',
    short: 'parse + index',
    body: 'closes the document comprehension gap · visual parsing + agentic enrichment + hybrid index',
    educateNotes: [
      'Vision model on the page — fine-tuned on 1M+ enterprise documents',
      'Tables, figures, hierarchy preserved as Semantic Objects',
      'Agentic enrichment — focused agents reason about each element',
      'Hybrid index ready · Pixel-Level Provenance on every chunk',
    ],
  },
  {
    key: 'extract',
    n: 2, name: 'Extract',
    short: 'pull structured data',
    body: 'tables, fields, JSON · each cell cited back to source',
  },
  {
    key: 'interact',
    n: 3, name: 'Interact',
    short: 'grounded chat',
    body: 'questions get answers with citations · cross-doc when needed',
  },
  {
    key: 'report',
    n: 4, name: 'Report',
    short: 'compose briefs',
    body: 'narrative summaries · IC briefs · risk roll-ups · all cited',
  },
];

// ── Chapter card styling helpers (status: live | active | done | grayed | locked)
function _chapterStyle(status, isActive) {
  if (isActive) return { bg: '#fff', border: 'var(--gx-green)', borderW: 2, text: 'var(--gx-navy)', barBg: 'rgba(161,236,131,0.25)' };
  if (status === 'done') return { bg: 'rgba(161,236,131,0.10)', border: 'var(--gx-green)', borderW: 1.5, text: 'var(--gx-navy)', barBg: 'var(--gx-green)' };
  if (status === 'live') return { bg: '#fff', border: 'rgba(41,51,92,0.25)', borderW: 1, text: 'var(--gx-navy)', barBg: 'var(--gx-tint)' };
  if (status === 'locked') return { bg: '#f7f6f1', border: 'rgba(41,51,92,0.15)', borderW: 1, text: 'rgba(41,51,92,0.4)', barBg: 'rgba(41,51,92,0.06)' };
  /* grayed */
  return { bg: '#f7f6f1', border: 'rgba(41,51,92,0.18)', borderW: 1, text: 'rgba(41,51,92,0.45)', barBg: 'rgba(41,51,92,0.08)' };
}

// ── ChapterStrip widget (Matt-style row of capability cards) ──
function ChapterStrip({ scenario, activeKey, progress = {}, onChapter, compact = false }) {
  // scenario.chapters: { understand: 'live'|'grayed'|'done'|'locked', ... }
  // activeKey: which chapter is currently active
  // progress: { understand: 0..1, ... } for the progress bar fills
  const chapters = scenario.chapters || { understand: 'live', extract: 'live', interact: 'live', report: 'live' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: compact ? 6 : 10 }}>
      {CAPABILITIES.map((c) => {
        const status = chapters[c.key] || 'grayed';
        const isActive = c.key === activeKey;
        const s = _chapterStyle(status, isActive);
        const pct = isActive ? (progress[c.key] || 0.5) : (status === 'done' ? 1 : 0);
        const lockable = status === 'grayed' || status === 'locked';
        return (
          <div key={c.key} style={{
            background: s.bg,
            border: `${s.borderW}px solid ${s.border}`,
            borderRadius: 6,
            padding: compact ? 8 : 12,
            position: 'relative',
            cursor: lockable ? 'help' : 'pointer',
          }}>
            {lockable && (
              <div className="wf-anno" style={{
                position: 'absolute', top: -8, right: 8,
                background: '#fff', border: '1px solid rgba(41,51,92,0.3)',
                borderRadius: 99, padding: '0 6px',
                fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700,
                color: 'rgba(41,51,92,0.55)',
                textTransform: 'uppercase', letterSpacing: 0.4,
              }}>
                {status === 'locked' ? '🔒 sign in' : 'sign in to try'}
              </div>
            )}
            <div className="wf-label" style={{ color: s.text, opacity: lockable ? 0.55 : 0.75, fontSize: compact ? 9 : 10, marginBottom: 2 }}>
              CHAPTER {c.n}
            </div>
            <div className="wf-h" style={{ fontSize: compact ? 17 : 20, color: s.text, lineHeight: 1 }}>{c.name}</div>
            {!compact && (
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: s.text, opacity: 0.6, marginTop: 3 }}>{c.short}</div>
            )}
            {/* progress bar — three short segments like Matt's mock */}
            <div style={{ display: 'flex', gap: 2, marginTop: compact ? 8 : 10 }}>
              {[0, 1, 2].map((i) => {
                const segPct = Math.max(0, Math.min(1, pct * 3 - i));
                return (
                  <div key={i} style={{ flex: 1, height: compact ? 3 : 4, borderRadius: 99, background: s.barBg, position: 'relative', overflow: 'hidden' }}>
                    {segPct > 0 && (
                      <div className="wf-accent-bg" style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${segPct * 100}%`,
                        background: isActive ? 'var(--gx-navy)' : (i === 0 ? 'var(--gx-green)' : i === 1 ? 'var(--gx-cyan)' : 'var(--gx-coral)'),
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
            {!compact && (
              <div style={{ marginTop: 8, fontFamily: 'Kalam,cursive', fontSize: 14, color: s.text, opacity: lockable ? 0.45 : 0.85 }}>
                →
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Matt-style "Add your own docs" tile ──
// `compact` matches the compact ScenarioCard shape (horizontal · 92px high).
function AddYourOwnTile({ width, height, signedIn = false, compact, style }) {
  if (compact) {
    return (
      <div className="wf-rough-lite" style={{
        width: width || '100%', minHeight: height || 76,
        height: height,
        border: '2px dashed rgba(41,51,92,0.35)',
        borderRadius: 4,
        padding: 10,
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#fff',
        cursor: 'pointer',
        boxSizing: 'border-box',
        ...style,
      }}>
        <div style={{
          width: 38, height: 48, borderRadius: 4,
          background: 'var(--gx-tint)', border: '1.5px solid rgba(41,51,92,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Kalam,cursive', fontSize: 20, fontWeight: 700, color: 'var(--gx-navy)',
          flexShrink: 0,
        }}>+</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="wf-h" style={{ fontSize: 19, lineHeight: 1.05, color: 'var(--gx-navy)' }}>Add your own docs</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)', marginTop: 3 }}>
            Drop a folder · start a project
          </div>
          <div className="wf-accent-text" style={{
            marginTop: 6, fontFamily: 'Kalam,cursive',
            fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            color: signedIn ? 'var(--gx-green)' : 'var(--gx-coral)',
          }}>
            {signedIn ? 'UPLOAD →' : 'SIGN UP FREE TO UNLOCK'}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{
      width: width || '100%', height: height || 'auto',
      border: '2px dashed rgba(41,51,92,0.35)',
      borderRadius: 8,
      padding: '28px 24px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 12, background: '#fff',
      ...style,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 99,
        background: 'var(--gx-tint)', border: '1.5px solid rgba(41,51,92,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Kalam,cursive', fontSize: 22, fontWeight: 700, color: 'var(--gx-navy)',
      }}>+</div>
      <div className="wf-h" style={{ fontSize: 22, color: 'var(--gx-navy)', lineHeight: 1 }}>Add your own docs</div>
      <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.7)', textAlign: 'center', maxWidth: 240, lineHeight: 1.35 }}>
        Drop a folder of your own documents to start a new project.
      </div>
      {!signedIn && (
        <div className="wf-accent-bg" style={{
          padding: '6px 14px', borderRadius: 99,
          border: '1.5px solid var(--gx-coral)',
          background: 'rgba(243,102,63,0.08)',
          fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 11,
          letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gx-coral)',
        }}>SIGN UP FREE TO UNLOCK</div>
      )}
      {signedIn && (
        <div className="wf-accent-bg" style={{
          padding: '6px 14px', borderRadius: 99,
          border: '1.5px solid var(--gx-navy)',
          background: 'var(--gx-green)',
          fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 11,
          letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gx-navy)',
        }}>UPLOAD</div>
      )}
    </div>
  );
}

// ── Frame · Processing (Chapter 1 Understand) ──
// While the doc is being processed, the canvas shows the chapter strip with
// "Understand" active + educational content about what's happening.
function Flow_Processing() {
  const scenario = SCENARIOS.utility;
  return (
    <div className="ab">
      <div className="ab-title">Flow · 2 · Understand · closing the document comprehension gap</div>
      <div className="ab-sub">
        Live-parse animation fills the canvas; thinking-style notes stream into the chat as the model "reads" the doc, starting with <i>"closing the document comprehension gap."</i>
        <br />
        <b>Implementation note:</b> the demo doc is preprocessed; a client timer simulates the work so the user sees the value props land in sequence. No real parsing happens during onboarding.
      </div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={340} focus="split">
        <>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
              <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Conversation</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>thinking…</div>
            </div>
            {/* Project + sample switcher */}
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10 }}>
              <span style={{ color: 'rgba(41,51,92,0.5)' }}>sample:</span>
              <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>Utility Bill</span>
              <span className="wf-link" style={{ color: 'rgba(41,51,92,0.55)' }}>switch ▾</span>
            </div>
          </div>
          <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
            <Bubble who="me">Utility Bill</Bubble>
            <Bubble who="gx" lead>
              <b>Reading utility-bill.pdf now.</b>
            </Bubble>

            {/* Thinking-style notes — appear one at a time as the model "discovers" each value prop */}
            <div style={{ marginTop: 8 }}>
              {[
                { t: '·', body: '<b>Closing the document comprehension gap</b> — the structural barrier general-purpose AI cannot cross. That\'s the whole point of GroundX.' },
                { t: '·', body: '<b>Vision-first parsing</b> — fine-tuned on 1M+ enterprise pages. I can see tables, paragraphs, and figures before any LLM touches the doc.' },
                { t: '·', body: '<b>Agentic enrichment</b> — narrow agents reasoning about each Semantic Object in parallel. The 8 meters won\'t get confused with each other.' },
                { t: '·', body: '<b>Pixel-Level Provenance</b> — every chunk anchored to its page region. When I cite something later, you can click straight back to where it came from.' },
                { t: '·', body: '<b>Hybrid retrieval</b> — proprietary relevance + semantic scoring, not just embeddings.' },
                { t: '·', body: 'Up to <b>99%</b> field accuracy. <b>96.2%</b> on Air France/KLM policy docs (vs 60% target). The docs that break general-purpose AI — still readable here.' },
              ].map((note, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: 9, fontWeight: 700,
                    color: 'rgba(41,51,92,0.4)', marginTop: 4, minWidth: 10,
                  }}>{note.t}</div>
                  <div style={{
                    fontFamily: 'Kalam,cursive', fontSize: 11.5, lineHeight: 1.35,
                    color: 'rgba(41,51,92,0.85)', fontStyle: 'italic',
                    flex: 1, paddingLeft: 6, borderLeft: '2px solid rgba(41,51,92,0.15)',
                  }} dangerouslySetInnerHTML={{ __html: note.body }} />
                </div>
              ))}
            </div>

            <Bubble who="gx">
              <b>Done.</b> 3 pages · 20 statement fields · 8 meters · 56 charges. Ready to analyze.
            </Bubble>
            <Bubble who="gx" opts={[
              { label: 'statement' },
              { label: 'meters', hot: true },
              { label: 'charges' },
              { label: 'edit schema' },
            ]}>
              Pick a view:
            </Bubble>
          </div>
          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="ask a question, ready when you are…" />
          </div>
        </>

        {/* Canvas — full-bleed live parse animation */}
        <div style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {/* Onboarding step strip */}
          <div style={{ padding: '12px 16px 14px', borderBottom: '1px solid rgba(41,51,92,0.1)', background: '#fafaf6' }}>
            <OnboardingStepStrip currentStepKey="understand" />
          </div>

          {/* Progress bar — no time commitment, just progress */}
          <div style={{ padding: '10px 18px 4px', display: 'flex', alignItems: 'center', gap: 12, background: '#fff' }}>
            <div className="wf-label" style={{ color: 'rgba(41,51,92,0.6)' }}>LIVE PARSE · utility-bill.pdf</div>
            <div style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(41,51,92,0.12)', position: 'relative', overflow: 'hidden' }}>
              <div className="wf-accent-bg" style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: '62%',
                background: 'linear-gradient(90deg, var(--gx-green), var(--gx-cyan))',
              }} />
            </div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'var(--gx-navy)' }}>processing…</div>
          </div>

          {/* Full-bleed PDF viewer with scan-line processing animation */}
          <div style={{ flex: 1, padding: '14px 22px 18px', overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* PDF viewer toolbar */}
            <div style={{
              width: '100%', maxWidth: 560,
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 14px', marginBottom: 12,
              background: 'var(--gx-navy)', color: '#fff',
              borderRadius: 4,
              fontFamily: 'Kalam,cursive', fontSize: 11,
            }}>
              <span style={{ fontWeight: 700 }}>utility-bill.pdf</span>
              <div style={{ flex: 1 }} />
              <span style={{ opacity: 0.65 }}>‹</span>
              <span style={{ fontWeight: 700 }}>page 1 of 3</span>
              <span style={{ opacity: 0.65 }}>›</span>
              <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.2)' }} />
              <span style={{ opacity: 0.65 }}>−</span>
              <span style={{ fontWeight: 700 }}>100%</span>
              <span style={{ opacity: 0.65 }}>+</span>
            </div>

            {/* PDF page · scan-line animation overlays a real-looking page silhouette */}
            <div style={{
              width: '100%', maxWidth: 560, aspectRatio: '8.5 / 11',
              background: '#fff', border: '1.5px solid rgba(41,51,92,0.25)',
              boxShadow: '0 4px 16px rgba(41,51,92,0.10), 0 1px 3px rgba(41,51,92,0.06)',
              position: 'relative', overflow: 'hidden',
              padding: 28, boxSizing: 'border-box',
              flex: 1, maxHeight: 380,
            }}>
              {/* faint page content — looks like a bill */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ height: 14, width: '32%', background: 'rgba(41,51,92,0.65)', borderRadius: 2 }} />
                <div style={{ height: 8, width: '20%', background: 'rgba(41,51,92,0.25)', borderRadius: 2 }} />
              </div>
              <div style={{ height: 5, width: '60%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
              <div style={{ height: 5, width: '70%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
              <div style={{ height: 5, width: '40%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 14 }} />

              {/* table region — many parallel lines */}
              <div style={{ border: '1px solid rgba(41,51,92,0.2)', padding: 8, marginBottom: 14 }}>
                {[0,1,2,3,4,5,6,7].map((row) => (
                  <div key={row} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <div style={{ height: 4, flex: 2, background: 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
                    <div style={{ height: 4, flex: 1, background: 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
                    <div style={{ height: 4, flex: 1, background: 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
                    <div style={{ height: 4, flex: 1, background: 'rgba(41,51,92,0.18)', borderRadius: 99 }} />
                  </div>
                ))}
              </div>

              <div style={{ height: 5, width: '55%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
              <div style={{ height: 5, width: '75%', background: 'rgba(41,51,92,0.15)', borderRadius: 99, marginBottom: 5 }} />
              <div style={{ height: 5, width: '45%', background: 'rgba(41,51,92,0.15)', borderRadius: 99 }} />

              {/* Above-line · already-scanned area · faint cyan wash */}
              <div className="wf-accent-bg" style={{
                position: 'absolute', left: 0, right: 0, top: 0, height: '62%',
                background: 'linear-gradient(180deg, rgba(193,232,238,0.18) 0%, rgba(193,232,238,0.08) 100%)',
                pointerEvents: 'none',
              }} />

              {/* THE scan line — horizontal sweep down the page */}
              <div className="wf-accent-bg" style={{
                position: 'absolute', left: 0, right: 0, top: '62%',
                height: 2,
                background: 'linear-gradient(90deg, transparent 0%, var(--gx-green) 12%, var(--gx-cyan) 50%, var(--gx-green) 88%, transparent 100%)',
                boxShadow: '0 0 16px rgba(161,236,131,0.6), 0 -4px 24px rgba(193,232,238,0.4)',
                animation: 'scanSweep 4s ease-in-out infinite',
                pointerEvents: 'none',
              }} />

              {/* Shimmer dots near the scan line — make it feel "alive" */}
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 'calc(62% - 8px)',
                height: 16, pointerEvents: 'none', overflow: 'hidden',
              }}>
                {[14, 28, 44, 62, 78, 88].map((x, i) => (
                  <div key={i} className="wf-accent-bg" style={{
                    position: 'absolute', left: x + '%', top: '50%',
                    width: 3, height: 3, borderRadius: 99,
                    background: 'var(--gx-green)',
                    animation: `scanDot 2s ease-in-out ${i * 0.18}s infinite`,
                    transform: 'translate(-50%, -50%)',
                  }} />
                ))}
              </div>
            </div>

            {/* Page thumbnails — 3-page progress */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              {[
                { n: 1, state: 'parsing' },
                { n: 2, state: 'queued' },
                { n: 3, state: 'queued' },
              ].map((p) => (
                <div key={p.n} style={{
                  width: 44, height: 56, background: '#fff',
                  border: '1.5px solid ' + (p.state === 'parsing' ? 'var(--gx-navy)' : 'rgba(41,51,92,0.2)'),
                  borderRadius: 3, position: 'relative',
                  opacity: p.state === 'queued' ? 0.55 : 1,
                  boxShadow: p.state === 'parsing' ? '0 0 0 3px rgba(161,236,131,0.4)' : 'none',
                }}>
                  <div style={{
                    position: 'absolute', top: 4, left: 4, right: 4,
                    height: 2, background: 'rgba(41,51,92,0.2)', borderRadius: 99,
                  }} />
                  <div style={{
                    position: 'absolute', top: 10, left: 4, right: 4,
                    height: 1.5, background: 'rgba(41,51,92,0.15)', borderRadius: 99,
                  }} />
                  <div style={{
                    position: 'absolute', top: 14, left: 4, right: 8,
                    height: 1.5, background: 'rgba(41,51,92,0.15)', borderRadius: 99,
                  }} />
                  <div style={{
                    position: 'absolute', bottom: 3, left: 0, right: 0,
                    textAlign: 'center',
                    fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700,
                    color: 'var(--gx-navy)',
                  }}>p.{p.n}</div>
                </div>
              ))}
            </div>

            {/* Inline keyframes */}
            <style>{`
              @keyframes scanSweep {
                0% { top: 8%; opacity: 0.4; }
                50% { top: 62%; opacity: 1; }
                100% { top: 96%; opacity: 0.4; }
              }
              @keyframes scanDot {
                0%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
                50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
              }
            `}</style>
          </div>
        </div>
      </AppShell>
    </div>
  );
}

// ── Frame · Chapter strip in flow (after Understand, ready for Chapter 2) ──
function Flow_Chapters() {
  return (
    <div className="ab">
      <div className="ab-title">Scenarios · capabilities demonstrated</div>
      <div className="ab-sub">
        What each sample scenario covers across the four Studio capabilities (Understand · Extract · Interact · Report). <b>Live</b> = the canonical demo walks through this capability. <b>Grayed</b> = the doc type doesn't use it (Solar has no schema · Utility &amp; Loan don't reach Report). The full surface is always visible so users see what the product can do beyond the demo.
      </div>

      <div className="wf-box wf-rough-lite" style={{ padding: 16, marginBottom: 14, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <div className="wf-label" style={{ margin: 0 }}>UTILITY BILL</div>
          <span style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, color: 'rgba(41,51,92,0.6)' }}>1 doc · primary demo · ends at the F6 gate</span>
        </div>
        <ChapterStrip scenario={SCENARIOS.utility} activeKey={null} />
      </div>

      <div className="wf-box wf-rough-lite" style={{ padding: 16, marginBottom: 14, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <div className="wf-label" style={{ margin: 0 }}>LOAN ELIGIBILITY</div>
          <span style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, color: 'rgba(41,51,92,0.6)' }}>12 docs · structured-output demo · JSON render</span>
        </div>
        <ChapterStrip scenario={SCENARIOS.loan} activeKey={null} />
      </div>

      <div className="wf-box wf-rough-lite" style={{ padding: 16, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <div className="wf-label" style={{ margin: 0 }}>SOLAR PORTFOLIO</div>
          <span style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, color: 'rgba(41,51,92,0.6)' }}>142 docs · cross-doc Interact + Report demo · no schema</span>
        </div>
        <ChapterStrip scenario={SCENARIOS.solar} activeKey={null} />
      </div>

      <div className="wf-box wf-rough-lite" style={{ padding: 12, marginTop: 14, background: 'var(--gx-tint)' }}>
        <div className="wf-label" style={{ marginBottom: 4 }}>WHY EXPOSE GRAYED CAPABILITIES</div>
        <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, color: 'var(--gx-navy)', lineHeight: 1.4 }}>
          Grayed ≠ hidden. Showing what each scenario <i>doesn't</i> demo makes the full product surface visible — and the upgrade path obvious. Solar buyers see Extract is there; Utility buyers see Report exists; nobody guesses at scope.
        </div>
      </div>
    </div>
  );
}

// ── Widget anatomy · Chapter card ──
function Widget_Chapter() {
  return (
    <div className="ab" style={{ padding: '22px 26px' }}>
      <div className="ab-title">Widget · Capability card (per scenario)</div>
      <div className="ab-sub">
        One card per Studio capability (Understand · Extract · Interact · Report) showing what a scenario demonstrates. Used in <b>LC1 · capabilities demonstrated per scenario</b>. Distinct from <b>W2 · onboarding step strip</b>: W2 tracks where the user IS this session; this card tracks what this DOC TYPE supports.
      </div>

      <div className="wf-label" style={{ marginBottom: 6 }}>STATES (side-by-side)</div>
      <div className="wf-box wf-rough-lite" style={{ padding: 16, background: '#fff', marginBottom: 14 }}>
        <ChapterStrip
          scenario={{ chapters: { understand: 'done', extract: 'live', interact: 'grayed', report: 'locked' } }}
          activeKey="extract"
          progress={{ extract: 0.4 }}
        />
      </div>

      <CalloutList columns={2} items={[
        { n: 1, title: 'done', body: 'this scenario has finished demonstrating the capability — green tint, full progress. Click → re-enter to see the result again.' },
        { n: 2, title: 'live', body: 'currently running for this scenario — 2px green border, progress bar fills as it advances. One card per row can be live.' },
        { n: 3, title: 'grayed', body: 'this scenario doesn\'t demo the capability (Solar skips Extract — no schema). Still visible to expose the full surface.' },
        { n: 4, title: 'locked', body: 'capability requires sign-in or paid tier (Report on Utility / Loan in the canonical demo). Same muted treatment + 🔒.' },
        { n: 5, title: 'where it appears', body: 'LC1 only. Three rows of cards — one per scenario, side-by-side. Not used in the live product; the step strip (W2) is what users see during onboarding.' },
        { n: 6, title: 'capability names', body: 'Understand · Extract · Interact · Report. Match the harness Studio names. "Understand" maps to the step strip\'s pre-Analyze step in W2.' },
      ]} />
    </div>
  );
}

// ── Widget anatomy · Add your own docs tile (Matt mock) ──
function Widget_AddYourOwn() {
  return (
    <div className="ab" style={{ padding: '22px 26px' }}>
      <div className="ab-title">Widget · "Add your own" tile</div>
      <div className="ab-sub">
        Fourth option in the <b>F2 scenario picker</b> chat bubble (after Utility · Loan · Solar). Lets users skip samples and bring their own docs straight from the picker. Two states: logged-out (signals the gate) and signed-in (becomes a real drop target). Also used as the <i>+ New project</i> tile in Workspaces (see canvas-states).
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 14 }}>
        <div>
          <div className="wf-label" style={{ marginBottom: 8 }}>STATE · LOGGED OUT</div>
          <AddYourOwnTile height={260} />
        </div>
        <div>
          <div className="wf-label" style={{ marginBottom: 8 }}>STATE · SIGNED IN</div>
          <AddYourOwnTile height={260} signedIn />
        </div>
      </div>

      <CalloutList columns={2} items={[
        { n: 1, title: 'dashed border', body: '2px dashed at 35% navy — signals "drop zone". Same border in both states.' },
        { n: 2, title: '+ in a soft tint circle', body: 'visual hook. 44 × 44 — large enough to be a touch target on tablet/mobile.' },
        { n: 3, title: 'logged-out CTA · "SIGN UP FREE TO UNLOCK"', body: 'coral outline pill, small caps. Tapping triggers the F1 → F2 transition + loads the F6 sign-up experience inline in chat (same pattern as F1 BYO).' },
        { n: 4, title: 'signed-in CTA · "UPLOAD"', body: 'green primary pill. Click → file picker. Drag-and-drop active on the whole tile body.' },
        { n: 5, title: 'compact variant', body: 'shorter horizontal version (92px tall) used inside the F2 chat picker grid alongside the three ScenarioCards. Same affordance, less chrome.' },
        { n: 6, title: 'cross-link', body: 'Same tile shape is reused as the "+ New project" affordance on the signed-in Workspaces canvas state (parking lot).' },
      ]} />
    </div>
  );
}

Object.assign(window, {
  CAPABILITIES, ChapterStrip, AddYourOwnTile,
  Flow_Processing, Flow_Chapters, Widget_Chapter, Widget_AddYourOwn,
});
