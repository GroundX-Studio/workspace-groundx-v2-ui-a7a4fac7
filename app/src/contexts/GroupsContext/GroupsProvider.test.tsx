import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/contexts/ApiContext";
import { useGroupsContext } from "@/contexts/GroupsContext";
import { GroupsProvider } from "@/contexts/GroupsContext/GroupsProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import {
  MessageBarProvider,
  useMessageContext,
} from "@/contexts/MessageBarContext/MessageBarContext";
import { makeFakeApi } from "@/test/makeFakeApi";

/**
 * TS-02 — GroupsProvider coverage. Wraps injected `api.groundxGroups.*` +
 * `api.partnerGroups.*` calls in `run()`. Three contracts: list
 * populates state, create prepends + emits success, error path
 * surfaces "Group operation failed."
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
        <GroupsProvider>{children}</GroupsProvider>
      </MessageBarProvider>
    </LoadingProvider>
  </ApiProvider>
);

describe("GroupsProvider (TS-02)", () => {
  it("listGroundXGroups populates `groundxGroups` state on success", async () => {
    const fake = [{ groupId: 1, name: "g-one" }, { groupId: 2, name: "g-two" }];
    vi.mocked(api.groundxGroups.listGroundXGroups).mockResolvedValue({ groups: fake });

    const { result } = renderHook(() => useGroupsContext(), { wrapper });
    let actionResult: unknown;
    await act(async () => {
      actionResult = await result.current.listGroundXGroups();
    });

    expect(api.groundxGroups.listGroundXGroups).toHaveBeenCalledTimes(1);
    expect((actionResult as { isSuccess: boolean }).isSuccess).toBe(true);
    expect(result.current.groundxGroups).toEqual(fake);
  });

  it("createGroundXGroup prepends + emits 'Group created.'", async () => {
    vi.mocked(api.groundxGroups.listGroundXGroups).mockResolvedValue({
      groups: [{ groupId: 1, name: "old" }],
    });
    vi.mocked(api.groundxGroups.createGroundXGroup).mockResolvedValue({
      group: { groupId: 9, name: "new" },
    });

    const { result } = renderHook(
      () => ({ groups: useGroupsContext(), msg: useMessageContext() }),
      { wrapper },
    );

    await act(async () => {
      await result.current.groups.listGroundXGroups();
    });
    await act(async () => {
      await result.current.groups.createGroundXGroup({ name: "new" });
    });

    expect(result.current.groups.groundxGroups[0]).toEqual({ groupId: 9, name: "new" });
    expect(result.current.groups.groundxGroups).toHaveLength(2);
    expect(result.current.msg.successMessage).toBe("Group created.");
  });

  it("a thrown API error surfaces 'Group operation failed.' and isSuccess=false", async () => {
    vi.mocked(api.groundxGroups.listGroundXGroups).mockRejectedValue(new Error("kaboom"));

    const { result } = renderHook(
      () => ({ groups: useGroupsContext(), msg: useMessageContext() }),
      { wrapper },
    );

    let actionResult: { isSuccess: boolean; response?: unknown; error?: unknown } | undefined;
    await act(async () => {
      actionResult = await result.current.groups.listGroundXGroups();
    });

    expect(actionResult?.isSuccess).toBe(false);
    expect(actionResult?.error).toBeInstanceOf(Error);
    await waitFor(() => {
      expect(result.current.msg.errorMessage).toBe("Group operation failed.");
    });
    expect(result.current.groups.groundxGroups).toEqual([]);
  });
});
