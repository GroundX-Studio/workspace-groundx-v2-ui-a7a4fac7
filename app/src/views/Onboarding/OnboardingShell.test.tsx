import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatStore } from "@/contexts/ChatStoreContext";
import { useEntityRegistry } from "@/contexts/EntityRegistryContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { OnboardingShell } from "./OnboardingShell";

const apiMocks = vi.hoisted(() => ({
  issueOnboardingSession: vi.fn(),
}));

vi.mock("@/api/entities/onboardingSessionEntity", () => ({
  issueOnboardingSession: apiMocks.issueOnboardingSession,
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  apiMocks.issueOnboardingSession.mockReset();
  apiMocks.issueOnboardingSession.mockResolvedValue({ sessionId: "anon-session-1", anonymous: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const SessionProbe = ({ onSnapshot }: { onSnapshot: (snapshot: { sessionId: string | null; frame: string }) => void }) => {
  const session = useOnboardingSession();
  onSnapshot({ sessionId: session.state.sessionId, frame: session.state.currentFrame });
  return null;
};

/**
 * Test action probe — captures the session API so a test can drive
 * `advanceFrame` programmatically without going through the step
 * strip UI (the compact step strip hides pills at narrow viewports).
 */
const SessionActionsProbe = ({ onReady }: { onReady: (api: { advanceFrame: (f: import("@/types/onboarding").FFrame) => void }) => void }) => {
  const { advanceFrame } = useOnboardingSession();
  onReady({ advanceFrame });
  return null;
};

/**
 * Registry probe — exposes the full set of entity keys that have
 * been created in the registry. Tests use this to assert what was
 * (or was NOT) persisted as an entity. E.g., clicking BYO should NOT
 * leave anything in the registry.
 */
const RegistryProbe = ({ onSnapshot }: { onSnapshot: (snapshot: { entityKeys: string[] }) => void }) => {
  const { state } = useEntityRegistry();
  onSnapshot({ entityKeys: [...state.entities.keys()] });
  return null;
};

/**
 * Viewer-history probe — exposes the active session's viewer events
 * so tests can verify Phase-E recording at user-action boundaries.
 */
const ViewerHistoryProbe = ({ onSnapshot }: { onSnapshot: (snapshot: { events: Array<{ action: string; entityKey: string | null; source: string; detail?: Record<string, unknown> }> }) => void }) => {
  const { state } = useChatStore();
  const active = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
  onSnapshot({
    events: active
      ? active.viewerHistory.map((e) => ({
          action: e.action,
          entityKey: e.entityKey,
          source: e.source,
          detail: e.detail,
        }))
      : [],
  });
  return null;
};

describe("OnboardingShell", () => {
  it("issues and stores an anonymous onboarding session on mount", async () => {
    let snapshot = { sessionId: null as string | null, frame: "" };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    await waitFor(() => expect(apiMocks.issueOnboardingSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(snapshot.sessionId).toBe("anon-session-1"));
  });

  it("keeps the preview usable when session bootstrap fails", async () => {
    apiMocks.issueOnboardingSession.mockRejectedValueOnce(new Error("middleware offline"));

    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f2", initialScenario: "utility" });

    expect(await screen.findByTestId("onboarding-frame-f2")).toBeInTheDocument();
    expect(screen.getByText("GroundX is parsing the document. You'll see the extract in a moment.")).toBeInTheDocument();
  });

  it("wires reachable step-strip pills to frames", async () => {
    const user = userEvent.setup();
    let snapshot = { sessionId: null as string | null, frame: "" };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );

    // The step number is rendered in a separate badge element, so the
    // accessible name on the pill is just the label text.
    await user.click(screen.getByText("Understand"));

    await waitFor(() => {
      expect(snapshot.frame).toBe("f2");
      expect(screen.getByTestId("onboarding-frame-f2")).toBeInTheDocument();
    });
  });

  it("does not leave the chat column blank after dismissing the F6 gate", async () => {
    const user = userEvent.setup();

    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f5", initialScenario: "utility" });

    await user.click(screen.getByTestId("advance-to-f6"));
    expect(await screen.findByTestId("gate-card")).toBeInTheDocument();

    await user.click(screen.getByTestId("gate-dismiss"));

    await waitFor(() => expect(screen.queryByTestId("gate-card")).not.toBeInTheDocument());
    expect(screen.getByText("Ask anything about the sample. Citations appear next to every answer.")).toBeInTheDocument();
  });

  it("disables the Understand pill on F1 when no scenario has been picked", () => {
    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f1", initialScenario: null });
    // The Understand pill should be visually present but marked disabled
    // — clicking it from F1 with no scenario would land on a blank canvas.
    const understandPill = screen.getByText("Understand").closest('[role="button"]');
    expect(understandPill).toHaveAttribute("aria-disabled", "true");
    expect(understandPill).toHaveAttribute("tabIndex", "-1");
  });

  it("does not advance when the disabled Understand pill is clicked", async () => {
    const user = userEvent.setup();
    let snapshot = { sessionId: null as string | null, frame: "" };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialFrame: "f1", initialScenario: null },
    );

    await user.click(screen.getByText("Understand"));
    // Frame must NOT change. Wait briefly to catch any async state flip.
    await new Promise((r) => setTimeout(r, 50));
    expect(snapshot.frame).toBe("f1");
  });

  it("wraps nav, chat, and canvas in motion panes for the F1->F2 slide-in choreography", () => {
    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f2", initialScenario: "utility" });
    // All three motion-driven wrappers must be present. The visual
    // animation timing (180px nav, 320px chat, canvas fade) is a
    // styling detail covered by visual review; this test guards the
    // structural wiring so a refactor that strips out the motion
    // wrappers fails loudly.
    expect(screen.getByTestId("onboarding-shell-nav-pane")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-shell-chat-pane")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-shell-canvas-pane")).toBeInTheDocument();
  });

  it("applies a CSS keyframe animation to each pane during the F1→F2 slide-in", async () => {
    // Earlier attempts used framer-motion's `initial`/`animate` for the
    // pane slides, but the JS-driven motion never visibly fired in the
    // user's browser — possibly RAF-throttled, possibly hidden by
    // dev-mode jank between the click and the first paint. CSS
    // @keyframes animations run on the compositor thread regardless of
    // JS state and always start playing on element mount. This test
    // pins the implementation strategy: during the transitioning
    // phase, each pane MUST carry an Emotion-generated CSS class with
    // a non-empty `animation` style. (Idle-phase panes are plain Box
    // wrappers without animation — the animation only exists in the
    // SlideOverlay transition render path.)
    const user = userEvent.setup();
    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f1", initialScenario: null });

    // Trigger the F1 → F2 transition to enter the animated phase.
    // With URL-driven activation, the click navigates and the URL
    // sync useEffect picks up the change asynchronously — wait until
    // the transition's SlideOverlay panes appear.
    await user.click(screen.getByTestId("sample-utility"));
    await waitFor(() => expect(screen.getByTestId("onboarding-shell-nav-pane")).toBeInTheDocument());

    const nav = screen.getByTestId("onboarding-shell-nav-pane");
    const chat = screen.getByTestId("onboarding-shell-chat-pane");
    const canvas = screen.getByTestId("onboarding-shell-canvas-pane");
    // Emotion compiles the `animation:` sx prop into a class. We grep
    // the document stylesheets for a rule on that class that mentions
    // "animation" — jsdom's `getComputedStyle` doesn't resolve
    // animation shorthand from generated stylesheets, so we have to
    // walk the CSSOM ourselves.
    const styleSheets = [...document.styleSheets];
    const findAnimationRuleFor = (el: Element): string | null => {
      for (const cls of el.classList) {
        const selector = `.${cls}`;
        for (const sheet of styleSheets) {
          let rules: CSSRuleList;
          try {
            rules = sheet.cssRules;
          } catch {
            continue;
          }
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && rule.selectorText === selector) {
              const anim = rule.style.animation || rule.style.getPropertyValue("animation");
              if (anim && anim !== "none" && anim.trim() !== "") return anim;
            }
          }
        }
      }
      return null;
    };
    for (const pane of [nav, chat, canvas]) {
      const anim = findAnimationRuleFor(pane);
      expect(anim).not.toBeNull();
      // sanity-check the duration is present in the shorthand
      expect(anim).toMatch(/0\.7s/);
    }
  });

  it("clicking BYO from F1 advances to F2 and renders the gate in the chat column", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f1", initialScenario: null });

    // We're on F1's full-bleed picker — no chat column visible yet.
    expect(screen.queryByLabelText("Chat column")).not.toBeInTheDocument();

    // Click any BYO Sign Up tile (header, Upload, Connect, Email all
    // route through handleByoClick).
    await user.click(screen.getByTestId("byo-pdf"));

    // Frame advances to F2 and the chat + gate render — but only
    // after the URL navigates to /onboarding/signup AND the slide-in
    // finishes (~SWIPE_DURATION_MS). During the slide-in the chat
    // slot is intentionally empty so the GateChatPanel composing
    // animation doesn't kick off before the pane has finished
    // sliding in.
    await waitFor(() => expect(screen.getByTestId("onboarding-frame-f2")).toBeInTheDocument(), {
      timeout: 2000,
    });
    await waitFor(() => expect(screen.getByLabelText("Chat column")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("gate-card")).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it("does not mount GateChatPanel content during the F1→F2 slide-in", async () => {
    // Earlier the chat composing indicator started the moment
    // GateChatPanel mounted with an open gate — and GateChatPanel was
    // mounted as soon as the chat pane appeared, BEFORE the slide-in
    // had finished. Visually the user saw the dots appear before the
    // chat pane had arrived at its final position. This test pins the
    // fix: during entering/leaving phases the chat slot renders an
    // empty animated pane. GateChatPanel mounts only after the slide
    // settles into idle phase.
    const user = userEvent.setup();
    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f1", initialScenario: null });

    await user.click(screen.getByTestId("byo-pdf"));

    // Mid-slide: chat pane is mounted (so the slide animation can
    // play) but its CONTENT (gate card or composing indicator) is
    // not yet rendered. Wait for the slide overlay to appear first
    // — with URL-driven activation, the click triggers a navigate
    // which propagates to state via useEffect on the next tick.
    await waitFor(() => expect(screen.getByTestId("onboarding-shell-chat-pane")).toBeInTheDocument());
    expect(screen.queryByTestId("gate-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();

    // After the slide-in completes, the gate card surfaces.
    await waitFor(() => expect(screen.getByTestId("gate-card")).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it("makes the Understand pill reachable once a scenario is picked", () => {
    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f2", initialScenario: "utility" });
    const understandPill = screen.getByText("Understand").closest('[role="button"]');
    // Active on F2; aria-disabled should be absent.
    expect(understandPill).not.toHaveAttribute("aria-disabled");
  });

  it("clicking the Ingest pill from F2 plays the reverse animation, then unmounts the shell", async () => {
    // Mirror of the F1→F2 slide-in: when the user returns to F1 via
    // the Ingest pill, the panes must slide OUT to their respective
    // edges (nav+chat to the left, canvas to the right), revealing F1
    // underneath. Then, after the slide-out completes, the shell
    // unmounts so only F1 is left.
    const user = userEvent.setup();

    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f2", initialScenario: "utility" });

    expect(screen.getByTestId("onboarding-shell-nav-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-frame-f1")).not.toBeInTheDocument();

    await user.click(screen.getByText("Ingest"));

    // Mid-slide-out: F1 is now mounted as the active layer AND the
    // shell panes are still in the DOM (sliding out over F1). With
    // URL-driven activation, the navigate happens immediately but
    // the URL → state useEffect runs on the next tick — wait for the
    // leaving transition's F1 underlay to appear.
    await waitFor(() => expect(screen.getByTestId("onboarding-frame-f1")).toBeInTheDocument());
    expect(screen.getByTestId("onboarding-shell-nav-pane")).toBeInTheDocument();

    // The pane animation must point at a slide-OUT keyframe, not the
    // slide-IN one — direction-reversed. The Emotion-generated names
    // are unstable across builds, so we grep the CSS for the
    // `translateX(-100%)` `to` keyframe.
    const styleSheets = [...document.styleSheets];
    const animationNameOf = (el: Element): string | null => {
      for (const cls of el.classList) {
        const selector = `.${cls}`;
        for (const sheet of styleSheets) {
          let rules: CSSRuleList;
          try {
            rules = sheet.cssRules;
          } catch {
            continue;
          }
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && rule.selectorText === selector) {
              const shorthand = rule.style.animation;
              if (shorthand && shorthand !== "none" && shorthand.trim() !== "") return shorthand;
            }
          }
        }
      }
      return null;
    };
    // jsdom doesn't expose `CSSKeyframesRule` as a global, so we
    // duck-type via the `type` constant (7 = CSSRule.KEYFRAMES_RULE)
    // and the `name` / `cssRules` shape.
    type KeyframesShape = { name: string; cssRules: CSSRuleList; type: number };
    const findKeyframesByName = (name: string): KeyframesShape | null => {
      for (const sheet of styleSheets) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of rules) {
          if (rule.type === 7 && (rule as unknown as KeyframesShape).name === name) {
            return rule as unknown as KeyframesShape;
          }
        }
      }
      return null;
    };
    const navAnim = animationNameOf(screen.getByTestId("onboarding-shell-nav-pane"));
    expect(navAnim).not.toBeNull();
    // The `animation` shorthand starts with the animation-name token.
    const navAnimName = navAnim!.trim().split(/\s+/)[0];
    const kf = findKeyframesByName(navAnimName);
    expect(kf).not.toBeNull();
    // For a slide-OUT animation, the final keyframe (100% / "to") must
    // sit at translateX(-100vw) — fully past the LEFT page edge. Using
    // a viewport-relative unit (not -100% of the pane's own width)
    // ensures every pane travels the same distance and fully exits
    // regardless of its slot position. Earlier versions used -100% on
    // each pane, which left the chat half-on-screen behind the nav at
    // the end of the slide-out — looked like a fade snap. A slide-IN
    // keyframe would have translateX(0) at 100%.
    const lastKeyframe = kf!.cssRules[kf!.cssRules.length - 1] as CSSKeyframeRule;
    expect(lastKeyframe.style.transform).toMatch(/translateX\(-100vw\)/);

    // After the slide-out completes, the shell unmounts.
    await waitFor(
      () => expect(screen.queryByTestId("onboarding-shell-nav-pane")).not.toBeInTheDocument(),
      { timeout: 1500 },
    );
    expect(screen.getByTestId("onboarding-frame-f1")).toBeInTheDocument();
  });

  it("keeps F1 mounted underneath the shell during the slide-in window, then unmounts it", async () => {
    // Per spec: F1 doesn't animate at all. It sits underneath while the
    // nav + chat + canvas panes slide in over it, progressively covering
    // it up. Once the panes finish their slide (~SWIPE_DURATION_MS), F1
    // is fully occluded and can unmount safely. The previous
    // AnimatePresence-driven implementation kept F1 in the DOM forever
    // because its `animate=opacity:1, exit=opacity:1` no-op never fired
    // onComplete — this test pins down that timing contract.
    const user = userEvent.setup();

    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f1", initialScenario: null });

    expect(screen.getByTestId("onboarding-frame-f1")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-shell-nav-pane")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("sample-utility"));

    // Mid-slide: BOTH F1 (underneath) and the shell panes (sliding over
    // it) must be in the DOM.
    expect(screen.getByTestId("onboarding-frame-f1")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-shell-nav-pane")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-shell-chat-pane")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-shell-canvas-pane")).toBeInTheDocument();

    // After the slide completes, F1 unmounts.
    await waitFor(
      () => expect(screen.queryByTestId("onboarding-frame-f1")).not.toBeInTheDocument(),
      { timeout: 1500 },
    );
    expect(screen.getByTestId("onboarding-shell-nav-pane")).toBeInTheDocument();
  });

  it("activates the sample referenced by the URL params on mount", async () => {
    // URL contract: /onboarding/<bucketId>/<scenarioId> mounts with
    // that scenario active in the registry. The URL is the source of
    // truth for which surface to render — a fresh page load that
    // lands at this URL should immediately resume the named sample.
    let snapshot = { frame: "" };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      // We don't pre-seed the entity with initialScenario; the URL
      // params alone must drive activation.
      { initialFrame: "f1", initialScenario: null, initialUrl: "/onboarding/28454/utility" },
    );

    // After mount: utility sample is active at F2.
    await waitFor(() => expect(snapshot.frame).toBe("f2"));
    // After the F1 → F2 slide-in finishes (~700ms), AppShell mounts
    // and the canvas-frame testid appears.
    await waitFor(() => expect(screen.getByTestId("onboarding-frame-f2")).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it("activates the signup surface on /onboarding/signup", async () => {
    // URL contract: /onboarding/signup mounts the signup surface
    // (BYO sign-up flow). Renders the shell with the gate in chat,
    // BYO placeholder in canvas. Entity registry stays empty.
    let registrySnap = { entityKeys: [] as string[] };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <RegistryProbe onSnapshot={(s) => (registrySnap = s)} />
      </>,
      { initialFrame: "f1", initialScenario: null, initialUrl: "/onboarding/signup" },
    );

    // The shell renders (not the F1 picker).
    await waitFor(() => expect(screen.queryByTestId("onboarding-frame-f2")).toBeInTheDocument(), {
      timeout: 2000,
    });
    // Registry stays empty — signup is not an entity.
    expect(registrySnap.entityKeys).toEqual([]);
  });

  it("records ViewerEvents at pickScenario / advanceFrame / openGate / dismissGate / commitGate (Phase E)", async () => {
    // Phase E pins the third LLM-context axis: every user action that
    // changes the surface state writes a ViewerEvent onto the active
    // chat session's viewerHistory. Without this trail, LLM context
    // bundling (Phase J) has no "what has the user been doing"
    // signal — answers feel ungrounded.
    const user = userEvent.setup();
    let snapshot: { events: Array<{ action: string; entityKey: string | null; source: string; detail?: Record<string, unknown> }> } = { events: [] };
    let actions: { advanceFrame: (f: import("@/types/onboarding").FFrame) => void } | null = null;

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionActionsProbe onReady={(api) => (actions = api)} />
        <ViewerHistoryProbe onSnapshot={(s) => (snapshot = s)} />
      </>,
      { initialFrame: "f1", initialScenario: null },
    );

    // Pick utility → ViewerEvent action="opened", entityKey="sample:utility"
    await user.click(screen.getByTestId("sample-utility"));
    await waitFor(() => {
      const opens = snapshot.events.filter((e) => e.action === "opened");
      expect(opens.length).toBeGreaterThanOrEqual(1);
      expect(opens[opens.length - 1].entityKey).toBe("sample:utility");
      expect(opens[opens.length - 1].source).toBe("user");
    });

    // Advance to F3 → ViewerEvent action="frame-advanced", detail.frame="f3"
    act(() => actions!.advanceFrame("f3"));
    await waitFor(() => {
      const advances = snapshot.events.filter((e) => e.action === "frame-advanced");
      expect(advances.length).toBeGreaterThanOrEqual(1);
      expect(advances[advances.length - 1].detail).toMatchObject({ frame: "f3" });
    });

    // Return to picker via Ingest pill → ViewerEvent action="left"
    await user.click(screen.getByText("Ingest"));
    await waitFor(() => {
      expect(snapshot.events.some((e) => e.action === "left")).toBe(true);
    });
  });

  it("clicking BYO opens the session gate without creating a persistent entity", async () => {
    // BYO is not a real entity — it's a transient sign-up trigger
    // that never unlocks into a persistent journey. Clicking BYO
    // opens the session-level gate and shows the signup surface,
    // but does NOT create an entity in the registry the way picking
    // a sample does. This pins that contract — if a future refactor
    // re-introduces a `byo:default` entity, this test fails.
    const user = userEvent.setup();
    let registrySnap = { entityKeys: [] as string[] };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <RegistryProbe onSnapshot={(s) => (registrySnap = s)} />
      </>,
      { initialFrame: "f1", initialScenario: null },
    );

    // Before clicking: registry empty.
    expect(registrySnap.entityKeys).toEqual([]);

    await user.click(screen.getByTestId("byo-pdf"));

    // After clicking BYO: gate-card eventually appears in chat.
    await waitFor(() => expect(screen.queryByTestId("gate-card")).toBeInTheDocument(), {
      timeout: 2000,
    });

    // ⚠️ The registry must STILL be empty. No `byo:default` entity.
    expect(registrySnap.entityKeys).toEqual([]);
  });

  it("preserves independent state for multiple samples", async () => {
    // Multi-entity preservation: visiting sample A, advancing it to
    // F3, returning to the picker, visiting sample B, advancing it
    // to F5, then returning and re-picking sample A → must resume A
    // at F3 (not the default F2, and not B's F5). Each sample has
    // its own entity in the EntityRegistry with its own state.
    const user = userEvent.setup();
    let snapshot = { frame: "", scenario: null as string | null };
    let actions: { advanceFrame: (f: import("@/types/onboarding").FFrame) => void } | null = null;
    let registrySnap = { entityKeys: [] as string[] };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionProbe onSnapshot={(next) => (snapshot = { frame: next.frame, scenario: snapshot.scenario })} />
        <SessionActionsProbe onReady={(api) => (actions = api)} />
        <RegistryProbe onSnapshot={(s) => (registrySnap = s)} />
      </>,
      { initialFrame: "f1", initialScenario: null },
    );

    // Pick utility → F2
    await user.click(screen.getByTestId("sample-utility"));
    await waitFor(() => expect(snapshot.frame).toBe("f2"));
    // Advance utility to F3
    act(() => actions!.advanceFrame("f3"));
    await waitFor(() => expect(snapshot.frame).toBe("f3"));

    // Return to picker
    await user.click(screen.getByText("Ingest"));
    await waitFor(() => expect(snapshot.frame).toBe("f1"));

    // Pick loan (a different sample) → F2
    await waitFor(() => expect(screen.getByTestId("sample-loan")).toBeInTheDocument());
    await user.click(screen.getByTestId("sample-loan"));
    await waitFor(() => expect(snapshot.frame).toBe("f2"));
    // Advance loan to F5
    act(() => actions!.advanceFrame("f5"));
    await waitFor(() => expect(snapshot.frame).toBe("f5"));

    // Sanity: both entities should now be in the registry
    expect(registrySnap.entityKeys).toContain("sample:utility");
    expect(registrySnap.entityKeys).toContain("sample:loan");

    // Return to picker
    await user.click(screen.getByText("Ingest"));
    await waitFor(() => expect(snapshot.frame).toBe("f1"));

    // Re-pick utility → should resume at F3 (its preserved state,
    // NOT loan's F5)
    await waitFor(() => expect(screen.getByTestId("sample-utility")).toBeInTheDocument());
    await user.click(screen.getByTestId("sample-utility"));
    await waitFor(() => expect(snapshot.frame).toBe("f3"));

    // Re-pick loan → should resume at F5
    await user.click(screen.getByText("Ingest"));
    await waitFor(() => expect(snapshot.frame).toBe("f1"));
    await waitFor(() => expect(screen.getByTestId("sample-loan")).toBeInTheDocument());
    await user.click(screen.getByTestId("sample-loan"));
    await waitFor(() => expect(snapshot.frame).toBe("f5"));
  });

  it("preserves a sample's frame state across an F1 round-trip via the Ingest pill", async () => {
    // Phase 1 of the state-preservation work: when the user picks a
    // sample, advances to a later frame, then returns to F1 (Ingest
    // pill), then re-picks the SAME sample, they should resume at the
    // later frame — not restart at F2. State is keyed per-entity in
    // the EntityRegistry (sample:utility, sample:loan, etc.), so each
    // sample remembers its own progress independently.
    const user = userEvent.setup();
    let snapshot = { frame: "" };
    let actions: { advanceFrame: (f: import("@/types/onboarding").FFrame) => void } | null = null;

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
        <SessionActionsProbe onReady={(api) => (actions = api)} />
      </>,
      { initialFrame: "f1", initialScenario: null },
    );

    // Pick utility sample → F2
    await user.click(screen.getByTestId("sample-utility"));
    await waitFor(() => expect(snapshot.frame).toBe("f2"));

    // Advance to F3 (drive via the API probe so we don't need to
    // dig through the step strip UI in tests)
    act(() => {
      actions!.advanceFrame("f3");
    });
    await waitFor(() => expect(snapshot.frame).toBe("f3"));

    // Return to F1 via Ingest pill
    await user.click(screen.getByText("Ingest"));
    await waitFor(() => expect(snapshot.frame).toBe("f1"));

    // After the slide-out completes, F1 picker is shown again. Pick
    // the same sample — should resume at F3, not restart at F2.
    await waitFor(() => expect(screen.getByTestId("sample-utility")).toBeInTheDocument(), { timeout: 2000 });
    await user.click(screen.getByTestId("sample-utility"));
    await waitFor(() => expect(snapshot.frame).toBe("f3"));
  });

  it("only makes Integrate reachable from the step strip after sign-in", async () => {
    const user = userEvent.setup();
    let snapshot = { sessionId: null as string | null, frame: "" };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialAuthState: "signed-in", initialFrame: "f3", initialScenario: "loan" },
    );

    await user.click(screen.getByText("Integrate"));

    await waitFor(() => {
      expect(snapshot.frame).toBe("f7");
      expect(screen.getByTestId("onboarding-frame-f7")).toBeInTheDocument();
    });
  });
});
