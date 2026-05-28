// spec-workspace.jsx — workspace setup (per Chris mock) and placement options.
// Integrates Chris's "Name your workspace" + "What kind of work?" + domain
// teammate invite into the onboarding. Three placement options proposed;
// recommendation = SPLIT (lightweight pre-signup, confirm post-signup).

// ── Work-kind options (per Chris mock + scenario fit) ──
const WORK_KINDS = [
  { key: 'research', label: 'Research & insights', recommends: 'solar' },
  { key: 'compliance', label: 'Compliance & legal', recommends: 'loan' },
  { key: 'support', label: 'Customer support / KB', recommends: 'loan' },
  { key: 'finance', label: 'Financial analysis', recommends: 'utility' },
  { key: 'other', label: "Other / I'll decide later", recommends: null },
];

// ── Radio row (Chris-styled — outlined when selected, hollow otherwise) ──
function _RadioRow({ label, selected }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      border: selected ? '1.5px solid var(--gx-navy)' : '1.5px solid transparent',
      borderRadius: 8,
      background: '#fff',
      fontFamily: 'Kalam,cursive', fontSize: 14,
      color: 'var(--gx-navy)',
      cursor: 'pointer',
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: 99,
        border: `1.5px solid ${selected ? 'var(--gx-navy)' : 'rgba(41,51,92,0.4)'}`,
        background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {selected && <div style={{ width: 10, height: 10, borderRadius: 99, background: 'var(--gx-navy)' }} />}
      </div>
      <span style={{ fontWeight: selected ? 700 : 400 }}>{label}</span>
    </div>
  );
}

// ── WorkKindPicker widget (used in multiple frames) ──
function WorkKindPicker({ value = 'research' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {WORK_KINDS.map((wk) => (
        <_RadioRow key={wk.key} label={wk.label} selected={wk.key === value} />
      ))}
    </div>
  );
}

