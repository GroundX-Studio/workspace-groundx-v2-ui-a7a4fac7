import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Health } from "./Health";

describe("Health", () => {
  it("renders an intentionally minimal OK response", () => {
    render(<Health />);

    expect(screen.getByText("OK")).toBeInTheDocument();
  });
});
