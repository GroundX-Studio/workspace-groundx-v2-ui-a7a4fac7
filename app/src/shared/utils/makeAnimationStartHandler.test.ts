import type { AnimationEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { makeAnimationStartHandler } from "./makeAnimationStartHandler";

const makeEvent = (animationName: string, matches: boolean) =>
  ({
    animationName,
    currentTarget: {
      matches: vi.fn().mockReturnValue(matches),
    },
  }) as unknown as AnimationEvent<HTMLInputElement>;

describe("makeAnimationStartHandler", () => {
  it("sets autofill state when MUI reports an autofilled input", () => {
    const setIsAutofilled = vi.fn();

    makeAnimationStartHandler(setIsAutofilled)(makeEvent("mui-auto-fill", true));

    expect(setIsAutofilled).toHaveBeenCalledWith(true);
  });

  it("clears autofill state when MUI reports autofill cancellation", () => {
    const setIsAutofilled = vi.fn();

    makeAnimationStartHandler(setIsAutofilled)(makeEvent("mui-auto-fill-cancel", false));

    expect(setIsAutofilled).toHaveBeenCalledWith(false);
  });

  it("ignores unrelated animation events", () => {
    const setIsAutofilled = vi.fn();

    makeAnimationStartHandler(setIsAutofilled)(makeEvent("unrelated-animation", true));

    expect(setIsAutofilled).not.toHaveBeenCalled();
  });
});
