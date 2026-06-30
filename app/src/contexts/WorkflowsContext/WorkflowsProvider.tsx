import { FC, ReactNode, useCallback, useState } from "react";

import type { RequestOptions } from "@/api/common";
import type { WorkflowInput, WorkflowRelationshipInput } from "@/api/entities/groundxWorkflowsEntity";
import type { Workflow } from "@/api/entities/sdkTypes";
import { useApi } from "@/contexts/ApiContext";
import { useSdkRunner } from "@/contexts/createEntityContext";

import { WorkflowsContext } from "./WorkflowsContext";

export const WorkflowsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const api = useApi();
  const run = useSdkRunner("Workflow operation failed.");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [accountWorkflow, setAccountWorkflow] = useState<Workflow | null>(null);

  const listWorkflows = useCallback(
    (options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.listGroundXWorkflows(options);
        setWorkflows(response.workflows);
        return response.workflows;
      }),
    [api, run]
  );

  const createWorkflow = useCallback(
    (input: WorkflowInput, options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.createGroundXWorkflow(input, options);
        setWorkflows((items) => [response.workflow, ...items]);
        return response.workflow;
      }, "Workflow created."),
    [api, run]
  );

  const getWorkflow = useCallback(
    (id: string | number, options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.getGroundXWorkflow(id, options);
        setSelectedWorkflow(response.workflow);
        return response.workflow;
      }),
    [api, run]
  );

  const updateWorkflow = useCallback(
    (id: string | number, input: WorkflowInput, options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.updateGroundXWorkflow(id, input, options);
        setWorkflows((items) => items.map((item) => (item.workflowId === String(id) ? response.workflow : item)));
        setSelectedWorkflow(response.workflow);
        return response.workflow;
      }, "Workflow updated."),
    [api, run]
  );

  const deleteWorkflow = useCallback(
    (id: string | number, options?: RequestOptions) =>
      run(async () => {
        await api.groundxWorkflows.deleteGroundXWorkflow(id, options);
        setWorkflows((items) => items.filter((item) => item.workflowId !== String(id)));
        setSelectedWorkflow((workflow) => (workflow?.workflowId === String(id) ? null : workflow));
      }, "Workflow deleted."),
    [api, run]
  );

  const getAccountWorkflow = useCallback(
    (options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.getGroundXAccountWorkflow(options);
        setAccountWorkflow(response.workflow);
        return response.workflow;
      }),
    [api, run]
  );

  const assignAccountWorkflow = useCallback(
    (input: WorkflowRelationshipInput, options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.assignGroundXAccountWorkflow(input, options);
        setAccountWorkflow(response.workflow);
        return response.workflow;
      }, "Workflow assigned."),
    [api, run]
  );

  const removeAccountWorkflow = useCallback(
    (options?: RequestOptions) =>
      run(async () => {
        await api.groundxWorkflows.removeGroundXAccountWorkflow(options);
        setAccountWorkflow(null);
      }, "Workflow removed."),
    [api, run]
  );

  const assignWorkflowToResource = useCallback(
    (id: string | number, input: WorkflowRelationshipInput, options?: RequestOptions) =>
      run(async () => (await api.groundxWorkflows.assignGroundXWorkflowToResource(id, input, options)).workflow, "Workflow assigned."),
    [api, run]
  );

  const removeWorkflowFromResource = useCallback(
    (id: string | number, options?: RequestOptions) =>
      run(async () => {
        await api.groundxWorkflows.removeGroundXWorkflowFromResource(id, options);
      }, "Workflow removed."),
    [api, run]
  );

  return (
    <WorkflowsContext.Provider
      value={{
        workflows,
        selectedWorkflow,
        accountWorkflow,
        listWorkflows,
        createWorkflow,
        getWorkflow,
        updateWorkflow,
        deleteWorkflow,
        getAccountWorkflow,
        assignAccountWorkflow,
        removeAccountWorkflow,
        assignWorkflowToResource,
        removeWorkflowFromResource,
      }}
    >
      {children}
    </WorkflowsContext.Provider>
  );
};
