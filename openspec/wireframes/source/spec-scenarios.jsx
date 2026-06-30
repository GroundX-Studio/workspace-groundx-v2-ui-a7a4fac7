// spec-scenarios.jsx — the other two preloaded scenarios.
// Same AppShell, different content. One frame per scenario showing answer + workspace.

function _scenarioShellChat({ history, currentQ, currentA, sample }) {
  return (
    <>
      <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
          <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Conversation</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>{history.length + 1} turns</div>
        </div>
        {sample && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Kalam,cursive', fontSize: 10 }}>
            <span style={{ color: 'rgba(41,51,92,0.5)' }}>sample:</span>
            <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>{sample}</span>
            <span className="wf-link" style={{ color: 'rgba(41,51,92,0.55)' }}>switch ▾</span>
          </div>
        )}
      </div>
      <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
        {/* compressed history */}
        {history.length > 0 && (
          <>
            <div className="wf-label" style={{ color: 'rgba(41,51,92,0.5)', marginBottom: 6 }}>EARLIER ({history.length})</div>
            {history.map((h, i) => (
              <div key={i} className="wf-box wf-rough-lite" style={{ padding: '4px 8px', marginBottom: 4, fontFamily: 'Kalam,cursive', fontSize: 10 }}>
                <span style={{ color: 'rgba(41,51,92,0.5)' }}>{h.q}</span>
                {h.ans && <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}> → {h.ans}</span>}
              </div>
            ))}
            <div style={{ height: 8 }} />
          </>
        )}
        <Bubble who="me">{currentQ}</Bubble>
        {currentA}
      </div>
      <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
        <ChatInput placeholder="ask anything…" />
      </div>
    </>
  );
}

