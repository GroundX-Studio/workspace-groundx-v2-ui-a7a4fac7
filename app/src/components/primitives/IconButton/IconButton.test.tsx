/**
 * IconButton (primitive) — icon-only button sibling to Button.
 * Tests cover the default close-glyph + aria-label, custom icon
 * pass-through, click handling, and the data-button-variant marker.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IconButton } from "./IconButton";

describe("IconButton primitive — defaults", () => {
  it("defaults to a Close glyph and aria-label='close'", () => {
    render(<IconButton />);
    const btn = screen.getByRole("button", { name: /close/i });
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute("data-button-variant")).toBe("icon");
    // CloseIcon renders an svg
    expect(btn.querySelector("svg")).not.toBeNull();
  });

  it("default size is 'small' (MUI applies the corresponding sizeSmall class)", () => {
    render(<IconButton />);
    expect(screen.getByRole("button").className).toMatch(/MuiIconButton-sizeSmall/);
  });
});

describe("IconButton primitive — custom icon + label", () => {
  it("accepts a custom icon", () => {
    render(<IconButton icon={<span data-testid="custom-glyph">✕</span>} />);
    expect(screen.getByTestId("custom-glyph")).toBeInTheDocument();
  });

  it("respects an explicit aria-label", () => {
    render(<IconButton aria-label="dismiss notification" />);
    expect(screen.getByRole("button", { name: /dismiss notification/i })).toBeInTheDocument();
  });

  it("respects an explicit size", () => {
    render(<IconButton size="large" />);
    expect(screen.getByRole("button").className).toMatch(/MuiIconButton-sizeLarge/);
  });
});

describe("IconButton primitive — interaction", () => {
  it("fires onClick", () => {
    const onClick = vi.fn();
    render(<IconButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(<IconButton disabled onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
