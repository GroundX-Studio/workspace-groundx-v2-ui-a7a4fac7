import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageActions } from "./MessageActions";

const TIME_RE = /\d{1,2}:\d{2}\s?(AM|PM)/i;

describe("MessageActions", () => {
  it("assistant footer: copy + extra action (pin) + timestamp, tagged assistant", () => {
    render(
      <MessageActions
        role="assistant"
        text="The total is $7,613.20."
        timestamp={Date.now()}
        extraActions={<button data-testid="pin-stub">pin</button>}
      />,
    );
    const footer = screen.getByTestId("message-actions");
    expect(footer).toHaveAttribute("data-role", "assistant");
    expect(within(footer).getByTestId("copy-message-button")).toBeInTheDocument();
    expect(within(footer).getByTestId("pin-stub")).toBeInTheDocument();
    expect(footer.textContent).toMatch(TIME_RE);
  });

  it("user footer: copy + timestamp, no pin, tagged user", () => {
    render(<MessageActions role="user" text="what is the total?" timestamp={Date.now()} />);
    const footer = screen.getByTestId("message-actions");
    expect(footer).toHaveAttribute("data-role", "user");
    expect(within(footer).getByTestId("copy-message-button")).toBeInTheDocument();
    expect(within(footer).queryByTestId("pin-stub")).toBeNull();
    expect(footer.textContent).toMatch(TIME_RE);
  });

  it("copies the message text (via the embedded CopyButton)", () => {
    render(<MessageActions role="assistant" text="Answer text." timestamp={Date.now()} />);
    // The copy control is present and labelled — behavior is covered by CopyButton's own suite.
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });
});
