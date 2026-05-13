import axios from "@/api/axios";
import { GroundXRequestOptions, MessageResponse, groundxRequestConfig, groundxUrl } from "@/api/common";

import { GroundXApiKey } from "./sdkTypes";

export interface GroundXApiKeysResponse {
  apiKeys: GroundXApiKey[];
}

export const listGroundXApiKeys = async (options?: GroundXRequestOptions): Promise<GroundXApiKeysResponse> => {
  const response = await axios.get<GroundXApiKeysResponse>(groundxUrl("/v1/apikey"), groundxRequestConfig(options));
  return response.data;
};

export const createGroundXApiKey = async (
  name: string,
  options?: GroundXRequestOptions
): Promise<GroundXApiKeysResponse> => {
  const response = await axios.post<GroundXApiKeysResponse>(
    groundxUrl("/v1/apikey"),
    { name },
    groundxRequestConfig(options)
  );
  return response.data;
};

export const renameGroundXApiKey = async (
  apiKey: string,
  name: string,
  options?: GroundXRequestOptions
): Promise<GroundXApiKeysResponse> => {
  const response = await axios.put<GroundXApiKeysResponse>(
    groundxUrl(`/v1/apikey/${encodeURIComponent(apiKey)}`),
    { name },
    groundxRequestConfig(options)
  );
  return response.data;
};

export const deleteGroundXApiKey = async (
  apiKey: string,
  options?: GroundXRequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(
    groundxUrl(`/v1/apikey/${encodeURIComponent(apiKey)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

