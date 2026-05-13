import { createContext } from "react";

import { GroundXRequestOptions, PartnerRequestOptions } from "@/api/common";
import { GroundXApiKey } from "@/api/entities/sdkTypes";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface ApiKeysContextI {
  groundxApiKeys: GroundXApiKey[];
  partnerApiKeys: GroundXApiKey[];
  listGroundXApiKeys: (options?: GroundXRequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  createGroundXApiKey: (name: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  renameGroundXApiKey: (apiKey: string, name: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  deleteGroundXApiKey: (apiKey: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
  listPartnerApiKeys: (options?: PartnerRequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  createPartnerApiKey: (name: string, options?: PartnerRequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  renamePartnerApiKey: (apiKey: string, name: string, options?: PartnerRequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  deletePartnerApiKey: (apiKey: string, options?: PartnerRequestOptions) => Promise<SdkActionResult<void>>;
}

export const ApiKeysContext = createContext<ApiKeysContextI | undefined>(undefined);

