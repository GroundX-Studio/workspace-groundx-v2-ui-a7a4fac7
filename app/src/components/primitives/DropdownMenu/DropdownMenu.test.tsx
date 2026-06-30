import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import DropdownMenu from "./DropdownMenu";

describe("DropdownMenu", () => {
  it("opens from the provided trigger", async () => {
    render(<DropdownMenu trigger={({ onClick }) => <button onClick={onClick}>Open</button>} items={[{ label: "Edit", onClick: vi.fn() }]} />);

    expect(screen.queryByText("Edit")).not.toBeInTheDocument();

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
    });

    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
  });

  it("fires an item action and closes the menu", async () => {
    const onEdit = vi.fn();
    render(<DropdownMenu trigger={({ onClick }) => <button onClick={onClick}>Open</button>} items={[{ label: "Edit", onClick: onEdit }]} />);

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
    });
    await act(async () => {
      await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    });

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("renders disabled informational items without firing them", async () => {
    const onDisabled = vi.fn();
    render(
      <DropdownMenu
        trigger={({ onClick }) => <button onClick={onClick}>Open</button>}
        items={[{ label: "pat@example.com", onClick: onDisabled, disabled: true }]}
      />,
    );

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
    });

    expect(screen.getByRole("menuitem", { name: "pat@example.com" })).toHaveAttribute("aria-disabled", "true");
    expect(onDisabled).not.toHaveBeenCalled();
  });
});
