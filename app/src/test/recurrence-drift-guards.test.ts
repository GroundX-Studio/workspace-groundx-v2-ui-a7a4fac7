/**
 * Recurrence drift-guards — 2026-05-31-core-data-followups §5.
 *
 * The whole point of the core-data-followups change was to collapse a class of
 * structural debt onto shared bases:
 *
 *   • §2 — every `*Error` extends the shared `ApiError` base.
 *   • §3 — entity contexts route results through `SdkActionResult<T>` (no
 *     `Record<string,unknown>` placeholder standing in for a real union).
 *   • §4/onboarding-shell — the four main viewer widgets build on
 *     `ScopedViewerWidget` (a `scope` prop + a canvas-dispatch `show_*` tool +
 *     registration in the production registry).
 *
 * These guards FAIL LOUDLY if a future change reintroduces the debt. They are
 * authored AFTER the bases exist (per the tasks.md authoring-order rule) so each
 * guard is NON-vacuous: it walks the CURRENT tree and would catch a real
 * reintroduction (each was proven to fire by a temporary fork during authoring,
 * then reverted).
 *
 * Guards in this file (app-side):
 *   (a) a viewer-widget that doesn't build on `ScopedViewerWidget` / lacks a
 *       `show_*` tool;
 *   (b) a duplicate exported type name across files;
 *   (c) a `Record<string,unknown>` placeholder in a context's typed STATE
 *       (the `currentIntent` placeholder B1 collapsed);
 *   (d) an app `*Error` class that doesn't extend the shared `ApiError`.
 *
 * Guard (e) (a persisted DB column with no in-memory type field) + the
 * middleware half of (d) live in `middleware/src/db/persistedColumnPolicy.test.ts`
 * (they can only see the middleware source tree).
 */
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

/** Recursively collect every non-test `.ts`/`.tsx` source file under `dir`. */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      out.push(...listSourceFiles(abs));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue; // production source only
    out.push(abs);
  }
  return out;
}

// ── Guard (a) — every viewer-widget builds on ScopedViewerWidget ────────────
//
// A built viewer widget is "wired" iff its `*.tools.ts` exports a
// `defineScopedViewerWidget(...)` descriptor (which the production registry
// catalogs so `<ScopedCanvas>` can resolve `step.kind → CanvasKind → mount →
// component`) AND declares ≥1 canvas-dispatch tool. The four main
// ScopedViewerWidgets (PdfViewer · Extract · SmartReport{Render,Builder} ·
// Integrate) each register a descriptor through the production registry; a new
// viewer widget that skips `defineScopedViewerWidget` is unreachable by
// `<ScopedCanvas>` (the registry is the sole mount path) — this guard catches
// that at authoring time, not at a runtime canvas swap.
//
// NOTE on the canvas-dispatch verb: `show_*` is the canonical ScopedViewerWidget
// verb, but the base descriptor DELIBERATELY accepts the full allowlisted verb
// set (PdfViewer ships `open_document`/`jump_to_page`, the report family ships
// `show_*`) — verb prefixes are policed by `check-tool-quality`, NOT here (see
// the `scopedViewerWidget.ts` header). So this guard asserts "registers a
// descriptor with ≥1 canvas-dispatch tool", which is the real base-membership
// signal; it does NOT hard-require the literal `show_` prefix (that would
// false-fail PdfViewer).
//
// EXEMPTIONS: viewer-pane widgets that are NOT ScopedViewerWidgets by design —
// session-scoped overlays / value-prop surfaces mounted directly by a view, not
// through the CanvasKind registry. Each carries a documented reason (mirrors the
// no-hardcoded-styles allowlist hygiene: a stale exemption is force-deleted by
// the sanity check below).

const VIEWER_WIDGETS_DIR = join(SRC, "components", "viewer-widgets");

