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
import {
  confirmUserChangingPassword,
  getUserData,
  login,
  logout,
  register,
  resetSession,
  resetUserPassword,
  updateAppMetadata,
} from "@/api/entities/customerEntity";
import * as groundxApiKeys from "@/api/entities/groundxApiKeysEntity";
import * as groundxBuckets from "@/api/entities/groundxBucketsEntity";
import * as groundxCustomer from "@/api/entities/groundxCustomerEntity";
import * as groundxDocuments from "@/api/entities/groundxDocumentsEntity";
import * as groundxGroups from "@/api/entities/groundxGroupsEntity";
import * as groundxHealth from "@/api/entities/groundxHealthEntity";
import * as groundxSearch from "@/api/entities/groundxSearchEntity";
import * as groundxWorkflows from "@/api/entities/groundxWorkflowsEntity";
import { issueOnboardingSession, type OnboardingSessionResponse } from "@/api/entities/onboardingSessionEntity";
import * as partnerApiKeys from "@/api/entities/partnerApiKeysEntity";
import * as partnerBuckets from "@/api/entities/partnerBucketsEntity";
import * as partnerCustomer from "@/api/entities/partnerCustomerEntity";
import * as partnerGroups from "@/api/entities/partnerGroupsEntity";
import * as partnerProjects from "@/api/entities/partnerProjectsEntity";
import { listScenarios } from "@/api/entities/scenarioRegistryEntity";
import { extractField } from "@/api/extractField";
import { fetchFieldGeometry } from "@/api/fieldGeometry";
import { recordIntent } from "@/api/intentLog";
import { getReportTemplate, renderReport, saveReportTemplate } from "@/api/smartReport";
import { saveTemplate } from "@/api/templates";
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

const createChatSessionWithSession = async (
  input: Parameters<typeof createChatSessionDirect>[0],
) => {
  if (input.isOnboarding) {
    await ensureAnonSession();
  }
  return createChatSessionDirect(input);
};

const chatSessionEnsure = createChatSessionEnsureClient(createChatSessionWithSession);

const createChatSession = async (input: Parameters<typeof createChatSessionDirect>[0]) => {
  const result = await createChatSessionWithSession(input);
  chatSessionEnsure.markChatSessionEnsured(input.id);
  return result;
};

const sendChatMessage: typeof sendChatMessageDirect = (input) =>
  sendChatMessageDirect(input, chatSessionEnsure);

const listChatMessages: typeof listChatMessagesDirect = (chatSessionId, sessionMeta) =>
  listChatMessagesDirect(chatSessionId, sessionMeta, chatSessionEnsure);

const ensureServerChatSession = chatSessionEnsure.ensureServerChatSession;

export const __resetRealApiSessionStateForTests = (): void => {
  pendingAnonSession = null;
  resolvedAnonSession = null;
  chatSessionEnsure.resetEnsuredChatSessions();
};

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

const legacyApiMembers = {
  partnerCustomer,
  partnerApiKeys,
  partnerBuckets,
  partnerGroups,
  partnerProjects,
  groundxApiKeys,
  groundxBuckets,
  groundxCustomer,
  groundxDocuments,
  groundxGroups,
  groundxHealth,
  groundxSearch,
  groundxWorkflows,
  login,
  register,
  logout,
  getUserData,
  updateAppMetadata,
  resetUserPassword,
  confirmUserChangingPassword,
  issueOnboardingSession,
};

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
  ...legacyApiMembers,
  auth: {
    login,
    register,
    logout,
    getUserData,
    updateAppMetadata,
    resetUserPassword,
    confirmUserChangingPassword,
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
  workflow: {
    getGroundXWorkflow: groundxWorkflows.getGroundXWorkflow,
  },
  template: {
    saveTemplate,
  },
  telemetry: {
    captureException,
  },
  report: {
    renderReport: renderReportWithClientEnsure,
    saveReportTemplate,
    getReportTemplate,
  },
  extract: {
    extractField: extractFieldWithClientEnsure,
    fetchFieldGeometry,
  },
};

/** The injected client surface. `makeFakeApi` is type-checked against this. */
export type Api = typeof realApi;
