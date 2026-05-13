import { HelmetProvider } from "react-helmet-async";
import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext/AuthProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";
import { GxThemeProvider } from "@/ThemeProvider";
import { router } from "@/router/router";

export default function App() {
  return (
    <GxThemeProvider>
      <LoadingProvider>
        <MessageBarProvider>
          <AuthProvider>
            <HelmetProvider>
              <RouterProvider router={router} />
            </HelmetProvider>
          </AuthProvider>
        </MessageBarProvider>
      </LoadingProvider>
    </GxThemeProvider>
  );
}
