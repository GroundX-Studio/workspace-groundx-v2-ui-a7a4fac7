// Widget · Extract behavior (dev spec)
// Answers the question: as a developer, what triggers an extraction, what
// does the request/response look like, and how does the UI respond?
// Grounded in EyeLevel-ai/groundx-studio-harness · skills/groundx-extraction-workflows.

function Widget_ExtractBehavior() {
  return (
    <div className="ab" style={{ padding: '24px 28px' }}>
      <div className="ab-title">Behavior · Extract via schema (dev spec)</div>
      <div className="ab-sub">
        Schema is the durable artifact. Extraction = running a saved schema against pinned docs. Trigger paths, API contract, edge cases.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* TRIGGER */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>1 · TRIGGER</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12.5, lineHeight: 1.4 }}>
            Extraction is always schema-driven. Three trigger paths:
            <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
              <li><b>sample open</b> · F1 → F2 transition auto-runs the sample's default schema (Utility Bill → meters; Loan → underwriting).</li>
              <li><b>↻ rerun</b> · F3a / S1 topbar — re-runs the current schema against pinned samples after an edit.</li>
              <li><b>chat freeform</b> · agent translates intent ("add a total_kwh field") into a schema edit + scoped re-run.</li>
            </ul>
          </div>
        </div>

        {/* INPUT */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>2 · INPUT (server payload)</div>
          <div style={{ fontFamily: '"JetBrains Mono", "Kalam", monospace', fontSize: 11, lineHeight: 1.45, background: 'var(--gx-tint)', padding: 10, borderRadius: 4 }}>
            POST /v1/extractions<br />
            {`{`}<br />
            <span style={{ paddingLeft: 14, display: 'block' }}>
              <span style={{ color: 'var(--gx-coral)' }}>schema_id</span>: "sch_meters_v2",<br />
              <span style={{ color: 'var(--gx-coral)' }}>doc_ids</span>: ["doc_utility_bill"],<br />
              <span style={{ color: 'var(--gx-coral)' }}>category</span>: "meters",  <span style={{ opacity: 0.55 }}>// opt · scope to one group</span><br />
              <span style={{ color: 'var(--gx-coral)' }}>chat_session_id</span>: "s_42",<br />
              <span style={{ color: 'var(--gx-coral)' }}>parent_message_id</span>: "m_91"
            </span>
            {`}`}
          </div>
          <div style={{ marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>
            Schema model: <code>statement</code> / <code>charges</code> / <code>meters</code> categories · each field has <i>description</i>, <i>identifiers[]</i>, <i>instructions</i>, <i>type</i>. See F3a for the editor.
          </div>
        </div>

        {/* OUTPUT */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>3 · OUTPUT (extraction document)</div>
          <div style={{ fontFamily: '"JetBrains Mono", "Kalam", monospace', fontSize: 11, lineHeight: 1.45, background: 'var(--gx-tint)', padding: 10, borderRadius: 4 }}>
            {`{`}<br />
            <span style={{ paddingLeft: 14, display: 'block' }}>
              <span style={{ color: 'var(--gx-coral)' }}>extraction_id</span>: "ex_8821",<br />
              <span style={{ color: 'var(--gx-coral)' }}>schema_id</span>: "sch_meters_v2",<br />
              <span style={{ color: 'var(--gx-coral)' }}>status</span>: "complete" | "streaming" | "error",<br />
              <span style={{ color: 'var(--gx-coral)' }}>statement</span>: {`{ field_key: { value, cites[], confidence }, ... }`},<br />
              <span style={{ color: 'var(--gx-coral)' }}>charges</span>: [{`{ field_key: ..., cites, confidence }`}, ...],<br />
              <span style={{ color: 'var(--gx-coral)' }}>meters</span>: [...],<br />
              <span style={{ color: 'var(--gx-coral)' }}>render_modes</span>: ["table","json","grid"],<br />
              <span style={{ color: 'var(--gx-coral)' }}>preview_only</span>: true  <span style={{ opacity: 0.55 }}>// free tier</span>
            </span>
            {`}`}
          </div>
        </div>

        {/* UI EFFECTS */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>4 · UI EFFECTS (client)</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12.5, lineHeight: 1.4 }}>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>Workspace lands on Schema Editor · <b>Results</b> tab; render mode defaults to <b>table</b> (or the last selected).</li>
              <li>Chat receives one summary turn — fields extracted · cites · anomalies.</li>
              <li>Onboarding step strip lights <b>Analyze · Extract</b>; flips to Interact on the first follow-up question.</li>
              <li>Each cell hover → highlights its source region in the doc viewer.</li>
              <li>Topbar: <b>export ▾ 🔒 · ↻ rerun · ✎ edit schema ▾ · 💾 Save 🔒</b>. Save + export gated.</li>
              <li>If <code>preview_only</code>: pinned sample's rows visible; further docs blur until sign-in.</li>
            </ul>
          </div>
        </div>

        {/* STATES */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>5 · CLIENT STATES</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, lineHeight: 1.4 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <StateLabel kind="default" top="auto" left="auto" style={{ position: 'static' }}>idle</StateLabel>
              <StateLabel kind="active" top="auto" left="auto" style={{ position: 'static' }}>streaming</StateLabel>
              <StateLabel kind="active" top="auto" left="auto" style={{ position: 'static' }}>complete</StateLabel>
              <StateLabel kind="hover" top="auto" left="auto" style={{ position: 'static' }}>rerunning (post-edit)</StateLabel>
              <StateLabel kind="disabled" top="auto" left="auto" style={{ position: 'static' }}>error</StateLabel>
            </div>
            <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
              <li><b>streaming</b>: fields fill in as they resolve; ↻ rerun replaced with "stop" while in flight.</li>
              <li><b>complete</b>: green dot · "in sync" indicator next to Results tab.</li>
              <li><b>rerunning</b>: scoped to the field(s) whose prompts changed — cheaper than a full pass.</li>
              <li><b>error</b>: field row marked <code>⚠ couldn't extract — open X-Ray</code>; rest of schema completes.</li>
            </ul>
          </div>
        </div>

        {/* EDGE CASES */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>6 · EDGE CASES &amp; SAFEGUARDS</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, lineHeight: 1.4 }}>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li><b>no pinned doc</b> → ↻ rerun disabled, tooltip "pin a sample first".</li>
              <li><b>schema field with no source</b> → cell renders <code>—</code> with <code>⚠ no match</code> chip; low-confidence flag in the row.</li>
              <li><b>field prompt edit</b> → scoped re-run only on that field (no full LLM pass).</li>
              <li><b>schema version bump</b> → old extraction kept in history; diff view (added / removed / value-changed cells) available against any prior <code>extraction_id</code>.</li>
              <li><b>free-tier preview</b> → first pinned doc renders fully; additional docs blur until sign-in.</li>
              <li><b>derived field</b> (e.g. <code>total_kwh = sum(...)</code>) → computed client-side from cited source fields; cites inherit from the inputs.</li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />
      <div className="wf-box wf-rough-lite" style={{ padding: 12, background: 'var(--gx-tint)' }}>
        <div className="wf-label" style={{ marginBottom: 4 }}>IN SCOPE · CROSS-LINKS</div>
        <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'var(--gx-navy)' }}>
          <b>F3a · Edit schema</b> (schema editor with field prompts) · <b>S1 · Loan</b> (JSON render mode) · <b>W6 · Results · table render</b> (cell anatomy). Out of scope still: cross-project schemas, scheduled re-extraction, customer webhooks.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Widget_ExtractBehavior, Widget_ReportBehavior });

