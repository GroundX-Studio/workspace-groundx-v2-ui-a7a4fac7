import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ScenarioHero } from "@/types/scenarios";

import { SampleScenarioCard } from "./SampleScenarioCard";

const hero: ScenarioHero = {
  title: "Utility Bill",
  shortDesc: "a single billing statement with 8 meters and 56 charges",
  demonstrates: "messy layout → clean extraction",
  badges: ["E"],
  chapters: { extract: "live", interact: "live", report: "off" },
  docCount: "1 doc",
};

describe("SampleScenarioCard", () => {
  it("renders hero title, shortDesc, demonstrates line, and docCount", () => {
    render(<SampleScenarioCard id="utility" hero={hero} onClick={() => undefined} />);
    expect(screen.getByText("Utility Bill")).toBeInTheDocument();
    expect(screen.getByText(/single billing statement/)).toBeInTheDocument();
    expect(screen.getByText("messy layout → clean extraction")).toBeInTheDocument();
    expect(screen.getByText("1 doc")).toBeInTheDocument();
  });

  it("exposes a stable data-testid sourced from the id prop", () => {
    render(<SampleScenarioCard id="utility" hero={hero} onClick={() => undefined} />);
    expect(screen.getByTestId("sample-utility")).toBeInTheDocument();
  });

  it("renders an aria-label naming the scenario as a sample", () => {
    render(<SampleScenarioCard id="utility" hero={hero} onClick={() => undefined} />);
    expect(screen.getByLabelText("Open sample: Utility Bill")).toBeInTheDocument();
  });

  it("renders the ★ start here pill only when startHere is true", () => {
    const { rerender } = render(
      <SampleScenarioCard id="utility" hero={hero} onClick={() => undefined} />
    );
    expect(screen.queryByText(/start here/)).not.toBeInTheDocument();
    rerender(<SampleScenarioCard id="utility" hero={hero} startHere onClick={() => undefined} />);
    expect(screen.getByText(/star here|★ start here/i)).toBeInTheDocument();
  });

  it("renders one CapabilityBadge per E/I/R capability with live state from hero.chapters", () => {
    render(<SampleScenarioCard id="utility" hero={hero} onClick={() => undefined} />);
    const card = screen.getByTestId("sample-utility");
    // hero.chapters = { extract:'live', interact:'live', report:'off' }
    // CapabilityBadge tooltip text encodes live state.
    const extractBadge = within(card).getByTitle(/Extract · live/);
    const interactBadge = within(card).getByTitle(/Interact · live/);
    const reportBadge = within(card).getByTitle(/Report · not/);
    expect(extractBadge).toBeInTheDocument();
    expect(interactBadge).toBeInTheDocument();
    expect(reportBadge).toBeInTheDocument();
  });

  it("fires onClick when activated", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SampleScenarioCard id="utility" hero={hero} onClick={onClick} />);
    await user.click(screen.getByTestId("sample-utility"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("fires onClick on Enter key", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SampleScenarioCard id="utility" hero={hero} onClick={onClick} />);
    screen.getByTestId("sample-utility").focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("accepts a custom ariaLabel override", () => {
    render(
      <SampleScenarioCard id="utility" hero={hero} onClick={() => undefined} ariaLabel="custom label" />
    );
    expect(screen.getByLabelText("custom label")).toBeInTheDocument();
  });
});