// ── Frame · Placement decision · 3 options ──
function Workspace_Placement() {
  return (
    <div className="ab" style={{ padding: '24px 28px' }}>
      <div className="ab-title">Workspace setup · placement options</div>
      <div className="ab-sub">Where to ask the questions from Chris's mock (workspace name + work-kind + invite teammates). Three options. Recommendation: <b>split</b>.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[
          {
            id: 'A', title: 'Before sign-up · pre-gate',
            when: 'right after entry, before any scenario',
            pros: ['Personalizes scenario picker', 'Sets tone for the demo'],
            cons: ['Adds friction before value', 'Asks for commitment we haven\'t earned', 'No domain detection yet'],
            verdict: 'too early',
            kind: 'bad',
          },
          {
            id: 'B', title: 'After sign-up · post-gate',
            when: 'right after magic-link / SSO returns',
            pros: ['Canonical (matches Chris mock)', 'Domain detection works', 'Pre-fill from email'],
            cons: ['First post-auth screen is a form', 'Defers the "I\'m back in the product" moment', 'May skip and never finish'],
            verdict: 'lazy default',
            kind: 'meh',
          },
          {
            id: 'C', title: 'Split · before + after',
            when: 'work-kind asked in chat pre-signup · name + slug + invite confirmed post-signup',
            pros: ['Lightest at each touch', 'Personalizes recommendations early', 'Post-signup is mostly confirmation', 'Skippable defaults at every step'],
            cons: ['Two surfaces to design + maintain', 'Need to remember work-kind across the gate'],
            verdict: 'recommend',
            kind: 'good',
          },
        ].map((opt) => (
          <div key={opt.id} className="wf-box wf-rough-lite" style={{
            padding: 14, background: '#fff', position: 'relative',
            border: opt.kind === 'good' ? '2px solid var(--gx-green)' : '1.5px solid var(--gx-navy)',
          }}>
            <div className="wf-anno wf-accent-bg" style={{
              position: 'absolute', top: -10, right: 12,
              background: opt.kind === 'good' ? 'var(--gx-green)' : opt.kind === 'bad' ? 'var(--gx-coral)' : '#f7f6f1',
              color: opt.kind === 'bad' ? '#fff' : 'var(--gx-navy)',
              border: '1.5px solid var(--gx-navy)',
              padding: '1px 8px', borderRadius: 99,
              fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700,
              letterSpacing: 0.4, textTransform: 'uppercase',
            }}>
              {opt.verdict}
            </div>
            <div className="wf-label" style={{ marginBottom: 4 }}>OPTION {opt.id}</div>
            <div className="wf-h" style={{ fontSize: 19, lineHeight: 1.05 }}>{opt.title}</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)', marginTop: 4 }}>{opt.when}</div>
            <div className="wf-label" style={{ marginTop: 10, marginBottom: 4 }}>PROS</div>
            <ul style={{ paddingLeft: 16, margin: 0, fontFamily: 'Kalam,cursive', fontSize: 11, lineHeight: 1.4 }}>
              {opt.pros.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            <div className="wf-label" style={{ marginTop: 10, marginBottom: 4 }}>CONS</div>
            <ul style={{ paddingLeft: 16, margin: 0, fontFamily: 'Kalam,cursive', fontSize: 11, lineHeight: 1.4, color: 'rgba(41,51,92,0.7)' }}>
              {opt.cons.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <div className="wf-box wf-rough-lite" style={{ padding: 12, marginTop: 14, background: 'var(--gx-tint)' }}>
        <div className="wf-label" style={{ marginBottom: 4 }}>SPLIT · HOW IT FLOWS</div>
        <ol style={{ paddingLeft: 18, margin: 0, fontFamily: 'Kalam,cursive', fontSize: 13, lineHeight: 1.45 }}>
          <li><b>F1 entry</b> — chat opens with scenario picker (unchanged). After the user picks a scenario or interacts once, an assistant turn asks: <i>"While I run that, what kind of work brings you here? I'll tailor what comes next."</i> Skippable.</li>
          <li><b>F6 gate</b> — magic link / SSO (unchanged). The selected work-kind is carried through as a session attribute.</li>
          <li><b>F7 workspace setup</b> (post-auth) — name + URL slug + work-kind (pre-filled from F1 chat) + invite teammates from domain. Big "Continue" + "Skip · use defaults" escape.</li>
        </ol>
      </div>
    </div>
  );
}

// ── Frame · Pre-signup · work-kind asked in chat ──
function WorkKind_InChat() {
  return (
    <div className="ab">
      <div className="ab-title">Workspace setup · 1 · pre-signup · work-kind in chat</div>
      <div className="ab-sub">After the user picks a scenario, the assistant casually asks. Skippable — no form, no commitment. Result personalizes recommendations and pre-fills post-signup.</div>

      <AppShell navState="full" navActive={null} accountState="loggedOut" chatWidth={360} focus="split">
        <>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(41,51,92,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wf-av gx" style={{ width: 20, height: 20, fontSize: 12 }}>G</div>
              <div className="wf-h" style={{ fontSize: 16, lineHeight: 1 }}>Conversation</div>
            </div>
          </div>
          <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
            <Bubble who="me">Utility Bill</Bubble>
            <Bubble who="gx" lead>
              Opening it now — about 6 seconds.
            </Bubble>
            <Bubble who="gx">
              While I run that — <b>what kind of work brings you here?</b>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)', marginTop: 4 }}>
                Just helps me tailor what comes next. Skip if you'd rather poke around.
              </div>
            </Bubble>

            {/* In-chat radio list */}
            <div className="wf-box wf-rough-lite" style={{ padding: 8, marginTop: 4, background: '#fff' }}>
              <WorkKindPicker value="finance" />
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 8, fontFamily: 'Kalam,cursive', fontSize: 11 }}>
              <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 11 }}>→ that's me</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>skip · ask later</div>
            </div>
          </div>
          <div style={{ padding: 14, borderTop: '1px solid rgba(41,51,92,0.1)' }}>
            <ChatInput placeholder="…or just keep going" />
          </div>
        </>

        {/* Canvas keeps running the demo — Understand chapter active */}
        <div style={{ padding: 16, height: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <div className="wf-h" style={{ fontSize: 22 }}>Utility Bill · 8 meters</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)' }}>processing · ~6s</div>
          </div>
          <div style={{ padding: 12, background: '#fafaf6', borderRadius: 6, marginBottom: 10 }}>
            <ChapterStrip scenario={SCENARIOS.utility} activeKey="understand" progress={{ understand: 0.45 }} compact />
          </div>

          <RBox w="100%" h={300} fill="fill">
            <div style={{ padding: 14 }}>
              <div className="wf-line" />
              <div className="wf-line" style={{ width: '70%' }} />
              <div style={{ marginTop: 10, padding: 8, background: 'var(--gx-green)', border: '1.5px dashed var(--gx-navy)' }} className="wf-accent-bg">
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, color: 'var(--gx-navy)' }}>detected: meter charges grid · 8 rows × 4 cols</div>
              </div>
              <div className="wf-line dim" style={{ marginTop: 10 }} />
              <div className="wf-line dim" style={{ width: '60%' }} />
            </div>
          </RBox>
        </div>
      </AppShell>

      <Callout n={1} top={160} left={150} />
      <Callout n={2} top={290} left={150} />
      <Callout n={3} top={158} right={300} />
    </div>
  );
}

