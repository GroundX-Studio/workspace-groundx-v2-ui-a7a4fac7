import axios from "@/api/axios";
import { GroundXRequestOptions, groundxRequestConfig, groundxUrl } from "@/api/common";

export interface ServiceHealth {
  service?: string;
  status: string;
  updated?: string;
  [key: string]: unknown;
}

export interface HealthListResponse {
  health: ServiceHealth[];
}

export interface HealthResponse {
  health: ServiceHealth;
}

export const listGroundXHealth = async (options?: GroundXRequestOptions): Promise<HealthListResponse> => {
  const response = await axios.get<HealthListResponse>(groundxUrl("/v1/health"), groundxRequestConfig(options));
  return response.data;
};

export const getGroundXServiceHealth = async (
  service: string,
  options?: GroundXRequestOptions
): Promise<HealthResponse> => {
  const response = await axios.get<HealthResponse>(
    groundxUrl(`/v1/health/${encodeURIComponent(service)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

