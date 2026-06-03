/**
 * AppErrorBoundary — outermost error boundary in the App.
 *
 * Catches any uncaught render error from the entire provider /
 * router tree below (e.g. a hook called outside its required
 * Provider, a JSON parse blowing up at component init) and renders
 * a calm fallback instead of React Router's red default crash
 * screen.
 *
 * React's complaint that "you can provide a way better UX than this
 * when your app throws errors by providing your own ErrorBoundary"
 * is what motivated wrapping the app this way after the missing
 * DocumentsProvider crash on 2026-05-25.
 *
 * Sentry capture is wired through the injected API telemetry surface. The
 * production client forwards it to the project's Sentry wrapper, which is a
 * no-op when `VITE_SENTRY_DSN` is unset.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
  captureException: (error: unknown, extras?: Record<string, unknown>) => void;
  /** Optional override for the fallback UI; defaults to the built-in. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Route to the Sentry wrapper (CF-13). No-op when DSN is unset.
    // The OB-08 drift guard (`src/lib/sentryMigration.test.ts`) forbids
    // the raw console error call in production code; React's own
    // error handler already writes to the dev console for us.
    this.props.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div
          role="alert"
          data-testid="app-error-boundary"
          style={{
            padding: "32px",
            fontFamily: "Inter, system-ui, sans-serif",
            color: "#0a1a2a",
            maxWidth: 640,
            margin: "48px auto",
            border: "1px solid #d6dde4",
            borderRadius: 8,
            backgroundColor: "#ffffff",
          }}
        >
          <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 700 }}>
            Something went wrong.
          </h1>
          <p style={{ margin: "0 0 16px", color: "#46566a", lineHeight: 1.5 }}>
            The app hit an unexpected error and stopped rendering this view. The
            problem has been logged. You can try again, or reload the page.
          </p>
          <pre
            style={{
              fontSize: 12,
              backgroundColor: "#f4f6f8",
              padding: 12,
              borderRadius: 4,
              overflowX: "auto",
              color: "#46566a",
              margin: "0 0 16px",
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={this.reset}
            data-testid="app-error-boundary-reset"
            style={{
              padding: "10px 20px",
              border: "1px solid #0a1a2a",
              borderRadius: 999,
              backgroundColor: "#a1ec83",
              color: "#0a1a2a",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
