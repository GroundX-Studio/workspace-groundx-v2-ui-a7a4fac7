import { fireEvent, render, screen } from "@testing-library/react";
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
        // A passthrough sentinel (lands on the DOM <input>) + the label-shrink
        // animation handler LoginForm relies on — both must survive the merge.
        InputProps={{ onAnimationStart, inputProps: { "data-sentinel": "x" } }}
        noTool="test"
      />,
    );
    // The toggle adornment is present...
    expect(screen.getByRole("button", { name: "toggle password visibility" })).toBeInTheDocument();
    // ...AND the caller's InputProps survive the `{...InputProps}` spread:
    // (1) the passthrough sentinel reaches the rendered <input> (proves the
    //     spread is load-bearing — deleting it drops `inputProps`).
    const input = document.querySelector("#pw") as HTMLInputElement;
    expect(input).toHaveAttribute("data-sentinel", "x");
    // (2) the caller's onAnimationStart handler is wired — fire it directly
    //     (jsdom won't trigger CSS animations) and assert the spy ran. MUI
    //     spreads InputProps onto the InputBase root, so dispatch there.
    const inputRoot = input.closest(".MuiInputBase-root") as HTMLElement;
    fireEvent.animationStart(inputRoot);
    expect(onAnimationStart).toHaveBeenCalled();
  });

  it("lands the tool-binding on the rendered field (data-no-tool)", () => {
    render(<PasswordField id="pw" name="pw" label="Password" noTool="pre-app auth (not agent-driven)" />);
    const root = document.querySelector('[data-no-tool="pre-app auth (not agent-driven)"]');
    expect(root).not.toBeNull();
  });
});
