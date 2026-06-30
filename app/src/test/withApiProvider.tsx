import type { ReactNode } from "react";

import { ApiProvider } from "@/contexts/ApiContext";
import { makeFakeApi, type ApiOverrides } from "@/test/makeFakeApi";

export const withApiProvider = (children: ReactNode, api?: ApiOverrides): JSX.Element => (
  <ApiProvider value={makeFakeApi(api)}>{children}</ApiProvider>
);

export const makeApiWrapper =
  (api?: ApiOverrides) =>
  function ApiWrapper({ children }: { children: ReactNode }): JSX.Element {
    return withApiProvider(children, api);
  };
