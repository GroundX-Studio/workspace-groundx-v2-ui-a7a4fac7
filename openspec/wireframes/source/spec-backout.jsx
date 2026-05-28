// spec-backout.jsx — F6b: explicit back-out paths from the gate.
// User asked: "how does someone back out of the F6 flow?"
// Grounded in groundx-wireframes/guided-sandbox-onboarding.md ·
// "Account gate timing: Account later after meaningful action" — gate is
// soft-dismissable, never blocks the canvas.

function Flow_BackOut() {
  return (
    <div className="ab">
      <div className="ab-title">Back-out paths from the gate</div>
      <div className="ab-sub">Four ways to dismiss without committing. The gate is never modal — the canvas stays usable behind it. Returning later re-opens the same gate. Same gate used on every 🔒 boundary (Save / Export / BYO / free-tier ceiling).</div>

      {/* Frame containing the gate state + arrows out */}
      <div className="ab-stage" style={{ background: '#fff', position: 'relative' }}>
        <div className="ab-chrome">
          <i></i><i></i><i></i>
          <span>app.groundx.ai/extract</span>
        </div>

        <div className="ab-body" style={{ display: 'flex' }}>
          {/* sidebar */}
          <MiniNav navState="full" navActive="projects" />

          {/* Chat with the gate card */}
          <div style={{ width: 360, borderRight: '1px solid var(--gx-navy)', background: '#fbfaf6', padding: 14, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ flex: 1 }}>
              <Bubble who="me">unlock all</Bubble>
              <Bubble who="gx" lead>
                One quick step. To unlock all rows, I just need an email.
              </Bubble>

              {/* Gate card with all back-out affordances visible */}
              <div className="wf-box wf-rough-lite" style={{ padding: 12, background: 'var(--gx-tint)', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 6, right: 8, fontFamily: 'Kalam,cursive', fontSize: 18, fontWeight: 700, color: 'rgba(41,51,92,0.7)', lineHeight: 1, cursor: 'pointer' }}>×</div>
                <div className="wf-label" style={{ marginBottom: 6 }}>continue with…</div>
                <div className="wf-box" style={{ padding: '6px 10px', fontSize: 12, fontFamily: 'Kalam,cursive', color: 'rgba(41,51,92,0.6)', marginBottom: 8 }}>name@company.com</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <div className="wf-btn primary wf-accent-bg" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>→ send link</div>
                  <div className="wf-btn ghost" style={{ fontSize: 11 }}>SSO</div>
                </div>
                <div className="wf-btn coral wf-accent-bg" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}>📅 book 15-min engineer call</div>
              </div>

              <div style={{ marginTop: 8, fontFamily: 'Kalam,cursive', fontSize: 11, textAlign: 'center', color: 'var(--gx-navy)' }}>
                Or <span className="wf-link">← keep exploring samples</span>
                <div style={{ fontSize: 10, color: 'rgba(41,51,92,0.55)', marginTop: 4 }}>
                  ESC · click × · or just keep chatting
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(41,51,92,0.1)', paddingTop: 8 }}>
              <ChatInput placeholder="…or ask something else" />
            </div>
          </div>

          {/* Workspace stays interactive */}
          <div style={{ flex: 1, padding: 16, background: '#fff', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
              <div className="wf-h" style={{ fontSize: 20 }}>Reading utility-bill · meters</div>
              <div style={{ flex: 1 }} />
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>↻ rerun</div>
              <div className="wf-btn ghost" style={{ fontSize: 11 }}>JSON</div>
            </div>
            <RBox w="100%" h={300} fill="fill">
              <div style={{ padding: 12 }}>
                <div className="wf-line" />
                <div className="wf-line" style={{ width: '85%' }} />
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '70%' }} />
                <div className="wf-line dim" />
                <div className="wf-line dim" style={{ width: '60%' }} />
                <div className="wf-line dim" style={{ width: '80%' }} />
                <div className="wf-line dim" style={{ width: '50%' }} />
              </div>
            </RBox>

            {/* Toast confirming dismiss-without-loss */}
            <div className="wf-box wf-rough-lite" style={{
              position: 'absolute', top: 16, right: 16,
              padding: '8px 12px', background: '#fff',
              display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: 'Kalam,cursive', fontSize: 12,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--gx-green)' }} className="wf-accent-bg" />
              <span>session preserved · gate returns on next save/export</span>
            </div>
          </div>
        </div>
      </div>

      {/* Annotation arrows pointing to each exit */}
      <svg className="wf-anno" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 8 }} width="100%" height="100%">
        <defs>
          <marker id="bo-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
            <path d="M0,0 L9,5 L0,10 z" fill="var(--gx-coral)" />
          </marker>
        </defs>
        {/* × close arrow */}
        <path d="M 380 244 Q 440 220 466 224" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" markerEnd="url(#bo-arrow)" />
        <text x="430" y="208" fontFamily="Caveat,cursive" fontSize="16" fill="var(--gx-coral)" fontWeight="700">× close</text>
        {/* keep exploring arrow */}
        <path d="M 200 396 Q 130 410 130 388" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" markerEnd="url(#bo-arrow)" />
        <text x="100" y="436" fontFamily="Caveat,cursive" fontSize="16" fill="var(--gx-coral)" fontWeight="700">← keep exploring</text>
        {/* ESC keyboard */}
        <path d="M 286 472 Q 280 510 152 510" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" markerEnd="url(#bo-arrow)" strokeDasharray="4 4" />
        <text x="36" y="500" fontFamily="Caveat,cursive" fontSize="16" fill="var(--gx-coral)" fontWeight="700">ESC key</text>
        {/* keep chatting / type below */}
        <path d="M 280 560 Q 280 580 192 580" stroke="var(--gx-coral)" strokeWidth="1.6" fill="none" markerEnd="url(#bo-arrow)" />
        <text x="38" y="582" fontFamily="Caveat,cursive" fontSize="16" fill="var(--gx-coral)" fontWeight="700">just keep chatting</text>
      </svg>

    </div>
  );
}

// ── Companion: state-machine diagram of the gate lifecycle ──
function Flow_BackOut_Lifecycle() {
  // Boxes
  const nodes = [
    { id: 'idle', x: 60, y: 100, label: 'idle · using sample', kind: 'rest' },
    { id: 'trigger', x: 320, y: 100, label: 'trigger event\n(save · export · BYO · threshold)', kind: 'event' },
    { id: 'gate', x: 600, y: 100, label: 'gate opens\n(in chat or full sheet)', kind: 'gate' },
    { id: 'commit', x: 860, y: 30, label: 'commit\n(magic link / SSO / engineer call)', kind: 'commit' },
    { id: 'dismiss', x: 860, y: 170, label: 'dismiss\n(× · ESC · keep exploring)', kind: 'dismiss' },
    { id: 'signed', x: 1080, y: 30, label: 'signed in · session preserved\n→ action completes', kind: 'rest' },
    { id: 'back', x: 1080, y: 170, label: 'back to idle\n(session preserved)', kind: 'rest' },
  ];

  const edges = [
    ['idle', 'trigger', 'user attempts'],
    ['trigger', 'gate', 'always'],
    ['gate', 'commit', 'fill email / pick option'],
    ['gate', 'dismiss', '×, ESC, keep exploring, type below'],
    ['commit', 'signed', ''],
    ['dismiss', 'back', ''],
    ['back', 'idle', 'gate re-opens on next trigger', true],
  ];

  const kinds = {
    rest: { bg: '#fff', border: 'var(--gx-navy)' },
    event: { bg: 'var(--gx-tint)', border: 'var(--gx-navy)' },
    gate: { bg: 'var(--gx-green)', border: 'var(--gx-navy)' },
    commit: { bg: 'var(--gx-cyan)', border: 'var(--gx-navy)' },
    dismiss: { bg: '#fff', border: 'var(--gx-coral)' },
  };

  const nx = (n) => n.x + 88;
  const ny = (n) => n.y + 28;

  return (
    <div className="ab" style={{ padding: '22px 26px' }}>
      <div className="ab-title">Gate lifecycle (state machine)</div>
      <div className="ab-sub">Read left → right. <b>Dismiss</b> is always one click. Gate <b>re-opens</b> on the next 🔒 boundary — no permanent dismiss.</div>

      <div className="wf-box wf-rough-lite" style={{ position: 'relative', height: 320, background: '#fff', marginBottom: 14 }}>
        <svg style={{ position: 'absolute', inset: 0 }} width="100%" height="100%">
          <defs>
            <marker id="lc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
              <path d="M0,0 L9,5 L0,10 z" fill="var(--gx-navy)" />
            </marker>
            <marker id="lc-arrow-c" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
              <path d="M0,0 L9,5 L0,10 z" fill="var(--gx-coral)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = nodes.find((n) => n.id === e[0]);
            const b = nodes.find((n) => n.id === e[1]);
            if (!a || !b) return null;
            const dashed = e[3];
            const isReentry = a.id === 'back' && b.id === 'idle';
            // Connect right-edge of A to left-edge of B (with vertical offset where same column)
            const ax = a.x + 176, ay = ny(a);
            const bx = b.x, by = ny(b);
            let path;
            if (isReentry) {
              // long curve underneath back to idle
              path = `M ${ax - 130} ${ay + 28} Q ${nx(a)} 280 ${nx({ x: 60, y: 0 })} 240 Q 60 240 ${nx({ x: 60, y: 0 })} ${ny(nodes[0])}`;
              path = `M ${a.x} ${ay + 28} Q ${a.x - 50} 280 ${nx(nodes[0])} 270 Q ${nx(nodes[0])} 230 ${nx(nodes[0])} ${ny(nodes[0]) + 28}`;
            } else if (a.y === b.y) {
              path = `M ${ax} ${ay} L ${bx} ${by}`;
            } else if (a.id === 'gate') {
              path = `M ${ax} ${ay} Q ${(ax + bx) / 2} ${ay} ${bx} ${by}`;
            } else {
              path = `M ${ax} ${ay} L ${bx} ${by}`;
            }
            return (
              <g key={i}>
                <path d={path} stroke={a.id === 'gate' && b.id === 'dismiss' ? 'var(--gx-coral)' : 'var(--gx-navy)'} strokeWidth="1.6" fill="none" strokeDasharray={dashed ? '5 5' : '0'} markerEnd={a.id === 'gate' && b.id === 'dismiss' ? 'url(#lc-arrow-c)' : 'url(#lc-arrow)'} />
                {e[2] && (
                  <text
                    x={isReentry ? 110 : (ax + bx) / 2}
                    y={isReentry ? 296 : (ay + by) / 2 - 6}
                    textAnchor="middle"
                    fontFamily="Kalam,cursive"
                    fontSize="10"
                    fontWeight="700"
                    fill={a.id === 'gate' && b.id === 'dismiss' ? 'var(--gx-coral)' : 'var(--gx-navy)'}
                  >{e[2]}</text>
                )}
              </g>
            );
          })}
        </svg>
        {nodes.map((n) => (
          <div key={n.id} style={{
            position: 'absolute', left: n.x, top: n.y,
            width: 176, padding: '8px 10px',
            background: kinds[n.kind].bg, border: `1.5px solid ${kinds[n.kind].border}`,
            borderRadius: 4,
            fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700,
            color: 'var(--gx-navy)',
            textAlign: 'center',
            whiteSpace: 'pre-line',
            zIndex: 2,
          }} className={n.kind === 'gate' || n.kind === 'event' ? 'wf-accent-bg' : ''}>
            {n.label}
          </div>
        ))}
      </div>

      <CalloutList columns={2} items={[
        { n: 1, title: 'gate is a turn, not a wall', body: 'rendered in the chat panel (or full sheet on mobile) — the workspace stays visible & interactive behind it.' },
        { n: 2, title: 'dismiss returns to idle', body: 'every dismiss path goes through the same state — session, history, extracted rows preserved.' },
        { n: 3, title: 're-trigger re-opens', body: 'next attempt at save/export/BYO/threshold fires the same trigger. No "you already dismissed this" sneaky no-op.' },
        { n: 4, title: 'one-time commit', body: 'once signed in, gate never appears in this session again. (Threshold-based gates can re-appear at the next threshold — separate event.)' },
      ]} />
    </div>
  );
}

Object.assign(window, { Flow_BackOut, Flow_BackOut_Lifecycle });
