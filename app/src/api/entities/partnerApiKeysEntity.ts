import axios from "@/api/axios";
import { MessageResponse, PartnerRequestOptions, partnerRequestConfig, partnerUrl } from "@/api/common";

import { GroundXApiKey } from "./sdkTypes";

export interface PartnerApiKeysResponse {
  apiKeys: GroundXApiKey[];
}

export const listPartnerApiKeys = async (options?: PartnerRequestOptions): Promise<PartnerApiKeysResponse> => {
  const response = await axios.get<PartnerApiKeysResponse>(partnerUrl("/apikey"), partnerRequestConfig(options));
  return response.data;
};

export const createPartnerApiKey = async (
  name: string,
  options?: PartnerRequestOptions
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
  options?: PartnerRequestOptions
): Promise<PartnerApiKeysResponse> => {
  const response = await axios.put<PartnerApiKeysResponse>(
    partnerUrl(`/apikey/${encodeURIComponent(apiKey)}`),
    { apiKey: { name } },
    partnerRequestConfig(options)
  );
  return response.data;
};

export const deletePartnerApiKey = async (apiKey: string, options?: PartnerRequestOptions): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(
    partnerUrl(`/apikey/${encodeURIComponent(apiKey)}`),
    partnerRequestConfig(options)
  );
  return response.data;
};

