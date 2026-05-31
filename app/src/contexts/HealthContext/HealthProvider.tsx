import { FC, ReactNode, useCallback, useState } from "react";

import { api } from "@/api";
import { RequestOptions } from "@/api/common";
import { ServiceHealth } from "@/api/entities/groundxHealthEntity";
import { useSdkRunner } from "@/contexts/createEntityContext";

import { HealthContext } from "./HealthContext";

export const HealthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const run = useSdkRunner("Could not load service health.");
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceHealth | null>(null);

  const listHealth = useCallback(
    (options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxHealth.listGroundXHealth(options);
        setServices(response.health);
        return response.health;
      }),
    [run]
  );

  const getServiceHealth = useCallback(
    (service: string, options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxHealth.getGroundXServiceHealth(service, options);
        setSelectedService(response.health);
        return response.health;
      }),
    [run]
  );

  return <HealthContext.Provider value={{ services, selectedService, listHealth, getServiceHealth }}>{children}</HealthContext.Provider>;
};

