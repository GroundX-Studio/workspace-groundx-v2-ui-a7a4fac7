import { ReactElement } from "react";
import { render } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext/AuthProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";
import { GxThemeProvider } from "@/ThemeProvider";

export const renderWithAppProviders = (ui: ReactElement, initialRoute = "/") =>
  render(
    <GxThemeProvider>
      <LoadingProvider>
        <MessageBarProvider>
          <AuthProvider>
            <HelmetProvider>
              <MemoryRouter initialEntries={[initialRoute]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
                {ui}
              </MemoryRouter>
            </HelmetProvider>
          </AuthProvider>
        </MessageBarProvider>
      </LoadingProvider>
    </GxThemeProvider>
  );
