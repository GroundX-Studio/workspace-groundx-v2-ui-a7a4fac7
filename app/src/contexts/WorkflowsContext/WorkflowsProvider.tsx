import { FC, ReactNode, useCallback, useState } from "react";

import { api } from "@/api";
import { GroundXRequestOptions } from "@/api/common";
import { WorkflowInput, WorkflowRelationshipInput } from "@/api/entities/groundxWorkflowsEntity";
import { Workflow } from "@/api/entities/sdkTypes";
import { useIsLoading } from "@/contexts/LoadingContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { createSdkResult } from "@/contexts/sdkContextTypes";

import { WorkflowsContext } from "./WorkflowsContext";

export const WorkflowsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { setIsLoading } = useIsLoading();
  const { setErrorMessage, setSuccessMessage } = useMessageContext();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [accountWorkflow, setAccountWorkflow] = useState<Workflow | null>(null);

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
        setErrorMessage("Workflow operation failed.");
      } finally {
        setIsLoading(false);
      }
      return result;
    },
    [setErrorMessage, setIsLoading, setSuccessMessage]
  );

  const listWorkflows = useCallback(
    (options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.listGroundXWorkflows(options);
        setWorkflows(response.workflows);
        return response.workflows;
      }),
    [run]
  );

  const createWorkflow = useCallback(
    (input: WorkflowInput, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.createGroundXWorkflow(input, options);
        setWorkflows((items) => [response.workflow, ...items]);
        return response.workflow;
      }, "Workflow created."),
    [run]
  );

  const getWorkflow = useCallback(
    (id: string | number, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.getGroundXWorkflow(id, options);
        setSelectedWorkflow(response.workflow);
        return response.workflow;
      }),
    [run]
  );

  const updateWorkflow = useCallback(
    (id: string | number, input: WorkflowInput, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.updateGroundXWorkflow(id, input, options);
        setWorkflows((items) => items.map((item) => (item.workflowId === String(id) ? response.workflow : item)));
        setSelectedWorkflow(response.workflow);
        return response.workflow;
      }, "Workflow updated."),
    [run]
  );

  const deleteWorkflow = useCallback(
    (id: string | number, options?: GroundXRequestOptions) =>
      run(async () => {
        await api.groundxWorkflows.deleteGroundXWorkflow(id, options);
        setWorkflows((items) => items.filter((item) => item.workflowId !== String(id)));
        setSelectedWorkflow((workflow) => (workflow?.workflowId === String(id) ? null : workflow));
      }, "Workflow deleted."),
    [run]
  );

  const getAccountWorkflow = useCallback(
    (options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.getGroundXAccountWorkflow(options);
        setAccountWorkflow(response.workflow);
        return response.workflow;
      }),
    [run]
  );

  const assignAccountWorkflow = useCallback(
    (input: WorkflowRelationshipInput, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxWorkflows.assignGroundXAccountWorkflow(input, options);
        setAccountWorkflow(response.workflow);
        return response.workflow;
      }, "Workflow assigned."),
    [run]
  );

  const removeAccountWorkflow = useCallback(
    (options?: GroundXRequestOptions) =>
      run(async () => {
        await api.groundxWorkflows.removeGroundXAccountWorkflow(options);
        setAccountWorkflow(null);
      }, "Workflow removed."),
    [run]
  );

  const assignWorkflowToResource = useCallback(
    (id: string | number, input: WorkflowRelationshipInput, options?: GroundXRequestOptions) =>
      run(async () => (await api.groundxWorkflows.assignGroundXWorkflowToResource(id, input, options)).workflow, "Workflow assigned."),
    [run]
  );

  const removeWorkflowFromResource = useCallback(
    (id: string | number, options?: GroundXRequestOptions) =>
      run(async () => {
        await api.groundxWorkflows.removeGroundXWorkflowFromResource(id, options);
      }, "Workflow removed."),
    [run]
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

