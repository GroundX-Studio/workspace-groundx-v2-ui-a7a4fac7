import { createContext } from "react";

import { GroundXRequestOptions } from "@/api/common";
import { WorkflowInput, WorkflowRelationshipInput } from "@/api/entities/groundxWorkflowsEntity";
import { Workflow } from "@/api/entities/sdkTypes";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface WorkflowsContextI {
  workflows: Workflow[];
  selectedWorkflow: Workflow | null;
  accountWorkflow: Workflow | null;
  listWorkflows: (options?: GroundXRequestOptions) => Promise<SdkActionResult<Workflow[]>>;
  createWorkflow: (input: WorkflowInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<Workflow>>;
  getWorkflow: (id: string | number, options?: GroundXRequestOptions) => Promise<SdkActionResult<Workflow>>;
  updateWorkflow: (id: string | number, input: WorkflowInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<Workflow>>;
  deleteWorkflow: (id: string | number, options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
  getAccountWorkflow: (options?: GroundXRequestOptions) => Promise<SdkActionResult<Workflow>>;
  assignAccountWorkflow: (input: WorkflowRelationshipInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<Workflow>>;
  removeAccountWorkflow: (options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
  assignWorkflowToResource: (id: string | number, input: WorkflowRelationshipInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<Workflow>>;
  removeWorkflowFromResource: (id: string | number, options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
}

export const WorkflowsContext = createContext<WorkflowsContextI | undefined>(undefined);

