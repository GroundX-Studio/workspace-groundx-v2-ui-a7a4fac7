import { FC, ReactNode, useCallback, useState } from "react";

import { api } from "@/api";
import { GroundXRequestOptions, PaginationParams, PartnerRequestOptions } from "@/api/common";
import { CreateGroundXGroupInput } from "@/api/entities/groundxGroupsEntity";
import { PartnerGroupInput } from "@/api/entities/partnerGroupsEntity";
import { Group } from "@/api/entities/sdkTypes";
import { useIsLoading } from "@/contexts/LoadingContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { createSdkResult } from "@/contexts/sdkContextTypes";

import { GroupsContext } from "./GroupsContext";

export const GroupsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { setIsLoading } = useIsLoading();
  const { setErrorMessage, setSuccessMessage } = useMessageContext();
  const [groundxGroups, setGroundXGroups] = useState<Group[]>([]);
  const [partnerGroups, setPartnerGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  const run = useCallback(
    async <T,>(work: () => Promise<T>, successMessage?: string) => {
      const result = createSdkResult<T>();
      setIsLoading(true);
      try {
        result.response = await work();
        result.isSuccess = true;
        if (successMessage) setSuccessMessage(successMessage);
      } catch (error) {
        result.error = error;
        setErrorMessage("Group operation failed.");
      } finally {
        setIsLoading(false);
      }
      return result;
    },
    [setErrorMessage, setIsLoading, setSuccessMessage]
  );

  const listGroundXGroups = useCallback(
    (params?: PaginationParams, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxGroups.listGroundXGroups(params, options);
        setGroundXGroups(response.groups);
        return response.groups;
      }),
    [run]
  );

  const createGroundXGroup = useCallback(
    (input: CreateGroundXGroupInput, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxGroups.createGroundXGroup(input, options);
        setGroundXGroups((groups) => [response.group, ...groups]);
        return response.group;
      }, "Group created."),
    [run]
  );

  const getGroundXGroup = useCallback(
    (groupId: number, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxGroups.getGroundXGroup(groupId, options);
        setSelectedGroup(response.group);
        return response.group;
      }),
    [run]
  );

  const updateGroundXGroup = useCallback(
    (groupId: number, name: string, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxGroups.updateGroundXGroup(groupId, name, options);
        setGroundXGroups((groups) => groups.map((group) => (group.groupId === groupId ? response.group : group)));
        setSelectedGroup(response.group);
        return response.group;
      }, "Group updated."),
    [run]
  );

  const deleteGroundXGroup = useCallback(
    (groupId: number, options?: GroundXRequestOptions) =>
      run(async () => {
        await api.groundxGroups.deleteGroundXGroup(groupId, options);
        setGroundXGroups((groups) => groups.filter((group) => group.groupId !== groupId));
        setSelectedGroup((group) => (group?.groupId === groupId ? null : group));
      }, "Group deleted."),
    [run]
  );

  const addBucketToGroundXGroup = useCallback(
    (groupId: number, bucketId: number, options?: GroundXRequestOptions) =>
      run(async () => {
        await api.groundxGroups.addBucketToGroundXGroup(groupId, bucketId, options);
      }, "Bucket added to group."),
    [run]
  );

  const removeBucketFromGroundXGroup = useCallback(
    (groupId: number, bucketId: number, options?: GroundXRequestOptions) =>
      run(async () => {
        await api.groundxGroups.removeBucketFromGroundXGroup(groupId, bucketId, options);
      }, "Bucket removed from group."),
    [run]
  );

  const listPartnerGroups = useCallback(
    (options?: PartnerRequestOptions) =>
      run(async () => {
        const response = await api.partnerGroups.listPartnerGroups(options);
        setPartnerGroups(response.groups);
        return response.groups;
      }),
    [run]
  );

  const createPartnerGroup = useCallback(
    (group: PartnerGroupInput, options?: PartnerRequestOptions) =>
      run(async () => {
        const response = await api.partnerGroups.createPartnerGroup(group, options);
        setPartnerGroups((groups) => [response.group, ...groups]);
        return response.group;
      }, "Group created."),
    [run]
  );

  const getPartnerGroup = useCallback(
    (groupId: number, options?: PartnerRequestOptions) =>
      run(async () => {
        const response = await api.partnerGroups.getPartnerGroup(groupId, options);
        setSelectedGroup(response.group);
        return response.group;
      }),
    [run]
  );

  const updatePartnerGroup = useCallback(
    (groupId: number, group: PartnerGroupInput, options?: PartnerRequestOptions) =>
      run(async () => {
        await api.partnerGroups.updatePartnerGroup(groupId, group, options);
        setPartnerGroups((groups) => groups.map((item) => (item.groupId === groupId ? { ...item, ...group } : item)));
      }, "Group updated."),
    [run]
  );

  const deletePartnerGroup = useCallback(
    (groupId: number, options?: PartnerRequestOptions) =>
      run(async () => {
        await api.partnerGroups.deletePartnerGroup(groupId, options);
        setPartnerGroups((groups) => groups.filter((group) => group.groupId !== groupId));
      }, "Group deleted."),
    [run]
  );

  return (
    <GroupsContext.Provider
      value={{
        groundxGroups,
        partnerGroups,
        selectedGroup,
        listGroundXGroups,
        createGroundXGroup,
        getGroundXGroup,
        updateGroundXGroup,
        deleteGroundXGroup,
        addBucketToGroundXGroup,
        removeBucketFromGroundXGroup,
        listPartnerGroups,
        createPartnerGroup,
        getPartnerGroup,
        updatePartnerGroup,
        deletePartnerGroup,
      }}
    >
      {children}
    </GroupsContext.Provider>
  );
};

