/**
 * RT-05 — bridges AuthContext + ChatStore: when a visitor signs in,
 * fetch their server-side chat sessions and merge into the local
 * store. Mounted as a transparent child of ChatStoreProvider; renders
 * nothing.
 *
 * Failure mode this fixes: a user signing in on a fresh browser (no
 * localStorage cache) would see zero sessions in SessionSwitcher
 * despite the DB carrying their full history. Now the hydrate runs
 * on every false→true transition of `auth.isLoggedIn`, so the
 * SessionSwitcher sees the real list as soon as auth resolves.
 *
 * Idempotency: a `useRef` tracks the last hydrated isLoggedIn value
 * to keep StrictMode double-mount + remount churn from firing
 * multiple requests. Hydration is one-shot per login session;
 * subsequent local mutations follow the per-write PATCH/POST paths
 * RT-01..04 already wired.
 *
 * Anon visitors (isLoggedIn=false): no-op. The server returns 401
 * which `listChatSessions` resolves to an empty array; we skip the
 * fetch entirely in that branch to avoid the round trip.
 */

import { useContext, useEffect, useRef, type FC } from "react";

import { useApi } from "@/contexts/ApiContext";
import { AuthContext } from "@/contexts/AuthContext/AuthContext";
import { captureException } from "@/lib/sentry";

import { useChatStore } from "./ChatStoreContext";

export const ChatStoreServerHydrator: FC = () => {
  const api = useApi();
  // Read AuthContext via useContext (not useAuthContext) so tests
  // that mount EntitySessionStoreProvider without AuthProvider don't
  // crash. The hydrator is a no-op until/unless AuthProvider mounts
  // above us — production has AuthProvider in the tree, tests opt
  // in only when they need auth.
  const authCtx = useContext(AuthContext);
  const { hydrateFromServer } = useChatStore();
  const auth = authCtx?.auth ?? null;
  // Track the most recent auth state we hydrated against so a
  // re-render with the same isLoggedIn doesn't kick another fetch.
  // Pre-RT-05 there was no hydrator at all; this is gated on the
  // false→true transition (login event) + once per mount of a
  // signed-in user (page reload while authed).
  const hydratedFor = useRef<boolean | null>(null);

  useEffect(() => {
    // No AuthProvider in the tree → no-op (test path or pre-auth
    // bootstrap). The effect re-runs if AuthProvider mounts later.
    if (auth === null) return;
    if (auth.isLoggedIn !== true) {
      // Reset tracking on logout so a re-login triggers a fresh
      // hydrate without page reload.
      hydratedFor.current = false;
      return;
    }
    if (hydratedFor.current === true) return;
    hydratedFor.current = true;

    let cancelled = false;
    (async () => {
      try {
        const sessions = await api.chat.listChatSessions();
        if (cancelled || sessions.length === 0) return;
        hydrateFromServer(sessions);
      } catch (err) {
        // Non-fatal — localStorage cache remains visible; user can
        // start a fresh session. Sentry catches the failure for
        // ops, but the UI never blocks on hydrate.
        captureException(err, { route: "/api/chat-sessions" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api.chat, auth, hydrateFromServer]);

  return null;
};
