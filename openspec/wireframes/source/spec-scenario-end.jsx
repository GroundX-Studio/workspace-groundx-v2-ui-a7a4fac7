// spec-scenario-end.jsx — scenario lifecycle, end states, and back-out audit.
// Answers: "what happens at the end of solar?" + "what other screens need back-out
// and lifecycle callouts?" Grounded in groundx-wireframes/inbound-outbound-visitor-journey.md
// (Phase 6: Shared Sandbox Evaluation, current direction "chat-driven product-grade").

// ── 1 · Scenario lifecycle state machine (parallel to F6c gate lifecycle) ──
function Lifecycle_Scenario() {
  const nodes = [
    { id: 'picker', x: 60, y: 100, label: 'sample picker\n(F1)', kind: 'rest' },
    { id: 'opened', x: 260, y: 100, label: 'opened · understanding\n(F2)', kind: 'event' },
    { id: 'inProgress', x: 460, y: 100, label: 'in progress\n(F3 · F4 · F5)', kind: 'rest' },
    { id: 'checkpoint', x: 700, y: 100, label: 'results / brief\n(S1 extract output · S3 IC brief)', kind: 'gate' },
    { id: 'save', x: 940, y: 30, label: 'save / sign in\n(F6 gate)', kind: 'commit' },
    { id: 'switch', x: 940, y: 170, label: 'switch sample\n(confirm if dirty)', kind: 'dismiss' },
    { id: 'done', x: 1140, y: 30, label: 'session ends\n→ next visit = product UI', kind: 'rest' },
  ];

  const edges = [
    ['picker', 'opened', 'user picks'],
    ['opened', 'inProgress', 'extract auto-runs'],
    ['inProgress', 'inProgress', 'ask · cite peek · refine schema · pin to report', true],
    ['inProgress', 'checkpoint', 'extract output / render report'],
    ['checkpoint', 'save', '💾 Save / 📥 Export'],
    ['checkpoint', 'switch', 'try another sample'],
    ['save', 'done', ''],
    ['switch', 'picker', 'reset, history kept', true],
  ];

  const kinds = {
    rest: { bg: '#fff', border: 'var(--gx-navy)' },
    event: { bg: 'var(--gx-tint)', border: 'var(--gx-navy)' },
    gate: { bg: 'var(--gx-green)', border: 'var(--gx-navy)' },
    commit: { bg: 'var(--gx-cyan)', border: 'var(--gx-navy)' },
    dismiss: { bg: '#fff', border: 'var(--gx-coral)' },
  };

  return (
    <div className="ab" style={{ padding: '22px 26px' }}>
      <div className="ab-title">Lifecycle · sample exploration</div>
      <div className="ab-sub">Picker → opened → in progress → results checkpoint → (save | switch). Returning users skip the picker; their last sample is the default. The "checkpoint" is when the user has something worth saving — schema results (S1) or rendered report (S3) — and the 💾 Save / 📥 Export buttons start triggering the F6 gate.</div>

      <div className="wf-box wf-rough-lite" style={{ position: 'relative', height: 280, background: '#fff', marginBottom: 14 }}>
        <svg style={{ position: 'absolute', inset: 0 }} width="100%" height="100%">
          <defs>
            <marker id="ls-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
              <path d="M0,0 L9,5 L0,10 z" fill="var(--gx-navy)" />
            </marker>
            <marker id="ls-arrow-c" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
              <path d="M0,0 L9,5 L0,10 z" fill="var(--gx-coral)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = nodes.find((n) => n.id === e[0]);
            const b = nodes.find((n) => n.id === e[1]);
            if (!a || !b) return null;
            const dashed = e[3];
            // self-loop on inProgress
            if (a.id === b.id) {
              const cx = a.x + 88, cy = a.y - 6;
              const path = `M ${cx - 40} ${cy} Q ${cx} ${cy - 38} ${cx + 40} ${cy}`;
              return (
                <g key={i}>
                  <path d={path} stroke="var(--gx-navy)" strokeWidth="1.6" fill="none" markerEnd="url(#ls-arrow)" />
                  <text x={cx} y={cy - 30} textAnchor="middle" fontFamily="Kalam,cursive" fontSize="10" fontWeight="700" fill="var(--gx-navy)">{e[2]}</text>
                </g>
              );
            }
            const ax = a.x + 176, ay = a.y + 28;
            const bx = b.x, by = b.y + 28;
            const isReentry = a.id === 'switch' && b.id === 'picker';
            let path;
            if (isReentry) {
              path = `M ${a.x} ${ay + 28} Q ${a.x - 60} 250 ${nodes[0].x + 88} 250 Q ${nodes[0].x + 88} 230 ${nodes[0].x + 88} ${nodes[0].y + 56}`;
            } else if (a.y === b.y) {
              path = `M ${ax} ${ay} L ${bx} ${by}`;
            } else if (a.id === 'checkpoint') {
              path = `M ${ax} ${ay} Q ${(ax + bx) / 2} ${ay} ${bx} ${by}`;
            } else {
              path = `M ${ax} ${ay} L ${bx} ${by}`;
            }
            const useCoral = (a.id === 'checkpoint' && b.id === 'switch') || isReentry;
            return (
              <g key={i}>
                <path d={path} stroke={useCoral ? 'var(--gx-coral)' : 'var(--gx-navy)'} strokeWidth="1.6" fill="none" strokeDasharray={dashed ? '5 5' : '0'} markerEnd={useCoral ? 'url(#ls-arrow-c)' : 'url(#ls-arrow)'} />
                {e[2] && !isReentry && (
                  <text
                    x={(ax + bx) / 2}
                    y={(ay + by) / 2 - 6}
                    textAnchor="middle"
                    fontFamily="Kalam,cursive" fontSize="10" fontWeight="700"
                    fill={useCoral ? 'var(--gx-coral)' : 'var(--gx-navy)'}
                  >{e[2]}</text>
                )}
                {isReentry && (
                  <text x={140} y={264} textAnchor="middle" fontFamily="Kalam,cursive" fontSize="10" fontWeight="700" fill="var(--gx-coral)">{e[2]}</text>
                )}
              </g>
            );
          })}
        </svg>
        {nodes.map((n) => (
          <div key={n.id} style={{
            position: 'absolute', left: n.x, top: n.y, width: 176,
            padding: '8px 10px',
            background: kinds[n.kind].bg, border: `1.5px solid ${kinds[n.kind].border}`,
            borderRadius: 4,
            fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700,
            color: 'var(--gx-navy)', textAlign: 'center', whiteSpace: 'pre-line',
            zIndex: 2,
          }} className={n.kind === 'gate' || n.kind === 'event' ? 'wf-accent-bg' : ''}>
            {n.label}
          </div>
        ))}
      </div>

      <CalloutList columns={2} items={[
        { n: 1, title: 'checkpoint is the new moment', body: 'every scenario reaches one or more checkpoints (extract complete, brief generated). That\'s when save/sign-in becomes worth offering.' },
        { n: 2, title: 'switch scenario is two-step', body: 'if work is unsaved, a confirm: "you have 23 extracted rows — sign in to keep them, or discard?". Saves the dismiss.' },
        { n: 3, title: 'returning users skip picker', body: 'per May 20: first-session gets overlay, later visits go straight to product. The picker becomes a "switch scenario" menu in the nav.' },
        { n: 4, title: 'history persists across switches', body: 'switching keeps the chat history in a "previous session" collapsible. Citations still resolve. Same chat_session_id continues.' },
      ]} />
    </div>
  );
}

