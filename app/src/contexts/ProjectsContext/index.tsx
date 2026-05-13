import { useContext } from "react";

import { ProjectsContext, ProjectsContextI } from "./ProjectsContext";
export { ProjectsProvider } from "./ProjectsProvider";

export const useProjectsContext = (): ProjectsContextI => {
  const context = useContext(ProjectsContext);
  if (!context) throw new Error("useProjectsContext must be used inside a ProjectsProvider");
  return context;
};

