import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import GxCard from "./GxCard";

describe("GxCard", () => {
  it("renders children inside the canonical surface", () => {
    render(<GxCard>Usage summary</GxCard>);

    expect(screen.getByText("Usage summary")).toBeInTheDocument();
  });

  it("passes through Box props for semantic surfaces", () => {
    render(
      <GxCard component="section" aria-label="Metrics">
        42 documents
      </GxCard>,
    );

    expect(screen.getByRole("region", { name: "Metrics" })).toHaveTextContent("42 documents");
  });

  it("supports the compact no-padding variant", () => {
    render(
      <GxCard data-testid="card" noPadding radius="sm">
        Table wrapper
      </GxCard>,
    );

    expect(screen.getByTestId("card")).toHaveTextContent("Table wrapper");
  });
});
