# GateValueProp

**Slot:** `viewer-widgets` · **Status:** shipped

The **canvas (viewer-slot) half of the F6 sign-up gate**. Sibling to
`chat-widgets/GateChatRail`, which owns the sign-up doors.

## What it does

When the gate opens, the chat rail (`GateChatRail`) presents the three doors —
email "send magic link" · SSO · book-a-call — and the canvas mounts this widget:
an attractive, on-brand pitch of the GroundX value proposition. It replaced the
old in-canvas account form (P1, 2026-05-29) so sign-up is a chat moment and the
canvas reinforces *why* it's worth an account. Presentational only.

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

Its matrix availability is **anonymous-only** (gate context — a signed-in
`member` never sees the sign-up gate). Per the widget-access matrix,
**availability is enforced at the MOUNT SITE** (OnboardingShell, driven by
gate-state), NOT by a prop inside the widget. The `role` prop is carried
only for widget-contract conformance and future roles.

## Scope

`{ type: "none" }`. GateValueProp is **not** a ScopedViewerWidget — it
operates on no document set, so it always declares the explicit "none"
scope required by the widget contract.

## Events

None. The widget emits no events and takes no callbacks — the actionable gate
affordances (commit / dismiss) live in the sibling `GateChatRail`.

## How to mount

`OnboardingShell` mounts `<GateValueProp role={role} scope={{ type: "none" }} />`
in the canvas slot whenever the sign-up surface is active
(`gate.status === "open" | "committed"`), in place of the previous frame view.
Because the mount is gated on the sign-up surface (an anonymous-only state),
the **mount site enforces the anonymous-only availability** — the widget
itself carries `role` only for contract conformance. `role` comes from the
session (`useWidgetRole`); `scope` is always the explicit "none" scope.

## No LLM tools

Presentational — no tools. See `no-llm.md`. The gate's `commit_gate` /
`dismiss_gate` tools live on `GateChatRail`.

## Copy

product-brand-gtm aligned: echoes F1's "documents that break general-purpose AI"
framing and F7's "ship the same project to your stack" close.