// ── Frame · Post-signup · "Set up your workspace" (Chris mock adapted) ──
function Workspace_Setup() {
  return (
    <div className="ab">
      <div className="ab-title">Workspace setup · 2 · post-signup · Chris mock</div>
      <div className="ab-sub">Lands here right after magic-link / SSO returns. Mostly pre-filled. "Continue" + "Skip · use defaults" both exit to the product.</div>

      <div className="ab-stage" style={{ background: '#fff' }}>
        <div className="ab-chrome">
          <i></i><i></i><i></i>
          <span>studio.eyelevel.ai/setup</span>
        </div>
        <div className="ab-body" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 60px', overflow: 'auto' }}>
          <div style={{ width: 620, maxWidth: '100%' }}>
            <div className="wf-label" style={{ color: 'var(--gx-coral)', marginBottom: 10 }}>SET UP YOUR WORKSPACE</div>
            <div className="wf-h" style={{ fontSize: 38, color: 'var(--gx-navy)', lineHeight: 1 }}>Name your workspace.</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, color: 'rgba(41,51,92,0.7)', marginTop: 6 }}>This is what you and your team will see in the URL and in the app.</div>

            {/* Workspace name */}
            <div style={{ marginTop: 22 }}>
              <div className="wf-label" style={{ marginBottom: 6 }}>WORKSPACE NAME</div>
              <div className="wf-box" style={{ padding: '10px 14px', fontFamily: 'Kalam,cursive', fontSize: 15, color: 'var(--gx-navy)', fontWeight: 700, background: '#fff' }}>EyeLevel</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.6)', marginTop: 4 }}>Pre-filled from your email domain.</div>
            </div>

            {/* URL slug */}
            <div style={{ marginTop: 16 }}>
              <div className="wf-label" style={{ marginBottom: 6 }}>URL SLUG</div>
              <div className="wf-box" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, background: '#fff' }}>
                <span style={{ fontFamily: 'Kalam,cursive', fontSize: 13, color: 'rgba(41,51,92,0.55)' }}>studio.eyelevel.ai/</span>
                <span style={{ fontFamily: 'Kalam,cursive', fontSize: 15, color: 'var(--gx-navy)', fontWeight: 700, flex: 1 }}>eyelevel</span>
                <span className="wf-accent-text" style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'var(--gx-green)', fontWeight: 700 }}>✓ Available</span>
              </div>
            </div>

            {/* Work kind */}
            <div style={{ marginTop: 22 }}>
              <div className="wf-label" style={{ marginBottom: 8 }}>WHAT KIND OF WORK WILL THIS WORKSPACE DO?</div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'var(--gx-coral)', marginBottom: 6, fontWeight: 700 }}>↘ pre-selected from your chat earlier</div>
              <WorkKindPicker value="finance" />
            </div>

            {/* Invite teammates */}
            <div className="wf-box wf-rough-lite" style={{ padding: 12, marginTop: 18, background: 'var(--gx-tint)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 4,
                border: '1.5px solid var(--gx-navy)',
                background: 'var(--gx-navy)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Kalam,cursive', fontWeight: 700, fontSize: 13,
                flexShrink: 0,
              }}>✓</div>
              <div style={{ flex: 1, fontFamily: 'Kalam,cursive', fontSize: 13, color: 'var(--gx-navy)' }}>
                Invite teammates from <b>@eyelevel.ai</b> automatically
              </div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>4 domain matches found</div>
            </div>

            {/* CTAs */}
            <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 13, padding: '10px 22px' }}>Continue →</div>
              <div className="wf-btn ghost" style={{ fontSize: 12 }}>Skip · use defaults</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)' }}>change anytime in Settings</div>
            </div>
          </div>
        </div>
      </div>

      <Callout n={1} top={120} left={236} />
      <Callout n={2} top={250} left={236} />
      <Callout n={3} top={372} left={236} />
      <Callout n={4} bottom={154} left={236} />
      <Callout n={5} bottom={80} left={236} />
    </div>
  );
}

