import { describe, expect, it } from "vitest";

import { router } from "./router";
import { ROUTER_PATHS } from "./routerPaths";

describe("router config", () => {
  // WF-01 C4 (2026-05-28). The user reported that
  // `/onboarding/:bucketId/:scenarioId/interact` triggered the error
  // boundary because no route matched. Fix: a splat route under the
  // scenario URL so any extra path segment mounts OnboardingShell
  // instead of falling through to the unknown-route error.
  it("WF-01 C4: an onboarding sub-path under a scenario URL has a matching route", () => {
    const found = router.routes.some((r) =>
      r.path === `${ROUTER_PATHS.ONBOARDING}/:bucketId/:scenarioId/*`,
    );
    expect(found).toBe(true);
  });

  it("WF-01 C4: the canonical onboarding routes are all present", () => {
    const paths = router.routes.map((r) => r.path);
    expect(paths).toContain(ROUTER_PATHS.ONBOARDING);
    expect(paths).toContain(`${ROUTER_PATHS.ONBOARDING}/signup`);
    expect(paths).toContain(`${ROUTER_PATHS.ONBOARDING}/:bucketId/:scenarioId`);
  });

  // 2026-05-31-onboarding-experiences — the Workspaces / Projects nav entries
  // assign to these routes; they must resolve (not 404) so the authenticated
  // user lands in the scoped conversation.
  it("the /workspaces and /projects surfaces are registered routes", () => {
    const paths = router.routes.map((r) => r.path);
    expect(paths).toContain(ROUTER_PATHS.WORKSPACES);
    expect(paths).toContain(ROUTER_PATHS.PROJECTS);
    expect(ROUTER_PATHS.WORKSPACES).toBe("/workspaces");
    expect(ROUTER_PATHS.PROJECTS).toBe("/projects");
  });
});