// ── Loan Eligibility scenario · same chrome as F3a · Results tab, JSON render ──
// S1 is the Loan-shaped output of the Extract surface — same Schema-Editor chrome
// as F3a (topbar + pinned samples + Design/Fields/Results sub-tabs), in Results
// mode with the JSON render selected because the chat asked for a JSON shape.
function Scenario_Loan() {
  return (
    <div className="ab">
      <div className="ab-title">Scenario · Loan Eligibility · Extract output (JSON render)</div>
      <div className="ab-sub">
        <b>Same chrome as F3a · Edit schema.</b> Results tab active (the schema has run); <b>JSON</b> selected because the chat asked for a JSON shape. Same primitives across the Extract surface, different default render.
      </div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={340} focus="split">
        {_scenarioShellChat({
          sample: 'Loan Eligibility',
          history: [
            { q: 'opened Loan Eligibility', ans: '12 docs' },
            { q: 'extract income, DTI, employer, employment length', ans: '$94k · 28% DTI · Acme · 4y' },
          ],
          currentQ: 'shape this for a JSON loan-approval workflow',
          currentA: (
            <Bubble who="gx" lead>
              <b>Done.</b> Fields grouped by your underwriting schema. Anomalies flagged inline.
              <CiteChip n={1} page={2} doc="w2-2024" />
              <CiteChip n={2} page={1} doc="paystub-mar" />
              <CiteChip n={3} page={3} doc="bank-stmt-q1" color="coral" />
              <div style={{ marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>
                <b>1 anomaly:</b> $14,200 deposit on 2024-02-18 has no matching paystub.
              </div>
              {/* Pin to report affordance · consistent with S2/S3 */}
              <div style={{
                marginTop: 6, padding: '3px 7px',
                background: '#fff', border: '1.5px dashed rgba(41,51,92,0.3)', borderRadius: 4,
                fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.7)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ color: 'var(--gx-coral)' }}>📌</span>
                <span className="wf-link" style={{ color: 'var(--gx-navy)', fontWeight: 700 }}>pin to report</span>
                <span style={{ color: 'rgba(41,51,92,0.45)' }}>· lands as a new section in a template</span>
                <div style={{ flex: 1 }} />
                <span className="wf-link" style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)' }}>copy</span>
              </div>
            </Bubble>
          ),
        })}

        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {/* Step strip — same as F-series. User has extracted and is now in Interact. */}
          <div style={{ padding: '8px 14px 10px', background: '#fafaf6', borderRadius: 6, marginBottom: 8 }}>
            <OnboardingStepStrip currentStepKey="analyze" activeSubKey="interact" doneSubKeys={['extract']} />
          </div>

          {/* Schema topbar · matches F3a chrome */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(41,51,92,0.12)' }}>
            <span className="wf-link" style={{ fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>← back</span>
            <div style={{
              padding: '3px 8px', background: '#fff',
              border: '1.5px solid var(--gx-navy)', borderRadius: 4,
              fontFamily: 'Kalam,cursive', fontSize: 13, fontWeight: 700, color: 'var(--gx-navy)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Reading <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>loan-eligibility · statement</span>
              <span style={{ width: 1, height: 12, background: 'rgba(41,51,92,0.2)' }} />
              <span style={{ fontWeight: 400, fontSize: 10.5, color: 'rgba(41,51,92,0.6)' }}>v1 · saved</span>
            </div>
            <span style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>· ran just now</span>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Export the extraction — sign-in required">export <span style={{ opacity: 0.55, fontSize: 9 }}>▾ JSON · CSV · YAML</span> 🔒</div>
            <div className="wf-btn ghost" style={{ fontSize: 10 }}>↻ rerun</div>
            <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 10 }} title="Open the schema in F3a · Edit schema (Design tab)">✎ edit schema ▾</div>
            <div className="wf-btn coral wf-accent-bg" style={{ fontSize: 10 }} title="Save the schema — sign-in opens here">💾 Save 🔒</div>
          </div>

          {/* Pinned samples row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>PINNED <span style={{ opacity: 0.55 }}>1/3</span></span>
            <span className="wf-box wf-rough-lite" style={{ padding: '2px 8px', background: 'rgba(193,232,238,0.5)', fontFamily: 'Kalam,cursive', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              loan-packet.zip <span style={{ color: 'rgba(41,51,92,0.55)' }}>· 12 docs</span> <span style={{ color: 'rgba(41,51,92,0.4)' }}>×</span>
            </span>
            <span className="wf-link" style={{ fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>+ pin another sample</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'rgba(41,51,92,0.55)' }}>category: <b style={{ color: 'var(--gx-navy)' }}>statement</b></span>
          </div>

          {/* Subseg tabs — Results is active (the schema has run) */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
            <div className="wf-box wf-rough-lite" style={{ padding: '3px 12px', background: '#fff' }}>Design</div>
            <div className="wf-box wf-rough-lite" style={{ padding: '3px 12px', background: '#fff' }}>Fields <span style={{ opacity: 0.65 }}>· 9</span></div>
            <div className="wf-box wf-rough-lite wf-accent-bg" style={{ padding: '3px 12px', background: 'var(--gx-cyan)', fontWeight: 700 }}>Results</div>
          </div>

          {/* Inside Results · render-mode toggle (Results-tab specific) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '4px 8px', background: '#fafaf6', borderRadius: 4 }}>
            <span style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Kalam,cursive', fontWeight: 700 }}>render as</span>
            {[
              { label: 'table' },
              { label: 'JSON', active: true },
              { label: 'grid' },
            ].map((m) => (
              <div key={m.label} className={`wf-box wf-rough-lite ${m.active ? 'wf-accent-bg' : ''}`} style={{
                padding: '2px 9px', fontFamily: 'Kalam,cursive', fontSize: 10.5,
                background: m.active ? 'var(--gx-green)' : '#fff',
                fontWeight: m.active ? 700 : 400,
              }}>{m.label}</div>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'rgba(41,51,92,0.55)' }}>9 fields · all cited</span>
          </div>

          {/* JSON render */}
          <RBox w="100%" fill="fill" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ padding: 14, fontFamily: '"JetBrains Mono", "Kalam", monospace', fontSize: 12, color: 'var(--gx-navy)', lineHeight: 1.55, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
              <div>{'{'}</div>
              <div style={{ paddingLeft: 16 }}>
                <span style={{ color: 'var(--gx-coral)' }}>"income"</span>: {'{'}
                <div style={{ paddingLeft: 16 }}>
                  <span style={{ color: 'var(--gx-coral)' }}>"annual_base"</span>: <span style={{ fontWeight: 700 }}>94000</span>, <CiteChip n={1} page={2} doc="w2-2024" /><br/>
                  <span style={{ color: 'var(--gx-coral)' }}>"ytd_gross"</span>: <span style={{ fontWeight: 700 }}>23517</span>, <CiteChip n={2} page={1} doc="paystub-mar" /><br/>
                  <span style={{ color: 'var(--gx-coral)' }}>"bonuses"</span>: <span style={{ fontWeight: 700 }}>0</span>
                </div>
                {'}'},
                <br/>
                <span style={{ color: 'var(--gx-coral)' }}>"dti"</span>: <span style={{ fontWeight: 700 }}>0.28</span>,<br/>
                <span style={{ color: 'var(--gx-coral)' }}>"employer"</span>: <span style={{ color: 'var(--gx-green)' }}>"Acme Corp"</span>, <CiteChip n={4} page={1} doc="employment-letter" /><br/>
                <span style={{ color: 'var(--gx-coral)' }}>"employment_years"</span>: <span style={{ fontWeight: 700 }}>4.2</span>,<br/>
                <span style={{ color: 'var(--gx-coral)' }}>"anomalies"</span>: [
                <div style={{ paddingLeft: 16 }}>
                  {'{'} <span style={{ color: 'var(--gx-coral)' }}>"type"</span>: <span style={{ color: 'var(--gx-green)' }}>"unexplained_deposit"</span>,<br/>
                  <span style={{ paddingLeft: 24 }}><span style={{ color: 'var(--gx-coral)' }}>"amount"</span>: <span style={{ fontWeight: 700 }}>14200</span>,</span><br/>
                  <span style={{ paddingLeft: 24 }}><span style={{ color: 'var(--gx-coral)' }}>"date"</span>: <span style={{ color: 'var(--gx-green)' }}>"2024-02-18"</span>, <CiteChip n={3} page={3} doc="bank-stmt-q1" color="coral" /></span> {'}'},
                </div>
                ]
              </div>
              <div>{'}'}</div>
            </div>
          </RBox>
        </div>
      </AppShell>
    </div>
  );
}

// ── Solar Portfolio scenario ──
function Scenario_Solar() {
  return (
    <div className="ab">
      <div className="ab-title">Scenario · Solar Project Portfolio</div>
      <div className="ab-sub">Enterprise / cross-document intelligence. Workspace shifts to a hierarchy view; chat composes across docs.</div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={340} focus="split">
        {_scenarioShellChat({
          sample: 'Solar Portfolio',
          history: [
            { q: 'opened Solar Portfolio', ans: '142 docs · 3 funds · 8 projects' },
            { q: 'highest lease exposure?', ans: 'Project Sundance · $4.2M' },
          ],
          currentQ: 'summarize risk across Project Sundance',
          currentA: (
            <Bubble who="gx" lead>
              <b>3 risks rolled up</b> from 11 source documents:
              <ol style={{ paddingLeft: 18, margin: '6px 0', fontFamily: 'Kalam,cursive', fontSize: 12, lineHeight: 1.4 }}>
                <li><b>Interconnection delay</b> — utility CA-3 letter, 14 mo backlog <CiteChip n={1} page={2} doc="utility-letter" /></li>
                <li><b>Lease escalator</b> — 4.2% annual after yr 5 <CiteChip n={2} page={11} doc="lease-2024" color="coral" /></li>
                <li><b>O&amp;M assumption gap</b> — financial model uses 60% of vendor quote <CiteChip n={3} page={3} doc="financial-model" /></li>
              </ol>

              {/* Pin to report affordance — the canonical "save this Q&A as a section"
                  interaction. Shows on every assistant turn; clicking lands the Q&A
                  in the active report template (or opens template picker). */}
              <div style={{
                marginTop: 6, padding: '3px 7px',
                background: '#fff', border: '1.5px dashed rgba(41,51,92,0.3)', borderRadius: 4,
                fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.7)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ color: 'var(--gx-coral)' }}>📌</span>
                <span className="wf-link" style={{ color: 'var(--gx-navy)', fontWeight: 700 }}>pin to report</span>
                <span style={{ color: 'rgba(41,51,92,0.45)' }}>· lands as a new section in a template</span>
                <div style={{ flex: 1 }} />
                <span className="wf-link" style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)' }}>copy</span>
                <span className="wf-link" style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)' }}>share</span>
              </div>

              <div style={{ marginTop: 4, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>
                Generate an investment-committee brief from this?
              </div>
            </Bubble>
          ),
        })}

        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Onboarding step strip — Extract is disabled in this scenario (no
              field extraction; pure cross-document interact). Interact is active. */}
          <div style={{ padding: '10px 14px 12px', background: '#fafaf6', borderRadius: 6, marginBottom: 10 }}>
            <OnboardingStepStrip currentStepKey="analyze" activeSubKey="interact" />
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <div className="wf-h" style={{ fontSize: 20 }}>Solar Portfolio · Project Sundance</div>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Run a saved report template against this project — IC brief, risk memo, etc.">📐 use template <span style={{ opacity: 0.55, fontSize: 9 }}>▾</span></div>
            <div className="wf-btn coral wf-accent-bg" style={{ fontSize: 11 }} title="Save the brief — sign-in opens here so it persists to your workspace">💾 Save 🔒</div>
          </div>

          {/* Hierarchy breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
            <span style={{ color: 'rgba(41,51,92,0.55)' }}>Portfolio · Renewable III</span>
            <span style={{ color: 'rgba(41,51,92,0.4)' }}>›</span>
            <span style={{ color: 'rgba(41,51,92,0.55)' }}>Fund · West Solar 2024</span>
            <span style={{ color: 'rgba(41,51,92,0.4)' }}>›</span>
            <span style={{ fontWeight: 700, color: 'var(--gx-navy)' }}>Project · Sundance</span>
          </div>

          {/* Two-pane: source docs + risk roll-up */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12, flex: 1, minHeight: 0 }}>
            {/* Cited sources · the 3 docs the answer drew from */}
            <RBox w="100%" h="100%" fill="fill">
              <div style={{ padding: 12, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
                <div className="wf-label" style={{ marginBottom: 8 }}>CITED SOURCES · 3 OF 11</div>
                {[
                  { doc: 'utility-letter-CA3.pdf', type: 'Utility', n: 1, page: 2 },
                  { doc: 'lease-2024.pdf', type: 'Lease', n: 2, page: 11, color: 'coral' },
                  { doc: 'financial-model.xlsx', type: 'Model', n: 3, page: 3 },
                ].map((d, i) => (
                  <div key={i} className="wf-box wf-rough-lite" style={{
                    padding: '5px 8px', marginBottom: 4,
                    fontFamily: 'Kalam,cursive', fontSize: 11,
                    background: 'var(--gx-tint)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <Doc w={14} h={18} />
                    <div style={{ flex: 1, fontWeight: 700 }}>{d.doc}</div>
                    <div style={{ fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>{d.type}</div>
                    <CiteChip n={d.n} page={d.page} doc={d.doc} color={d.color} />
                  </div>
                ))}

                <div className="wf-label" style={{ marginTop: 14, marginBottom: 6, color: 'rgba(41,51,92,0.55)' }}>OTHER DOCS IN PROJECT · 8</div>
                {[
                  { doc: 'PPA-vendor.pdf', type: 'Agreement' },
                  { doc: 'engineering-study.pdf', type: 'Engineering' },
                  { doc: 'permit-county.pdf', type: 'Permit' },
                  { doc: 'interconnection.pdf', type: 'Grid' },
                  { doc: 'vendor-quote-OM.pdf', type: 'Vendor' },
                ].map((d, i) => (
                  <div key={i} className="wf-box wf-rough-lite" style={{
                    padding: '4px 8px', marginBottom: 3,
                    fontFamily: 'Kalam,cursive', fontSize: 10.5,
                    background: '#fff', opacity: 0.65,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <Doc w={12} h={16} />
                    <div style={{ flex: 1 }}>{d.doc}</div>
                    <div style={{ fontSize: 9, color: 'rgba(41,51,92,0.55)' }}>{d.type}</div>
                  </div>
                ))}
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.5)', textAlign: 'center', marginTop: 4 }}>+ 3 more</div>
              </div>
            </RBox>

            {/* Answer · canvas view — the same 3 risks from chat, structured */}
            <RBox w="100%" h="100%" fill="fill">
              <div style={{ padding: 12, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                  <div className="wf-label" style={{ margin: 0 }}>ANSWER · CANVAS VIEW</div>
                  <span style={{ fontFamily: 'Kalam,cursive', fontSize: 9.5, color: 'rgba(41,51,92,0.55)' }}>· the same 3 risks from chat, structured</span>
                </div>
                {[
                  { sev: 'high', title: 'Interconnection delay', meta: 'utility CA-3 · 14 mo backlog', n: 1, page: 2, doc: 'utility-letter-CA3' },
                  { sev: 'med', title: 'Lease escalator above market', meta: '4.2% / yr after yr 5', n: 2, page: 11, doc: 'lease-2024', color: 'coral' },
                  { sev: 'med', title: 'O&M assumption gap', meta: '$0.6M annual vs $1.0M vendor', n: 3, page: 3, doc: 'financial-model' },
                ].map((r, i) => (
                  <div key={i} className="wf-box wf-rough-lite" style={{ padding: 10, marginBottom: 6, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 10, left: -1, bottom: 10, width: 4, background: r.sev === 'high' ? 'var(--gx-coral)' : '#e3a514' }} className="wf-accent-bg" />
                    <div style={{ paddingLeft: 8, fontFamily: 'Kalam,cursive', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
                          background: r.sev === 'high' ? 'var(--gx-coral)' : '#e3a514',
                          color: '#fff', padding: '1px 5px', borderRadius: 3,
                        }} className="wf-accent-bg">{r.sev}</span>
                        <span style={{ fontWeight: 700 }}>{r.title}</span>
                        <span style={{ flex: 1 }} />
                        <CiteChip n={r.n} page={r.page} doc={r.doc} color={r.color} />
                      </div>
                      <div style={{ paddingLeft: 0, fontSize: 11, color: 'rgba(41,51,92,0.7)', marginTop: 3 }}>{r.meta}</div>
                    </div>
                  </div>
                ))}

                {/* How citations work · annotation */}
                <div style={{
                  marginTop: 10, padding: 8,
                  border: '1.5px dashed rgba(41,51,92,0.25)', borderRadius: 4,
                  fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.7)', lineHeight: 1.35,
                }}>
                  <b style={{ color: 'var(--gx-navy)' }}>How to see citations:</b><br/>
                  · <b>Click any chip</b> (here, in chat, or on a doc row) → opens an inline peek with the source region highlighted on the doc.<br/>
                  · <b>Hover a chip</b> → connector line lights up between the risk row, the chat citation, and the doc row above. Same number = same citation everywhere.
                </div>
              </div>
            </RBox>
          </div>
        </div>
      </AppShell>
    </div>
  );
}

Object.assign(window, { Scenario_Loan, Scenario_Solar });
