import axios from "@/api/axios";
import { RequestOptions, MessageResponse, Metadata, groundxRequestConfig, groundxUrl } from "@/api/common";

import { Workflow } from "./sdkTypes";

export interface WorkflowResponse {
  workflow: Workflow;
}

export interface WorkflowsResponse {
  workflows: Workflow[];
}

export interface WorkflowInput {
  name?: string;
  chunkStrategy?: "element" | "size" | string;
  sectionStrategy?: "chunks" | "page" | string;
  steps?: Metadata;
  extract?: Metadata;
}

export interface WorkflowRelationshipInput {
  workflowId: string;
}

export const listGroundXWorkflows = async (options?: RequestOptions): Promise<WorkflowsResponse> => {
  const response = await axios.get<WorkflowsResponse>(groundxUrl("/v1/workflow"), groundxRequestConfig(options));
  return response.data;
};

export const createGroundXWorkflow = async (
  input: WorkflowInput,
  options?: RequestOptions
): Promise<WorkflowResponse> => {
  const response = await axios.post<WorkflowResponse>(groundxUrl("/v1/workflow"), input, groundxRequestConfig(options));
  return response.data;
};

export const getGroundXWorkflow = async (id: string | number, options?: RequestOptions): Promise<WorkflowResponse> => {
  const response = await axios.get<WorkflowResponse>(
    groundxUrl(`/v1/workflow/${encodeURIComponent(String(id))}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const updateGroundXWorkflow = async (
  id: string | number,
  input: WorkflowInput,
  options?: RequestOptions
): Promise<WorkflowResponse> => {
  const response = await axios.put<WorkflowResponse>(
    groundxUrl(`/v1/workflow/${encodeURIComponent(String(id))}`),
    input,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const deleteGroundXWorkflow = async (
  id: string | number,
  options?: RequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(
    groundxUrl(`/v1/workflow/${encodeURIComponent(String(id))}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const getGroundXAccountWorkflow = async (options?: RequestOptions): Promise<WorkflowResponse> => {
  const response = await axios.get<WorkflowResponse>(groundxUrl("/v1/workflow/relationship"), groundxRequestConfig(options));
  return response.data;
};

export const assignGroundXAccountWorkflow = async (
  input: WorkflowRelationshipInput,
  options?: RequestOptions
): Promise<WorkflowResponse> => {
  const response = await axios.post<WorkflowResponse>(
    groundxUrl("/v1/workflow/relationship"),
    input,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const removeGroundXAccountWorkflow = async (options?: RequestOptions): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(groundxUrl("/v1/workflow/relationship"), groundxRequestConfig(options));
  return response.data;
};

export const assignGroundXWorkflowToResource = async (
  id: string | number,
  input: WorkflowRelationshipInput,
  options?: RequestOptions
): Promise<WorkflowResponse> => {
  const response = await axios.post<WorkflowResponse>(
    groundxUrl(`/v1/workflow/relationship/${encodeURIComponent(String(id))}`),
    input,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const removeGroundXWorkflowFromResource = async (
  id: string | number,
  options?: RequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(
    groundxUrl(`/v1/workflow/relationship/${encodeURIComponent(String(id))}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

