import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMocks = vi.hoisted(() => ({
  configured: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  raw: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/api/axios", () => ({ default: axiosMocks.configured }));
vi.mock("axios", () => ({ default: axiosMocks.raw }));

import {
  confirmUserChangingPassword,
  getUserData,
  login,
  logout,
  register,
  resetUserPassword,
  updateAppMetadata,
} from "@/api/entities/customerEntity";
import {
  createGroundXApiKey,
  deleteGroundXApiKey,
  listGroundXApiKeys,
  renameGroundXApiKey,
} from "@/api/entities/groundxApiKeysEntity";
import {
  createGroundXBucket,
  deleteGroundXBucket,
  getGroundXBucket,
  listGroundXBuckets,
  updateGroundXBucket,
} from "@/api/entities/groundxBucketsEntity";
import { getGroundXCustomer } from "@/api/entities/groundxCustomerEntity";
import {
  cancelGroundXProcess,
  copyGroundXDocuments,
  crawlGroundXWebsite,
  deleteGroundXDocument,
  deleteGroundXDocuments,
  getGroundXDocument,
  getGroundXDocumentExtract,
  getGroundXDocumentXray,
  getGroundXProcessingStatus,
  ingestGroundXLocalDocument,
  ingestGroundXRemoteDocuments,
  listGroundXDocuments,
  listGroundXProcesses,
  lookupGroundXDocument,
  updateGroundXDocuments,
} from "@/api/entities/groundxDocumentsEntity";
import {
  addBucketToGroundXGroup,
  createGroundXGroup,
  deleteGroundXGroup,
  getGroundXGroup,
  listGroundXGroups,
  removeBucketFromGroundXGroup,
  updateGroundXGroup,
} from "@/api/entities/groundxGroupsEntity";
import { getGroundXServiceHealth, listGroundXHealth } from "@/api/entities/groundxHealthEntity";
import { searchGroundXContent, searchGroundXDocuments } from "@/api/entities/groundxSearchEntity";
import {
  assignGroundXAccountWorkflow,
  assignGroundXWorkflowToResource,
  createGroundXWorkflow,
  deleteGroundXWorkflow,
  getGroundXAccountWorkflow,
  getGroundXWorkflow,
  listGroundXWorkflows,
  removeGroundXAccountWorkflow,
  removeGroundXWorkflowFromResource,
  updateGroundXWorkflow,
} from "@/api/entities/groundxWorkflowsEntity";
import {
  createPartnerApiKey,
  deletePartnerApiKey,
  listPartnerApiKeys,
  renamePartnerApiKey,
} from "@/api/entities/partnerApiKeysEntity";
import {
  createPartnerBucket,
  deletePartnerBucket,
  getPartnerBucket,
  listPartnerBuckets,
  transferPartnerBucket,
  updatePartnerBucket,
} from "@/api/entities/partnerBucketsEntity";
import {
  confirmPartnerCustomerPassword,
  deletePartnerCustomer,
  getPartnerCustomer,
  loginPartnerCustomer,
  registerPartnerCustomer,
  resetPartnerCustomerPassword,
} from "@/api/entities/partnerCustomerEntity";
import {
  createPartnerGroup,
  deletePartnerGroup,
  getPartnerGroup,
  listPartnerGroups,
  updatePartnerGroup,
} from "@/api/entities/partnerGroupsEntity";
import {
  attachBucketToPartnerProject,
  createPartnerProject,
  detachBucketFromPartnerProject,
  listPartnerProjects,
  updatePartnerProject,
} from "@/api/entities/partnerProjectsEntity";

type Method = "get" | "post" | "put" | "patch" | "delete";
type Client = "configured" | "raw";

interface ContractCase {
  name: string;
  client: Client;
  method: Method;
  url: string;
  call: () => Promise<unknown>;
}

const cases: ContractCase[] = [
  {
    name: "customer login",
    client: "raw",
    method: "post",
    url: "/api/auth/login",
    call: () => login({ email: "pat@example.com", password: "secret" }),
  },
  {
    name: "customer register",
    client: "raw",
    method: "post",
    url: "/api/auth/register",
    call: () =>
      register({
        first: "Pat",
        last: "Lee",
        email: "pat@example.com",
        password: "secret",
        confirmPassword: "secret",
        endUserLicenseAgreement: true,
      }),
  },
  { name: "auth me", client: "configured", method: "get", url: "/api/auth/me", call: () => getUserData("ignored") },
  {
    name: "metadata update",
    client: "configured",
    method: "patch",
    url: "/api/me/metadata",
    call: () => updateAppMetadata({ onboardingState: "complete" }),
  },
  { name: "logout", client: "configured", method: "post", url: "/api/auth/logout", call: () => logout() },
  {
    name: "password reset",
    client: "raw",
    method: "post",
    url: "/api/auth/password/reset",
    call: () => resetUserPassword("pat@example.com"),
  },
  {
    name: "password confirm",
    client: "raw",
    method: "post",
    url: "/api/auth/password/confirm",
    call: () => confirmUserChangingPassword("123456", "pat@example.com", "new-secret"),
  },
  { name: "GroundX API key list", client: "configured", method: "get", url: "/api/v1/apikey", call: () => listGroundXApiKeys() },
  { name: "GroundX API key create", client: "configured", method: "post", url: "/api/v1/apikey", call: () => createGroundXApiKey("app") },
  {
    name: "GroundX API key rename",
    client: "configured",
    method: "put",
    url: "/api/v1/apikey/gx-key",
    call: () => renameGroundXApiKey("gx-key", "renamed"),
  },
  {
    name: "GroundX API key delete",
    client: "configured",
    method: "delete",
    url: "/api/v1/apikey/gx-key",
    call: () => deleteGroundXApiKey("gx-key"),
  },
  { name: "GroundX bucket list", client: "configured", method: "get", url: "/api/v1/bucket", call: () => listGroundXBuckets() },
  { name: "GroundX bucket create", client: "configured", method: "post", url: "/api/v1/bucket", call: () => createGroundXBucket("docs") },
  { name: "GroundX bucket get", client: "configured", method: "get", url: "/api/v1/bucket/7", call: () => getGroundXBucket(7) },
  { name: "GroundX bucket update", client: "configured", method: "put", url: "/api/v1/bucket/7", call: () => updateGroundXBucket(7, "renamed") },
  { name: "GroundX bucket delete", client: "configured", method: "delete", url: "/api/v1/bucket/7", call: () => deleteGroundXBucket(7) },
  { name: "GroundX customer", client: "configured", method: "get", url: "/api/v1/customer", call: () => getGroundXCustomer() },
  { name: "GroundX ingest copy", client: "configured", method: "post", url: "/api/v1/ingest/copy", call: () => copyGroundXDocuments({ documentIds: ["doc"], bucketId: 7 }) },
  {
    name: "GroundX remote ingest",
    client: "configured",
    method: "post",
    url: "/api/v1/ingest/documents/remote",
    call: () => ingestGroundXRemoteDocuments({ documents: [{ bucketId: 7, sourceUrl: "https://example.com/a.pdf" }] }),
  },
  {
    name: "GroundX local ingest",
    client: "configured",
    method: "post",
    url: "/api/v1/ingest/documents/local",
    call: () => ingestGroundXLocalDocument(new FormData()),
  },
  {
    name: "GroundX website ingest",
    client: "configured",
    method: "post",
    url: "/api/v1/ingest/documents/website",
    call: () => crawlGroundXWebsite({ websites: [{ bucketId: 7, sourceUrl: "https://example.com" }] }),
  },
  { name: "GroundX document list", client: "configured", method: "get", url: "/api/v1/ingest/documents", call: () => listGroundXDocuments() },
  {
    name: "GroundX document update",
    client: "configured",
    method: "put",
    url: "/api/v1/ingest/documents",
    call: () => updateGroundXDocuments({ documents: [{ documentId: "doc", searchData: { type: "contract" } }] }),
  },
  {
    name: "GroundX documents delete",
    client: "configured",
    method: "delete",
    url: "/api/v1/ingest/documents",
    call: () => deleteGroundXDocuments({ documentIds: ["doc"] }),
  },
  { name: "GroundX document lookup", client: "configured", method: "get", url: "/api/v1/ingest/documents/doc", call: () => lookupGroundXDocument("doc") },
  { name: "GroundX document get", client: "configured", method: "get", url: "/api/v1/ingest/document/doc", call: () => getGroundXDocument("doc") },
  {
    name: "GroundX document delete",
    client: "configured",
    method: "delete",
    url: "/api/v1/ingest/document/doc",
    call: () => deleteGroundXDocument("doc"),
  },
  {
    name: "GroundX document extract",
    client: "configured",
    method: "get",
    url: "/api/v1/ingest/document/extract/doc",
    call: () => getGroundXDocumentExtract("doc"),
  },
  {
    name: "GroundX document xray",
    client: "configured",
    method: "get",
    url: "/api/v1/ingest/document/xray/doc",
    call: () => getGroundXDocumentXray("doc"),
  },
  { name: "GroundX ingest status", client: "configured", method: "get", url: "/api/v1/ingest/proc", call: () => getGroundXProcessingStatus("proc") },
  { name: "GroundX ingest cancel", client: "configured", method: "delete", url: "/api/v1/ingest/proc", call: () => cancelGroundXProcess("proc") },
  { name: "GroundX process list", client: "configured", method: "get", url: "/api/v1/ingest", call: () => listGroundXProcesses() },
  { name: "GroundX group list", client: "configured", method: "get", url: "/api/v1/group", call: () => listGroundXGroups() },
  { name: "GroundX group create", client: "configured", method: "post", url: "/api/v1/group", call: () => createGroundXGroup({ name: "docs" }) },
  { name: "GroundX group get", client: "configured", method: "get", url: "/api/v1/group/7", call: () => getGroundXGroup(7) },
  { name: "GroundX group update", client: "configured", method: "put", url: "/api/v1/group/7", call: () => updateGroundXGroup(7, "renamed") },
  { name: "GroundX group delete", client: "configured", method: "delete", url: "/api/v1/group/7", call: () => deleteGroundXGroup(7) },
  {
    name: "GroundX group add bucket",
    client: "configured",
    method: "post",
    url: "/api/v1/group/7/bucket/8",
    call: () => addBucketToGroundXGroup(7, 8),
  },
  {
    name: "GroundX group remove bucket",
    client: "configured",
    method: "delete",
    url: "/api/v1/group/7/bucket/8",
    call: () => removeBucketFromGroundXGroup(7, 8),
  },
  { name: "GroundX health list", client: "configured", method: "get", url: "/api/v1/health", call: () => listGroundXHealth() },
  { name: "GroundX health service", client: "configured", method: "get", url: "/api/v1/health/search", call: () => getGroundXServiceHealth("search") },
  { name: "GroundX search content", client: "configured", method: "post", url: "/api/v1/search/7", call: () => searchGroundXContent({ id: 7, query: "hello" }) },
  {
    name: "GroundX search documents",
    client: "configured",
    method: "post",
    url: "/api/v1/search/documents",
    call: () => searchGroundXDocuments({ documentIds: ["doc"], query: "hello" }),
  },
  { name: "GroundX workflow list", client: "configured", method: "get", url: "/api/v1/workflow", call: () => listGroundXWorkflows() },
  { name: "GroundX workflow create", client: "configured", method: "post", url: "/api/v1/workflow", call: () => createGroundXWorkflow({ name: "wf" }) },
  { name: "GroundX workflow get", client: "configured", method: "get", url: "/api/v1/workflow/wf", call: () => getGroundXWorkflow("wf") },
  { name: "GroundX workflow update", client: "configured", method: "put", url: "/api/v1/workflow/wf", call: () => updateGroundXWorkflow("wf", { name: "wf2" }) },
  { name: "GroundX workflow delete", client: "configured", method: "delete", url: "/api/v1/workflow/wf", call: () => deleteGroundXWorkflow("wf") },
  {
    name: "GroundX account workflow get",
    client: "configured",
    method: "get",
    url: "/api/v1/workflow/relationship",
    call: () => getGroundXAccountWorkflow(),
  },
  {
    name: "GroundX account workflow assign",
    client: "configured",
    method: "post",
    url: "/api/v1/workflow/relationship",
    call: () => assignGroundXAccountWorkflow({ workflowId: "wf" }),
  },
  {
    name: "GroundX account workflow remove",
    client: "configured",
    method: "delete",
    url: "/api/v1/workflow/relationship",
    call: () => removeGroundXAccountWorkflow(),
  },
  {
    name: "GroundX resource workflow assign",
    client: "configured",
    method: "post",
    url: "/api/v1/workflow/relationship/7",
    call: () => assignGroundXWorkflowToResource(7, { workflowId: "wf" }),
  },
  {
    name: "GroundX resource workflow remove",
    client: "configured",
    method: "delete",
    url: "/api/v1/workflow/relationship/7",
    call: () => removeGroundXWorkflowFromResource(7),
  },
  { name: "Partner API key list", client: "configured", method: "get", url: "/api/apikey", call: () => listPartnerApiKeys() },
  { name: "Partner API key create", client: "configured", method: "post", url: "/api/apikey", call: () => createPartnerApiKey("app") },
  {
    name: "Partner API key rename",
    client: "configured",
    method: "put",
    url: "/api/apikey/partner-key",
    call: () => renamePartnerApiKey("partner-key", "renamed"),
  },
  {
    name: "Partner API key delete",
    client: "configured",
    method: "delete",
    url: "/api/apikey/partner-key",
    call: () => deletePartnerApiKey("partner-key"),
  },
  { name: "Partner bucket list", client: "configured", method: "get", url: "/api/bucket", call: () => listPartnerBuckets() },
  { name: "Partner bucket create", client: "configured", method: "post", url: "/api/bucket", call: () => createPartnerBucket({ name: "docs" }) },
  { name: "Partner bucket get", client: "configured", method: "get", url: "/api/bucket/7", call: () => getPartnerBucket(7) },
  { name: "Partner bucket update", client: "configured", method: "put", url: "/api/bucket/7", call: () => updatePartnerBucket(7, { name: "renamed" }) },
  { name: "Partner bucket delete", client: "configured", method: "delete", url: "/api/bucket/7", call: () => deletePartnerBucket(7) },
  { name: "Partner bucket transfer", client: "configured", method: "post", url: "/api/bucket/transfer/7", call: () => transferPartnerBucket(7) },
  {
    name: "Partner customer register",
    client: "raw",
    method: "post",
    url: "/api/auth/register",
    call: () => registerPartnerCustomer({ email: "pat@example.com", password: "secret" }, { first: "Pat" }),
  },
  {
    name: "Partner customer login",
    client: "raw",
    method: "post",
    url: "/api/auth/login",
    call: () => loginPartnerCustomer({ email: "pat@example.com", password: "secret" }),
  },
  { name: "Partner customer get", client: "configured", method: "get", url: "/api/customer/gx-user", call: () => getPartnerCustomer("gx-user") },
  {
    name: "Partner customer delete",
    client: "configured",
    method: "delete",
    url: "/api/customer/gx-user",
    call: () => deletePartnerCustomer("gx-user"),
  },
  {
    name: "Partner customer password reset",
    client: "raw",
    method: "post",
    url: "/api/auth/password/reset",
    call: () => resetPartnerCustomerPassword("pat@example.com"),
  },
  {
    name: "Partner customer password confirm",
    client: "raw",
    method: "post",
    url: "/api/auth/password/confirm",
    call: () => confirmPartnerCustomerPassword({ email: "pat@example.com", password: "secret", code: "123456" }),
  },
  { name: "Partner group list", client: "configured", method: "get", url: "/api/group", call: () => listPartnerGroups() },
  { name: "Partner group create", client: "configured", method: "post", url: "/api/group", call: () => createPartnerGroup({ name: "docs" }) },
  { name: "Partner group get", client: "configured", method: "get", url: "/api/group/7", call: () => getPartnerGroup(7) },
  { name: "Partner group update", client: "configured", method: "put", url: "/api/group/7", call: () => updatePartnerGroup(7, { name: "renamed" }) },
  { name: "Partner group delete", client: "configured", method: "delete", url: "/api/group/7", call: () => deletePartnerGroup(7) },
  { name: "Partner project list", client: "configured", method: "get", url: "/api/project", call: () => listPartnerProjects() },
  {
    name: "Partner project create",
    client: "configured",
    method: "post",
    url: "/api/project",
    call: () => createPartnerProject({ project: { name: "app" }, bucket: { name: "docs" } }),
  },
  {
    name: "Partner project update",
    client: "configured",
    method: "put",
    url: "/api/project/7",
    call: () => updatePartnerProject(7, { name: "renamed" }),
  },
  {
    name: "Partner project attach bucket",
    client: "configured",
    method: "post",
    url: "/api/project/kit/7",
    call: () => attachBucketToPartnerProject(7, 8),
  },
  {
    name: "Partner project detach bucket",
    client: "configured",
    method: "delete",
    url: "/api/project/kit/7",
    call: () => detachBucketFromPartnerProject(7, 8),
  },
];

describe("frontend SDK to middleware route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(axiosMocks.configured) as Method[]) {
      axiosMocks.configured[method].mockResolvedValue({ data: {} });
    }
    axiosMocks.raw.post.mockResolvedValue({ data: {}, headers: {} });
  });

  it.each(cases)("$name calls $method $url", async ({ call, client, method, url }) => {
    await call();

    const calls = axiosMocks[client][method].mock.calls;
    expect(calls[calls.length - 1]?.[0]).toBe(url);
  });
});
