/**
 * Login-claim: tell the BFF to re-key every chat_sessions row owned
 * by this browser's anon session cookie so it's instead owned by the
 * signed-in user. The server reads the anon id from req.session.id
 * (the cookie was upgraded in place by the login handler — the
 * session.id stayed the same), so no request body is required.
 *
 * Trigger: any time the auth state flips from anonymous to signed-in.
 * Frontend chat_sessions rows already exist server-side from day one
 * (created by POST /api/chat-sessions when the local session was
 * minted), so the claim no longer ships content — it only flips
 * ownership.
 */

import { csrfFetch } from "./csrfFetch";

export interface ClaimResult {
  /** How many chat_sessions rows had their owner flipped to the signed-in user. */
  rekeyedSessions: number;
}

/** POST the claim trigger to the BFF. Throws on non-2xx. */
export async function claimAnonymousChat(): Promise<ClaimResult> {
  const res = await csrfFetch("/api/chat-sessions/claim", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    const err = new Error(`claim failed: ${res.status}`);
    (err as Error & { detail?: unknown; status?: number }).detail = detail;
    (err as Error & { detail?: unknown; status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as ClaimResult;
}
