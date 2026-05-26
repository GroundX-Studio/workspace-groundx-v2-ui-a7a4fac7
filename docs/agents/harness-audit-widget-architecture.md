# Harness audit · widget architecture + scaffold reorg

**Authored 2026-05-26 after the ARCH epic closed all 14 P0 items.**
**For:** the `harness-web-ui` skill team + `groundx-web-ui-scaffold`
template repo maintainers.

This memo describes the **generally-applicable patterns** that
landed in `groundx-v2-ui` during the ARCH epic and that the harness
team should consider codifying so future managed projects ship with
them by default. **GroundX-specific cleanup decisions are NOT raised
here** — the harness team should not delete scaffold-default Home or
Dashboard files because one project did; that's per-project.

## TL;DR

The ARCH epic was a structural rewrite of a managed project that
started from the standard `groundx-web-ui-scaffold` and grew into a
sign-up + onboarding + steady-mode chat surface. Along the way, it
hit a set of architectural friction points that we believe most
chat-surface products built on the scaffold will eventually hit too.
The eight patterns + one consideration below are our case for
shipping the scaffold pre-wired with them.

If you adopt none of them, the scaffold still works. If you adopt
even one (we recommend the widget-contract drift guard first), the
next project starts ahead.

---

## Eight patterns to codify

### 1. Single canonical `AppShell` mounted by every surface

**Problem we hit:** the scaffold's default `Dashboard` layout
(boxed content + topbar) is appropriate for a generic CRUD product,
but doesn't fit a chat product (nav + chat | viewer). We built our
own `AppShell` (nav slot + header slot + chat slot + canvas slot),
but for a while had TWO parallel shells live concurrently — the
onboarding flow's custom `f1Layout` for F1 and the canonical
`AppShell` for F2+. The dual-mount left us with timed slide-overlay
animation infrastructure that nobody could reason about + ~300 LOC
of state machinery (transition-phase enum, ref-tracking for leaving
snapshots, etc.).

**The fix:** one canonical `AppShell` mount, always. Surface-
specific differences (F1's no-nav + no-chat picker layout vs F2+'s
chat | viewer split) become props (`hideNav`, `hideChat`,
optional `header` slot, etc.) instead of separate mounts.

**For the scaffold:** ship the canonical AppShell pre-built with
the slot contract documented + `hideNav` / `hideChat` props out of
the box. Doc the "build for steady, decorate for onboarding"
philosophy: the post-onboarding majority is the design target, and
onboarding is an overlay decorating the canonical shell.

### 2. Onboarding as an overlay above the shell, not a parallel hierarchy

**Problem we hit:** mounting an onboarding flow as its own shell
parallel to the steady-mode shell creates two of everything (two
nav implementations, two chat surfaces, two viewer slots). Every
feature has to be implemented twice or carefully cross-shared.

**The fix:** AppShell is the canonical mount. Onboarding is an
absolute-positioned overlay above it that lifts away to reveal the
shell underneath. The shell is always there; onboarding just
visually obscures it for the first ~30 seconds.

**For the scaffold:** offer an `OnboardingOverlay` slot in the
scaffold's default surface, OR document the overlay pattern in the
references with an example animation spec. Our spec (locked):
A · Sheet dismiss, 900ms dismiss / 700ms return, cubic-bezier
(0.32, 0.72, 0, 1), opacity holds till 70% then wipes, subtle F2
zoom (0.985 → 1, opacity 0.92 → 1), reduced-motion bypass.

### 3. Chat-widget vs viewer-widget contract (slot directory convention)

**Problem we hit:** without a structural rule for "which widgets go
where," widgets end up scattered across `shared/components/`,
`views/<Frame>/<Widget>.tsx`, ad-hoc subfolders. The mental model
becomes "search the tree" instead of "look in the chat slot."

**The fix:** two slot directories — `components/chat-widgets/`
and `components/viewer-widgets/`. Directory placement IS the slot
declaration. No third slot, no cross-mounting.

**For the scaffold:** ship `src/components/chat-widgets/` +
`src/components/viewer-widgets/` as empty directories (with
.gitkeep README files explaining the contract). Reference doc:
`harness-web-ui/references/widget-slots.md`.

