import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ByoTile } from "./ByoTile";

const baseProps = {
  testId: "byo-test",
  title: "Upload files",
  sub: "drag & drop",
  cta: "Sign up · upload your docs",
  ctaIcon: "↑",
};

describe("ByoTile", () => {
  it("renders title, sub, CTA label, and CTA icon", () => {
    render(<ByoTile {...baseProps} onClick={() => undefined} />);
    expect(screen.getByText("Upload files")).toBeInTheDocument();
    expect(screen.getByText("drag & drop")).toBeInTheDocument();
    expect(screen.getByText(/Sign up · upload your docs/)).toBeInTheDocument();
    expect(screen.getByText("↑")).toBeInTheDocument();
  });

  it("uses an aria-label that announces the gating ('sign-in required')", () => {
    render(<ByoTile {...baseProps} onClick={() => undefined} />);
    expect(screen.getByLabelText(/Upload files \(sign-in required\)/)).toBeInTheDocument();
  });

  it("fires onClick when the tile is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ByoTile {...baseProps} onClick={onClick} />);
    await user.click(screen.getByTestId("byo-test"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("fires onClick on Enter key", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ByoTile {...baseProps} onClick={onClick} />);
    screen.getByTestId("byo-test").focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("fires onClick on Space key", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ByoTile {...baseProps} onClick={onClick} />);
    screen.getByTestId("byo-test").focus();
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders the child preview slot", () => {
    render(
      <ByoTile {...baseProps} onClick={() => undefined}>
        <span data-testid="byo-preview-child">preview</span>
      </ByoTile>
    );
    expect(screen.getByTestId("byo-preview-child")).toBeInTheDocument();
  });

  it("places the child preview to the left of title when accent='dashed'", () => {
    render(
      <ByoTile {...baseProps} onClick={() => undefined} accent="dashed">
        <span data-testid="byo-preview-child">preview</span>
      </ByoTile>
    );
    // Both render — accent controls layout slot, verified by the document
    // order via DOM position.
    const child = screen.getByTestId("byo-preview-child");
    const title = screen.getByText("Upload files");
    expect(child.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
