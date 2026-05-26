import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UR-03 — MotionRoot wraps the app tree in a global `<MotionConfig>`
 * so reduced-motion users get a deterministic 80 ms crossfade
 * fallback instead of per-site `useReducedMotion()` branches.
 *
 * The repo-wide framerMotionMock makes `MotionConfig` an
 * unconditional passthrough — that's fine for production-style
 * tests but it hides the props we need to assert here. So this
 * file does a file-local `vi.mock` that captures the props the
 * MotionRoot hands to `MotionConfig`, plus a controllable
 * `useReducedMotion` so each test pins the OS preference.
 */

let lastMotionConfigProps:
  | { reducedMotion?: string; transition?: unknown }
  | null = null;

const useReducedMotionMock = vi.hoisted(() => vi.fn<[], boolean>());

vi.mock("framer-motion", () => ({
  MotionConfig: ({
    children,
    ...rest
  }: { children?: React.ReactNode } & Record<string, unknown>) => {
    lastMotionConfigProps = rest;
    return <>{children}</>;
  },
  useReducedMotion: useReducedMotionMock,
}));

import { MotionRoot } from "./MotionRoot";

describe("MotionRoot (UR-03)", () => {
  beforeEach(() => {
    lastMotionConfigProps = null;
    useReducedMotionMock.mockReset();
  });

  afterEach(() => {
    lastMotionConfigProps = null;
  });

  it("renders its children", () => {
    useReducedMotionMock.mockReturnValue(false);
    const { getByTestId } = render(
      <MotionRoot>
        <span data-testid="child">hi</span>
      </MotionRoot>,
    );
    expect(getByTestId("child")).toBeInTheDocument();
  });

  it("declares reducedMotion=\"user\" so framer-motion respects OS preference globally", () => {
    useReducedMotionMock.mockReturnValue(false);
    render(<MotionRoot>x</MotionRoot>);
    expect(lastMotionConfigProps?.reducedMotion).toBe("user");
  });

  it("swaps to an 80 ms crossfade default transition when OS prefers reduced motion", () => {
    useReducedMotionMock.mockReturnValue(true);
    render(<MotionRoot>x</MotionRoot>);
    expect(lastMotionConfigProps?.transition).toEqual({
      duration: 0.08,
      ease: "linear",
    });
  });

  it("omits the global default transition when OS does not prefer reduced motion (let per-site transitions drive)", () => {
    useReducedMotionMock.mockReturnValue(false);
    render(<MotionRoot>x</MotionRoot>);
    expect(lastMotionConfigProps?.transition).toBeUndefined();
  });
});
