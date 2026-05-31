import axios from "@/api/axios";
import { MessageResponse, RequestOptions, partnerRequestConfig, partnerUrl } from "@/api/common";

import { Group } from "./sdkTypes";

export interface PartnerGroupInput {
  name: string;
  preProcessors?: number[];
  postProcessors?: number[];
}

export interface PartnerGroupResponse {
  group: Group;
}

export interface PartnerGroupsResponse {
  groups: Group[];
}

export const listPartnerGroups = async (options?: RequestOptions): Promise<PartnerGroupsResponse> => {
  const response = await axios.get<PartnerGroupsResponse>(partnerUrl("/group"), partnerRequestConfig(options));
  return response.data;
};

export const createPartnerGroup = async (
  group: PartnerGroupInput,
  options?: RequestOptions
): Promise<PartnerGroupResponse> => {
  const response = await axios.post<PartnerGroupResponse>(partnerUrl("/group"), { group }, partnerRequestConfig(options));
  return response.data;
};

export const getPartnerGroup = async (groupId: number, options?: RequestOptions): Promise<PartnerGroupResponse> => {
  const response = await axios.get<PartnerGroupResponse>(partnerUrl(`/group/${groupId}`), partnerRequestConfig(options));
  return response.data;
};

export const updatePartnerGroup = async (
  groupId: number,
  group: PartnerGroupInput,
  options?: RequestOptions
): Promise<MessageResponse> => {
  const response = await axios.put<MessageResponse>(partnerUrl(`/group/${groupId}`), { group }, partnerRequestConfig(options));
  return response.data;
};

export const deletePartnerGroup = async (groupId: number, options?: RequestOptions): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(partnerUrl(`/group/${groupId}`), partnerRequestConfig(options));
  return response.data;
};