// ── Widget · Report behavior (dev spec) ──
// Answers: as a developer, what triggers a report render, what does the
// request/response look like, and how does the UI respond?
// Mirrors W7 (extraction). Reports are to questions what schemas are to fields.

function Widget_ReportBehavior() {
  return (
    <div className="ab" style={{ padding: '24px 28px' }}>
      <div className="ab-title">Behavior · Report render via template (dev spec)</div>
      <div className="ab-sub">
        Template is the durable artifact. Rendering a report = running a saved template against a project's docs. Trigger paths, API contract, edge cases. Mirrors W7 (extraction).
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* TRIGGER */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>1 · TRIGGER</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12.5, lineHeight: 1.4 }}>
            Reports are template-driven. Three trigger paths:
            <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
              <li><b>📌 pin from chat</b> · any assistant turn carries the affordance; clicking lands the Q&amp;A as a new section in the active template (or opens a picker).</li>
              <li><b>↻ render</b> · S3 / S3a topbar — runs every section in the template against pinned docs, produces the full brief.</li>
              <li><b>📐 use template ▾</b> · S2 picker — applies a saved template to the current project on demand.</li>
            </ul>
          </div>
        </div>

        {/* INPUT */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>2 · INPUT (server payload)</div>
          <div style={{ fontFamily: '"JetBrains Mono", "Kalam", monospace', fontSize: 11, lineHeight: 1.45, background: 'var(--gx-tint)', padding: 10, borderRadius: 4 }}>
            POST /v1/reports<br />
            {`{`}<br />
            <span style={{ paddingLeft: 14, display: 'block' }}>
              <span style={{ color: 'var(--gx-coral)' }}>template_id</span>: "tpl_ic_brief_v3",<br />
              <span style={{ color: 'var(--gx-coral)' }}>doc_scope</span>: {`{ project_id: "proj_sundance" }`},<br />
              <span style={{ color: 'var(--gx-coral)' }}>variables</span>: {`{ project: "Sundance", comparables: ["Cordoba","Helios"] }`},<br />
              <span style={{ color: 'var(--gx-coral)' }}>section_ids</span>: null,  <span style={{ opacity: 0.55 }}>// opt · scope to subset</span><br />
              <span style={{ color: 'var(--gx-coral)' }}>chat_session_id</span>: "s_42",<br />
              <span style={{ color: 'var(--gx-coral)' }}>parent_message_id</span>: "m_91"
            </span>
            {`}`}
          </div>
          <div style={{ marginTop: 6, fontFamily: 'Kalam,cursive', fontSize: 11, color: 'rgba(41,51,92,0.65)' }}>
            Template model: list of <i>sections</i> · each has <code>name</code>, <code>render_as</code> (PARAGRAPH / BULLETS / TABLE), <code>question</code> prompt, <code>variables[]</code>, <code>instructions</code>. See S3a for the editor.
          </div>
        </div>

        {/* OUTPUT */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>3 · OUTPUT (rendered report)</div>
          <div style={{ fontFamily: '"JetBrains Mono", "Kalam", monospace', fontSize: 11, lineHeight: 1.45, background: 'var(--gx-tint)', padding: 10, borderRadius: 4 }}>
            {`{`}<br />
            <span style={{ paddingLeft: 14, display: 'block' }}>
              <span style={{ color: 'var(--gx-coral)' }}>report_id</span>: "rpt_8821",<br />
              <span style={{ color: 'var(--gx-coral)' }}>template_id</span>: "tpl_ic_brief_v3",<br />
              <span style={{ color: 'var(--gx-coral)' }}>status</span>: "complete" | "streaming" | "error",<br />
              <span style={{ color: 'var(--gx-coral)' }}>sections</span>: [<br />
              <span style={{ paddingLeft: 14, display: 'block' }}>
                {`{ name, render_as, body, cites[], confidence, warnings[] }`}, ...
              </span>
              ],<br />
              <span style={{ color: 'var(--gx-coral)' }}>resolved_variables</span>: {`{ project: "Sundance", ... }`},<br />
              <span style={{ color: 'var(--gx-coral)' }}>export_formats</span>: ["pdf","md","link"],<br />
              <span style={{ color: 'var(--gx-coral)' }}>preview_only</span>: true  <span style={{ opacity: 0.55 }}>// free tier</span>
            </span>
            {`}`}
          </div>
        </div>

        {/* UI EFFECTS */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>4 · UI EFFECTS (client)</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12.5, lineHeight: 1.4 }}>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>Workspace lands on <b>S3 · Reading {`{template}`}</b>; sections stream in order.</li>
              <li>Chat receives one summary turn — N sections rendered · all cited.</li>
              <li>Onboarding step strip lights <b>Analyze · Report</b>; Extract / Interact carry their ✓ if traversed.</li>
              <li>Each section heading carries <b>✎ edit §N</b> · jumps to S3a with that section pre-selected.</li>
              <li>Topbar: <b>export ▾ 🔒 · ↻ render · ✎ edit template ▾ · 💾 Save 🔒</b>. Save + export gated.</li>
              <li>If <code>preview_only</code>: brief renders fully on pinned project; rendering against new projects requires sign-in.</li>
            </ul>
          </div>
        </div>

        {/* STATES */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>5 · CLIENT STATES</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, lineHeight: 1.4 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <StateLabel kind="default" top="auto" left="auto" style={{ position: 'static' }}>idle</StateLabel>
              <StateLabel kind="active" top="auto" left="auto" style={{ position: 'static' }}>streaming</StateLabel>
              <StateLabel kind="active" top="auto" left="auto" style={{ position: 'static' }}>complete</StateLabel>
              <StateLabel kind="hover" top="auto" left="auto" style={{ position: 'static' }}>rerendering (post-edit)</StateLabel>
              <StateLabel kind="disabled" top="auto" left="auto" style={{ position: 'static' }}>error</StateLabel>
            </div>
            <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
              <li><b>streaming</b>: sections append as they resolve; ↻ render replaced with "stop" while in flight.</li>
              <li><b>complete</b>: green dot · "rendered just now" indicator next to template name.</li>
              <li><b>rerendering</b>: scoped to sections whose questions changed — cheaper than full re-render.</li>
              <li><b>error</b>: section renders <code>⚠ couldn't generate — open trace</code>; remaining sections complete.</li>
            </ul>
          </div>
        </div>

        {/* EDGE CASES */}
        <div className="wf-box wf-rough-lite" style={{ padding: 14, background: '#fff' }}>
          <div className="wf-label" style={{ marginBottom: 6 }}>6 · EDGE CASES &amp; SAFEGUARDS</div>
          <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, lineHeight: 1.4 }}>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li><b>unresolved variable</b> → section renders with placeholder <code>{'{project}'}</code>; warning chip prompts user to bind it.</li>
              <li><b>section finds no source</b> → body renders <code>—</code> with <code>⚠ no support in docs</code>; section flagged low-confidence.</li>
              <li><b>section question edit</b> → scoped re-render of that section only (no full template pass).</li>
              <li><b>template version bump</b> → old report kept in history; diff view (added / removed / changed sections) available against any prior <code>report_id</code>.</li>
              <li><b>free-tier preview</b> → render fully on pinned project; rendering against a new project triggers the gate.</li>
              <li><b>pin during streaming</b> → 📌 affordance disabled until the current turn completes; queues the pin if clicked.</li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />
      <div className="wf-box wf-rough-lite" style={{ padding: 12, background: 'var(--gx-tint)' }}>
        <div className="wf-label" style={{ marginBottom: 4 }}>IN SCOPE · CROSS-LINKS</div>
        <div style={{ fontFamily: 'Kalam,cursive', fontSize: 12, color: 'var(--gx-navy)' }}>
          <b>S3 · IC brief rendered</b> · <b>S3a · Report builder template</b> · <b>S2 · pin to report from chat</b> · <b>W7 · Extract behavior</b> (parallel dev spec). Out of scope still: scheduled re-rendering, cross-project templates by default, customer webhooks.
        </div>
      </div>
    </div>
  );
}
