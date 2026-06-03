import { createContext } from "react";

import type { RequestOptions } from "@/api/common";
import type { PartnerProjectCreateInput, PartnerProjectInput } from "@/api/entities/partnerProjectsEntity";
import type { Project } from "@/api/entities/sdkTypes";
import type { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface ProjectsContextI {
  projects: Project[];
  listProjects: (options?: RequestOptions) => Promise<SdkActionResult<Project[]>>;
  createProject: (input: PartnerProjectCreateInput, options?: RequestOptions) => Promise<SdkActionResult<Project>>;
  updateProject: (projectId: number, project: PartnerProjectInput, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  attachBucket: (projectId: number, bucketId: number, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  detachBucket: (projectId: number, bucketId: number, options?: RequestOptions) => Promise<SdkActionResult<void>>;
}

export const ProjectsContext = createContext<ProjectsContextI | undefined>(undefined);
