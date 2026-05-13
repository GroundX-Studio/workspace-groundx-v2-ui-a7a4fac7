import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithAppProviders } from "@/test/renderWithAppProviders";

import { Banned } from "./Banned";

describe("Banned", () => {
  it("renders a clear unavailable-account message", () => {
    renderWithAppProviders(<Banned />);

    expect(screen.getByRole("heading", { name: /this account is not available/i })).toBeInTheDocument();
  });
});
