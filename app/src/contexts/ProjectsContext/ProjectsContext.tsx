import { createContext } from "react";

import { PartnerRequestOptions } from "@/api/common";
import { PartnerProjectCreateInput, PartnerProjectInput } from "@/api/entities/partnerProjectsEntity";
import { Project } from "@/api/entities/sdkTypes";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface ProjectsContextI {
  projects: Project[];
  listProjects: (options?: PartnerRequestOptions) => Promise<SdkActionResult<Project[]>>;
  createProject: (input: PartnerProjectCreateInput, options?: PartnerRequestOptions) => Promise<SdkActionResult<Project>>;
  updateProject: (projectId: number, project: PartnerProjectInput, options?: PartnerRequestOptions) => Promise<SdkActionResult<void>>;
  attachBucket: (projectId: number, bucketId: number, options?: PartnerRequestOptions) => Promise<SdkActionResult<void>>;
  detachBucket: (projectId: number, bucketId: number, options?: PartnerRequestOptions) => Promise<SdkActionResult<void>>;
}

export const ProjectsContext = createContext<ProjectsContextI | undefined>(undefined);

