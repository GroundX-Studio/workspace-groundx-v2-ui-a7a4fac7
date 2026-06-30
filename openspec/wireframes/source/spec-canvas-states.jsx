// spec-canvas-states.jsx — answers two design questions:
// 1) "what is the 'workspace' in your design?" → the right pane is the CANVAS.
//    What shows there when no doc is open = the project's contents.
// 2) Codified nav structure: content (top) / account (bottom).

// ── 1 · Docs landing · canvas default state ──
// When the user clicks "Docs" (top of nav), this is what shows in the canvas.
// Pre-onboarding: lists the 3 preloaded scenarios as projects, plus an empty
// "+ New project" tile that triggers the upload gate.
function Canvas_Docs() {
  return (
    <div className="ab">
      <div className="ab-title">Canvas · Projects landing</div>
      <div className="ab-sub">What shows when the user clicks <b>Projects</b> (top of nav). 3 sample projects inside the default Sample workspace. No doc open yet.</div>

      <AppShell navState="full" navActive="projects" accountState="free" chatWidth={320} focus="split">
        {/* Chat — recap / pick up where you left off */}
        <>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
              <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Conversation</div>
              <div style={{ flex: 1 }} />
              <div className="wf-btn ghost" style={{ fontSize: 10, padding: '2px 6px' }}>+ new</div>
            </div>
          </div>
          <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
            <Bubble who="gx" lead>
              Pick a project on the right, or pick up where you left off.
            </Bubble>
            <div className="wf-label" style={{ color: 'rgba(41,51,92,0.5)', marginBottom: 6, marginTop: 8 }}>RECENT</div>
            {[
              { time: 'yesterday', q: 'Utility Bill · extract by meter', ans: '56 charges' },
              { time: '3 days ago', q: 'Loan packet · build JSON', ans: '1 anomaly' },
              { time: 'last week', q: 'Solar · Sundance risks', ans: '3 flags' },
            ].map((h, i) => (
              <div key={i} className="wf-box wf-rough-lite" style={{ padding: '5px 8px', marginBottom: 4, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ color: 'rgba(41,51,92,0.5)', fontSize: 10 }}>{h.time}</span>
                  <span style={{ flex: 1, color: 'var(--gx-navy)' }}>{h.q}</span>
                </div>
                <div style={{ fontWeight: 700, marginTop: 2, color: 'var(--gx-navy)' }}>→ {h.ans}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="open a project, or ask anything…" />
          </div>
        </>

        {/* Canvas — Docs landing */}
        <div style={{ padding: 20, height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
            <div className="wf-h" style={{ fontSize: 28 }}>Projects</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.6)' }}>in <b>Sample</b> workspace · 3 preloaded · upload your own when ready</div>
            <div style={{ flex: 1 }} />
            <div className="wf-btn ghost" style={{ fontSize: 12 }}>sort ▾</div>
            <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 12 }}>+ upload doc · sign in</div>
          </div>
          <div className="wf-line dim" style={{ width: '100%', marginBottom: 14 }} />

          {/* Project grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {[SCENARIOS.utility, SCENARIOS.loan, SCENARIOS.solar].map((s) => (
              <div key={s.key} className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff', cursor: 'pointer', position: 'relative' }}>
                <div className="wf-anno wf-accent-bg" style={{
                  position: 'absolute', top: -10, right: 12,
                  background: 'var(--gx-cyan)', border: '1.5px solid var(--gx-navy)',
                  padding: '1px 8px', borderRadius: 99,
                  fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700,
                }}>sample</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Doc w={44} h={56} />
                    <div className="wf-accent-bg" style={{
                      position: 'absolute', bottom: -6, right: -6,
                      background: 'var(--gx-cyan)', border: '1.5px solid var(--gx-navy)',
                      borderRadius: 99, padding: '1px 6px',
                      fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700,
                    }}>{s.docCount}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="wf-h" style={{ fontSize: 21, lineHeight: 1.05 }}>{s.name}</div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.7)', marginTop: 4 }}>{s.shortDesc}</div>
                    <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'var(--gx-coral)', fontWeight: 700, marginTop: 6 }}>{s.demonstrates}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                      <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.55)' }}>
                        last opened · {s.key === 'utility' ? 'yesterday' : s.key === 'loan' ? '3 days ago' : 'last week'}
                      </div>
                      <div style={{ flex: 1 }} />
                      <div className="wf-btn ghost" style={{ fontSize: 11, padding: '4px 10px' }}>open →</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* + New project tile (Matt-style; gates on click) */}
            <AddYourOwnTile height={160} />
          </div>
        </div>
      </AppShell>

    </div>
  );
}

// ── 2 · Nav structure · design guidance ──
function Nav_Guidance() {
  return (
    <div className="ab" style={{ padding: '24px 28px' }}>
      <div className="ab-title">Nav · structure guidance</div>
      <div className="ab-sub">Top = content. Bottom = account. One rule, applied at every breakpoint and in every mode.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'flex-start' }}>
        {/* Visual diagram */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 8 }}>EXPANDED · 180px</div>
          <div style={{ background: '#f8f7f2', border: '1.5px solid var(--gx-navy)', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 22, height: 22, fontSize: 13 }}>G</div>
              <div className="wf-h" style={{ fontSize: 18 }}>GroundX</div>
            </div>
            <div style={{ height: 1, background: 'rgba(41,51,92,0.12)', margin: '6px 0' }} />
            <div className="wf-label" style={{ color: 'rgba(41,51,92,0.5)', fontSize: 9 }}>PRIMARY</div>
            <div style={{ padding: '6px 10px', fontFamily: 'Kalam,cursive', fontSize: 12, fontWeight: 700, background: 'var(--gx-cyan)', border: '1px solid rgba(41,51,92,0.3)', borderRadius: 4 }}>Workspaces</div>
            <div style={{ padding: '6px 10px', fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.7)' }}>Projects</div>

            <div style={{ flex: 1, minHeight: 60 }} />

            <div className="wf-label" style={{ color: 'rgba(41,51,92,0.5)', fontSize: 9 }}>ACCOUNT + REFERENCE</div>
            <div className="wf-accent-stroke" style={{
              padding: '8px 10px',
              fontFamily: 'Kalam,cursive',
              background: '#fff', border: '1.5px solid var(--gx-green)',
              borderRadius: 4, color: 'var(--gx-navy)',
            }}>
              <div className="wf-accent-text" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gx-green)', marginBottom: 3 }}>NEED HELP?</div>
              <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.15, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>Book a call</span>
                <span className="wf-accent-text" style={{ color: 'var(--gx-green)' }}>→</span>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(41,51,92,0.6)', marginTop: 2, lineHeight: 1.2 }}>30 min with an engineer</div>
            </div>
            <div style={{ padding: '6px 10px', fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.7)' }}>Docs</div>
            <div style={{ padding: '6px 10px', fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.7)' }}>API Keys</div>
            <div style={{ padding: '6px 10px', fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.7)' }}>Settings</div>
          </div>
          <div style={{ marginTop: 8, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)', textAlign: 'center' }}>
            Flex spacer between groups · single visual separator
          </div>
        </div>

        {/* Rules + state table */}
        <div>
          <CalloutList columns={2} items={[
            { n: 1, title: 'Top = primary content', body: 'Workspaces and Projects — the things the user actively builds and switches between.' },
            { n: 2, title: 'Bottom = account + reference', body: 'Engineer call CTA, Docs, API Keys, Settings. Surfaces you visit infrequently or for help.' },
            { n: 3, title: 'CTA flips by account state', body: 'Logged-out / free → Book a call · 30 min with an engineer (consultative). Paid → Get support.' },
            { n: 4, title: 'No middle hover-state', body: 'Nav is binary 48px ↔ 180px. The user opens it deliberately; persists in localStorage.' },
            { n: 5, title: 'Same order, every viewport', body: 'On tablet/mobile the nav becomes a drawer or sheet, but the top/bottom split is preserved.' },
            { n: 6, title: 'Tested by question', body: '"Is this about content or account?" If content → top. If account → bottom. New items follow this rule.' },
          ]} />

          <div className="wf-label" style={{ marginTop: 14, marginBottom: 6 }}>CTA STATE TABLE</div>
          <div className="wf-box wf-rough-lite" style={{ padding: 10, background: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 0.8fr', gap: 8, fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, paddingBottom: 4, borderBottom: '1.2px solid var(--gx-navy)' }}>
              <div>Account state</div><div>CTA label</div><div>Destination</div><div>Style</div>
            </div>
            {[
              ['logged out', 'Book a call · engineer', 'calendar embed (Cal / Calendly)', 'green frame'],
              ['free (signed in)', 'Book a call · engineer', 'calendar embed', 'green frame'],
              ['paid · self-serve', 'Get support', 'support chat / docs', 'navy ghost'],
              ['paid · enterprise', 'Get support', 'CSM channel / Slack', 'navy ghost'],
            ].map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 0.8fr', gap: 8, fontFamily: 'Kalam,cursive', fontSize: 11, padding: '5px 0', borderBottom: '1px dashed rgba(41,51,92,0.15)' }}>
                <div style={{ fontWeight: 700 }}>{r[0]}</div>
                <div>{r[1]}</div>
                <div style={{ color: 'rgba(41,51,92,0.7)' }}>{r[2]}</div>
                <div style={{ color: 'rgba(41,51,92,0.7)' }}>{r[3]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 3 · Glossary · "workspace" and friends ──
function Spec_Glossary() {
  const terms = [
    { t: 'Canvas', d: 'The right pane in the split layout. Renders docs, extractions, reports, and briefs. The thing that changes when you click a doc, pin a sample, or render a template.' },
    { t: 'Chat panel', d: 'The left pane. Always present in some form (rail, sheet, puck). Hosts the conversation, the citation chips, the Pin-to-report affordance.' },
    { t: 'Nav', d: 'The leftmost sidebar (48 ↔ 180px). Top = content (Workspaces, Projects), bottom = account.' },
    { t: 'App surface', d: 'Casual noun for the whole product surface (nav + chat + canvas). Not a nav item.' },
    { t: 'Workspace', d: 'Top of the org hierarchy. Groups projects. Has a name + URL slug. One per tenant; Sample is the default workspace for the onboarding demo. API: "bucket".' },
    { t: 'Project', d: 'A logical group of documents inside a workspace, defined by a metadata filter (per GroundX API). Drives "open Utility Bill" → the doc viewer.' },
    { t: 'Document', d: 'A single file (PDF, XLSX, etc.) ingested into a project. Has a page index, parsed structure, and embeddings. Shortened to "doc" when space is tight.' },
    { t: 'Sample', d: 'A preloaded project: Utility Bill, Loan Eligibility, Solar Portfolio. Onboarding-only entry surface — see F1.' },
    { t: 'Citation', d: 'A chip [N] that appears in chat answers, schema field rows, report sections, and table cells. Points at (doc, page, region). Hover lights every other [N] in the session; click → peek panel.' },
    { t: 'Peek', d: 'The inline panel that opens under a citation chip. Shows source snippet + extracted object + why-matched + confidence. F4 is the canonical example.' },
    { t: 'Schema', d: 'The durable artifact of an extraction. Named, versioned. Has categories (statement / charges / meters); each category contains fields. See F3a · Edit schema.' },
    { t: 'Field', d: 'A single extracted value defined by name, type (STRING/NUMBER/DATE/BOOLEAN), description prompt, identifiers, and instructions. The Neil-pattern row in the schema editor.' },
    { t: 'Field prompt', d: 'The natural-language instructions the model follows to locate a field on every doc. Editing the prompt is the primary way users refine an extraction.' },
    { t: 'Extraction', d: 'A run of a schema against pinned docs. Produces structured output with cited values. Output renders as table · JSON · grid in the Results tab.' },
    { t: 'Category', d: 'A top-level group inside a schema. Three recognized by the runner: statement (per-doc fields) · charges (repeating records) · meters (utility-style usage records).' },
    { t: 'Template', d: 'A saved Report — the durable artifact for narrative output. Named, versioned. Has sections; each section is a saved question. See S3a · Report builder.' },
    { t: 'Section', d: 'One Q&A unit inside a template. Has name, render_as (PARAGRAPH/BULLETS/TABLE), question prompt, variables, instructions. Lands here when a user pins a chat answer.' },
    { t: 'Pin to report', d: 'In-chat affordance on every assistant turn (📌). Saves the Q&A as a new section in the active template — variables auto-extracted from doc-specific nouns.' },
    { t: 'Report / Brief', d: 'The rendered output of a template against a project. Lives in S3 (read mode); template lives in S3a (edit mode). "IC brief" is one named example.' },
    { t: 'Step strip', d: 'The bracketed 4-step journey pinned at the top of the workspace (Ingest · Understand · Analyze · Integrate). See W2.' },
    { t: 'Earlier turns', d: 'The collapsed-history strip at the top of every chat panel (▾ N earlier turns). Replaces the legacy multi-row HistoryWidget. See W3.' },
    { t: 'Render mode', d: 'How the schema Results render: table, JSON, or grid. Toggle inside the Results tab. Report equivalent: render_as per section.' },
    { t: 'Gate', d: 'The inline sign-in offer. Fires on Save 🔒, Export 🔒, BYO sign-up, or hitting the free-tier ceiling. Never modal. Three options: email · SSO · book engineer call. See W4 / F6.' },
    { t: 'Pinned sample / project', d: 'The doc(s) currently driving an editor (Schema or Report). Free-tier renders fully on pinned; additional docs blur until sign-in.' },
  ];

  return (
    <div className="ab" style={{ padding: '24px 28px' }}>
      <div className="ab-title">Glossary</div>
      <div className="ab-sub">Words we use consistently in copy and code. "Workspace" is not a nav item.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
        {terms.map((t, i) => (
          <div key={i} className="wf-box wf-rough-lite" style={{ padding: 10, background: '#fff' }}>
            <div className="wf-h" style={{ fontSize: 17, color: 'var(--gx-navy)' }}>{t.t}</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'rgba(41,51,92,0.78)', marginTop: 2, lineHeight: 1.35 }}>{t.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Canvas_Docs, Nav_Guidance, Spec_Glossary });