const SCOPED_VIEWER_WIDGET_EXEMPT: Record<string, string> = {
  // Sign-up gate surface — mounted by the gate flow, not a doc/scope-bound
  // canvas widget; it is session-scoped (the gate is the pre-sign-up moment).
  SignUpWidget: "sign-up gate surface — session-scoped, mounted by the gate flow (not a CanvasKind)",
  // Calendly booking iframe — opened by the book-call overlay, not scope-bound.
  BookCallView: "book-call surface — opened by the book-call overlay (not a CanvasKind)",
  // Gate value-prop panel — the locked-feature teaser; session-scoped overlay.
  GateValueProp: "gate value-prop teaser — session-scoped overlay (not a CanvasKind)",
};

function listViewerWidgetDirs(): string[] {
  if (!existsSync(VIEWER_WIDGETS_DIR)) return [];
  return readdirSync(VIEWER_WIDGETS_DIR).filter((name) => {
    if (name.startsWith("_")) return false;
    return statSync(join(VIEWER_WIDGETS_DIR, name)).isDirectory();
  });
}

describe("§5(a) — every viewer-widget builds on ScopedViewerWidget", () => {
  const dirs = listViewerWidgetDirs();

  it("the viewer-widgets directory is enumerable (sanity meta-check)", () => {
    expect(Array.isArray(dirs)).toBe(true);
    expect(dirs.length).toBeGreaterThan(0);
  });

  for (const name of dirs) {
    if (name in SCOPED_VIEWER_WIDGET_EXEMPT) continue;
    it(`viewer-widgets/${name} registers a defineScopedViewerWidget descriptor + ≥1 canvas-dispatch tool`, () => {
      const widgetDir = join(VIEWER_WIDGETS_DIR, name);
      // The tools file may be `<Name>.tools.ts`. Concatenate every source file
      // in the widget dir so a split (component vs tools) still resolves.
      const sources = listSourceFiles(widgetDir)
        .map((f) => readFileSync(f, "utf8"))
        .join("\n");
      expect(
        /\bdefineScopedViewerWidget\s*\(/.test(sources),
        `viewer-widgets/${name} does not call defineScopedViewerWidget(...) — every ` +
          `viewer widget must register a ScopedViewerWidget descriptor (or be added to ` +
          `SCOPED_VIEWER_WIDGET_EXEMPT with a reason). See docs/agents/data-model.md.`,
      ).toBe(true);
      // ≥1 canvas-dispatch tool: a `tools:` array passed to the descriptor with
      // at least one tool `name:`. (Verb prefix policed by check-tool-quality.)
      expect(
        /\bname:\s*["'][a-z][a-z0-9_]*["']/.test(sources),
        `viewer-widgets/${name} declares no canvas-dispatch tool — every ` +
          `ScopedViewerWidget exposes at least one (show_extraction / open_document / …).`,
      ).toBe(true);
    });
  }

  it("every SCOPED_VIEWER_WIDGET_EXEMPT entry still names a real viewer-widget dir (sanity)", () => {
    const present = new Set(dirs);
    const stale = Object.keys(SCOPED_VIEWER_WIDGET_EXEMPT).filter((n) => !present.has(n));
    expect(
      stale.length === 0,
      `SCOPED_VIEWER_WIDGET_EXEMPT has stale entries (dir gone — delete them): ${stale.join(", ")}`,
    ).toBe(true);
  });
});

// ── Guard (b) — no duplicate exported type name across files ─────────────────
//
// A duplicate `export type X` / `export interface X` declared in two different
// files is the tell of a wire-twin that should be unified onto `@groundx/shared`
// (the §4 type-unification work). Re-exports (`export type { X } from "..."` /
// `export { X }`) are NOT declarations — they are the unification mechanism, so
// they're excluded. This guard pins the de-duped state so a future fork fails.
//
// EXEMPTIONS: names that legitimately appear as independent declarations in
// multiple files (generic param names, locally-scoped helper aliases). Each
// carries a documented reason.

const DUP_TYPE_NAME_EXEMPT: Record<string, string> = {
  // KNOWN, TRACKED inline wire-twin not yet folded: `ReportSectionRenderAs` is
  // declared identically in `types/report.ts` and `contexts/ChatStoreContext/
  // types.ts` (the latter's comment literally says "Mirrors ReportSectionRenderAs").
  // Folding it onto one home (a shared `report` render-mode union) is the OPEN
  // §4b "LOW — fold remaining inline wire-twins" item in
  // 2026-05-31-core-data-followups/tasks.md — left honestly open there, exempted
  // here so this guard ships GREEN today WITHOUT pre-empting that fold. The guard
  // still fires for any NEW duplicate; the sanity check below force-deletes this
  // entry the moment the §4 fold collapses it to one declaration.
  ReportSectionRenderAs:
    "tracked §4b inline-wire-twin fold (types/report.ts ↔ ChatStoreContext/types.ts) — not yet collapsed",
};

interface ExportDecl {
  name: string;
  file: string;
}

function collectExportedTypeDecls(files: string[]): ExportDecl[] {
  const out: ExportDecl[] = [];
  // Match a DECLARATION (has a body / `=`), not a re-export. Re-exports look
  // like `export type { X }` or `export { X } from` — the `{` immediately after
  // `type`/nothing is the tell; we require an identifier directly after the
  // keyword (no `{`).
  const declRe =
    /\bexport\s+(?:declare\s+)?(?:type|interface)\s+([A-Z][A-Za-z0-9_]*)\b(?!\s*,)/g;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(src)) !== null) {
      const name = m[1]!;
      // Skip `export type {` re-export blocks — the regex above won't match
      // them (no identifier follows `type`), but guard against `export type X =`
      // being a pure alias re-export of a shared type, which is the UNIFICATION
      // path, not a fork. An alias whose RHS is an import-bound shared symbol is
      // fine; we only flag genuinely independent declarations, so we keep ALL
      // `export type X =` / `export interface X` and rely on the cross-file
      // collision to surface true forks. Aliases of the SAME shared symbol in
      // two files would collide — that is itself worth flagging (pick one home).
      out.push({ name, file });
    }
  }
  return out;
}

