import { useContext } from "react";

import { WorkflowsContext, WorkflowsContextI } from "./WorkflowsContext";
export { WorkflowsProvider } from "./WorkflowsProvider";

export const useWorkflowsContext = (): WorkflowsContextI => {
  const context = useContext(WorkflowsContext);
  if (!context) throw new Error("useWorkflowsContext must be used inside a WorkflowsProvider");
  return context;
};

