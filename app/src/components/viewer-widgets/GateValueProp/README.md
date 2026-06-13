# GateValueProp

**Slot:** `viewer-widgets` · **Status:** legacy

The retired canvas value-prop companion for the old F6 sign-up gate. The live
sign-in path now renders `SignUpWidget` as the viewer overlay and keeps
`ConversationFlow` mounted in chat.

## Viewer chrome

Policy: `hostless-exception`

Content mode: `centered-panel`

Owner: OnboardingShell

Host proof: `app/src/views/Onboarding/OnboardingShell.test.tsx`

GateValueProp is a legacy reference widget retained for tests and historical
context. It is not mounted by the live onboarding viewer host; the live owner
is `OnboardingShell` wrapping `SignUpWidget` with `ViewerWidgetFrame`.

## What it does

Historically, when the gate opened, the chat rail (`GateChatRail`) presented
the sign-in doors and the canvas mounted this value-prop pitch. It is retained
for legacy tests/reference, not mounted by the live onboarding sign-in path.
Presentational only.

## Props

```ts
interface GateValuePropProps {
  /** Widget access role (widget contract). REQUIRED. */
  role: WidgetRole;             // "anonymous" | "member"
  /** Required scope (widget contract). Always { type: "none" }. */
  scope: WidgetScope;
}
```

Migrated to the role+scope contract in `2026-05-30-widget-role-access`
Phase 2b. The retired cosmetic `mode` prop was dropped — the pitch is
identical in both modes, so it switched nothing — and replaced by `role`
for contract conformance. `role` is surfaced as `data-role` on the root.

## Locked affordances (read-only roles)

**None.** GateValueProp is presentational (a pitch surface) with no
interactive controls, so there is nothing to lock by role; it renders
identically under any role it is handed.

Its matrix availability is **legacy anonymous-only**. The live mount site uses
`SignUpWidget`; this component keeps `role` only for widget-contract
conformance and historical tests.

## Scope

`{ type: "none" }`. GateValueProp is **not** a ScopedViewerWidget — it
operates on no document set, so it always declares the explicit "none"
scope required by the widget contract.

## Events

None. The widget emits no events and takes no callbacks.

## How to mount

Legacy-only example:

```tsx
<GateValueProp role="anonymous" scope={{ type: "none" }} />
```

The live onboarding shell mounts `SignUpWidget` for sign-in instead.

## No LLM tools

Presentational — no tools. See `no-llm.md`.

## Copy

product-brand-gtm aligned: echoes F1's "documents that break general-purpose AI"
framing and F7's "ship the same project to your stack" close.
