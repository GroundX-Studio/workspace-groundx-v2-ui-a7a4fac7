import { APP_CONFIG } from "@/appConfig";

export interface SdkConfig {
  middlewareBaseUrl: string;
  defaultPageSize: number;
}

export const sdkConfig: SdkConfig = {
  middlewareBaseUrl: APP_CONFIG.api.basePath,
  defaultPageSize: APP_CONFIG.api.defaultPageSize,
};
