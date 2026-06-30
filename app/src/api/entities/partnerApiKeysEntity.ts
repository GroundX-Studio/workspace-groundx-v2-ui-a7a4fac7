import axios from "@/api/axios";
import { MessageResponse, RequestOptions, partnerRequestConfig, partnerUrl } from "@/api/common";

import { GroundXApiKey } from "./sdkTypes";

export interface PartnerApiKeysResponse {
  apiKeys: GroundXApiKey[];
}

export const listPartnerApiKeys = async (options?: RequestOptions): Promise<PartnerApiKeysResponse> => {
  const response = await axios.get<PartnerApiKeysResponse>(partnerUrl("/apikey"), partnerRequestConfig(options));
  return response.data;
};

export const createPartnerApiKey = async (
  name: string,
  options?: RequestOptions
): Promise<PartnerApiKeysResponse> => {
  const response = await axios.post<PartnerApiKeysResponse>(
    partnerUrl("/apikey"),
    { apiKey: { name } },
    partnerRequestConfig(options)
  );
  return response.data;
};

export const renamePartnerApiKey = async (
  apiKey: string,
  name: string,
  options?: RequestOptions
): Promise<PartnerApiKeysResponse> => {
  const response = await axios.put<PartnerApiKeysResponse>(
    partnerUrl(`/apikey/${encodeURIComponent(apiKey)}`),
    { apiKey: { name } },
    partnerRequestConfig(options)
  );
  return response.data;
};

export const deletePartnerApiKey = async (apiKey: string, options?: RequestOptions): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(
    partnerUrl(`/apikey/${encodeURIComponent(apiKey)}`),
    partnerRequestConfig(options)
  );
  return response.data;
};

