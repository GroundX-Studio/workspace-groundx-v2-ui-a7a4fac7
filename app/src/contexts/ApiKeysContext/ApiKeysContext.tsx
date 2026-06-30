import { createContext } from "react";

import { RequestOptions } from "@/api/common";
import { GroundXApiKey } from "@/api/entities/sdkTypes";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface ApiKeysContextI {
  groundxApiKeys: GroundXApiKey[];
  partnerApiKeys: GroundXApiKey[];
  listGroundXApiKeys: (options?: RequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  createGroundXApiKey: (name: string, options?: RequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  renameGroundXApiKey: (apiKey: string, name: string, options?: RequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  deleteGroundXApiKey: (apiKey: string, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  listPartnerApiKeys: (options?: RequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  createPartnerApiKey: (name: string, options?: RequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  renamePartnerApiKey: (apiKey: string, name: string, options?: RequestOptions) => Promise<SdkActionResult<GroundXApiKey[]>>;
  deletePartnerApiKey: (apiKey: string, options?: RequestOptions) => Promise<SdkActionResult<void>>;
}

export const ApiKeysContext = createContext<ApiKeysContextI | undefined>(undefined);

