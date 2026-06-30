import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Markdown } from "./Markdown";

describe("Markdown primitive (full markdown, XSS-safe)", () => {
  it("renders bold (`**x**`) as <strong>", () => {
    const { container } = render(<Markdown>{"The total is **$7,613.20**."}</Markdown>);
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe("$7,613.20");
  });

  it("renders italic (`*x*`) as <em>", () => {
    const { container } = render(<Markdown>{"this is *important*"}</Markdown>);
    expect(container.querySelector("em")?.textContent).toBe("important");
  });

  it("renders inline code (`` `x` ``) as <code>", () => {
    const { container } = render(<Markdown>{"the field `amount_due` is set"}</Markdown>);
    expect(container.querySelector("code")?.textContent).toBe("amount_due");
  });

  it("renders unordered lists as <ul><li>", () => {
    const { container } = render(<Markdown>{"- first\n- second\n- third"}</Markdown>);
    expect(container.querySelectorAll("ul li")).toHaveLength(3);
  });

  it("renders ordered lists as <ol><li>", () => {
    const { container } = render(<Markdown>{"1. one\n2. two"}</Markdown>);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("renders headings", () => {
    const { container } = render(<Markdown>{"# Summary\n\nbody"}</Markdown>);
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")?.textContent).toBe("Summary");
  });

  it("renders GFM tables (remark-gfm)", () => {
    const md = "| Field | Value |\n| --- | --- |\n| due | 7613.20 |";
    const { container } = render(<Markdown>{md}</Markdown>);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("table td")).toHaveLength(2);
  });

  it("renders links with safe rel/target", () => {
    const { container } = render(<Markdown>{"[docs](https://groundx.ai)"}</Markdown>);
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://groundx.ai");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel") ?? "").toContain("noopener");
  });

  it("does NOT render raw HTML (XSS-safe — no rehype-raw)", () => {
    const { container } = render(
      <Markdown>{"hi <img src=x onerror=alert(1)> <script>alert(2)</script> bye"}</Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    // the literal text survives, just not as live HTML
    expect(container.textContent).toContain("hi");
    expect(container.textContent).toContain("bye");
  });

  it("renders plain text unchanged", () => {
    render(<Markdown>{"just words, no markup"}</Markdown>);
    expect(screen.getByText(/just words, no markup/)).toBeInTheDocument();
  });
});
