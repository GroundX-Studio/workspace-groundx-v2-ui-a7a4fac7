import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Citation } from "@groundx/shared";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { SourceList } from "./SourceList";

const cite = (over: Partial<Citation> = {}): Citation => ({ documentId: "doc-1", page: 1, ...over });

describe("SourceList", () => {
  it("renders nothing for zero citations", () => {
    renderWithOnboardingProviders(<SourceList citations={[]} />);
    expect(screen.queryByTestId("source-list")).not.toBeInTheDocument();
  });

  it("a single citation renders inline (no expand toggle) and names the document", () => {
    renderWithOnboardingProviders(<SourceList citations={[cite({ page: 3, fileName: "bill.pdf" })]} />);
    expect(screen.queryByRole("button", { name: /sources/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("cite-chip-1")).toBeInTheDocument();
    expect(screen.getByTestId("source-list")).toHaveTextContent("bill.pdf");
  });

  it("collapses many citations to an 'N sources' toggle that expands to grouped, deduped rows", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(
      <SourceList
        citations={[
          cite({ documentId: "doc-1", page: 1, fileName: "bill.pdf" }),
          cite({ documentId: "doc-1", page: 1, fileName: "bill.pdf" }),
          cite({ documentId: "doc-1", page: 2, fileName: "bill.pdf" }),
        ]}
      />,
    );
    const toggle = await screen.findByRole("button", { name: /3 sources/i });
    expect(screen.queryByTestId("cite-chip-1")).not.toBeInTheDocument(); // collapsed
    await act(async () => {
      await user.click(toggle);
    });
    expect(screen.getByTestId("cite-chip-1")).toBeInTheDocument();
    expect(screen.getByTestId("cite-chip-3")).toBeInTheDocument();
    expect(screen.queryByTestId("cite-chip-2")).not.toBeInTheDocument(); // dup page deduped
    expect(screen.getByTestId("source-list")).toHaveTextContent("bill.pdf");
  });

  it("falls back to documentId for a group with no fileName", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(
      <SourceList citations={[cite({ documentId: "doc-xyz", page: 1 }), cite({ documentId: "doc-2", page: 2 })]} />,
    );
    const toggle = await screen.findByRole("button", { name: /sources/i });
    await act(async () => {
      await user.click(toggle);
    });
    expect(screen.getByTestId("source-list")).toHaveTextContent("doc-xyz");
  });
});
