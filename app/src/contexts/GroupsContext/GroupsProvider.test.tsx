import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api } from "@/api";
import { useGroupsContext } from "@/contexts/GroupsContext";
import { GroupsProvider } from "@/contexts/GroupsContext/GroupsProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import {
  MessageBarProvider,
  useMessageContext,
} from "@/contexts/MessageBarContext/MessageBarContext";

/**
 * TS-02 — GroupsProvider coverage. Wraps `api.groundxGroups.*` +
 * `api.partnerGroups.*` calls in `run()`. Three contracts: list
 * populates state, create prepends + emits success, error path
 * surfaces "Group operation failed."
 */
vi.mock("@/api", () => ({
  api: {
    groundxGroups: {
      listGroundXGroups: vi.fn(),
      getGroundXGroup: vi.fn(),
      createGroundXGroup: vi.fn(),
      updateGroundXGroup: vi.fn(),
      deleteGroundXGroup: vi.fn(),
      addBucketToGroundXGroup: vi.fn(),
      removeBucketFromGroundXGroup: vi.fn(),
    },
    partnerGroups: {
      listPartnerGroups: vi.fn(),
      getPartnerGroup: vi.fn(),
      createPartnerGroup: vi.fn(),
      updatePartnerGroup: vi.fn(),
      deletePartnerGroup: vi.fn(),
    },
  },
}));

beforeEach(() => {
  for (const fn of Object.values(api.groundxGroups)) (fn as Mock).mockReset();
  for (const fn of Object.values(api.partnerGroups)) (fn as Mock).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LoadingProvider>
    <MessageBarProvider>
      <GroupsProvider>{children}</GroupsProvider>
    </MessageBarProvider>
  </LoadingProvider>
);

describe("GroupsProvider (TS-02)", () => {
  it("listGroundXGroups populates `groundxGroups` state on success", async () => {
    const fake = [{ groupId: 1, name: "g-one" }, { groupId: 2, name: "g-two" }];
    (api.groundxGroups.listGroundXGroups as Mock).mockResolvedValue({ groups: fake });

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
    (api.groundxGroups.listGroundXGroups as Mock).mockResolvedValue({
      groups: [{ groupId: 1, name: "old" }],
    });
    (api.groundxGroups.createGroundXGroup as Mock).mockResolvedValue({
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
    (api.groundxGroups.listGroundXGroups as Mock).mockRejectedValue(new Error("kaboom"));

    const { result } = renderHook(
      () => ({ groups: useGroupsContext(), msg: useMessageContext() }),
      { wrapper },
    );

    let actionResult: { isSuccess: boolean; error: unknown } | undefined;
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
