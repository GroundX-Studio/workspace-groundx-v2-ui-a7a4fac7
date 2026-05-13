/**
 * GxThemeProvider — wrap your app root with this to get the full GroundX Studio Harness look.
 *
 * Responsibilities:
 *   1. Install the MUI theme (palette, typography, component defaults).
 *   2. Apply CssBaseline so <body> gets the brand font and background.
 *   3. Load Inter from Google Fonts (via side-effect CSS import of fonts.css).
 *
 * Usage:
 *   import { GxThemeProvider } from "@/theme/ThemeProvider";
 *
 *   ReactDOM.createRoot(rootEl).render(
 *     <GxThemeProvider>
 *       <App />
 *     </GxThemeProvider>
 *   );
 */

import { CssBaseline, ThemeProvider } from "@mui/material";
import { ReactNode } from "react";

import theme from "./theme";
import "./fonts.css";

interface GxThemeProviderProps {
  children: ReactNode;
}

export function GxThemeProvider({ children }: GxThemeProviderProps) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export default GxThemeProvider;
