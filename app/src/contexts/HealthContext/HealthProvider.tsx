import { FC, ReactNode, useCallback, useState } from "react";

import { api } from "@/api";
import { RequestOptions } from "@/api/common";
import { ServiceHealth } from "@/api/entities/groundxHealthEntity";
import { useIsLoading } from "@/contexts/LoadingContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { createSdkResult } from "@/contexts/sdkContextTypes";

import { HealthContext } from "./HealthContext";

export const HealthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { setIsLoading } = useIsLoading();
  const { setErrorMessage } = useMessageContext();
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceHealth | null>(null);

  const listHealth = useCallback(
    async (options?: RequestOptions) => {
      const result = createSdkResult<ServiceHealth[]>();
      setIsLoading(true);
      try {
        const response = await api.groundxHealth.listGroundXHealth(options);
        setServices(response.health);
        result.response = response.health;
        result.isSuccess = true;
      } catch (error) {
        result.error = error;
        setErrorMessage("Could not load service health.");
      } finally {
        setIsLoading(false);
      }
      return result;
    },
    [setErrorMessage, setIsLoading]
  );

  const getServiceHealth = useCallback(
    async (service: string, options?: RequestOptions) => {
      const result = createSdkResult<ServiceHealth>();
      setIsLoading(true);
      try {
        const response = await api.groundxHealth.getGroundXServiceHealth(service, options);
        setSelectedService(response.health);
        result.response = response.health;
        result.isSuccess = true;
      } catch (error) {
        result.error = error;
        setErrorMessage("Could not load service health.");
      } finally {
        setIsLoading(false);
      }
      return result;
    },
    [setErrorMessage, setIsLoading]
  );

  return <HealthContext.Provider value={{ services, selectedService, listHealth, getServiceHealth }}>{children}</HealthContext.Provider>;
};