// ── Frame · Post-signup · "Before your first project" (Claude-inspired) ──
// Sits between F6 (gate accepted) and Workspace_Setup. A trust moment.
// Adapted from Claude's "Before your first chat" pattern: centered, generous
// whitespace, big serif heading, plain reassurances, one Continue CTA.
function Workspace_Welcome() {
  return (
    <div className="ab">
      <div className="ab-title">Workspace setup · 0 · "Before your first project"</div>
      <div className="ab-sub">Trust moment, post-signup. Claude-inspired: centered, generous space, one CTA. Two reassurances + one setting (training opt-in, default off — privacy-conservative for enterprise).</div>

      <div className="ab-stage" style={{ background: '#fafaf6' }}>
        <div className="ab-chrome">
          <i></i><i></i><i></i>
          <span>studio.eyelevel.ai/welcome</span>
        </div>
        <div className="ab-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 60px' }}>
          <div className="wf-av gx" style={{ width: 36, height: 36, fontSize: 18, marginBottom: 18 }}>G</div>

          <div style={{ textAlign: 'center', maxWidth: 560 }}>
            <div className="wf-h" style={{ fontSize: 38, color: 'var(--gx-navy)', lineHeight: 1.05 }}>Before your first project</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 14, color: 'rgba(41,51,92,0.65)', marginTop: 6 }}>A few things to know, plus one setting to review.</div>
          </div>

          <div className="wf-box wf-rough-lite" style={{ marginTop: 22, padding: 18, background: '#fff', width: 560, maxWidth: '95%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              {
                icon: '🔒',
                title: 'Your docs are yours.',
                body: 'GroundX never trains on your uploaded content. Source files stay in your project; they\'re only used to answer your questions.',
              },
              {
                icon: '⚓',
                title: 'Every answer is cited.',
                body: 'Every claim links back to the exact page and region. Tap a citation to verify before you trust.',
              },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 99,
                  background: 'var(--gx-tint)', border: '1.5px solid rgba(41,51,92,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>{row.icon}</div>
                <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, lineHeight: 1.4, color: 'var(--gx-navy)' }}>
                  <b>{row.title}</b> {row.body}
                </div>
              </div>
            ))}

            {/* The one toggleable setting */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', borderTop: '1px solid rgba(41,51,92,0.1)', paddingTop: 14 }}>
              <div style={{
                width: 44, height: 24, borderRadius: 99,
                background: 'rgba(41,51,92,0.18)', position: 'relative',
                flexShrink: 0, marginTop: 2,
              }}>
                <div style={{ position: 'absolute', left: 2, top: 2, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
              </div>
              <div style={{ fontFamily: 'Kalam,cursive', fontSize: 13, lineHeight: 1.4, color: 'var(--gx-navy)' }}>
                <b>Help us improve search quality.</b> Share <i>only</i> query patterns (no document content) to help us tune retrieval. <span className="wf-link">Learn more</span>.
                <div style={{ fontSize: 11, color: 'rgba(41,51,92,0.6)', marginTop: 2 }}>Off by default. Change anytime in Settings.</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div className="wf-btn primary wf-accent-bg" style={{ fontSize: 14, padding: '12px 36px' }}>Continue →</div>
            <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.55)' }}>Email verified as you@eyelevel.ai · <span className="wf-link">use a different email</span></div>
          </div>
        </div>
      </div>

      <Callout n={1} top={130} left={266} />
      <Callout n={2} top={272} right={290} />
      <Callout n={3} top={420} right={290} />
      <Callout n={4} bottom={130} right={290} />
    </div>
  );
}

Object.assign(window, {
  WORK_KINDS, WorkKindPicker,
  Workspace_Placement, WorkKind_InChat, Workspace_Setup, Workspace_Welcome,
});
