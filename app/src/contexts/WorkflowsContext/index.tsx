import { createContextHook } from "@/contexts/createEntityContext";

import { WorkflowsContext } from "./WorkflowsContext";
export { WorkflowsProvider } from "./WorkflowsProvider";

export const useWorkflowsContext = createContextHook(WorkflowsContext, "useWorkflowsContext must be used inside a WorkflowsProvider");
