import { createContext } from "react";

import { RequestOptions } from "@/api/common";
import { ServiceHealth } from "@/api/entities/groundxHealthEntity";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface HealthContextI {
  services: ServiceHealth[];
  selectedService: ServiceHealth | null;
  listHealth: (options?: RequestOptions) => Promise<SdkActionResult<ServiceHealth[]>>;
  getServiceHealth: (service: string, options?: RequestOptions) => Promise<SdkActionResult<ServiceHealth>>;
}

export const HealthContext = createContext<HealthContextI | undefined>(undefined);

