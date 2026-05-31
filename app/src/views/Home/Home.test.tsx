import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { AuthContext, type AuthContextI } from "@/contexts/AuthContext/AuthContext";
import { sdkFailure } from "@/contexts/sdkContextTypes";

import { Home } from "./Home";

const CHAT_STORE_STORAGE_KEY = "groundx-onboarding.chat-store.v1";

/**
 * ARCH-21 (2026-05-26): Home is now an auth-aware redirect, not a
 * marketing page. These tests pin the three branches:
 *   - anonymous → /onboarding
 *   - signed-in + persisted session → /c/<id>
 *   - signed-in + no session (or unparseable snapshot) → /onboarding
 *
 * We inject AuthContext directly instead of going through AuthProvider
 * so the tests don't have to mock the entire Partner API surface just
 * to flip a single boolean.
 */

const makeAuth = (isLoggedIn: boolean): AuthContextI => ({
  auth: {
    userName: isLoggedIn ? "acct-1" : "",
    token: "",
    isLoggedIn,
    xJwtToken: "",
  },
  user: null,
  setAuth: () => undefined,
  login: async () => ({ isLoggedIn: false, error: false, banned: false }),
  register: async () => sdkFailure<void>(new Error("not implemented")),
  logout: async () => undefined,
  getUserData: async () => sdkFailure(new Error("not implemented")),
  updateAppMetadata: async () => sdkFailure<void>(new Error("not implemented")),
  resetPassword: async () => sdkFailure<void>(new Error("not implemented")),
  confirmChangingPassword: async () => sdkFailure<void>(new Error("not implemented")),
});

const ChatRouteMarker = () => {
  const { sessionId } = useParams();
  return <div data-testid="chat-route">{sessionId}</div>;
};

const renderHome = (isLoggedIn: boolean) =>
  render(
    <AuthContext.Provider value={makeAuth(isLoggedIn)}>
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/onboarding" element={<div>Onboarding route</div>} />
          <Route path="/c/:sessionId" element={<ChatRouteMarker />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

describe("Home (auth-aware redirect)", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("redirects anonymous users to /onboarding", () => {
    renderHome(false);
    expect(screen.getByText("Onboarding route")).toBeInTheDocument();
  });

  it("redirects signed-in users with no persisted ChatStore snapshot to /onboarding", () => {
    renderHome(true);
    expect(screen.getByText("Onboarding route")).toBeInTheDocument();
  });

  it("redirects signed-in users with a persisted active session to /c/<sessionId>", () => {
    window.localStorage.setItem(
      CHAT_STORE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        ownerKey: "anon-x",
        activeSessionId: "sess-abc",
        sessions: [],
      }),
    );
    renderHome(true);
    expect(screen.getByTestId("chat-route")).toHaveTextContent("sess-abc");
  });

  it("falls back to /onboarding when the persisted ChatStore snapshot is malformed", () => {
    window.localStorage.setItem(CHAT_STORE_STORAGE_KEY, "{not valid json");
    renderHome(true);
    expect(screen.getByText("Onboarding route")).toBeInTheDocument();
  });

  it("falls back to /onboarding when the persisted snapshot has no activeSessionId", () => {
    window.localStorage.setItem(
      CHAT_STORE_STORAGE_KEY,
      JSON.stringify({ version: 1, ownerKey: "anon-x", activeSessionId: null, sessions: [] }),
    );
    renderHome(true);
    expect(screen.getByText("Onboarding route")).toBeInTheDocument();
  });
});
