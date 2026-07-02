import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "./CopyButton";

function setClipboard(value: unknown) {
  // navigator.clipboard is a getter-only prop in jsdom → redefine it. Set this
  // AFTER userEvent.setup() so it wins over user-event's own clipboard stub.
  Object.defineProperty(navigator, "clipboard", { value, configurable: true, writable: true });
}

/** Click and flush the async clipboard `.then(setCopied)` inside act(). */
async function clickCopy(user: ReturnType<typeof userEvent.setup>) {
  await act(async () => {
    await user.click(screen.getByRole("button", { name: /copy/i }));
    await Promise.resolve();
  });
}

afterEach(() => {
  setClipboard(undefined);
  vi.restoreAllMocks();
});

describe("CopyButton", () => {
  it("copies the text and confirms", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<CopyButton text="Hello world" />);
    await clickCopy(user);
    expect(writeText).toHaveBeenCalledWith("Hello world");
    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("strips trailing [N] citation markers bound to the preceding token", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<CopyButton text="The bill is $7,613.20.[1] It covers June.[3]" />);
    await clickCopy(user);
    expect(writeText).toHaveBeenCalledWith("The bill is $7,613.20. It covers June.");
  });

  it("preserves a bracketed digit that is part of the prose", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<CopyButton text="Pick option [1] from the menu" />);
    await clickCopy(user);
    expect(writeText).toHaveBeenCalledWith("Pick option [1] from the menu");
  });

  it("renders and no-ops without throwing when the clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    setClipboard(undefined);
    render(<CopyButton text="whatever" />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await user.click(btn); // must not throw
    expect(btn).toBeInTheDocument();
  });
});
