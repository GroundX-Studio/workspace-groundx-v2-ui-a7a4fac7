import Button from "@mui/material/Button";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import GxSectionHeader from "./GxSectionHeader";

describe("GxSectionHeader", () => {
  it("renders the section label as a heading", () => {
    render(<GxSectionHeader label="CONTENT" />);

    expect(screen.getByRole("heading", { name: "CONTENT" })).toBeInTheDocument();
  });

  it("renders an optional right-aligned action", () => {
    render(<GxSectionHeader label="CONTENT" action={<Button>New Bucket</Button>} />);

    expect(screen.getByRole("button", { name: "New Bucket" })).toBeInTheDocument();
  });

  it("renders an optional education slot beside the label", () => {
    render(
      <GxSectionHeader
        label="CONTENT"
        education={<button aria-label="About content">Info</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "CONTENT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "About content" })).toBeInTheDocument();
  });
});
