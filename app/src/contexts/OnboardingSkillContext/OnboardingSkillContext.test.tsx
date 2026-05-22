import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OnboardingSkillProvider, useOnboardingSkill } from "./OnboardingSkillContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <OnboardingSkillProvider>{children}</OnboardingSkillProvider>
);

describe("OnboardingSkillContext", () => {
  it("v1 stub returns loaded: false", () => {
    const { result } = renderHook(() => useOnboardingSkill(), { wrapper });
    expect(result.current.loaded).toBe(false);
  });

  it("works without provider (returns the default stub)", () => {
    const { result } = renderHook(() => useOnboardingSkill());
    expect(result.current.loaded).toBe(false);
  });
});