// ── 2a · Solar · Report builder · IC brief template ──
// Reports are to questions what schemas are to fields. Same UX vocabulary as
// the F3a Schema Editor — pinned samples, sub-tabs (Design / Sections / Render),
// row-based section list with one in edit mode, accept/dismiss proposal cards,
// and chat-driven authoring.
function Solar_ReportBuilder() {
  const SECTIONS = [
    { k: 'executive_summary', t: 'PARAGRAPH', q: '"One-paragraph synthesis of NPV, COD timing, and the top 3 risks for {project}, with citations."', meta: 'pinned from chat · 7 turns ago' },
    { k: 'risk_roll_up', t: 'BULLETS', q: '"Top 3 risks across all source docs for {project}, each with severity, source citation, and 1-line mitigation note."', meta: 'pinned from chat · 6 turns ago', edited: true, editing: true },
    { k: 'comparable_projects', t: 'TABLE', q: '"Compare {project} to {comparables[]} on IRR, lease terms, interconnection timing, and O&M assumptions."', meta: 'pinned from chat · 4 turns ago', vars: 'project · comparables' },
    { k: 'recommendation', t: 'PARAGRAPH', q: '"One-paragraph underwriting recommendation given the risks above. Cite the deciding factor."', meta: 'pinned from chat · 2 turns ago' },
  ];
  return (
    <div className="ab">
      <div className="ab-title">Solar · Report builder · IC brief template</div>
      <div className="ab-sub">
        <b>Reports = schemas for questions.</b> The "IC brief" is a collection of pinned Q&amp;A pairs that re-run against any project. Same chrome as F3a — pinned samples, sub-tabs, row-based section list with name + type chip + question prompt + agent-proposal cards. <b>Pin to report</b> is the in-chat verb on every assistant turn — pinning lands the Q&amp;A as a section here.
      </div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={340} focus="split">
        <>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
              <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Report Agent</div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10 }}>
              <span style={{ color: 'rgba(41,51,92,0.5)' }}>sample:</span>
              <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>Solar Portfolio</span>
              <span className="wf-link" style={{ color: 'rgba(41,51,92,0.55)' }}>switch ▾</span>
            </div>
          </div>

          <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
            <div style={{
              padding: '6px 10px', margin: '0 0 10px', textAlign: 'center',
              fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.5)',
              borderTop: '1px dashed rgba(41,51,92,0.2)', borderBottom: '1px dashed rgba(41,51,92,0.2)',
            }}>
              <span className="wf-link">▾ 3 earlier turns (lease exposure · cordoba comparison · sundance risk)</span>
            </div>

            {/* Previous turn — shows the Pin to report affordance + the pinned chip
                that lands when you click it. This is the canonical "save a question"
                interaction. */}
            <Bubble who="me">summarize risk across Project Sundance</Bubble>
            <Bubble who="gx">
              <b>3 risks rolled up</b> from 11 source documents:
              <ol style={{ paddingLeft: 16, margin: '4px 0', fontFamily: 'Kalam,cursive', fontSize: 11, lineHeight: 1.4 }}>
                <li>Interconnection delay <CiteChip n={1} page={2} doc="utility-letter" /></li>
                <li>Lease escalator <CiteChip n={2} page={11} doc="lease-2024" color="coral" /></li>
                <li>O&amp;M assumption gap <CiteChip n={3} page={3} doc="financial-model" /></li>
              </ol>
              {/* Pinned-to-report indicator + the hover row of save affordances */}
              <div style={{
                marginTop: 6, padding: '3px 7px',
                background: 'var(--gx-tint)', borderRadius: 4,
                fontFamily: 'Kalam,cursive', fontSize: 10, color: 'var(--gx-navy)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ color: 'var(--gx-coral)' }}>📌</span>
                <span>pinned to <b>IC brief · §2 risk_roll_up</b></span>
                <span style={{ flex: 1 }} />
                <span className="wf-link" style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)' }}>unpin</span>
                <span className="wf-link" style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)' }}>jump →</span>
              </div>
            </Bubble>

            {/* The agent confirms the pin + proposes the next section */}
            <Bubble who="gx" lead>
              Added <b>risk_roll_up</b> to the IC brief template. The question is generalized — <code>{'{project}'}</code> is a variable, so the same section will run on Cordoba, Helios, or any other project you load.
              <div style={{ marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.7)' }}>
                Want me to also propose a <b>sensitivity_analysis</b> section based on the lease escalator + interconnection slip? It's a natural follow-up.
              </div>
            </Bubble>
          </div>

          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="ask the agent to add, edit, or split a section…" />
          </div>
        </>

        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {/* Onboarding step strip — Report active. Extract disabled (no field
              extraction in this scenario). Interact done. */}
          <div style={{ padding: '8px 14px 10px', background: '#fafaf6', borderRadius: 6, marginBottom: 8 }}>
            <OnboardingStepStrip currentStepKey="analyze" activeSubKey="report" doneSubKeys={['interact']} />
          </div>

          {/* Report topbar · mirrors F3a chrome */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(41,51,92,0.12)' }}>
            <span className="wf-link" style={{ fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>← back</span>
            <div style={{
              padding: '3px 8px', background: '#fff',
              border: '1.5px solid var(--gx-navy)', borderRadius: 4,
              fontFamily: 'Kalam,cursive', fontSize: 13, fontWeight: 700, color: 'var(--gx-navy)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Designing <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>ic-brief · investor-grade</span>
              <span style={{ width: 1, height: 12, background: 'rgba(41,51,92,0.2)' }} />
              <span style={{ fontWeight: 400, fontSize: 10.5, color: 'rgba(41,51,92,0.6)' }}>v3 · draft</span>
            </div>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Export the rendered template — sign-in required">export <span style={{ opacity: 0.55, fontSize: 9 }}>▾ PDF · MD · link</span> 🔒</div>
            <div className="wf-btn ghost" style={{ fontSize: 10 }}>↻ render</div>
            <div className="wf-btn coral wf-accent-bg" style={{ fontSize: 10 }} title="Save the template — sign-in opens here so it persists to your workspace and library">💾 Save 🔒</div>
          </div>

          {/* Pinned samples row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>PINNED <span style={{ opacity: 0.55 }}>1/3</span></span>
            <span className="wf-box wf-rough-lite" style={{ padding: '2px 8px', background: 'rgba(193,232,238,0.5)', fontFamily: 'Kalam,cursive', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              Project Sundance <span style={{ color: 'rgba(41,51,92,0.55)' }}>· 11 docs</span> <span style={{ color: 'rgba(41,51,92,0.4)' }}>×</span>
            </span>
            <span className="wf-link" style={{ fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>+ pin another project</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'rgba(41,51,92,0.55)' }}>format: <b style={{ color: 'var(--gx-navy)' }}>IC brief · investor-grade</b></span>
          </div>

          {/* Subseg tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
            <div className="wf-box wf-rough-lite" style={{ padding: '3px 12px', background: '#fff' }}>Design</div>
            <div className="wf-box wf-rough-lite wf-accent-bg" style={{ padding: '3px 12px', background: 'var(--gx-cyan)', fontWeight: 700 }}>Sections <span style={{ opacity: 0.65, fontWeight: 400 }}>· 4</span></div>
            <div className="wf-box wf-rough-lite" style={{ padding: '3px 12px', background: '#fff' }}>Render</div>
          </div>

          {/* Sections list */}
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingRight: 4 }}>
            <div style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Sections · 4 pinned</span>
              <span style={{ color: 'var(--gx-coral)' }}>● 2 unsaved</span>
            </div>
            {SECTIONS.map((s, i) => (
              <React.Fragment key={s.k}>
                <div className="wf-box wf-rough-lite" style={{
                  padding: '6px 10px',
                  marginBottom: s.editing ? 0 : 4,
                  background: s.editing ? 'var(--gx-tint)' : s.edited ? 'rgba(193,232,238,0.35)' : '#fff',
                  borderBottomLeftRadius: s.editing ? 0 : undefined,
                  borderBottomRightRadius: s.editing ? 0 : undefined,
                  borderBottom: s.editing ? 'none' : undefined,
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <span style={{
                    fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700,
                    color: 'rgba(41,51,92,0.55)', minWidth: 16, paddingTop: 1,
                  }}>§{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5, fontWeight: 700, color: 'var(--gx-navy)' }}>{s.k}</span>
                      <span style={{
                        fontFamily: 'Kalam,cursive', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5,
                        padding: '0 5px', background: 'var(--gx-tint)', color: 'var(--gx-navy)',
                        borderRadius: 3,
                      }}>{s.t}</span>
                      {s.vars && <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.6)' }}>· vars: {s.vars}</span>}
                      {s.editing && <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'var(--gx-coral)', fontWeight: 700 }}>✎ editing</span>}
                    </div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, fontStyle: 'italic', color: 'rgba(41,51,92,0.7)', marginTop: 2, lineHeight: 1.3 }}>{s.q}</div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.5)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--gx-coral)' }}>📌</span>{s.meta}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>
                    {!s.editing && <span className="wf-link">Edit</span>}
                    {s.editing && <span style={{ color: 'rgba(41,51,92,0.4)' }}>↓ open</span>}
                    <span className="wf-link" style={{ color: 'rgba(41,51,92,0.4)' }}>Remove</span>
                  </div>
                </div>

                {/* Expanded edit state — section editor */}
                {s.editing && (
                  <div className="wf-box wf-rough-lite" style={{
                    padding: 10, marginBottom: 4,
                    background: '#fff',
                    border: '1.5px solid var(--gx-coral)',
                    borderTop: 'none',
                    borderTopLeftRadius: 0, borderTopRightRadius: 0,
                    boxShadow: 'inset 3px 0 0 var(--gx-coral)',
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr', gap: 8, marginBottom: 8 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>name</span>
                        <div style={{ padding: '3px 7px', border: '1.5px solid var(--gx-navy)', borderRadius: 3, fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 700, background: 'rgba(193,232,238,0.4)' }}>risk_roll_up</div>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>render as</span>
                        <div style={{ padding: '3px 7px', border: '1.5px solid var(--gx-navy)', borderRadius: 3, background: '#fff', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontFamily: 'Kalam,cursive' }}>
                          BULLETS <span style={{ flex: 1 }} /> <span style={{ opacity: 0.5 }}>▾</span>
                        </div>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>sources scope</span>
                        <div style={{ padding: '3px 7px', border: '1.5px solid rgba(41,51,92,0.4)', borderRadius: 3, background: '#fff', fontSize: 10.5, fontFamily: 'Kalam,cursive', color: 'rgba(41,51,92,0.7)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          all docs in project <span style={{ flex: 1 }} /> <span style={{ opacity: 0.5 }}>▾</span>
                        </div>
                      </label>
                    </div>

                    {/* Question prompt — the actual question that gets asked */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>question</span>
                        <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.5)' }}>· what the model is asked when this section runs</span>
                        <div style={{ flex: 1 }} />
                        <span className="wf-link" style={{ fontSize: 9 }}>✨ rewrite with agent</span>
                      </div>
                      <div style={{
                        padding: '6px 8px', border: '1.5px solid var(--gx-navy)', borderRadius: 3,
                        background: 'rgba(193,232,238,0.35)',
                        fontFamily: 'Kalam,cursive', fontSize: 11, lineHeight: 1.4, color: 'var(--gx-navy)', fontStyle: 'italic',
                      }}>
                        "Top 3 risks across all source docs for <b style={{ background: 'var(--gx-green)' }}>{'{project}'}</b>, each with severity, source citation, and 1-line mitigation note."
                      </div>
                      <div style={{ marginTop: 4, fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'rgba(41,51,92,0.6)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>variables:</span>
                        <span className="wf-box wf-rough-lite" style={{ padding: '0 5px', fontSize: 9, background: 'var(--gx-tint)' }}>{'{project}'} = "Sundance"</span>
                        <span className="wf-link" style={{ fontSize: 9 }}>+ variable</span>
                      </div>
                    </div>

                    {/* Instructions + preview */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700, marginBottom: 2 }}>instructions</div>
                        <div style={{
                          padding: '5px 7px', border: '1.5px solid rgba(41,51,92,0.4)', borderRadius: 3, background: '#fff',
                          fontFamily: 'Kalam,cursive', fontSize: 10, lineHeight: 1.4, color: 'var(--gx-navy)',
                        }}>
                          - Sort by severity desc (high → low)<br/>
                          - Cite the primary source doc for each risk<br/>
                          - One short sentence mitigation per risk<br/>
                          - Skip risks with no doc support
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 8.5, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700, marginBottom: 2 }}>preview on sundance</div>
                        <div style={{
                          padding: '5px 7px', border: '1.5px solid var(--gx-navy)', borderRadius: 3,
                          background: 'rgba(193,232,238,0.25)',
                          fontFamily: 'Kalam,cursive', fontSize: 10, lineHeight: 1.4, color: 'var(--gx-navy)',
                        }}>
                          • <b>Interconnection delay</b> · 14 mo · mitigate via early CA-3 escalation <CiteChip n={1} page={2} doc="utility-letter" /><br/>
                          • <b>Lease escalator</b> · 4.2%/yr · renegotiate yr 4 <CiteChip n={2} page={11} doc="lease-2024" /><br/>
                          • <b>O&amp;M gap</b> · re-run model with vendor quote <CiteChip n={3} page={3} doc="financial-model" />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }} />
                      <div className="wf-btn ghost" style={{ fontSize: 10 }}>cancel</div>
                      <div className="wf-btn ghost" style={{ fontSize: 10 }}>↻ rerun</div>
                      <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 10 }}>save section</div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}

            {/* Proposal card · agent's latest suggestion */}
            <div style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700, marginTop: 12, marginBottom: 5 }}>
              Proposed sections · 1 from the latest agent turn
            </div>
            <div className="wf-box wf-rough-lite" style={{ padding: 10, background: 'rgba(247,209,108,0.18)', border: '1.5px dashed var(--gx-coral)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  padding: '1px 6px', background: 'var(--gx-coral)', color: '#fff',
                  fontFamily: 'Kalam,cursive', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5,
                  borderRadius: 3,
                }}>PROPOSAL</span>
                <span style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'var(--gx-navy)' }}>Add 1 section</span>
                <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.55)' }}>proposal_v1 · envelope verified</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5, fontWeight: 700, color: 'var(--gx-navy)' }}>sensitivity_analysis</span>
                    <span style={{
                      fontFamily: 'Kalam,cursive', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5,
                      padding: '0 5px', background: 'var(--gx-tint)', color: 'var(--gx-navy)',
                      borderRadius: 3,
                    }}>TABLE</span>
                    <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.6)' }}>· vars: project · scenarios[]</span>
                  </div>
                  <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10.5, fontStyle: 'italic', color: 'rgba(41,51,92,0.7)', marginTop: 2, lineHeight: 1.3 }}>
                    "NPV sensitivity table for {'{project}'} across interconnection slip (0/6/12 mo) and lease escalator (3/4/5%) scenarios."
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 10, padding: '3px 10px' }}>Accept</div>
                  <div className="wf-btn ghost" style={{ fontSize: 10, padding: '3px 10px' }}>Dismiss</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </AppShell>
    </div>
  );
}

