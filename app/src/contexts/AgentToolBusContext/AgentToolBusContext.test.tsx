import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AgentToolBusProvider, useAgentToolBus } from "./AgentToolBusContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AgentToolBusProvider now={() => 1700000000000}>{children}</AgentToolBusProvider>
);

describe("AgentToolBusContext", () => {
  it("registers and lists tools (no handler exposed)", () => {
    const { result } = renderHook(() => useAgentToolBus(), { wrapper });
    act(() => {
      result.current.register({
        name: "echo",
        description: "Echoes its input",
        parameters: z.object({ text: z.string() }),
        handler: ({ text }) => text,
      });
    });
    const listed = result.current.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("echo");
    expect(listed[0].description).toBe("Echoes its input");
    expect("handler" in listed[0]).toBe(false);
  });

  it("invoke runs the handler with validated params", async () => {
    const { result } = renderHook(() => useAgentToolBus(), { wrapper });
    const handler = vi.fn(({ text }: { text: string }) => `echo:${text}`);
    act(() => {
      result.current.register({
        name: "echo",
        description: "Echoes",
        parameters: z.object({ text: z.string() }),
        handler,
      });
    });
    const value = await result.current.invoke("echo", { text: "hi" });
    expect(value).toBe("echo:hi");
    expect(handler).toHaveBeenCalledWith({ text: "hi" });
  });

  it("invoke throws TOOL_NOT_FOUND for unknown name", async () => {
    const { result } = renderHook(() => useAgentToolBus(), { wrapper });
    await expect(result.current.invoke("missing", {})).rejects.toThrow(/No tool registered/);
  });

  it("invoke throws on invalid params (Zod validation)", async () => {
    const { result } = renderHook(() => useAgentToolBus(), { wrapper });
    act(() => {
      result.current.register({
        name: "echo",
        description: "Echoes",
        parameters: z.object({ text: z.string() }),
        handler: ({ text }) => text,
      });
    });
    await expect(result.current.invoke("echo", { text: 123 })).rejects.toThrow();
  });

  it("recent() returns invocations including failures", async () => {
    const { result } = renderHook(() => useAgentToolBus(), { wrapper });
    act(() => {
      result.current.register({
        name: "echo",
        description: "",
        parameters: z.object({ text: z.string() }),
        handler: ({ text }) => text,
      });
    });
    await result.current.invoke("echo", { text: "ok" });
    await result.current.invoke("missing", {}).catch(() => undefined);
    const recent = result.current.recent();
    expect(recent).toHaveLength(2);
    expect(recent[0].result).toBe("ok");
    expect(recent[1].error?.code).toBe("TOOL_NOT_FOUND");
  });

  it("throws when used outside provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useAgentToolBus())).toThrow(/AgentToolBusProvider/);
    } finally {
      consoleError.mockRestore();
    }
  });
});
