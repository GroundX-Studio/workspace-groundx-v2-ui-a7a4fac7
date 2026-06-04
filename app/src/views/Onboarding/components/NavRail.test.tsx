import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NavRail } from "./NavRail";
import { FlowProvider } from "../flow/FlowContext";

const renderNavRail = () =>
  render(
    <FlowProvider>
      <NavRail />
    </FlowProvider>,
  );

describe("NavRail", () => {
  it("renders content (top) and account (bottom) sections when expanded", () => {
    renderNavRail();

    expect(screen.getByText("GroundX")).toBeInTheDocument();
    expect(screen.getByText("Workspaces")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Book a call →")).toBeInTheDocument();
  });

  it("collapses to an icon-only rail and can be re-expanded", () => {
    renderNavRail();

    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(screen.queryByText("GroundX")).not.toBeInTheDocument();

    const expand = screen.getByRole("button", { name: "Expand navigation" });
    fireEvent.click(expand);
    expect(screen.getByText("GroundX")).toBeInTheDocument();
  });
});
