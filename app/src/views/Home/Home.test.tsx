import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Home } from "./Home";

describe("Home", () => {
  it("renders the starter dashboard sections and education", async () => {
    const user = userEvent.setup();

    render(<Home />);

    expect(screen.getByRole("heading", { name: "Studio Workspace" })).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Automations")).toBeInTheDocument();
    expect(screen.getByText("Build the first customer workflow here")).toBeInTheDocument();
    expect(screen.getByText("Customer onboarding guide indexed")).toBeInTheDocument();

    const educationTrigger = screen.getByRole("button", { name: "About the workspace overview" });
    expect(educationTrigger).toBeInTheDocument();

    await user.hover(educationTrigger);

    expect(
      await screen.findByText(
        "This protected starter view is the first place to shape the product workflow, dashboard metrics, and GroundX-powered actions.",
      ),
    ).toBeInTheDocument();
  });
});
