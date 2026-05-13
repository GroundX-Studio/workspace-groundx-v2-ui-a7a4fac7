import { act, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const contextMocks = vi.hoisted(() => ({
  setIsLoading: vi.fn(),
  setErrorMessage: vi.fn(),
  setSuccessMessage: vi.fn(),
  api: {
    groundxApiKeys: {
      listGroundXApiKeys: vi.fn(),
      createGroundXApiKey: vi.fn(),
      renameGroundXApiKey: vi.fn(),
      deleteGroundXApiKey: vi.fn(),
    },
    partnerApiKeys: {
      listPartnerApiKeys: vi.fn(),
      createPartnerApiKey: vi.fn(),
      renamePartnerApiKey: vi.fn(),
      deletePartnerApiKey: vi.fn(),
    },
    groundxBuckets: {
      listGroundXBuckets: vi.fn(),
      getGroundXBucket: vi.fn(),
      createGroundXBucket: vi.fn(),
      updateGroundXBucket: vi.fn(),
      deleteGroundXBucket: vi.fn(),
    },
    groundxDocuments: {
      listGroundXDocuments: vi.fn(),
      ingestGroundXRemoteDocuments: vi.fn(),
      crawlGroundXWebsite: vi.fn(),
      copyGroundXDocuments: vi.fn(),
      updateGroundXDocuments: vi.fn(),
      deleteGroundXDocuments: vi.fn(),
      getGroundXDocument: vi.fn(),
      lookupGroundXDocument: vi.fn(),
      deleteGroundXDocument: vi.fn(),
      getGroundXProcessingStatus: vi.fn(),
      cancelGroundXProcess: vi.fn(),
      listGroundXProcesses: vi.fn(),
    },
    groundxGroups: {
      listGroundXGroups: vi.fn(),
      createGroundXGroup: vi.fn(),
      getGroundXGroup: vi.fn(),
      updateGroundXGroup: vi.fn(),
      deleteGroundXGroup: vi.fn(),
      addBucketToGroundXGroup: vi.fn(),
      removeBucketFromGroundXGroup: vi.fn(),
    },
    groundxSearch: {
      searchGroundXContent: vi.fn(),
      searchGroundXDocuments: vi.fn(),
    },
    groundxWorkflows: {
      listGroundXWorkflows: vi.fn(),
      createGroundXWorkflow: vi.fn(),
      getGroundXWorkflow: vi.fn(),
      updateGroundXWorkflow: vi.fn(),
      deleteGroundXWorkflow: vi.fn(),
      getGroundXAccountWorkflow: vi.fn(),
      assignGroundXAccountWorkflow: vi.fn(),
      removeGroundXAccountWorkflow: vi.fn(),
      assignGroundXWorkflowToResource: vi.fn(),
      removeGroundXWorkflowFromResource: vi.fn(),
    },
    groundxHealth: {
      listGroundXHealth: vi.fn(),
      getGroundXServiceHealth: vi.fn(),
    },
    partnerBuckets: {
      listPartnerBuckets: vi.fn(),
      getPartnerBucket: vi.fn(),
      createPartnerBucket: vi.fn(),
      updatePartnerBucket: vi.fn(),
      deletePartnerBucket: vi.fn(),
    },
    partnerGroups: {
      listPartnerGroups: vi.fn(),
      createPartnerGroup: vi.fn(),
      getPartnerGroup: vi.fn(),
      updatePartnerGroup: vi.fn(),
      deletePartnerGroup: vi.fn(),
    },
    partnerProjects: {
      listPartnerProjects: vi.fn(),
      createPartnerProject: vi.fn(),
      updatePartnerProject: vi.fn(),
      attachBucketToPartnerProject: vi.fn(),
      detachBucketFromPartnerProject: vi.fn(),
    },
  },
}));

vi.mock("@/api", () => ({ api: contextMocks.api }));
vi.mock("@/contexts/LoadingContext", () => ({
  useIsLoading: () => ({ setIsLoading: contextMocks.setIsLoading }),
}));
vi.mock("@/contexts/MessageBarContext", () => ({
  useMessageContext: () => ({
    setErrorMessage: contextMocks.setErrorMessage,
    setSuccessMessage: contextMocks.setSuccessMessage,
  }),
}));

import { ApiKeysProvider, useApiKeysContext } from "./ApiKeysContext";
import { BucketsProvider, useBucketsContext } from "./BucketsContext";
import { DocumentsProvider, useDocumentsContext } from "./DocumentsContext";
import { GroupsProvider, useGroupsContext } from "./GroupsContext";
import { HealthProvider, useHealthContext } from "./HealthContext";
import { ProjectsProvider, useProjectsContext } from "./ProjectsContext";
import { SearchProvider, useSearchContext } from "./SearchContext";
import { WorkflowsProvider, useWorkflowsContext } from "./WorkflowsContext";

const wrapper = (Provider: React.FC<{ children: ReactNode }>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <Provider>{children}</Provider>;
  };

describe("SDK contexts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws helpful errors when SDK hooks are used outside providers", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      expect(() => renderHook(() => useApiKeysContext()).result.current).toThrow(/ApiKeysProvider/);
      expect(() => renderHook(() => useBucketsContext()).result.current).toThrow(/BucketsProvider/);
      expect(() => renderHook(() => useDocumentsContext()).result.current).toThrow(/DocumentsProvider/);
      expect(() => renderHook(() => useGroupsContext()).result.current).toThrow(/GroupsProvider/);
      expect(() => renderHook(() => useProjectsContext()).result.current).toThrow(/ProjectsProvider/);
      expect(() => renderHook(() => useSearchContext()).result.current).toThrow(/SearchProvider/);
      expect(() => renderHook(() => useWorkflowsContext()).result.current).toThrow(/WorkflowsProvider/);
      expect(() => renderHook(() => useHealthContext()).result.current).toThrow(/HealthProvider/);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("ApiKeysProvider updates state and clears loading on success", async () => {
    contextMocks.api.groundxApiKeys.listGroundXApiKeys.mockResolvedValue({
      apiKeys: [{ apiKey: "gx", name: "GroundX" }],
    });

    const { result } = renderHook(() => useApiKeysContext(), { wrapper: wrapper(ApiKeysProvider) });

    await act(async () => {
      await result.current.listGroundXApiKeys();
    });

    await waitFor(() => expect(result.current.groundxApiKeys).toEqual([{ apiKey: "gx", name: "GroundX" }]));
    expect(contextMocks.setIsLoading).toHaveBeenNthCalledWith(1, true);
    expect(contextMocks.setIsLoading).toHaveBeenLastCalledWith(false);
  });

  it("ApiKeysProvider mutates both API-key families and removes deleted keys", async () => {
    contextMocks.api.groundxApiKeys.createGroundXApiKey.mockResolvedValue({
      apiKeys: [
        { apiKey: "gx-2", name: "Two" },
        { apiKey: "gx-1", name: "One" },
      ],
    });
    contextMocks.api.groundxApiKeys.renameGroundXApiKey.mockResolvedValue({
      apiKeys: [{ apiKey: "gx-2", name: "Renamed" }],
    });
    contextMocks.api.groundxApiKeys.deleteGroundXApiKey.mockResolvedValue({ message: "OK" });
    contextMocks.api.partnerApiKeys.createPartnerApiKey.mockResolvedValue({
      apiKeys: [{ apiKey: "partner-1", name: "Partner" }],
    });
    contextMocks.api.partnerApiKeys.deletePartnerApiKey.mockResolvedValue({ message: "OK" });

    const { result } = renderHook(() => useApiKeysContext(), { wrapper: wrapper(ApiKeysProvider) });

    await act(async () => {
      await result.current.createGroundXApiKey("Two");
      await result.current.renameGroundXApiKey("gx-2", "Renamed");
      await result.current.deleteGroundXApiKey("gx-2");
      await result.current.createPartnerApiKey("Partner");
      await result.current.deletePartnerApiKey("partner-1");
    });

    expect(result.current.groundxApiKeys).toEqual([]);
    expect(result.current.partnerApiKeys).toEqual([]);
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("API key created.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("API key renamed.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("API key deleted.");
  });

  it("BucketsProvider updates state for create and returns failed results on errors", async () => {
    contextMocks.api.groundxBuckets.createGroundXBucket.mockResolvedValue({
      bucket: { bucketId: 1, name: "Docs" },
    });
    const { result } = renderHook(() => useBucketsContext(), { wrapper: wrapper(BucketsProvider) });

    await act(async () => {
      await result.current.createGroundXBucket("Docs");
    });

    expect(result.current.groundxBuckets).toEqual([{ bucketId: 1, name: "Docs" }]);
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Bucket created.");

    contextMocks.api.groundxBuckets.listGroundXBuckets.mockRejectedValue(new Error("Nope"));
    let failedResult: unknown;
    await act(async () => {
      failedResult = await result.current.listGroundXBuckets();
    });

    expect(failedResult).toMatchObject({ isSuccess: false, response: null });
    expect(contextMocks.setErrorMessage).toHaveBeenCalledWith("Bucket operation failed.");
    expect(contextMocks.setIsLoading).toHaveBeenLastCalledWith(false);
  });

  it("BucketsProvider tracks selection and partner bucket mutations", async () => {
    contextMocks.api.groundxBuckets.listGroundXBuckets.mockResolvedValue({
      buckets: [{ bucketId: 1, name: "Docs" }],
    });
    contextMocks.api.groundxBuckets.getGroundXBucket.mockResolvedValue({
      bucket: { bucketId: 1, name: "Docs" },
    });
    contextMocks.api.groundxBuckets.updateGroundXBucket.mockResolvedValue({
      bucket: { bucketId: 1, name: "Contracts" },
    });
    contextMocks.api.groundxBuckets.deleteGroundXBucket.mockResolvedValue({ message: "OK" });
    contextMocks.api.partnerBuckets.createPartnerBucket.mockResolvedValue({
      bucket: { bucketId: 2, name: "Partner Docs" },
    });
    contextMocks.api.partnerBuckets.updatePartnerBucket.mockResolvedValue({ message: "OK" });
    contextMocks.api.partnerBuckets.deletePartnerBucket.mockResolvedValue({ message: "OK" });

    const { result } = renderHook(() => useBucketsContext(), { wrapper: wrapper(BucketsProvider) });

    await act(async () => {
      await result.current.listGroundXBuckets();
      await result.current.getGroundXBucket(1);
      await result.current.updateGroundXBucket(1, "Contracts");
      await result.current.createPartnerBucket({ name: "Partner Docs" });
      await result.current.updatePartnerBucket(2, { name: "Partner Contracts" });
      await result.current.deletePartnerBucket(2);
      await result.current.deleteGroundXBucket(1);
    });

    expect(result.current.groundxBuckets).toEqual([]);
    expect(result.current.partnerBuckets).toEqual([]);
    expect(result.current.selectedBucket).toBeNull();
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Bucket updated.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Bucket deleted.");
  });

  it("DocumentsProvider caches document lists and process lists", async () => {
    contextMocks.api.groundxDocuments.listGroundXDocuments.mockResolvedValue({
      documents: [{ documentId: "doc-1", fileName: "a.pdf" }],
    });
    contextMocks.api.groundxDocuments.listGroundXProcesses.mockResolvedValue({
      ingests: [{ processId: "proc-1", status: "queued" }],
    });
    const { result } = renderHook(() => useDocumentsContext(), { wrapper: wrapper(DocumentsProvider) });

    await act(async () => {
      await result.current.listDocuments();
      await result.current.listProcesses();
    });

    expect(result.current.documents).toEqual([{ documentId: "doc-1", fileName: "a.pdf" }]);
    expect(result.current.processes).toEqual([{ processId: "proc-1", status: "queued" }]);
  });

  it("DocumentsProvider handles ingest workflows, selection, deletes, and process actions", async () => {
    const ingest = { processId: "proc-1", status: "queued" };
    contextMocks.api.groundxDocuments.listGroundXDocuments.mockResolvedValue({
      documents: [
        { documentId: "doc-1", fileName: "a.pdf" },
        { documentId: "doc-2", fileName: "b.pdf" },
      ],
    });
    contextMocks.api.groundxDocuments.ingestGroundXRemoteDocuments.mockResolvedValue({ ingest });
    contextMocks.api.groundxDocuments.crawlGroundXWebsite.mockResolvedValue({ ingest });
    contextMocks.api.groundxDocuments.copyGroundXDocuments.mockResolvedValue({ ingest });
    contextMocks.api.groundxDocuments.updateGroundXDocuments.mockResolvedValue({ ingest });
    contextMocks.api.groundxDocuments.getGroundXDocument.mockResolvedValue({ document: { documentId: "doc-1", fileName: "a.pdf" } });
    contextMocks.api.groundxDocuments.lookupGroundXDocument.mockResolvedValue({ document: { documentId: "doc-2", fileName: "b.pdf" } });
    contextMocks.api.groundxDocuments.deleteGroundXDocuments.mockResolvedValue({ message: "OK" });
    contextMocks.api.groundxDocuments.deleteGroundXDocument.mockResolvedValue({ message: "OK" });
    contextMocks.api.groundxDocuments.getGroundXProcessingStatus.mockResolvedValue({ ingest });
    contextMocks.api.groundxDocuments.cancelGroundXProcess.mockResolvedValue({ message: "OK" });

    const { result } = renderHook(() => useDocumentsContext(), { wrapper: wrapper(DocumentsProvider) });

    await act(async () => {
      await result.current.listDocuments();
      await result.current.ingestRemoteDocuments({ documents: [{ bucketId: 1, sourceUrl: "https://example.com/a.pdf" }] });
      await result.current.crawlWebsite({ websites: [{ bucketId: 1, sourceUrl: "https://example.com" }] });
      await result.current.copyDocuments({ documentIds: ["doc-1"], bucketId: 2 });
      await result.current.updateDocuments({ documents: [{ documentId: "doc-1", filter: { type: "contract" } }] });
      await result.current.getDocument("doc-1");
      await result.current.lookupDocument("doc-2");
      await result.current.getProcessingStatus("proc-1");
      await result.current.cancelProcess("proc-1");
      await result.current.deleteDocuments({ documentIds: ["doc-1"] });
      await result.current.deleteDocument("doc-2");
    });

    expect(result.current.documents).toEqual([]);
    expect(result.current.selectedDocument).toBeNull();
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Ingest started.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Crawl started.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Copy started.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Documents updated.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Process cancelled.");
  });

  it("SearchProvider stores current query and clears search state", async () => {
    contextMocks.api.groundxSearch.searchGroundXContent.mockResolvedValue({
      search: { query: "status", results: [{ text: "ok" }] },
    });
    const { result } = renderHook(() => useSearchContext(), { wrapper: wrapper(SearchProvider) });

    await act(async () => {
      await result.current.searchContent({ id: 1, query: "status" });
    });

    expect(result.current.query).toBe("status");
    expect(result.current.search).toEqual({ query: "status", results: [{ text: "ok" }] });

    act(() => result.current.clearSearch());
    expect(result.current.query).toBe("");
    expect(result.current.search).toBeNull();
  });

  it("SearchProvider supports document search and preserves previous results when a search fails", async () => {
    contextMocks.api.groundxSearch.searchGroundXDocuments.mockResolvedValueOnce({
      search: { query: "invoice", results: [{ documentId: "doc-1" }] },
    });
    contextMocks.api.groundxSearch.searchGroundXDocuments.mockRejectedValueOnce(new Error("Search unavailable"));
    const { result } = renderHook(() => useSearchContext(), { wrapper: wrapper(SearchProvider) });

    let failedResult: unknown;
    await act(async () => {
      await result.current.searchDocuments({ documentIds: ["doc-1"], query: "invoice" });
      failedResult = await result.current.searchDocuments({ documentIds: ["doc-1"], query: "broken" });
    });

    expect(failedResult).toMatchObject({ isSuccess: false, response: null });
    expect(result.current.query).toBe("invoice");
    expect(result.current.search).toEqual({ query: "invoice", results: [{ documentId: "doc-1" }] });
    expect(contextMocks.setErrorMessage).toHaveBeenCalledWith("Search failed.");
    expect(contextMocks.setIsLoading).toHaveBeenLastCalledWith(false);
  });

  it("WorkflowsProvider, HealthProvider, ProjectsProvider, and GroupsProvider expose stateful workflows", async () => {
    contextMocks.api.groundxWorkflows.listGroundXWorkflows.mockResolvedValue({
      workflows: [{ workflowId: "wf", name: "Default" }],
    });
    contextMocks.api.groundxHealth.listGroundXHealth.mockResolvedValue({
      health: [{ service: "search", status: "ok" }],
    });
    contextMocks.api.partnerProjects.listPartnerProjects.mockResolvedValue({
      projects: [{ projectId: 1, name: "App" }],
    });
    contextMocks.api.groundxGroups.listGroundXGroups.mockResolvedValue({
      groups: [{ groupId: 1, name: "Legal" }],
    });

    const workflows = renderHook(() => useWorkflowsContext(), { wrapper: wrapper(WorkflowsProvider) });
    const health = renderHook(() => useHealthContext(), { wrapper: wrapper(HealthProvider) });
    const projects = renderHook(() => useProjectsContext(), { wrapper: wrapper(ProjectsProvider) });
    const groups = renderHook(() => useGroupsContext(), { wrapper: wrapper(GroupsProvider) });

    await act(async () => {
      await workflows.result.current.listWorkflows();
      await health.result.current.listHealth();
      await projects.result.current.listProjects();
      await groups.result.current.listGroundXGroups();
    });

    expect(workflows.result.current.workflows).toEqual([{ workflowId: "wf", name: "Default" }]);
    expect(health.result.current.services).toEqual([{ service: "search", status: "ok" }]);
    expect(projects.result.current.projects).toEqual([{ projectId: 1, name: "App" }]);
    expect(groups.result.current.groundxGroups).toEqual([{ groupId: 1, name: "Legal" }]);
  });

  it("GroupsProvider handles GroundX and Partner group mutations plus bucket membership actions", async () => {
    contextMocks.api.groundxGroups.createGroundXGroup.mockResolvedValue({ group: { groupId: 1, name: "Legal" } });
    contextMocks.api.groundxGroups.getGroundXGroup.mockResolvedValue({ group: { groupId: 1, name: "Legal" } });
    contextMocks.api.groundxGroups.updateGroundXGroup.mockResolvedValue({ group: { groupId: 1, name: "Contracts" } });
    contextMocks.api.groundxGroups.addBucketToGroundXGroup.mockResolvedValue({ message: "OK" });
    contextMocks.api.groundxGroups.removeBucketFromGroundXGroup.mockResolvedValue({ message: "OK" });
    contextMocks.api.groundxGroups.deleteGroundXGroup.mockResolvedValue({ message: "OK" });
    contextMocks.api.partnerGroups.createPartnerGroup.mockResolvedValue({ group: { groupId: 2, name: "Partner" } });
    contextMocks.api.partnerGroups.updatePartnerGroup.mockResolvedValue({ message: "OK" });
    contextMocks.api.partnerGroups.deletePartnerGroup.mockResolvedValue({ message: "OK" });

    const { result } = renderHook(() => useGroupsContext(), { wrapper: wrapper(GroupsProvider) });

    await act(async () => {
      await result.current.createGroundXGroup({ name: "Legal" });
      await result.current.getGroundXGroup(1);
      await result.current.updateGroundXGroup(1, "Contracts");
      await result.current.addBucketToGroundXGroup(1, 10);
      await result.current.removeBucketFromGroundXGroup(1, 10);
      await result.current.createPartnerGroup({ name: "Partner" });
      await result.current.updatePartnerGroup(2, { name: "Partner Contracts" });
      await result.current.deletePartnerGroup(2);
      await result.current.deleteGroundXGroup(1);
    });

    expect(result.current.groundxGroups).toEqual([]);
    expect(result.current.partnerGroups).toEqual([]);
    expect(result.current.selectedGroup).toBeNull();
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Bucket added to group.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Bucket removed from group.");
  });

  it("ProjectsProvider mutates project state and exposes bucket relationship actions", async () => {
    contextMocks.api.partnerProjects.createPartnerProject.mockResolvedValue({ project: { projectId: 1, name: "App" } });
    contextMocks.api.partnerProjects.updatePartnerProject.mockResolvedValue({ message: "OK" });
    contextMocks.api.partnerProjects.attachBucketToPartnerProject.mockResolvedValue({ message: "OK" });
    contextMocks.api.partnerProjects.detachBucketFromPartnerProject.mockResolvedValue({ message: "OK" });

    const { result } = renderHook(() => useProjectsContext(), { wrapper: wrapper(ProjectsProvider) });

    await act(async () => {
      await result.current.createProject({ project: { name: "App" } });
      await result.current.updateProject(1, { name: "Renamed" });
      await result.current.attachBucket(1, 2);
      await result.current.detachBucket(1, 2);
    });

    expect(result.current.projects).toEqual([{ projectId: 1, name: "Renamed" }]);
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Project created.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Project updated.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Bucket attached.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Bucket detached.");
  });

  it("HealthProvider stores selected services and reports failures", async () => {
    contextMocks.api.groundxHealth.getGroundXServiceHealth.mockResolvedValueOnce({
      health: { service: "ingest", status: "ok" },
    });
    contextMocks.api.groundxHealth.getGroundXServiceHealth.mockRejectedValueOnce(new Error("Unavailable"));

    const { result } = renderHook(() => useHealthContext(), { wrapper: wrapper(HealthProvider) });

    let failedResult: unknown;
    await act(async () => {
      await result.current.getServiceHealth("ingest");
      failedResult = await result.current.getServiceHealth("search");
    });

    expect(result.current.selectedService).toEqual({ service: "ingest", status: "ok" });
    expect(failedResult).toMatchObject({ isSuccess: false, response: null });
    expect(contextMocks.setErrorMessage).toHaveBeenCalledWith("Could not load service health.");
  });

  it("WorkflowsProvider mutates workflow state and account workflow relationships", async () => {
    contextMocks.api.groundxWorkflows.createGroundXWorkflow.mockResolvedValue({
      workflow: { workflowId: "wf-1", name: "Default" },
    });
    contextMocks.api.groundxWorkflows.getGroundXWorkflow.mockResolvedValue({
      workflow: { workflowId: "wf-1", name: "Default" },
    });
    contextMocks.api.groundxWorkflows.updateGroundXWorkflow.mockResolvedValue({
      workflow: { workflowId: "wf-1", name: "Updated" },
    });
    contextMocks.api.groundxWorkflows.assignGroundXAccountWorkflow.mockResolvedValue({
      workflow: { workflowId: "wf-1", name: "Updated" },
    });
    contextMocks.api.groundxWorkflows.getGroundXAccountWorkflow.mockResolvedValue({
      workflow: { workflowId: "wf-1", name: "Updated" },
    });
    contextMocks.api.groundxWorkflows.assignGroundXWorkflowToResource.mockResolvedValue({
      workflow: { workflowId: "wf-1", name: "Updated" },
    });
    contextMocks.api.groundxWorkflows.removeGroundXWorkflowFromResource.mockResolvedValue({ message: "OK" });
    contextMocks.api.groundxWorkflows.removeGroundXAccountWorkflow.mockResolvedValue({ message: "OK" });
    contextMocks.api.groundxWorkflows.deleteGroundXWorkflow.mockResolvedValue({ message: "OK" });

    const { result } = renderHook(() => useWorkflowsContext(), { wrapper: wrapper(WorkflowsProvider) });

    await act(async () => {
      await result.current.createWorkflow({ name: "Default" });
      await result.current.getWorkflow("wf-1");
      await result.current.updateWorkflow("wf-1", { name: "Updated" });
      await result.current.assignAccountWorkflow({ workflowId: "wf-1" });
      await result.current.getAccountWorkflow();
      await result.current.assignWorkflowToResource(99, { workflowId: "wf-1" });
      await result.current.removeWorkflowFromResource(99);
      await result.current.removeAccountWorkflow();
      await result.current.deleteWorkflow("wf-1");
    });

    expect(result.current.workflows).toEqual([]);
    expect(result.current.selectedWorkflow).toBeNull();
    expect(result.current.accountWorkflow).toBeNull();
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Workflow created.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Workflow assigned.");
    expect(contextMocks.setSuccessMessage).toHaveBeenCalledWith("Workflow removed.");
  });
});