### 4. `primitives/` + `brand/` + `layout/` taxonomy

**Problem we hit:** we had a flat `shared/components/` with 24
files mixing typography primitives (`Common*Button`, `CommonTextField`),
branded molecules (`Gx*`), chrome singletons (`AppShell`,
`OnboardingNav`), and feature components. Knowing where to add a
new component required deep context.

**The fix:** three additional component tiers under `components/`:
- `primitives/` — unbranded atoms; theme-resolving; e.g. `Button`,
  `Heading`, `TextField`, `Tooltip` (13 today)
- `brand/` — Gx-prefixed (or equivalent) branded molecules; e.g.
  `GxCard`, `CapabilityBadge`, `ConnectorGlyph` (9 today)
- `layout/` — chrome singletons mounted at root or once; e.g.
  `AppShell`, `OnboardingNav`, `StepStrip` (4 today)

Combined with the slot widgets, that's the **5-tier taxonomy**:
`primitives/` + `brand/` + `layout/` + `chat-widgets/` +
`viewer-widgets/`.

**For the scaffold:** ship the 5 directories pre-created with a
README in each explaining the tier rules + a starter primitive
(`Button`) + a starter brand (`Card`) so the pattern is illustrative
from the first commit.

### 5. The "no canvas one-offs" rule + failure modes

**Problem we hit:** before the contract, every view (`UnderstandView`,
`ExtractView`, `InteractView`, etc.) contained its own bespoke
canvas implementation, often reading hardcoded fixtures from a
manifest file. The result: four "PDF viewer" implementations with
slightly different behavior, none of which loaded real API data
correctly.

**The fix:** the no-duplicates rule. Production widgets are
ONE production widget shared across onboarding + steady. Onboarding
mode = a `mode` prop that locks certain controls. Same widget, same
data, same code path, different UI affordances.

**For the scaffold:** doc this in `harness-web-ui/references/no-duplicate-widgets.md`
+ require every new widget to accept a `mode` prop. The widget-
contract drift guard (item 6) enforces it.

### 6. Drift-guard test pattern — widget contract

