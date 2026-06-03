import { api } from "@/api";
import { upsertChatSessionEntity } from "@/api/chatSessionEntities";
import { patchChatSession } from "@/api/chatSessionPatch";
import {
  createChatSession as createChatSessionDirect,
  createChatSessionEnsureClient,
  listChatMessages as listChatMessagesDirect,
  sendChatMessage as sendChatMessageDirect,
} from "@/api/chatSessions";
import { listChatSessions } from "@/api/chatSessionsList";
import { claimAnonymousChat } from "@/api/claimAnonymousChat";
import { resetSession } from "@/api/entities/customerEntity";
import { issueOnboardingSession, type OnboardingSessionResponse } from "@/api/entities/onboardingSessionEntity";
import { listScenarios } from "@/api/entities/scenarioRegistryEntity";
import { extractField } from "@/api/extractField";
import { recordIntent } from "@/api/intentLog";
import { renderReport, saveReportTemplate } from "@/api/smartReport";
import { recordViewerEvent } from "@/api/viewerEvents";
import { captureException } from "@/lib/sentry";

let pendingAnonSession: Promise<OnboardingSessionResponse> | null = null;
let resolvedAnonSession: OnboardingSessionResponse | null = null;

const ensureAnonSession = async (): Promise<OnboardingSessionResponse> => {
  if (resolvedAnonSession) return resolvedAnonSession;
  if (pendingAnonSession) return pendingAnonSession;
  pendingAnonSession = issueOnboardingSession()
    .then((response) => {
      resolvedAnonSession = response;
      return response;
    })
    .finally(() => {
      pendingAnonSession = null;
    });
  return pendingAnonSession;
};

const chatSessionEnsure = createChatSessionEnsureClient(createChatSessionDirect);

const createChatSession = async (input: Parameters<typeof createChatSessionDirect>[0]) => {
  const result = await createChatSessionDirect(input);
  chatSessionEnsure.markChatSessionEnsured(input.id);
  return result;
};

const sendChatMessage: typeof sendChatMessageDirect = (input) =>
  sendChatMessageDirect(input, chatSessionEnsure);

const listChatMessages: typeof listChatMessagesDirect = (chatSessionId) =>
  listChatMessagesDirect(chatSessionId, chatSessionEnsure);

const ensureServerChatSession = chatSessionEnsure.ensureServerChatSession;

const patchChatSessionWithClientEnsure: typeof patchChatSession = (input) =>
  patchChatSession(input, chatSessionEnsure);

const upsertChatSessionEntityWithClientEnsure: typeof upsertChatSessionEntity = (input) =>
  upsertChatSessionEntity(input, chatSessionEnsure);

const recordViewerEventWithClientEnsure: typeof recordViewerEvent = (input) =>
  recordViewerEvent(input, chatSessionEnsure);

const renderReportWithClientEnsure: typeof renderReport = (input) =>
  renderReport(input, chatSessionEnsure);

const extractFieldWithClientEnsure: typeof extractField = (input) =>
  extractField(input, chatSessionEnsure);

/**
 * The real frontend network client — the single composition root for ALL
 * network access. Consumers reach it through `useApi()` (see `ApiContext`),
 * never by importing `@/api` or the standalone modules directly. This mirrors
 * the middleware's `createApp({ ...deps })` DI: one real client in production,
 * one fake (`makeFakeApi`) injected in tests — instead of per-file `vi.mock`.
 *
 * The shape is BROADER than the `@/api` aggregate: it spreads the aggregate's
 * members AND folds in the standalone session/chat/report/extract modules that
 * were never part of it, grouped into cohesive members. New API functions are
 * added HERE (+ to `makeFakeApi`), never imported directly at a call-site.
 *
 * This object is a module singleton — a STABLE reference — so consumers may
 * safely place its methods in `useEffect` dependency arrays.
 */
export const realApi = {
  ...api,
  auth: {
    login: api.login,
    register: api.register,
    logout: api.logout,
    getUserData: api.getUserData,
    updateAppMetadata: api.updateAppMetadata,
    resetUserPassword: api.resetUserPassword,
    confirmUserChangingPassword: api.confirmUserChangingPassword,
    resetSession,
  },
  session: {
    issueOnboardingSession,
    ensureAnonSession,
  },
  chat: {
    createChatSession,
    sendChatMessage,
    listChatMessages,
    ensureServerChatSession,
    patchChatSession: patchChatSessionWithClientEnsure,
    listChatSessions,
    claimAnonymousChat,
    upsertChatSessionEntity: upsertChatSessionEntityWithClientEnsure,
  },
  viewerEvents: {
    recordViewerEvent: recordViewerEventWithClientEnsure,
  },
  intent: {
    recordIntent,
  },
  scenario: {
    listScenarios,
  },
  telemetry: {
    captureException,
  },
  report: {
    renderReport: renderReportWithClientEnsure,
    saveReportTemplate,
  },
  extract: {
    extractField: extractFieldWithClientEnsure,
  },
};

/** The injected client surface. `makeFakeApi` is type-checked against this. */
export type Api = typeof realApi;
