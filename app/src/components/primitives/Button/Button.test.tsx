/**
 * Button (primitive) — text-bearing button. Covers the `primary` /
 * `secondary` variant semantics, the submitting affordance, and the
 * brand-default uppercase / mixed-case behavior. Icon-only buttons
 * are tested separately in `../IconButton/IconButton.test.tsx`.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

describe("Button primitive — variant semantics", () => {
  it("variant=\"primary\" renders a green-pill button with uppercase label by default", () => {
    render(<Button variant="primary">Save</Button>);
    const btn = screen.getByRole("button", { name: /save/i });
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute("data-button-variant")).toBe("primary");
    const styles = window.getComputedStyle(btn);
    expect(styles.textTransform).toBe("uppercase");
  });

  it("variant=\"secondary\" renders a text-style button with mixed-case label by default", () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole("button", { name: /cancel/i });
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute("data-button-variant")).toBe("secondary");
    const styles = window.getComputedStyle(btn);
    expect(styles.textTransform).toBe("none");
  });

  it("defaults to primary when no variant is supplied", () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole("button").getAttribute("data-button-variant")).toBe("primary");
  });

  it("defaults type to 'button' so use inside <form> doesn't accidentally submit", () => {
    render(<Button variant="primary">Save</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("primary with type=\"submit\" submits the surrounding form", () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button variant="primary" type="submit">
          Send
        </Button>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("Button primitive — submitting state (primary only)", () => {
  it("disables the button and renders a spinner when submitting", () => {
    render(
      <Button variant="primary" submitting>
        Saving
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /saving/i });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.querySelector("svg")).not.toBeNull();
  });

  it("does not render a spinner for secondary variant", () => {
    render(
      <Button variant="secondary" submitting>
        Cancel
      </Button>,
    );
    expect(screen.getByRole("button").querySelector("svg")).toBeNull();
  });
});

describe("Button primitive — onClick", () => {
  it("fires onClick for primary + secondary", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button variant="primary" onClick={onClick}>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    rerender(
      <Button variant="secondary" onClick={onClick}>
        Cancel
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Button primitive — invert + isUppercase overrides", () => {
  it("primary + invert ships as a contained MuiButton (visual flip is sx-driven)", () => {
    render(
      <Button variant="primary" invert>
        Confirm
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-button-variant")).toBe("primary");
    expect(btn.className).toMatch(/MuiButton-contained/);
  });

  it("primary + isUppercase=false renders sentence-case label", () => {
    render(
      <Button variant="primary" isUppercase={false}>
        Save
      </Button>,
    );
    const styles = window.getComputedStyle(screen.getByRole("button"));
    expect(styles.textTransform).toBe("none");
  });

  it("secondary + isUppercase=true UPPER-CASES the label", () => {
    render(
      <Button variant="secondary" isUppercase>
        Discard
      </Button>,
    );
    const styles = window.getComputedStyle(screen.getByRole("button"));
    expect(styles.textTransform).toBe("uppercase");
  });
});
