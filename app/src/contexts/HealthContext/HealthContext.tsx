import { createContext } from "react";

import { GroundXRequestOptions } from "@/api/common";
import { ServiceHealth } from "@/api/entities/groundxHealthEntity";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface HealthContextI {
  services: ServiceHealth[];
  selectedService: ServiceHealth | null;
  listHealth: (options?: GroundXRequestOptions) => Promise<SdkActionResult<ServiceHealth[]>>;
  getServiceHealth: (service: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<ServiceHealth>>;
}

export const HealthContext = createContext<HealthContextI | undefined>(undefined);

