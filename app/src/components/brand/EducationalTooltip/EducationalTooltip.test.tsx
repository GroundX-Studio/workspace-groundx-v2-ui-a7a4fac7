import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import EducationalTooltip from "./EducationalTooltip";

describe("EducationalTooltip", () => {
  it("renders an accessible info trigger", () => {
    render(<EducationalTooltip ariaLabel="About usage metrics" title="Shows current usage." />);

    expect(screen.getByRole("button", { name: "About usage metrics" })).toBeInTheDocument();
  });

  it("shows the educational explanation on hover", async () => {
    const user = userEvent.setup();

    render(
      <EducationalTooltip
        ariaLabel="About content buckets"
        title="Buckets group documents so users can search and chat within a focused collection."
      />,
    );

    await user.hover(screen.getByRole("button", { name: "About content buckets" }));

    expect(
      await screen.findByText("Buckets group documents so users can search and chat within a focused collection."),
    ).toBeInTheDocument();
  });
});
