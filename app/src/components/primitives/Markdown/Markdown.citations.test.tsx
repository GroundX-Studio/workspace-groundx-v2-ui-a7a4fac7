import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Citation } from "@groundx/shared";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { Markdown } from "./Markdown";

/**
 * inline-footnote-citations Phase B — the `citations` prop turns inline `[N]`
 * tokens into footnote `CiteChip`s via a remark plugin, while leaving everything
 * else (and the no-`citations` path) byte-identical.
 */
const cite = (over: Partial<Citation> = {}): Citation => ({ documentId: "doc-1", page: 1, ...over });

describe("Markdown citations (inline footnote markers)", () => {
  it("renders an inline [N] as a footnote CiteChip bound to the citation", () => {
    renderWithOnboardingProviders(
      <Markdown citations={[cite({ page: 3 })]}>{"The total is $7,613.20 [1]."}</Markdown>,
    );
    const marker = screen.getByTestId("cite-chip-1");
    expect(marker).toHaveAttribute("data-variant", "footnote");
    expect(marker).toHaveAttribute("data-citation-doc", "doc-1");
    expect(screen.getByTestId("markdown")).toHaveTextContent("The total is $7,613.20");
  });

  it("does NOT treat a real markdown link [1](url) as a marker", () => {
    renderWithOnboardingProviders(
      <Markdown citations={[cite()]}>{"see [1](https://example.com) end"}</Markdown>,
    );
    expect(screen.queryByTestId("cite-chip-1")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "1" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders markers inside formatted prose without breaking structure (bold value + list)", () => {
    renderWithOnboardingProviders(
      <Markdown citations={[cite()]}>{"- Total: **$7,613.20** [1]\n- Next item"}</Markdown>,
    );
    expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-variant", "footnote");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("is byte-identical (no markers) when no citations prop is given", () => {
    renderWithOnboardingProviders(<Markdown>{"plain [1] text"}</Markdown>);
    expect(screen.queryByTestId("cite-chip-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveTextContent("plain [1] text");
  });

  it("leaves an out-of-range [N] as literal text", () => {
    renderWithOnboardingProviders(<Markdown citations={[cite()]}>{"note [3] here"}</Markdown>);
    expect(screen.queryByTestId("cite-chip-3")).not.toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveTextContent("note [3] here");
  });
});
