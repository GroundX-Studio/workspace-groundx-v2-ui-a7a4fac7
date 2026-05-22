import { createContext, useCallback, useContext, useMemo, useRef, type FC, type ReactNode } from "react";

import type { AgentTool, AgentToolBusApi, AgentToolInvocation } from "./types";

const RECENT_LIMIT = 50;

const AgentToolBusContext = createContext<AgentToolBusApi | null>(null);

interface AgentToolBusProviderProps {
  children: ReactNode;
  now?: () => number;
}

export const AgentToolBusProvider: FC<AgentToolBusProviderProps> = ({ children, now = Date.now }) => {
  const toolsRef = useRef(new Map<string, AgentTool>());
  const recentRef = useRef<AgentToolInvocation[]>([]);

  const register = useCallback(<T,>(tool: AgentTool<T>) => {
    toolsRef.current.set(tool.name, tool as AgentTool);
    return () => {
      const current = toolsRef.current.get(tool.name);
      if (current === (tool as AgentTool)) toolsRef.current.delete(tool.name);
    };
  }, []);

  const list = useCallback(() => {
    return Array.from(toolsRef.current.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      // Zod doesn't ship JSON Schema directly; for now we expose a placeholder
      // payload. The middleware mirrors the same schemas so the LLM payload
      // contract is enforced server-side. Phase 1+ can plug `zod-to-json-schema`.
      parametersJsonSchema: { kind: "zod-schema", note: "see middleware mirror for JSON Schema" },
    }));
  }, []);

  const invoke = useCallback(
    async (name: string, params: unknown) => {
      const tool = toolsRef.current.get(name);
      const invocation: AgentToolInvocation = { name, params, ts: now() };
      if (!tool) {
        invocation.error = { code: "TOOL_NOT_FOUND", message: `No tool registered with name "${name}"` };
        recordInvocation(recentRef, invocation);
        throw new Error(invocation.error.message);
      }
      const parsed = tool.parameters.safeParse(params);
      if (!parsed.success) {
        invocation.error = { code: "INVALID_PARAMS", message: parsed.error.message };
        recordInvocation(recentRef, invocation);
        throw new Error(invocation.error.message);
      }
      try {
        const result = await tool.handler(parsed.data);
        invocation.result = result;
        recordInvocation(recentRef, invocation);
        return result;
      } catch (error) {
        invocation.error = { code: "HANDLER_THREW", message: (error as Error)?.message ?? String(error) };
        recordInvocation(recentRef, invocation);
        throw error;
      }
    },
    [now]
  );

  const recent = useCallback(() => recentRef.current.slice(), []);

  const value = useMemo<AgentToolBusApi>(() => ({ list, register, invoke, recent }), [list, register, invoke, recent]);

  return <AgentToolBusContext.Provider value={value}>{children}</AgentToolBusContext.Provider>;
};

function recordInvocation(ref: { current: AgentToolInvocation[] }, invocation: AgentToolInvocation): void {
  ref.current.push(invocation);
  if (ref.current.length > RECENT_LIMIT) ref.current.splice(0, ref.current.length - RECENT_LIMIT);
}

export const useAgentToolBus = (): AgentToolBusApi => {
  const value = useContext(AgentToolBusContext);
  if (!value) throw new Error("useAgentToolBus must be used inside AgentToolBusProvider");
  return value;
};