// ── 3 · Back-out audit · every dismissal point in the app ──
function BackOut_Audit() {
  const rows = [
    {
      where: 'F1 · sample picker',
      action: 'user lands but doesn\'t pick',
      backOut: 'no action needed — picker persists',
      target: 'idle on picker',
      destructive: false,
    },
    {
      where: 'F2–F5 · in-progress chat',
      action: 'switch sample (nav · "← try another")',
      backOut: 'confirm if dirty: "23 fields extracted · 4 cites — keep?"',
      target: 'picker (or saved state)',
      destructive: true,
    },
    {
      where: 'F3 · extract · fields panel',
      action: 'leave the extract view',
      backOut: 'click another step pill · ← back to docs · re-tap doc in chat',
      target: 'previous workspace state (results kept)',
      destructive: false,
    },
    {
      where: 'F3a · edit schema',
      action: 'discard pending edits',
      backOut: '↩ undo · discard · ESC · close tab',
      target: 'last-saved schema (v in topbar)',
      destructive: true,
    },
    {
      where: 'F4 · citation peek',
      action: 'dismiss peek',
      backOut: '▴ collapse · ESC · click outside · re-tap chip',
      target: 'chat at peek\'s parent bubble',
      destructive: false,
    },
    {
      where: 'F5 · grounded answer',
      action: 'don\'t like the answer',
      backOut: 'regenerate · refine in chat · undo last turn',
      target: 'previous chat state',
      destructive: false,
    },
    {
      where: 'F6 · gate panel',
      action: 'not ready to sign in',
      backOut: '× · ESC · ← keep exploring · keep chatting',
      target: 'previous state, session preserved',
      destructive: false,
    },
    {
      where: 'F7 · Integrate',
      action: 'go back to extract / chat',
      backOut: 'click any reachable step pill in the strip (Ingest / Understand / Analyze)',
      target: 'previous step',
      destructive: false,
    },
    {
      where: 'S1 · Loan extract output',
      action: 'leave the results view',
      backOut: '← back · click another step pill',
      target: 'F2-style picker or F3-style fields',
      destructive: false,
    },
    {
      where: 'S3 · IC brief rendered',
      action: 'don\'t want this draft',
      backOut: '↻ render · ✎ edit template · keep editing in chat',
      target: 'in-progress (analysis preserved)',
      destructive: false,
    },
    {
      where: 'S3a · report builder',
      action: 'discard pending edits',
      backOut: '↩ undo · discard · ESC · close tab',
      target: 'last-saved template (v in topbar)',
      destructive: true,
    },
    {
      where: 'L3 · focus chat',
      action: 'exit focus mode',
      backOut: '↙ back to split · ESC · click backdrop · ⌥-3',
      target: 'split layout',
      destructive: false,
    },
    {
      where: 'L4 · focus workspace',
      action: 'exit focus mode',
      backOut: 'tap chat puck · ⌥-3 · drag from edge',
      target: 'split layout',
      destructive: false,
    },
    {
      where: 'Mobile · any sheet',
      action: 'dismiss sheet',
      backOut: 'swipe down · × in header · tap backdrop',
      target: 'screen behind sheet',
      destructive: false,
    },
  ];

  return (
    <div className="ab" style={{ padding: '22px 26px' }}>
      <div className="ab-title">Back-out · every dismissal point</div>
      <div className="ab-sub">Audit of where users can step back. Destructive rows are marked — they need a confirm. Everything else is reversible by design.</div>

      <div className="wf-box wf-rough-lite" style={{ padding: 12, background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.6fr 1.2fr 0.5fr', gap: 10, fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, paddingBottom: 6, borderBottom: '1.4px solid var(--gx-navy)' }}>
          <div>Screen</div><div>Action</div><div>How to back out</div><div>Target state</div><div>Destructive?</div>
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.6fr 1.2fr 0.5fr', gap: 10,
            fontFamily: 'Kalam,cursive', fontSize: 11.5, padding: '6px 0',
            borderBottom: '1px dashed rgba(41,51,92,0.15)',
            background: r.destructive ? 'rgba(243,102,63,0.08)' : 'transparent',
          }}>
            <div style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>{r.where}</div>
            <div>{r.action}</div>
            <div>{r.backOut}</div>
            <div style={{ color: 'rgba(41,51,92,0.75)' }}>{r.target}</div>
            <div style={{ fontWeight: 700, color: r.destructive ? 'var(--gx-coral)' : 'rgba(41,51,92,0.4)' }}>
              {r.destructive ? '⚠ confirm' : '—'}
            </div>
          </div>
        ))}
      </div>

      <div className="wf-box wf-rough-lite" style={{ padding: 12, marginTop: 14, background: 'var(--gx-tint)' }}>
        <div className="wf-label" style={{ marginBottom: 4 }}>RULES</div>
        <ol style={{ paddingLeft: 18, margin: 0, fontFamily: 'Kalam,cursive', fontSize: 12, lineHeight: 1.4 }}>
          <li><b>Always one click / one gesture.</b> No two-step dismissals.</li>
          <li><b>Always reversible</b> unless the action is destructive — those get one confirm with a "keep this work" escape via sign-in.</li>
          <li><b>Session-preserving by default.</b> Dismissing a gate, peek, or focus mode never loses data.</li>
          <li><b>Keyboard equivalents</b> on desktop: ESC for sheets/modals; ⌥-3 to return to split.</li>
          <li><b>Touch equivalents</b> on mobile: swipe-down on sheets; back-arrow in headers; × where space allows.</li>
        </ol>
      </div>
    </div>
  );
}

