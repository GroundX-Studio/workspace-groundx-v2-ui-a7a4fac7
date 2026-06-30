import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/contexts/ApiContext";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import {
  MessageBarProvider,
  useMessageContext,
} from "@/contexts/MessageBarContext/MessageBarContext";
import { useProjectsContext } from "@/contexts/ProjectsContext";
import { ProjectsProvider } from "@/contexts/ProjectsContext/ProjectsProvider";
import { makeFakeApi } from "@/test/makeFakeApi";

/**
 * TS-02 — ProjectsProvider coverage. Wraps injected `api.partnerProjects.*`
 * calls in the shared `run()` helper. Three contracts: list
 * populates state, create prepends + emits success, error path
 * surfaces the failure copy.
 */
let api: ReturnType<typeof makeFakeApi>;

beforeEach(() => {
  api = makeFakeApi();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ApiProvider value={api}>
    <LoadingProvider>
      <MessageBarProvider>
        <ProjectsProvider>{children}</ProjectsProvider>
      </MessageBarProvider>
    </LoadingProvider>
  </ApiProvider>
);

const combinedWrapper = (children: React.ReactNode) => (
  <ApiProvider value={api}>
    <LoadingProvider>
      <MessageBarProvider>
        <ProjectsProvider>{children}</ProjectsProvider>
      </MessageBarProvider>
    </LoadingProvider>
  </ApiProvider>
);

describe("ProjectsProvider (TS-02)", () => {
  it("listProjects populates `projects` state on success", async () => {
    const fake = [{ projectId: 1, name: "p-one" }, { projectId: 2, name: "p-two" }];
    vi.mocked(api.partnerProjects.listPartnerProjects).mockResolvedValue({ projects: fake });

    const { result } = renderHook(() => useProjectsContext(), { wrapper });
    let actionResult: unknown;
    await act(async () => {
      actionResult = await result.current.listProjects();
    });

    expect(api.partnerProjects.listPartnerProjects).toHaveBeenCalledTimes(1);
    expect((actionResult as { isSuccess: boolean }).isSuccess).toBe(true);
    expect(result.current.projects).toEqual(fake);
  });

  it("createProject prepends + emits the 'Project created.' success message", async () => {
    vi.mocked(api.partnerProjects.listPartnerProjects).mockResolvedValue({
      projects: [{ projectId: 1, name: "old" }],
    });
    vi.mocked(api.partnerProjects.createPartnerProject).mockResolvedValue({
      project: { projectId: 9, name: "fresh" },
    });

    const { result } = renderHook(
      () => ({ projects: useProjectsContext(), msg: useMessageContext() }),
      { wrapper: ({ children }) => combinedWrapper(children) },
    );

    await act(async () => {
      await result.current.projects.listProjects();
    });
    await act(async () => {
      await result.current.projects.createProject({ project: { name: "fresh" } });
    });

    expect(result.current.projects.projects[0]).toEqual({ projectId: 9, name: "fresh" });
    expect(result.current.projects.projects).toHaveLength(2);
    expect(result.current.msg.successMessage).toBe("Project created.");
  });

  it("a thrown API error surfaces 'Project operation failed.' and isSuccess=false", async () => {
    vi.mocked(api.partnerProjects.listPartnerProjects).mockRejectedValue(new Error("upstream 500"));

    const { result } = renderHook(
      () => ({ projects: useProjectsContext(), msg: useMessageContext() }),
      { wrapper: ({ children }) => combinedWrapper(children) },
    );

    let actionResult: { isSuccess: boolean; response?: unknown; error?: unknown } | undefined;
    await act(async () => {
      actionResult = await result.current.projects.listProjects();
    });

    expect(actionResult?.isSuccess).toBe(false);
    expect(actionResult?.error).toBeInstanceOf(Error);
    await waitFor(() => {
      expect(result.current.msg.errorMessage).toBe("Project operation failed.");
    });
    expect(result.current.projects.projects).toEqual([]);
  });
});
