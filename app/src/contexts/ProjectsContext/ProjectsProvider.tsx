import { FC, ReactNode, useCallback, useState } from "react";

import { api } from "@/api";
import { PartnerRequestOptions } from "@/api/common";
import { PartnerProjectCreateInput, PartnerProjectInput } from "@/api/entities/partnerProjectsEntity";
import { Project } from "@/api/entities/sdkTypes";
import { useIsLoading } from "@/contexts/LoadingContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { createSdkResult } from "@/contexts/sdkContextTypes";

import { ProjectsContext } from "./ProjectsContext";

export const ProjectsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { setIsLoading } = useIsLoading();
  const { setErrorMessage, setSuccessMessage } = useMessageContext();
  const [projects, setProjects] = useState<Project[]>([]);

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
        setErrorMessage("Project operation failed.");
      } finally {
        setIsLoading(false);
      }
      return result;
    },
    [setErrorMessage, setIsLoading, setSuccessMessage]
  );

  const listProjects = useCallback(
    (options?: PartnerRequestOptions) =>
      run(async () => {
        const response = await api.partnerProjects.listPartnerProjects(options);
        setProjects(response.projects);
        return response.projects;
      }),
    [run]
  );

  const createProject = useCallback(
    (input: PartnerProjectCreateInput, options?: PartnerRequestOptions) =>
      run(async () => {
        const response = await api.partnerProjects.createPartnerProject(input, options);
        setProjects((items) => [response.project, ...items]);
        return response.project;
      }, "Project created."),
    [run]
  );

  const updateProject = useCallback(
    (projectId: number, project: PartnerProjectInput, options?: PartnerRequestOptions) =>
      run(async () => {
        await api.partnerProjects.updatePartnerProject(projectId, project, options);
        setProjects((items) => items.map((item) => (item.projectId === projectId ? { ...item, ...project } : item)));
      }, "Project updated."),
    [run]
  );

  const attachBucket = useCallback(
    (projectId: number, bucketId: number, options?: PartnerRequestOptions) =>
      run(async () => {
        await api.partnerProjects.attachBucketToPartnerProject(projectId, bucketId, options);
      }, "Bucket attached."),
    [run]
  );

  const detachBucket = useCallback(
    (projectId: number, bucketId: number, options?: PartnerRequestOptions) =>
      run(async () => {
        await api.partnerProjects.detachBucketFromPartnerProject(projectId, bucketId, options);
      }, "Bucket detached."),
    [run]
  );

  return (
    <ProjectsContext.Provider value={{ projects, listProjects, createProject, updateProject, attachBucket, detachBucket }}>
      {children}
    </ProjectsContext.Provider>
  );
};

