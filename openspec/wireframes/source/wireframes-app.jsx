// wireframes-app.jsx — top-level mount; canvas with all four concepts.

const { useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakRadio, TweakSelect } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "annotations": true,
  "bw": false,
  "density": "comfy",
  "accent": "brand"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply global tweak classes to <body> via a wrapper class on root
  const rootCls = [
    t.annotations ? '' : 'wf-anno-hide',
    t.bw ? 'wf-bw' : '',
    `wf-density-${t.density}`,
    `wf-accent-${t.accent}`,
  ].filter(Boolean).join(' ');

  // Card sizes
  const W = 1120, H = 720;

  return (
    <div className={rootCls}>
      <DesignCanvas>
        {/* Intro section — context for the work */}
        <DCSection id="intro" title="Chat-driven onboarding · wireframes" subtitle="4 concepts × the full first-session flow. Pan, zoom, click any frame to focus.">
          <DCArtboard id="brief" label="brief · constraints" width={760} height={540}>
            <div className="ab" style={{ padding: '32px 36px' }}>
              <div className="ab-title" style={{ fontSize: 38 }}>The brief, in one frame.</div>
              <div className="ab-sub" style={{ fontSize: 15, marginBottom: 18 }}>
                First session opens inside the product. Chat-left or chat-right or chat-dock — chat does the talking.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div className="wf-box wf-rough-lite" style={{ padding: 12 }}>
                  <div className="wf-label">Non-negotiable</div>
                  <ul style={{ fontFamily: 'Kalam,cursive', fontSize: 14, lineHeight: 1.35, marginTop: 6, paddingLeft: 18 }}>
                    <li>Product area is <b>never empty</b> — preloaded buckets.</li>
                    <li>Chat <b>narrates the first action</b>, never tutorials.</li>
                    <li>User can <b>take control any time</b>.</li>
                    <li>Proof = citations + X-Ray, <b>always reachable</b>.</li>
                    <li>Gate <b>after</b> value, only on upload / save / export.</li>
                  </ul>
                </div>
                <div className="wf-box wf-rough-lite" style={{ padding: 12, background: 'var(--gx-tint)' }}>
                  <div className="wf-label">Five phases</div>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 13 }}>
                    <div>1. <b>Entry</b> — first session, chat says hi</div>
                    <div>2. <b>Bucket</b> — pick or accept rec</div>
                    <div>3. <b>Action</b> — assistant runs the first move</div>
                    <div>4. <b>Proof</b> — see why the answer is trustworthy</div>
                    <div>5. <b>Gate</b> — account only when needed</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { t: 'A · Split', d: 'chat L · classic', c: 'var(--gx-cyan)' },
                  { t: 'B · Driver', d: 'chat R · narrative', c: 'var(--gx-green)' },
                  { t: 'C · Conversational', d: 'chat-first · earned', c: 'var(--gx-coral)' },
                  { t: 'D · Dock', d: 'bottom · command bar', c: 'var(--gx-navy)' },
                ].map((c, i) => (
                  <div key={i} className="wf-box wf-rough-lite" style={{ padding: 10, background: c.c, color: i === 3 ? '#fff' : 'var(--gx-navy)' }}>
                    <div className="wf-h" style={{ fontSize: 22, lineHeight: 1 }}>{c.t}</div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, opacity: 0.8, marginTop: 4 }}>{c.d}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.65)' }}>
                Tip: open <b>Tweaks</b> ↘ to toggle annotations, B&W mode, or strip brand accents.
              </div>
            </div>
          </DCArtboard>
        </DCSection>

        {/* Concept A */}
        <DCSection id="conceptA" title="A · Split layout — chat left, product right" subtitle="Classic. Two stable columns. Predictable, fast to teach, hardest to mess up.">
          <DCArtboard id="a1" label="A1 · entry" width={W} height={H}><ConceptA_Entry /></DCArtboard>
          <DCArtboard id="a2" label="A2 · bucket selected" width={W} height={H}><ConceptA_Bucket /></DCArtboard>
          <DCArtboard id="a3" label="A3 · answer + X-Ray drawer" width={W} height={H}><ConceptA_Action /></DCArtboard>
          <DCArtboard id="a4" label="A4 · account gate (inline)" width={W} height={H}><ConceptA_Gate /></DCArtboard>
        </DCSection>

        {/* Concept B */}
        <DCSection id="conceptB" title="B · Chat-as-driver — chat right, product wide" subtitle="A default bucket is already open. Chat narrates &amp; suggests; the product is the canvas.">
          <DCArtboard id="b1" label="B1 · entry" width={W} height={H}><ConceptB_Entry /></DCArtboard>
          <DCArtboard id="b2" label="B2 · answer inline" width={W} height={H}><ConceptB_Action /></DCArtboard>
          <DCArtboard id="b3" label="B3 · full X-Ray view" width={W} height={H}><ConceptB_Proof /></DCArtboard>
          <DCArtboard id="b4" label="B4 · soft-banner gate" width={W} height={H}><ConceptB_Gate /></DCArtboard>
        </DCSection>

        {/* Concept C */}
        <DCSection id="conceptC" title="C · Conversational-first — workspace emerges" subtitle="Chat owns the first frame; the product unfolds as the conversation earns it.">
          <DCArtboard id="c1" label="C1 · entry · chat dominant" width={W} height={H}><ConceptC_Entry /></DCArtboard>
          <DCArtboard id="c2" label="C2 · workspace fades in" width={W} height={H}><ConceptC_Emerge /></DCArtboard>
          <DCArtboard id="c3" label="C3 · answer + evidence split" width={W} height={H}><ConceptC_Proof /></DCArtboard>
          <DCArtboard id="c4" label="C4 · gate as chat turn" width={W} height={H}><ConceptC_Gate /></DCArtboard>
        </DCSection>

        {/* Concept D */}
        <DCSection id="conceptD" title="D · Bottom dock — command bar" subtitle="Chat collapses to a dock; product is the full canvas. Power-user energy.">
          <DCArtboard id="d1" label="D1 · entry · bucket grid" width={W} height={H}><ConceptD_Entry /></DCArtboard>
          <DCArtboard id="d2" label="D2 · answer inline · proof open" width={W} height={H}><ConceptD_Action /></DCArtboard>
          <DCArtboard id="d3" label="D3 · X-Ray peek over page" width={W} height={H}><ConceptD_Proof /></DCArtboard>
          <DCArtboard id="d4" label="D4 · gate pinned in dock" width={W} height={H}><ConceptD_Gate /></DCArtboard>
        </DCSection>

        {/* ⭐ Deeper exploration of C */}
        <DCSection id="conceptCDeep" title="⭐ C · deeper — variations to consider" subtitle="If C is the direction: four ways to push it further. Different entries, motion, proof, and settled states.">
          <DCArtboard id="cd1" label="C·v2 · intent picker entry" width={W} height={H}><ConceptC_Intent /></DCArtboard>
          <DCArtboard id="cd2" label="C·v3 · emergence motion · 3-up" width={W} height={H}><ConceptC_Emergence /></DCArtboard>
          <DCArtboard id="cd3" label="C·v4 · anchored citations (proof in chat)" width={W} height={H}><ConceptC_AnchoredProof /></DCArtboard>
          <DCArtboard id="cd4" label="C·v5 · settled state (after warmup)" width={W} height={H}><ConceptC_Settled /></DCArtboard>
        </DCSection>

        {/* ⭐ C → A hybrid */}
        <DCSection id="hybridCA" title="⭐ C → A · the hybrid · conversational that settles" subtitle="Start C, end A. Same product, layout transforms over the first 30 seconds. Reversible.">
          <DCArtboard id="ca0" label="0 · the arc · storyboard" width={1120} height={520}><HybridCA_Storyboard /></DCArtboard>
          <DCArtboard id="ca1" label="1 · cold open · chat owns frame" width={W} height={H}><HybridCA_Open /></DCArtboard>
          <DCArtboard id="ca2" label="2 · transition · chat slides left" width={W} height={H}><HybridCA_Transition /></DCArtboard>
          <DCArtboard id="ca3" label="3 · settled · split + history" width={W} height={H}><HybridCA_Settled /></DCArtboard>
          <DCArtboard id="ca4" label="4 · focus chat anytime ↗" width={W} height={H}><HybridCA_Focus /></DCArtboard>
        </DCSection>

        {/* Compare strip */}
        <DCSection id="compare" title="Comparing the four" subtitle="Quick read on tradeoffs.">
          <DCArtboard id="cmp" label="tradeoff matrix" width={1100} height={500}>
            <div className="ab" style={{ padding: 28 }}>
              <div className="ab-title">Trade-offs at a glance</div>
              <div className="ab-sub">Pick by intent: hand-holding vs. self-driving, "guide the user" vs. "trust the user".</div>
              <div className="wf-box wf-rough-lite" style={{ padding: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(4, 1fr)', gap: 10, fontFamily: 'Kalam,cursive', fontSize: 12 }}>
                  <div></div>
                  <div className="wf-h" style={{ fontSize: 18 }}>A · Split</div>
                  <div className="wf-h" style={{ fontSize: 18 }}>B · Driver</div>
                  <div className="wf-h" style={{ fontSize: 18 }}>C · Conversational</div>
                  <div className="wf-h" style={{ fontSize: 18 }}>D · Dock</div>

                  {[
                    ['Familiarity', '★★★★★', '★★★★', '★★★', '★★★'],
                    ['Hand-holding', '★★★★', '★★★★', '★★★★★', '★★'],
                    ['Power-user speed', '★★', '★★★', '★★', '★★★★★'],
                    ['Visual focus on chat', '★★★★', '★★★', '★★★★★', '★★'],
                    ['Time-to-first-answer', '★★★', '★★★★★', '★★★', '★★★★'],
                    ['Best for…', 'casual evaluators', 'design-led demos', 'first-touch / cold visitors', 'devs / data folks'],
                  ].map((row, i) => (
                    <React.Fragment key={i}>
                      <div style={{ fontWeight: 700, paddingTop: 6, borderTop: i === 0 ? 'none' : '1px dashed rgba(41,51,92,0.2)' }}>{row[0]}</div>
                      {row.slice(1).map((cell, j) => (
                        <div key={j} style={{ paddingTop: 6, borderTop: i === 0 ? 'none' : '1px dashed rgba(41,51,92,0.2)', fontWeight: typeof cell === 'string' && cell.includes('★') ? 700 : 400 }}>{cell}</div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div className="wf-box wf-rough-lite" style={{ padding: 10, background: 'var(--gx-tint)' }}>
                  <div className="wf-label">Hybrids worth trying</div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, marginTop: 6 }}>
                    <b>B + D:</b> right-rail narrative with a dock for power moves.<br />
                    <b>C → A:</b> conversational-first that <b>settles</b> into split.
                  </div>
                </div>
                <div className="wf-box wf-rough-lite" style={{ padding: 10 }}>
                  <div className="wf-label">Where they all agree</div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, marginTop: 6 }}>
                    Preloaded buckets. Citations + X-Ray. Gate only on upload/save/export. Always offer "keep exploring".
                  </div>
                </div>
                <div className="wf-box wf-rough-lite" style={{ padding: 10 }}>
                  <div className="wf-label">Open questions</div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, marginTop: 6 }}>
                    Free-tier limit (5 docs vs. 100 pages)? Default bucket vs. picker first? Voice/length of assistant?
                  </div>
                </div>
              </div>
            </div>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      {/* Tweaks panel — only renders when user toggles edit mode in toolbar */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Display">
          <TweakToggle label="Annotations" value={t.annotations} onChange={(v) => setTweak('annotations', v)} hint="show / hide yellow sticky callouts" />
          <TweakToggle label="B&W mode" value={t.bw} onChange={(v) => setTweak('bw', v)} hint="strip brand accents — pure low-fi" />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
