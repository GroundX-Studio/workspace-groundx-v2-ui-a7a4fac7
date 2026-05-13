import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { APP_LOGOS } from "@/appConfig";

import { AuthLogoLockup } from "./AuthLogoLockup";

describe("AuthLogoLockup", () => {
  it("renders the default scaffold logos from appConfig", () => {
    render(<AuthLogoLockup />);

    expect(screen.getByAltText(APP_LOGOS.auth.alt)).toHaveAttribute("src", APP_LOGOS.auth.src);
  });
});