Object.assign(window, { Lifecycle_Scenario, Solar_EndState, Solar_ReportBuilder, BackOut_Audit });

// ── 2 · Solar end-state · IC brief · rendered view ──
// What you see right after the agent finishes assembling the report. The brief
// is the *output*; the template that produced it lives one click away in S3a
// (Solar_ReportBuilder). This screen makes that relationship explicit:
//   · topbar reads "Reading {name}" + an "Edit template" button
//   · each section heading carries a tiny "edit §N" affordance
//   · a footer banner says "want to change what runs? edit the template"
function Solar_EndState() {
  return (
    <div className="ab">
      <div className="ab-title">Solar · IC brief · rendered from template</div>
      <div className="ab-sub">
        <b>Output of running the IC brief template against Project Sundance.</b> 4 sections rendered from the saved questions, each with citations. To change <i>what</i> the brief asks (add a section, retype a prompt, change render format), <b>tap "Edit template ▾"</b> in the topbar or the small "edit §N" link on any section heading — both jump to S3a · Report builder with that section pre-selected.
      </div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={340} focus="split">
        <>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
              <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Report Agent</div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10 }}>
              <span style={{ color: 'rgba(41,51,92,0.5)' }}>sample:</span>
              <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>Solar Portfolio</span>
              <span className="wf-link" style={{ color: 'rgba(41,51,92,0.55)' }}>switch ▾</span>
            </div>
          </div>

          <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
            <div style={{
              padding: '6px 10px', margin: '0 0 10px', textAlign: 'center',
              fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.5)',
              borderTop: '1px dashed rgba(41,51,92,0.2)', borderBottom: '1px dashed rgba(41,51,92,0.2)',
            }}>
              <span className="wf-link">▾ 6 earlier turns (3 risks pinned · cordoba comparison)</span>
            </div>

            <Bubble who="me">render the IC brief</Bubble>
            <Bubble who="gx" lead>
              ✓ <b>4 sections rendered</b> from the IC brief template against Project Sundance · all claims cited.
              <div style={{ marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.7)' }}>
                Want to add a section? Try <i>"add a sensitivity analysis"</i> in chat, or tap <b>Edit template ▾</b> on the right to use the builder directly.
              </div>
            </Bubble>
            <Bubble who="gx" opts={[
              { label: '✎ edit template', hot: true },
              { label: '↻ re-render' },
              { label: '📄 export as PDF' },
            ]}>
            </Bubble>
          </div>

          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="ask about the brief, or describe a change…" />
          </div>
        </>

        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {/* Step strip · Report active. Extract disabled (no field extraction). */}
          <div style={{ padding: '8px 14px 10px', background: '#fafaf6', borderRadius: 6, marginBottom: 8 }}>
            <OnboardingStepStrip currentStepKey="analyze" activeSubKey="report" doneSubKeys={['interact']} />
          </div>

          {/* Topbar · read mode — matches the editor chrome but says "Reading" + Edit template */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(41,51,92,0.12)' }}>
            <div style={{
              padding: '3px 8px', background: '#fff',
              border: '1.5px solid var(--gx-navy)', borderRadius: 4,
              fontFamily: 'Kalam,cursive', fontSize: 13, fontWeight: 700, color: 'var(--gx-navy)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Reading <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>ic-brief · investor-grade</span>
              <span style={{ width: 1, height: 12, background: 'rgba(41,51,92,0.2)' }} />
              <span style={{ fontWeight: 400, fontSize: 10.5, color: 'rgba(41,51,92,0.6)' }}>v3</span>
            </div>
            <span style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>· rendered just now · on Project Sundance</span>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Export the rendered brief — sign-in required">export <span style={{ opacity: 0.55, fontSize: 9 }}>▾ PDF · MD · link</span> 🔒</div>
            <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 10 }} title="Open the template in the Report builder (S3a) to add/retype/re-order sections">✎ edit template ▾</div>
            <div className="wf-btn coral wf-accent-bg" style={{ fontSize: 10 }} title="Save the rendered brief — sign-in opens here">💾 Save 🔒</div>
          </div>

          {/* Brief content — sections rendered with edit-§N affordances */}
          <RBox w="100%" fill="fill" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ padding: 16, fontFamily: 'Kalam,cursive', color: 'var(--gx-navy)', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
              <div className="wf-h" style={{ fontSize: 18, color: 'var(--gx-navy)', lineHeight: 1.1 }}>Project Sundance · 24MW solar</div>
              <div style={{ fontSize: 10.5, color: 'rgba(41,51,92,0.55)', marginTop: 2 }}>Renewable III › West Solar 2024 › Sundance · rendered just now</div>

              {[
                { n: 1, k: 'executive_summary', t: 'PARAGRAPH', heading: 'Executive Summary', body: (
                  <>Sundance is on track for COD Q3 2026 with a base-case <b>NPV of $11.8M</b> <CiteChip n={1} page={3} doc="financial-model" />. Three risks materially affect the underwriting: a <b>14-month interconnection backlog</b> with utility CA-3 <CiteChip n={2} page={2} doc="utility-letter" />, a <b>4.2% lease escalator</b> after year 5 <CiteChip n={3} page={11} doc="lease-2024" color="coral" />, and an <b>O&amp;M assumption gap</b> ($0.6M model vs $1.0M vendor) <CiteChip n={4} page={3} doc="financial-model" />.</>
                ) },
                { n: 2, k: 'risk_roll_up', t: 'BULLETS', heading: 'Risk roll-up', body: (
                  <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
                    <li><b>Interconnection delay</b> · severity high · CA-3 letter, 14 mo backlog <CiteChip n={2} page={2} doc="utility-letter" /> — mitigate via early CA-3 escalation.</li>
                    <li><b>Lease escalator above market</b> · severity med · 4.2% / yr after yr 5 <CiteChip n={3} page={11} doc="lease-2024" color="coral" /> — renegotiate yr 4.</li>
                    <li><b>O&amp;M assumption gap</b> · severity med · $0.6M model vs $1.0M vendor <CiteChip n={4} page={3} doc="financial-model" /> — re-run model with vendor quote.</li>
                  </ul>
                ) },
                { n: 3, k: 'comparable_projects', t: 'TABLE', heading: 'Comparable projects', body: (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 0, border: '1.5px solid var(--gx-navy)', fontSize: 10.5 }}>
                      {['', 'IRR', 'Lease (yr 5+)', 'Intercon. (mo)'].map((h, i) => (
                        <div key={i} style={{ padding: '3px 6px', fontWeight: 700, background: 'var(--gx-navy)', color: '#fff', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>{h}</div>
                      ))}
                      {[
                        ['Sundance', '11.2%', '4.2%', '14'],
                        ['Cordoba', '10.4%', '3.0%', '6'],
                        ['Helios', '12.1%', '3.5%', '9'],
                      ].flatMap((row, r) => row.map((cell, c) => (
                        <div key={`${r}-${c}`} style={{ padding: '3px 6px', background: r % 2 ? '#fafaf6' : '#fff', borderRight: c < 3 ? '1px solid rgba(41,51,92,0.12)' : 'none', borderTop: '1px solid rgba(41,51,92,0.12)', fontWeight: c === 0 ? 700 : 400 }}>{cell}</div>
                      )))}
                    </div>
                  </div>
                ) },
                { n: 4, k: 'recommendation', t: 'PARAGRAPH', heading: 'Recommendation', body: (
                  <>Proceed with underwriting at the base-case NPV pending two diligence items: (a) confirm <b>interconnection slip exposure</b> with utility CA-3 by end of month; (b) re-run financial model with vendor O&amp;M assumption. Lease escalator does not change the recommendation but should be flagged for renegotiation in yr 4. <CiteChip n={5} page={1} doc="ic-memo" /></>
                ) },
              ].map((sec) => (
                <div key={sec.k} style={{ marginTop: 12, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, fontWeight: 700, color: 'rgba(41,51,92,0.55)' }}>§{sec.n}</span>
                    <div className="wf-label" style={{ margin: 0, color: 'var(--gx-navy)' }}>{sec.heading}</div>
                    <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9, color: 'rgba(41,51,92,0.5)' }}>{sec.t.toLowerCase()}</span>
                    <div style={{ flex: 1 }} />
                    <span className="wf-link" style={{ fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'var(--gx-coral)' }} title="Open this section in the template editor">✎ edit §{sec.n}</span>
                  </div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.45, marginTop: 2, color: 'var(--gx-navy)' }}>{sec.body}</div>
                </div>
              ))}
            </div>
          </RBox>

          {/* Template provenance banner — the link from output back to source */}
          <div className="wf-box wf-rough-lite" style={{ marginTop: 8, padding: 8, background: 'var(--gx-tint)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 14 }}>📐</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'var(--gx-navy)', flex: 1, lineHeight: 1.3 }}>
              <b>Want to change what this brief asks?</b>
              <span style={{ fontWeight: 400, color: 'rgba(41,51,92,0.7)', marginLeft: 4 }}>
                Sections come from the <b>ic-brief · investor-grade</b> template. Edit it to change every render — or tap <b>✎ edit §N</b> on any section above to jump there.
              </span>
            </div>
            <div className="wf-btn ghost" style={{ fontSize: 10 }}>open template →</div>
          </div>
        </div>
      </AppShell>
    </div>
  );
}
