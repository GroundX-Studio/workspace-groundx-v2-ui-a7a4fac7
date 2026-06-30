import { createContext } from "react";

import type { RequestOptions } from "@/api/common";
import type { ServiceHealth } from "@/api/entities/groundxHealthEntity";
import type { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface HealthContextI {
  services: ServiceHealth[];
  selectedService: ServiceHealth | null;
  listHealth: (options?: RequestOptions) => Promise<SdkActionResult<ServiceHealth[]>>;
  getServiceHealth: (service: string, options?: RequestOptions) => Promise<SdkActionResult<ServiceHealth>>;
}

export const HealthContext = createContext<HealthContextI | undefined>(undefined);
