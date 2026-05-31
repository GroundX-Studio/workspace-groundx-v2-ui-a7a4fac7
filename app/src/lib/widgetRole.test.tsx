/**
 * `useWidgetRole` derives a `WidgetRole` from `AppModeContext.authState`.
 * `"signed-in"` → `"member"`; otherwise (`"anonymous"`) → `"anonymous"`.
 * This is the single selector every widget mount site uses — pinning it here
 * prevents drift / hardcoded `role="member"` literals from creeping back in.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import { AppModeProvider } from "@/contexts/AppModeContext";

import { useWidgetRole } from "./widgetRole";

const wrap = (authState: "anonymous" | "signed-in") => {
  return ({ children }: { children: ReactNode }) => (
    <AppModeProvider initialAuthState={authState}>{children}</AppModeProvider>
  );
};

describe("useWidgetRole", () => {
  it("anonymous session → role='anonymous'", () => {
    const { result } = renderHook(() => useWidgetRole(), { wrapper: wrap("anonymous") });
    expect(result.current).toBe("anonymous");
  });
  it("signed-in session → role='member'", () => {
    const { result } = renderHook(() => useWidgetRole(), { wrapper: wrap("signed-in") });
    expect(result.current).toBe("member");
  });
});
