import { ReactElement } from "react";
import { render } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";

import type { Api } from "@/api/client";
import { ApiProvider } from "@/contexts/ApiContext";
import { AuthProvider } from "@/contexts/AuthContext/AuthProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";
import { GxThemeProvider } from "@/ThemeProvider";
import { makeFakeApi, type ApiOverrides } from "@/test/makeFakeApi";

interface RenderAppOptions {
  initialRoute?: string;
  /**
   * Override methods on the injected `Api` fake. Defaults to all-resolved
   * `vi.fn`s; pass only what the test asserts instead of `vi.mock("@/api/...")`.
   */
  api?: ApiOverrides;
}

export const renderWithAppProviders = (
  ui: ReactElement,
  { initialRoute = "/", api }: RenderAppOptions = {},
) =>
  // ApiProvider is OUTERMOST: AuthProvider (and any migrated provider) reads
  // the injected client via useApi(), so the fake must sit above it.
  render(
    <ApiProvider value={makeFakeApi(api)}>
      <GxThemeProvider>
        <LoadingProvider>
          <MessageBarProvider>
            <AuthProvider>
              <HelmetProvider>
                <MemoryRouter
                  initialEntries={[initialRoute]}
                  future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
                >
                  {ui}
                </MemoryRouter>
              </HelmetProvider>
            </AuthProvider>
          </MessageBarProvider>
        </LoadingProvider>
      </GxThemeProvider>
    </ApiProvider>,
  );
