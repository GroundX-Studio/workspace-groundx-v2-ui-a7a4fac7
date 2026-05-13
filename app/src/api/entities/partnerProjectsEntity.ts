import axios from "@/api/axios";
import { MessageResponse, PartnerRequestOptions, partnerRequestConfig, partnerUrl } from "@/api/common";

import { Bucket, Project } from "./sdkTypes";

export interface PartnerProjectInput {
  name: string;
  preProcessors?: number[];
  postProcessors?: number[];
  customerProjectId?: string;
}

export interface PartnerProjectCreateInput {
  project: PartnerProjectInput;
  bucket?: {
    name: string;
    preProcessors?: number[];
    postProcessors?: number[];
  };
}

export interface PartnerProjectResponse {
  project: Project;
  bucket?: Bucket;
}

export interface PartnerProjectsResponse {
  projects: Project[];
}

export const listPartnerProjects = async (options?: PartnerRequestOptions): Promise<PartnerProjectsResponse> => {
  const response = await axios.get<PartnerProjectsResponse>(partnerUrl("/project"), partnerRequestConfig(options));
  return response.data;
};

export const createPartnerProject = async (
  input: PartnerProjectCreateInput,
  options?: PartnerRequestOptions
): Promise<PartnerProjectResponse> => {
  const response = await axios.post<PartnerProjectResponse>(partnerUrl("/project"), input, partnerRequestConfig(options));
  return response.data;
};

export const updatePartnerProject = async (
  projectId: number,
  project: PartnerProjectInput,
  options?: PartnerRequestOptions
): Promise<MessageResponse> => {
  const response = await axios.put<MessageResponse>(
    partnerUrl(`/project/${projectId}`),
    { project },
    partnerRequestConfig(options)
  );
  return response.data;
};

export const attachBucketToPartnerProject = async (
  projectId: number,
  bucketId: number,
  options?: PartnerRequestOptions
): Promise<MessageResponse> => {
  const response = await axios.post<MessageResponse>(
    partnerUrl(`/project/kit/${projectId}`),
    { project: { bucketId } },
    partnerRequestConfig(options)
  );
  return response.data;
};

export const detachBucketFromPartnerProject = async (
  projectId: number,
  bucketId: number,
  options?: PartnerRequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(partnerUrl(`/project/kit/${projectId}`), {
    ...partnerRequestConfig(options),
    data: { project: { bucketId } },
  });
  return response.data;
};

