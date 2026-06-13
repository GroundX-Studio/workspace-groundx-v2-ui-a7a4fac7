import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ViewerWidgetFrame } from "./ViewerWidgetFrame";

describe("ViewerWidgetFrame", () => {
  it("renders one host-owned close action and labelled active frame chrome", () => {
    const onClose = vi.fn();

    render(
      <ViewerWidgetFrame
        widgetId="sign-up"
        active
        chromePolicy="framed"
        contentMode="centered-panel"
        eyebrow="Save your work"
        title="Create an account"
        subtitle="Your chat and viewer state stay together after sign-in."
        closeAction={{ id: "close-sign-in", label: "Close sign-in", onClick: onClose }}
      >
        <div data-testid="sign-up-content">Form content</div>
      </ViewerWidgetFrame>,
    );

    const frame = screen.getByTestId("viewer-widget-frame");
    expect(frame).toHaveAttribute("role", "region");
    expect(frame).toHaveAttribute("aria-label", "Create an account");
    expect(frame).toHaveAttribute("data-viewer-widget-id", "sign-up");
    expect(frame).toHaveAttribute("data-viewer-frame-active", "true");
    expect(frame).toHaveAttribute("data-viewer-content-mode", "centered-panel");
    expect(frame).toHaveAttribute("data-viewer-chrome-policy", "framed");
    expect(within(frame).getByText("Save your work")).toBeInTheDocument();
    expect(within(frame).getByText("Create an account")).toBeInTheDocument();
    expect(within(frame).getByText(/viewer state/i)).toBeInTheDocument();
    expect(within(frame).getByTestId("viewer-frame-body")).toContainElement(
      screen.getByTestId("sign-up-content"),
    );

    const close = within(frame).getByTestId("viewer-frame-close");
    expect(close).toHaveAccessibleName("Close sign-in");
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("places loading/status chrome outside the embed body", () => {
    render(
      <ViewerWidgetFrame
        widgetId="book-call"
        active
        chromePolicy="edge-to-edge"
        contentMode="embed"
        title="Book a 30-minute engineer call"
        loading={{ label: "Loading booking calendar" }}
      >
        <div data-testid="calendly-embed">Calendly body</div>
      </ViewerWidgetFrame>,
    );

    const frame = screen.getByTestId("viewer-widget-frame");
    const status = within(frame).getByTestId("viewer-frame-status");
    const body = within(frame).getByTestId("viewer-frame-body");
    expect(status).toHaveTextContent(/loading booking calendar/i);
    expect(body).toContainElement(screen.getByTestId("calendly-embed"));
    expect(body).not.toContainElement(status);
    expect(frame).toHaveAttribute("data-viewer-content-mode", "embed");
  });

  it("marks inactive underlay frames without exposing a close action", () => {
    render(
      <ViewerWidgetFrame
        widgetId="sign-up"
        active={false}
        chromePolicy="framed"
        contentMode="centered-panel"
        title="Create an account"
        closeAction={{ id: "close-sign-in", label: "Close sign-in", onClick: vi.fn() }}
      >
        <div>Inactive content</div>
      </ViewerWidgetFrame>,
    );

    const frame = screen.getByTestId("viewer-widget-frame");
    expect(frame).toHaveAttribute("data-viewer-frame-active", "false");
    expect(frame).toHaveAttribute("aria-hidden", "true");
    expect(within(frame).queryByTestId("viewer-frame-close")).not.toBeInTheDocument();
  });

  it("does not let close actions override the stable close handle", () => {
    render(
      <ViewerWidgetFrame
        widgetId="book-call"
        active
        chromePolicy="framed"
        contentMode="embed"
        title="Book a call"
        closeAction={{
          id: "close-book-call",
          label: "Close booking",
          onClick: vi.fn(),
          testId: "book-call-close",
        } as never}
      >
        <div>Booking content</div>
      </ViewerWidgetFrame>,
    );

    const frame = screen.getByTestId("viewer-widget-frame");
    expect(within(frame).getByTestId("viewer-frame-close")).toHaveAccessibleName("Close booking");
    expect(within(frame).queryByTestId("book-call-close")).not.toBeInTheDocument();
  });

  it("renders secondary frame actions supplied by the host with their declared icons", () => {
    const onSecondary = vi.fn();

    render(
      <ViewerWidgetFrame
        widgetId="report"
        active
        chromePolicy="framed"
        contentMode="padded-scroll"
        title="Report"
        secondaryActions={[
          {
            id: "download-report",
            label: "Download",
            onClick: onSecondary,
            icon: "download",
            testId: "viewer-frame-secondary-download",
          },
          {
            id: "save-report",
            label: "Save",
            onClick: vi.fn(),
            icon: "save",
            testId: "viewer-frame-secondary-save",
          },
          {
            id: "open-report",
            label: "Open",
            onClick: vi.fn(),
            icon: "external",
            testId: "viewer-frame-secondary-open",
          },
        ]}
      >
        <div>Report content</div>
      </ViewerWidgetFrame>,
    );

    const action = screen.getByTestId("viewer-frame-secondary-download");
    expect(action).toHaveAccessibleName("Download");
    expect(within(action).getByTestId("FileDownloadRoundedIcon")).toBeInTheDocument();
    expect(within(screen.getByTestId("viewer-frame-secondary-save")).getByTestId("SaveRoundedIcon")).toBeInTheDocument();
    expect(within(screen.getByTestId("viewer-frame-secondary-open")).getByTestId("OpenInNewRoundedIcon")).toBeInTheDocument();
    fireEvent.click(action);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
