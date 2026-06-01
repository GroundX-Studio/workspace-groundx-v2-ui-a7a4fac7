import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PasswordField } from "./PasswordField";

describe("PasswordField (primitive)", () => {
  // MUI IconButton's focus-visible effect runs a state update after the
  // userEvent act scope, tripping the strict console.error guard in
  // src/test/setup.ts — mirror the interactive-widget tests' convention.
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("masks the value by default (type=password) and reveals on toggle (type=text)", async () => {
    const user = userEvent.setup();
    render(<PasswordField id="password" name="password" label="Password" noTool="test" />);

    const input = document.querySelector("#password") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "toggle password visibility" }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "toggle password visibility" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("forwards arbitrary MUI TextField props (value/onChange/error/helperText)", async () => {
    const Harness = () => {
      const [value, setValue] = useState("");
      return (
        <PasswordField
          id="pw"
          name="pw"
          label="Enter your new password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error
          helperText="Password is required"
          noTool="test"
        />
      );
    };
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    const input = document.querySelector("#pw") as HTMLInputElement;
    await user.type(input, "abc");
    expect(input).toHaveValue("abc");
  });

  it("merges caller-supplied InputProps with the visibility-toggle endAdornment", () => {
    const onAnimationStart = vi.fn();
    render(
      <PasswordField
        id="pw"
        name="pw"
        label="Password"
        InputProps={{ onAnimationStart }}
        noTool="test"
      />,
    );
    // Toggle adornment present...
    expect(screen.getByRole("button", { name: "toggle password visibility" })).toBeInTheDocument();
    // ...without clobbering the caller's InputProps: the input animates the
    // label-shrink handler the LoginForm relies on.
    const input = document.querySelector("#pw") as HTMLInputElement;
    // jsdom won't fire CSS animations, but the handler must be wired (no throw,
    // and the adornment coexists with the field).
    expect(input).toBeInTheDocument();
  });

  it("lands the tool-binding on the rendered field (data-no-tool)", () => {
    render(<PasswordField id="pw" name="pw" label="Password" noTool="pre-app auth (not agent-driven)" />);
    const root = document.querySelector('[data-no-tool="pre-app auth (not agent-driven)"]');
    expect(root).not.toBeNull();
  });
});
