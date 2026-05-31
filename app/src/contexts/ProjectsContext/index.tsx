import { createContextHook } from "@/contexts/createEntityContext";

import { ProjectsContext, ProjectsContextI } from "./ProjectsContext";
export { ProjectsProvider } from "./ProjectsProvider";

export const useProjectsContext = createContextHook(ProjectsContext, "useProjectsContext must be used inside a ProjectsProvider");
