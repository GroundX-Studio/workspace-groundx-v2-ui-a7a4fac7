import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithAppProviders } from "@/test/renderWithAppProviders";

import { AppStatus } from "./AppStatus";

describe("AppStatus", () => {
  it("renders the scaffold status placeholder as a named status page", () => {
    renderWithAppProviders(<AppStatus />);

    expect(screen.getByRole("heading", { name: /application status/i })).toBeInTheDocument();
    expect(screen.getByText(/replace this scaffold status page/i)).toBeInTheDocument();
  });
});
