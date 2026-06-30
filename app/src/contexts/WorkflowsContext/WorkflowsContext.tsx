import { createContext } from "react";

import type { RequestOptions } from "@/api/common";
import type { WorkflowInput, WorkflowRelationshipInput } from "@/api/entities/groundxWorkflowsEntity";
import type { Workflow } from "@/api/entities/sdkTypes";
import type { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface WorkflowsContextI {
  workflows: Workflow[];
  selectedWorkflow: Workflow | null;
  accountWorkflow: Workflow | null;
  listWorkflows: (options?: RequestOptions) => Promise<SdkActionResult<Workflow[]>>;
  createWorkflow: (input: WorkflowInput, options?: RequestOptions) => Promise<SdkActionResult<Workflow>>;
  getWorkflow: (id: string | number, options?: RequestOptions) => Promise<SdkActionResult<Workflow>>;
  updateWorkflow: (id: string | number, input: WorkflowInput, options?: RequestOptions) => Promise<SdkActionResult<Workflow>>;
  deleteWorkflow: (id: string | number, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  getAccountWorkflow: (options?: RequestOptions) => Promise<SdkActionResult<Workflow>>;
  assignAccountWorkflow: (input: WorkflowRelationshipInput, options?: RequestOptions) => Promise<SdkActionResult<Workflow>>;
  removeAccountWorkflow: (options?: RequestOptions) => Promise<SdkActionResult<void>>;
  assignWorkflowToResource: (id: string | number, input: WorkflowRelationshipInput, options?: RequestOptions) => Promise<SdkActionResult<Workflow>>;
  removeWorkflowFromResource: (id: string | number, options?: RequestOptions) => Promise<SdkActionResult<void>>;
}

export const WorkflowsContext = createContext<WorkflowsContextI | undefined>(undefined);
