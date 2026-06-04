import { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { onEnterOrSpace } from "./onEnterOrSpace";

const keyEvent = (key: string) => {
  const preventDefault = vi.fn();
  return { event: { key, preventDefault } as unknown as KeyboardEvent, preventDefault };
};

describe("onEnterOrSpace", () => {
  it("invokes the handler and prevents default on Enter and Space", () => {
    for (const key of ["Enter", " "]) {
      const handler = vi.fn();
      const { event, preventDefault } = keyEvent(key);

      onEnterOrSpace(handler)(event);

      expect(handler).toHaveBeenCalledOnce();
      expect(preventDefault).toHaveBeenCalledOnce();
    }
  });

  it("ignores other keys", () => {
    const handler = vi.fn();
    const { event, preventDefault } = keyEvent("a");

    onEnterOrSpace(handler)(event);

    expect(handler).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