describe("§5(b) — no duplicate exported type name across files", () => {
  // Walk the whole app source tree (types are app-wide).
  const files = listSourceFiles(SRC);
  const decls = collectExportedTypeDecls(files);

  it("the app source tree is enumerable (sanity meta-check)", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(decls.length).toBeGreaterThan(0);
  });

  it("no exported type/interface name is DECLARED in more than one file", () => {
    const byName = new Map<string, Set<string>>();
    for (const d of decls) {
      if (d.name in DUP_TYPE_NAME_EXEMPT) continue;
      const set = byName.get(d.name) ?? new Set<string>();
      set.add(d.file.slice(SRC.length + 1));
      byName.set(d.name, set);
    }
    const dups = [...byName.entries()]
      .filter(([, files]) => files.size > 1)
      .map(([name, files]) => `${name} declared in: ${[...files].sort().join(", ")}`);
    expect(
      dups.length === 0,
      `Duplicate exported type names (unify onto @groundx/shared and re-export, ` +
        `or add a documented DUP_TYPE_NAME_EXEMPT entry):\n  ${dups.join("\n  ")}`,
    ).toBe(true);
  });

  it("every DUP_TYPE_NAME_EXEMPT entry still corresponds to a real duplicate (sanity)", () => {
    const byName = new Map<string, Set<string>>();
    for (const d of decls) {
      const set = byName.get(d.name) ?? new Set<string>();
      set.add(d.file);
      byName.set(d.name, set);
    }
    const stale = Object.keys(DUP_TYPE_NAME_EXEMPT).filter(
      (n) => (byName.get(n)?.size ?? 0) <= 1,
    );
    expect(
      stale.length === 0,
      `DUP_TYPE_NAME_EXEMPT has stale entries (no longer duplicated — delete them): ${stale.join(", ")}`,
    ).toBe(true);
  });
});

