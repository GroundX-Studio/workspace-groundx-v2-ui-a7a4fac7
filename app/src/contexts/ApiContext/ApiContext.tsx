import { createContext, type FC, type ReactNode } from "react";

import type { Api } from "@/api/client";
import { createContextHook } from "@/contexts/createEntityContext";

/**
 * Injected frontend network client. Components/contexts read it via `useApi()`,
 * never by importing `@/api` or the standalone network modules directly. The
 * composition root wires the real client (`realApi`); tests inject `makeFakeApi`.
 */
const ApiContext = createContext<Api | undefined>(undefined);

export const ApiProvider: FC<{ value: Api; children: ReactNode }> = ({
  value,
  children,
}) => <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;

export const useApi = createContextHook(
  ApiContext,
  "useApi must be used inside an ApiProvider",
);
