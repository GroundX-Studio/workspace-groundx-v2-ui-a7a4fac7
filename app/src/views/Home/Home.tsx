import { Navigate } from "react-router-dom";

import { useAuthContext } from "@/contexts/AuthContext";
import { ROUTER_PATHS } from "@/router/routerPaths";

/**
 * ChatStoreProvider isn't mounted at the `/` boundary (it's a child
 * of SteadyShell), so a hook-based read would always return null
 * here. Reading the persisted snapshot value directly mirrors how
 * OnboardingShell reads the same key for its URL-sync effect, and
 * keeps `Home` a single render with no waiting on context wiring.
 *
 * Keep this in sync with `STORAGE_KEY` in ChatStoreContext.tsx — if
 * either constant moves, both must move together.
 */
const CHAT_STORE_STORAGE_KEY = "groundx-onboarding.chat-store.v1";

const readLastSessionId = (): string | null => {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(CHAT_STORE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { activeSessionId?: string | null };
    return parsed.activeSessionId ?? null;
  } catch {
    return null;
  }
};

/**
 * ARCH-21 (2026-05-26): the scaffold-default 161-line marketing card
 * was replaced with an auth-aware redirect. `/home` is no longer a
 * destination — it's an entry hop that forwards the user to where
 * they actually belong based on auth + persisted session state:
 *
 *   - Signed-in with a last chat session: `/c/<sessionId>` (deep-link
 *     back into where they left off).
 *   - Signed-in without one: `/onboarding` (no destination chosen
 *     yet — bounce them to the picker).
 *   - Anonymous: `/onboarding`. AppInitialization usually catches
 *     these earlier and forwards to login, but this fallback keeps
 *     the redirect contract obvious if the gate is ever loosened.
 *
 * The companion drift guard (`no-hardcoded-styles.test.ts`) used to
 * exempt this file with 2 offenders; the rewrite removes them and
 * the exemption was deleted in the same change.
 */
export const Home = () => {
  const { auth } = useAuthContext();

  if (auth.isLoggedIn) {
    const sessionId = readLastSessionId();
    if (sessionId) {
      return <Navigate to={`/c/${sessionId}`} replace />;
    }
  }

  return <Navigate to={ROUTER_PATHS.ONBOARDING} replace />;
};
