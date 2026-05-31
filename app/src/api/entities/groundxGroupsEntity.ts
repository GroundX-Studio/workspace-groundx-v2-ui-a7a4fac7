import axios from "@/api/axios";
import {
  RequestOptions,
  MessageResponse,
  PaginationParams,
  groundxRequestConfig,
  groundxUrl,
  paramsWithPagination,
} from "@/api/common";

import { Group } from "./sdkTypes";

export interface GroupResponse {
  group: Group;
}

export interface GroupsResponse {
  groups: Group[];
  count?: number;
  total?: number;
  remaining?: number;
  nextToken?: string;
}

export interface CreateGroundXGroupInput {
  name: string;
  bucketName?: string;
}

export const listGroundXGroups = async (
  params?: PaginationParams,
  options?: RequestOptions
): Promise<GroupsResponse> => {
  const response = await axios.get<GroupsResponse>(groundxUrl("/v1/group"), {
    ...groundxRequestConfig(options),
    params: paramsWithPagination(params),
  });
  return response.data;
};

export const createGroundXGroup = async (
  input: CreateGroundXGroupInput,
  options?: RequestOptions
): Promise<GroupResponse> => {
  const response = await axios.post<GroupResponse>(groundxUrl("/v1/group"), input, groundxRequestConfig(options));
  return response.data;
};

export const getGroundXGroup = async (groupId: number, options?: RequestOptions): Promise<GroupResponse> => {
  const response = await axios.get<GroupResponse>(groundxUrl(`/v1/group/${groupId}`), groundxRequestConfig(options));
  return response.data;
};

export const updateGroundXGroup = async (
  groupId: number,
  newName: string,
  options?: RequestOptions
): Promise<GroupResponse> => {
  const response = await axios.put<GroupResponse>(
    groundxUrl(`/v1/group/${groupId}`),
    { newName },
    groundxRequestConfig(options)
  );
  return response.data;
};

export const deleteGroundXGroup = async (groupId: number, options?: RequestOptions): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(groundxUrl(`/v1/group/${groupId}`), groundxRequestConfig(options));
  return response.data;
};

export const addBucketToGroundXGroup = async (
  groupId: number,
  bucketId: number,
  options?: RequestOptions
): Promise<MessageResponse> => {
  const response = await axios.post<MessageResponse>(
    groundxUrl(`/v1/group/${groupId}/bucket/${bucketId}`),
    undefined,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const removeBucketFromGroundXGroup = async (
  groupId: number,
  bucketId: number,
  options?: RequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(
    groundxUrl(`/v1/group/${groupId}/bucket/${bucketId}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

