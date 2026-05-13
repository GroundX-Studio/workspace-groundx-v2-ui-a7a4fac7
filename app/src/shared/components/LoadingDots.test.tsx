import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LoadingDots from "./LoadingDots";

describe("LoadingDots", () => {
  it("renders an accessible loading status", () => {
    render(<LoadingDots />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("supports a custom accessible label", () => {
    render(<LoadingDots aria-label="Saving changes" />);

    expect(screen.getByRole("status", { name: "Saving changes" })).toBeInTheDocument();
  });
});
