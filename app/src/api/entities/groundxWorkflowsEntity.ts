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
  // extract-workflow-authoring — PUT accepts the full compiler overlay
  // (leafFields/customSteps/outputRoutes ride the round-trip opaquely;
  // engine secrets inside `steps` are REDACTED before hold/PUT — design §2).
  leafFields?: import("@groundx/shared").WorkflowLeafField[];
  customSteps?: Metadata[];
  outputRoutes?: Metadata[];
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

/**
 * extract-workflow-authoring / principle 0 — engine config (`EXTRACT_MODEL_*`)
 * can surface an `apiKey`/`baseURL` inside the `steps` blob a workflow GET
 * returns. Those must NEVER ride the round-trip back to a PUT (or a log):
 * strip the keys at ANY depth, without mutating the input. The compiler reads
 * engine config from the build service's own environment, so removal is safe.
 */
const ENGINE_SECRET_KEYS = new Set(["apiKey", "baseURL"]);

export function redactWorkflowEngineSecrets<T>(value: T): T {
  const scrub = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(scrub);
    if (node !== null && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (ENGINE_SECRET_KEYS.has(k)) continue;
        out[k] = scrub(v);
      }
      return out;
    }
    return node;
  };
  return scrub(value) as T;
}

export const updateGroundXWorkflow = async (
  id: string | number,
  input: WorkflowInput,
  options?: RequestOptions
): Promise<WorkflowResponse> => {
  const response = await axios.put<WorkflowResponse>(
    groundxUrl(`/v1/workflow/${encodeURIComponent(String(id))}`),
    // principle 0 — engine secrets never ride the PUT (see redactor above).
    redactWorkflowEngineSecrets(input),
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

