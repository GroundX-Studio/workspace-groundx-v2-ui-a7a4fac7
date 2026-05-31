import { sdkConfig } from "@/api/sdkConfig";

export const middlewareUrl = sdkConfig.middlewareBaseUrl;

export interface PaginationParams {
  n?: number;
  nextToken?: string;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface MessageResponse {
  message: string;
}

export type Metadata = Record<string, unknown>;

export const customerUrl = `${middlewareUrl}/auth`;
export const customerLoginUrl = `${customerUrl}/login`;
export const customerRegisterUrl = `${customerUrl}/register`;
export const customerDataUrl = (_accountId: string) => `${customerUrl}/me`;
export const customerLogoutUrl = `${customerUrl}/logout`;
// DBG-01: debug-overlay session reset — clears the httpOnly session + csrf
// cookies for any caller (anon or authed). See middleware POST /api/auth/reset.
export const customerResetUrl = `${customerUrl}/reset`;
export const appMetadataUrl = `${middlewareUrl}/me/metadata`;

export const resetPasswordUrl = `${customerUrl}/password`;
export const resetPasswordCodeUrl = `${resetPasswordUrl}/reset`;
export const resetPasswordConfirmUrl = `${resetPasswordUrl}/confirm`;

export const onboardingSessionUrl = `${middlewareUrl}/onboarding/session`;
export const scenariosUrl = `${middlewareUrl}/scenarios`;

export const groundxUrl = (path: string): string => `${middlewareUrl}${path}`;
export const partnerUrl = (path: string): string => `${middlewareUrl}${path}`;
export const llmUrl = (path: string): string => `${middlewareUrl}/llm${path}`;

export const paramsWithPagination = (params?: PaginationParams): Record<string, string | number> => {
  const output: Record<string, string | number> = {};
  if (params?.n !== undefined) output.n = params.n;
  if (params?.nextToken) output.nextToken = params.nextToken;
  return output;
};

export const groundxRequestConfig = (options: RequestOptions = {}) => ({
  signal: options.signal,
});

export const partnerRequestConfig = (options: RequestOptions = {}) => ({
  signal: options.signal,
});

export const llmRequestConfig = (options: RequestOptions = {}) => {
  return {
    signal: options.signal,
  };
};
