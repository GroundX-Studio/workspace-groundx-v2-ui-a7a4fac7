// wireframe-primitives.jsx — shared sketchy components used by all concepts.
// All exports get attached to window so each concept file can use them.

// ── Rough box: SVG-roughened border, fill option, supports children. ──
function RBox({ children, w, h, fill, dashed, rough = true, style, accent, className = '', label }) {
  const cls = [
    'wf-box',
    fill === 'navy' ? 'wf-box-navy' : '',
    fill === 'green' ? 'wf-box-green' : '',
    fill === 'coral' ? 'wf-box-coral' : '',
    fill === 'cyan' ? 'wf-box-cyan' : '',
    fill === 'tint' ? 'wf-box-tint' : '',
    fill === 'fill' ? 'wf-box-fill' : '',
    dashed ? 'wf-box-dashed' : '',
    rough ? 'wf-rough-lite' : '',
    accent === 'bg' ? 'wf-accent-bg' : '',
    accent === 'stroke' ? 'wf-accent-stroke' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <div className={cls} style={{ width: w, height: h, boxSizing: 'border-box', ...style }}>
      {label && <div className="wf-label" style={{ position: 'absolute', top: -7, left: 8, background: '#fff', padding: '0 5px', color: 'rgba(41,51,92,0.6)' }}>{label}</div>}
      {children}
    </div>
  );
}

// ── Sticky annotation note ──
function Sticky({ children, top, left, right, bottom, width = 170, rotate = -2.5, style }) {
  return (
    <div className="wf-sticky wf-anno" style={{ top, left, right, bottom, width, transform: `rotate(${rotate}deg)`, ...style }}>
      {children}
    </div>
  );
}

// ── Arrow (sketchy) pointing from A→B; absolute, pass coords inside parent ──
function Arrow({ from, to, curve = 30, width = 1.6, dashed = false, label, labelPos = 0.5, style }) {
  // straight-ish bezier with mid control offset perpendicular
  const [x1, y1] = from, [x2, y2] = to;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const cx = mx + px * curve, cy = my + py * curve;
  const d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  // crude label position along curve
  const t = labelPos;
  const lx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
  const ly = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
  return (
    <svg className="wf-anno" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', ...style }} width="100%" height="100%">
      <defs>
        <marker id="ar-h" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M0,0 L9,5 L0,10 z" fill="#2a251f" />
        </marker>
      </defs>
      <path d={d} fill="none" stroke="#2a251f" strokeWidth={width} strokeDasharray={dashed ? '4 4' : '0'} markerEnd="url(#ar-h)" filter="url(#wf-rough-lite)" />
      {label && (
        <foreignObject x={lx - 70} y={ly - 18} width="140" height="40" style={{ overflow: 'visible' }}>
          <div style={{ fontFamily: 'Caveat, cursive', fontSize: 16, color: '#2a251f', textAlign: 'center', lineHeight: 1.1 }}>{label}</div>
        </foreignObject>
      )}
    </svg>
  );
}

// ── Chat bubble row ──
function Bubble({ who, lead, children, opts, time }) {
  const isMe = who === 'me';
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
      {!isMe && <div className="wf-av gx">G</div>}
      <div className={`bub ${isMe ? 'me' : 'gx'} ${lead ? 'lead' : ''}`} style={{ maxWidth: '85%' }}>
        {children}
        {opts && (
          <div style={{ marginTop: 6 }}>
            {opts.map((o, i) => (
              <span key={i} className={`opt ${o.hot ? 'hot' : ''}`}>{o.label || o}</span>
            ))}
          </div>
        )}
        {time && <small>{time}</small>}
      </div>
      {isMe && <div className="wf-av">U</div>}
    </div>
  );
}

// ── Chat input strip ──
function ChatInput({ placeholder = 'Ask anything…', width = '100%', send = true }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', width }}>
      <div className="wf-box" style={{ flex: 1, padding: '8px 12px', fontFamily: 'Kalam,cursive', fontSize: 13, color: 'rgba(41,51,92,0.55)' }}>
        {placeholder}
      </div>
      {send && <div className="wf-btn primary wf-accent-bg" style={{ padding: '8px 10px' }}>↑</div>}
    </div>
  );
}

// ── Doc thumbnail (small page icon) ──
function Doc({ w = 32, h = 40, label, style }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, ...style }}>
      <div className="wf-doc" style={{ width: w, height: h }}>
        <div className="wf-line dim" />
        <div className="wf-line dim" style={{ width: '70%' }} />
        <div className="wf-line dim" style={{ width: '85%' }} />
        <div className="wf-line dim" style={{ width: '60%' }} />
      </div>
      {label && <div style={{ fontFamily: 'Kalam,cursive', fontSize: 10, color: 'rgba(41,51,92,0.6)' }}>{label}</div>}
    </div>
  );
}

