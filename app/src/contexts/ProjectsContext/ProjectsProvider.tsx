import { FC, ReactNode, useCallback, useState } from "react";

import type { RequestOptions } from "@/api/common";
import type { PartnerProjectCreateInput, PartnerProjectInput } from "@/api/entities/partnerProjectsEntity";
import type { Project } from "@/api/entities/sdkTypes";
import { useApi } from "@/contexts/ApiContext";
import { useSdkRunner } from "@/contexts/createEntityContext";

import { ProjectsContext } from "./ProjectsContext";

export const ProjectsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const api = useApi();
  const run = useSdkRunner("Project operation failed.");
  const [projects, setProjects] = useState<Project[]>([]);

  const listProjects = useCallback(
    (options?: RequestOptions) =>
      run(async () => {
        const response = await api.partnerProjects.listPartnerProjects(options);
        setProjects(response.projects);
        return response.projects;
      }),
    [api, run]
  );

  const createProject = useCallback(
    (input: PartnerProjectCreateInput, options?: RequestOptions) =>
      run(async () => {
        const response = await api.partnerProjects.createPartnerProject(input, options);
        setProjects((items) => [response.project, ...items]);
        return response.project;
      }, "Project created."),
    [api, run]
  );

  const updateProject = useCallback(
    (projectId: number, project: PartnerProjectInput, options?: RequestOptions) =>
      run(async () => {
        await api.partnerProjects.updatePartnerProject(projectId, project, options);
        setProjects((items) => items.map((item) => (item.projectId === projectId ? { ...item, ...project } : item)));
      }, "Project updated."),
    [api, run]
  );

  const attachBucket = useCallback(
    (projectId: number, bucketId: number, options?: RequestOptions) =>
      run(async () => {
        await api.partnerProjects.attachBucketToPartnerProject(projectId, bucketId, options);
      }, "Bucket attached."),
    [api, run]
  );

  const detachBucket = useCallback(
    (projectId: number, bucketId: number, options?: RequestOptions) =>
      run(async () => {
        await api.partnerProjects.detachBucketFromPartnerProject(projectId, bucketId, options);
      }, "Bucket detached."),
    [api, run]
  );

  return (
    <ProjectsContext.Provider value={{ projects, listProjects, createProject, updateProject, attachBucket, detachBucket }}>
      {children}
    </ProjectsContext.Provider>
  );
};
