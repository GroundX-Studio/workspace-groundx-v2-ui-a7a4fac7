import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CommonCloseIcon from "./CommonCloseIcon";

describe("CommonCloseIcon", () => {
  it("renders a labelled close button by default", () => {
    render(<CommonCloseIcon />);

    expect(screen.getByRole("button", { name: "close" })).toBeInTheDocument();
  });

  it("supports a custom aria label and click handler", () => {
    const onClick = vi.fn();

    render(<CommonCloseIcon aria-label="dismiss dialog" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "dismiss dialog" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