// ── Guard (c) — no Record<string,unknown> placeholder in a context typed STATE
//
// The B1 "One CanvasIntent" work collapsed `currentIntent: Record<string,unknown>
// | null` (a deferred-foundation placeholder) onto the real union. This guard
// fails if a context's STATE interface (a `*State` interface under contexts/)
// reintroduces a bare `Record<string, unknown>` typed field — the placeholder
// smell. SERIALIZATION shapes (localStorage snapshots, the `detail?:
// CanvasIntent | Record<string,unknown>` JSON-bag escape hatch, persistence
// payloads) are legitimate and NOT state fields — they are excluded by only
// scanning `interface *State {...}` blocks.

function collectStateInterfaceBodies(files: string[]): { file: string; name: string; body: string }[] {
  const out: { file: string; name: string; body: string }[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // Match `(export )?interface <Name>State ... { ... }` — balance braces from
    // the first `{` after the header.
    const headerRe = /\b(?:export\s+)?interface\s+([A-Za-z0-9_]*State)\b[^{]*\{/g;
    let m: RegExpExecArray | null;
    while ((m = headerRe.exec(src)) !== null) {
      const name = m[1]!;
      const openIdx = src.indexOf("{", m.index);
      if (openIdx < 0) continue;
      let depth = 0;
      let end = openIdx;
      for (let i = openIdx; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      out.push({ file, name, body: src.slice(openIdx, end + 1) });
    }
  }
  return out;
}

describe("§5(c) — no Record<string,unknown> placeholder in a context typed state", () => {
  const contextsDir = join(SRC, "contexts");
  const files = listSourceFiles(contextsDir);
  const stateBodies = collectStateInterfaceBodies(files);

  it("the contexts/*State interfaces are enumerable (sanity meta-check)", () => {
    expect(stateBodies.length).toBeGreaterThan(0);
  });

  it("no *State interface field is typed as a bare Record<string, unknown>", () => {
    const offenders: string[] = [];
    // A field like `currentIntent: Record<string, unknown> | null;` — the
    // placeholder smell. We match a `: Record<string, unknown>` annotation
    // anywhere inside a *State interface body.
    const placeholderRe = /:\s*Record<\s*string\s*,\s*unknown\s*>/;
    for (const { file, name, body } of stateBodies) {
      // Inspect each member line so the offender message is precise.
      for (const rawLine of body.split("\n")) {
        const line = rawLine.trim();
        if (placeholderRe.test(line)) {
          offenders.push(`${file.slice(SRC.length + 1)} › ${name}: ${line}`);
        }
      }
    }
    expect(
      offenders.length === 0,
      `A context *State interface uses a Record<string,unknown> placeholder where a ` +
        `real typed union belongs (the currentIntent placeholder B1 collapsed):\n  ` +
        `${offenders.join("\n  ")}`,
    ).toBe(true);
  });
});

// ── Guard (d) [app half] — every app *Error extends the shared ApiError ──────
//
// §2 made `ApiError` (in `@groundx/shared`) the one base. A hand-rolled
// `class XError extends Error` reintroduces the forked hierarchy this change
// removed. This guard fails any app error class that extends `Error` directly
// (rather than `ApiError`). React error boundaries (`extends Component`) are not
// error CLASSES and don't match.

describe("§5(d) — every app *Error class extends the shared ApiError", () => {
  const files = listSourceFiles(SRC);

  it("no app error class extends Error directly (must extend ApiError)", () => {
    const offenders: string[] = [];
    // `class FooError extends Error` — the forked-hierarchy smell. The base
    // ApiError itself lives in @groundx/shared (not under app/src), so it is
    // not walked here; an app subclass must extend ApiError, never Error.
    const re = /\bclass\s+([A-Za-z0-9_]*Error)\s+extends\s+Error\b/g;
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        offenders.push(`${file.slice(SRC.length + 1)} › class ${m[1]} extends Error`);
      }
    }
    expect(
      offenders.length === 0,
      `An app error class extends Error directly — extend the shared \`ApiError\` ` +
        `base (@groundx/shared) instead (§2):\n  ${offenders.join("\n  ")}`,
    ).toBe(true);
  });
});
