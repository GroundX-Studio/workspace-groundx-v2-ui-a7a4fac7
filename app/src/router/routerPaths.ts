export const ROUTER_PATHS = {
  AUTH_LOGIN: "/auth/login",
  AUTH_REGISTER: "/auth/register",
  AUTH_RESET_PASSWORD: "/auth/reset-password",
  BANNED: "/banned",
  HEALTH: "/health",
  HOME: "/home",
  ONBOARDING: "/onboarding",
  // Steady-mode chat session URL. Param `sessionId` is the ChatStore
  // session id (e.g. `abc123`); pathname looks like `/c/abc123`.
  // The "c" prefix marks it as a session URL — distinct from
  // `/customer/:id` or any other resource. (Memory originally
  // referred to "c-<id>" as a single segment but react-router v6
  // requires `:` to start a segment, so the canonical form became
  // `/c/:sessionId` with a slash separator.)
  STEADY_SESSION: "/c/:sessionId",
};