**Problem we hit:** the contract above ("every widget has a README,
a sibling test, a `mode` prop") is only valuable if it's enforced.
A docs-only rule decays into vibes the moment someone is in a hurry.

**The fix:** `src/test/widget-contract.test.ts` auto-discovers every
widget directory under both slot folders and asserts: (a) README
exists; (b) sibling `*.test.tsx` exists; (c) main `.tsx` references
`mode:` in its props type. Failing any one = failing CI.

**For the scaffold:** ship this test pre-installed. The boilerplate
is ~100 lines; the value compounds as the project grows.

### 7. Drift-guard test pattern — no hardcoded styles

**Problem we hit:** even with a primitive system, developers slip
in `fontSize: 13` / `borderRadius: 6` / `#29335c` literals in `sx`
blocks. Each one is harmless on its own but the design system rots
gradually.

**The fix:** `src/test/no-hardcoded-styles.test.ts` walks every
`.tsx` under `components/` + `views/` and fails CI on inline
`fontSize: <num>` / `fontWeight: <num>` / `borderRadius: <num>` /
viewport-unit `maxHeight`/`minHeight` string literals / hex color
literals. `EXEMPT_OFFENDER_COUNTS` records historical exemptions
(monotonically shrinking); `ASSET_ALLOWLIST` documents legitimate
non-brand cases.

**For the scaffold:** ship this test pre-installed pointing at the
scaffold's chrome tokens. Three documented allowlist cases worth
calling out:
- Third-party brand glyphs (logos at their actual hex values)
- Dev-only debug overlays (intentionally non-brand colors as the
  "this is a debug panel" identity)
- Framework-independent error boundaries (render BEFORE the theme
  provider mounts; can't use tokens)

### 8. "Follow MUI where it makes sense" rule

**Problem we hit:** designing primitive APIs from scratch is
tempting (we initially built `<Button variant="primary | secondary
| icon">` as a monolith) but it diverges from MUI's component
graph that developers already know. We corrected mid-build to
split `Button` (text-bearing) and `IconButton` (icon-only) per
MUI's own division. The corrected APIs are now intuitive for
anyone with MUI familiarity.

**The fix:** when a primitive has a clear MUI counterpart, mirror
MUI's component split + prop names + variant taxonomy. Layer
brand-locked semantics ON TOP. Don't invent novel APIs unless the
primitive has no MUI analogue or the project's design language
genuinely requires departure (document the rationale in the
primitive's README).

**For the scaffold:** doc this in `harness-web-ui/references/primitives.md`
+ make it part of the starter `Button` primitive's README so new
agents see the pattern immediately.

---

## One consideration to raise (not a recommended change)

### Scaffold-default Home / Dashboard / AppStatus / Banned stubs

The scaffold ships with `Home.tsx` (marketing landing), `Dashboard.tsx`
(boxed-content + topbar layout), `AppStatus.tsx` (status page),
`Banned.tsx` (banned-account placeholder). Each is a reasonable
starting point for a generic CRUD product.

For products that adopt a custom shell (single AppShell with chat |
viewer slots, per item 1), most of these stubs become dead weight:
- `Home.tsx` (161 lines of scaffold marketing) → replaced by an
  auth-aware redirect at `/` for products with a single home target
- `Dashboard.tsx` (317 lines of boxed layout) → replaced by routes
  mounting AppShell directly
- `AppStatus.tsx` → kept-or-deleted per product (no callers in our
  project)
- `Banned.tsx` → kept (the `/banned` route IS load-bearing —
  `api/axios.ts` 403-on-archived-customer redirect + `Login.tsx`
  banned-login branch — but the placeholder copy needs a real
  banned-account surface)

**The recommendation is NOT to delete these from the scaffold.**
Many products will use them as-is. The recommendation IS to add a
single doc note in `harness-web-ui` along the lines of: "If your
product mounts a custom shell at `/`, consider whether the
scaffold-default `Home` / `Dashboard` / `AppStatus` / `Banned`
stubs still serve your needs. The `/banned` route is typically
load-bearing (referenced by axios 403 handler + Login)."

That single sentence would save the next per-project "what does
this file actually do" investigation.

---

## What we ARE NOT raising

- The five-tier component tree's exact names (we chose
  `primitives/` + `brand/` + `layout/` + `chat-widgets/` +
  `viewer-widgets/`; other naming is fine).
- Specific brand tokens (each project has its own).
- Specific widget implementations (each project's widgets are its
  own).
- The animation spec for onboarding → shell transition (each
  project picks its own visual; ours is documented as one example).
- Per-project deletions (CoreLayouts, AppStatus, Home replacement,
  etc. — those are GroundX-specific calls).

---

## Anchoring evidence (links into `groundx-v2-ui`)

For the harness team to validate any of the above patterns against
real code:

- Widget contract test: `scaffold/app/src/test/widget-contract.test.ts`
- No-hardcoded-styles test: `scaffold/app/src/test/no-hardcoded-styles.test.ts`
- Widget contract doc: `scaffold/docs/agents/widget-contract.md`
- AppShell: `scaffold/app/src/components/layout/AppShell/AppShell.tsx`
  (look for `hideNav` + `hideChat` props, `data-shell-instance`
  attribute, the `header` slot)
- Onboarding overlay animation spec: top of
  `scaffold/app/src/views/Onboarding/OnboardingShell.tsx`
- Sign-up split example (canonical widget pair): `chat-widgets/GateChatRail/`
  + `viewer-widgets/SignUpWidget/` (each with README + test + mode prop)
- MUI-follow example: `components/primitives/Button/` (Button + IconButton
  split documented in `Button/README.md` § "Why split from MUI")

---

## Closing

The eight patterns + one consideration above represent ~3 weeks of
project-side architectural work that the next managed project
shouldn't have to redo. We believe the marginal cost to the
harness team to codify them is low (mostly doc + a few hundred
lines of scaffold boilerplate) and the marginal benefit to
downstream projects is high (the patterns are forcing functions
that compound; the drift guards in particular get more valuable as
the codebase grows).

If you want to discuss any of the patterns or the implementation
details, the corresponding ARCH backlog rows in `scaffold/docs/
agents/backlog.md` carry the full closure notes (each describes
what shipped, what was rejected, and why).