// ── Bucket card: doc-set summary used inside product area ──
function Bucket({ name, type, pages, demo, recommended, selected, style }) {
  return (
    <div className="wf-box wf-rough-lite" style={{ padding: 12, position: 'relative', background: selected ? 'var(--gx-tint)' : '#fff', borderWidth: selected ? 2 : 1.5, ...style }}>
      {recommended && (
        <div style={{ position: 'absolute', top: -10, right: 10, background: 'var(--gx-green)', border: '1.5px solid var(--gx-navy)', padding: '1px 8px', borderRadius: 99, fontFamily: 'Kalam,cursive', fontSize: 10, fontWeight: 700 }} className="wf-anno wf-accent-bg">
          ★ recommended
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          <Doc w={22} h={28} />
          <Doc w={22} h={28} style={{ marginTop: 4 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="wf-h" style={{ fontSize: 18, lineHeight: 1, color: 'var(--gx-navy)' }}>{name}</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)', marginTop: 2 }}>
            {type} · {pages} pages
          </div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.85)', marginTop: 6, lineHeight: 1.25 }}>
            <span style={{ fontWeight: 700 }}>Good for:</span> {demo}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sample buckets used across concepts ──
const SAMPLE_BUCKETS = [
  { name: '10-K Filings', type: 'SEC', pages: 412, demo: 'tables + financial extraction' },
  { name: 'FDA Drug Labels', type: 'Regulatory', pages: 88, demo: 'structured Q&A on dosing' },
  { name: 'Insurance Policies', type: 'Legal PDF', pages: 230, demo: 'clause lookup w/ citations' },
  { name: 'Defense RFP Set', type: 'Gov PDF', pages: 600, demo: 'large-corpus retrieval' },
];

// ── Phase strip (Entry → Bucket → Action → Proof → Gate) ──
function Phases({ active }) {
  const items = ['Entry', 'Bucket', 'Action', 'Proof', 'Gate'];
  return (
    <div className="phases">
      {items.map((p, i) => (
        <div key={p} className={`phase ${i === active ? 'active' : ''}`}>{i + 1}. {p}</div>
      ))}
      <div style={{ flex: 1 }} />
    </div>
  );
}

// ── Browser chrome wrapper for an artboard ──
function Frame({ url = 'app.groundx.ai', children }) {
  return (
    <div className="ab-stage">
      <div className="ab-chrome">
        <i></i><i></i><i></i>
        <span>{url}</span>
      </div>
      <div className="ab-body">{children}</div>
    </div>
  );
}

// ── Citation pill ──
function Cite({ n, page }) {
  return (
    <span className="wf-box wf-rough-lite" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', fontFamily: 'Kalam,cursive', fontSize: 11, fontWeight: 700, borderRadius: 99, marginLeft: 4, background: 'var(--gx-cyan)', color: 'var(--gx-navy)' }}>
      [{n}] p.{page}
    </span>
  );
}

// ── Mini app sidebar (groundx-style) ──
function MiniSidebar({ active = 'Buckets', collapsed }) {
  const items = ['Workspace', 'Buckets', 'X-Ray', 'Workflows', 'Settings'];
  return (
    <div className="wf-box" style={{ width: collapsed ? 36 : 110, height: '100%', borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderLeft: 'none', background: '#f8f7f2', padding: collapsed ? '10px 6px' : '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div className="wf-av gx" style={{ width: 18, height: 18, fontSize: 11 }}>G</div>
        {!collapsed && <div className="wf-h" style={{ fontSize: 17, lineHeight: 1 }}>GroundX</div>}
      </div>
      <div style={{ height: 1, background: 'rgba(41,51,92,0.12)', margin: '4px 0' }} />
      {items.map((it) => (
        <div key={it} style={{
          fontFamily: 'Kalam,cursive', fontSize: 12, color: it === active ? 'var(--gx-navy)' : 'rgba(41,51,92,0.65)',
          fontWeight: it === active ? 700 : 400,
          background: it === active ? 'var(--gx-cyan)' : 'transparent',
          padding: collapsed ? '4px 2px' : '4px 6px',
          borderRadius: 4,
          textAlign: collapsed ? 'center' : 'left',
          border: it === active ? '1px solid rgba(41,51,92,0.3)' : '1px solid transparent',
        }} className={it === active ? 'wf-accent-bg' : ''}>
          {collapsed ? it[0] : '· ' + it}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  RBox, Sticky, Arrow, Bubble, ChatInput, Doc, Bucket, SAMPLE_BUCKETS, Phases, Frame, Cite, MiniSidebar,
});
