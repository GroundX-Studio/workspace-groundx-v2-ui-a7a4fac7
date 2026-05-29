import rawAxios from "axios";

import axios from "@/api/axios";
import {
  appMetadataUrl,
  customerDataUrl,
  customerLoginUrl,
  customerLogoutUrl,
  customerResetUrl,
  customerRegisterUrl,
  resetPasswordCodeUrl,
  resetPasswordConfirmUrl,
} from "@/api/common";

export interface LoginI {
  email: string;
  password: string;
}

export interface RegisterI {
  first: string;
  last: string;
  email: string;
  password: string;
  confirmPassword: string;
  companyName?: string;
  endUserLicenseAgreement: boolean;
  xrayEmail?: string | null;
}

export interface RegisterRes {
  username: string;
  token: string;
  xJwtToken: string;
  apiKeys: { apiKey: string; created: string; name: string }[];
}

export interface LoginResponse {
  customer: User;
  token: string;
  username: string;
  xJwtToken: string;
}

export interface Subscription {
  cancelAt?: string;
  planId?: string;
  customerId?: string;
  purchaseId?: string;
}

export interface User {
  company?: string;
  email: string;
  first: string;
  last: string;
  phone?: string;
  username: string;
  partnerUserId?: string;
  subscription?: Subscription;
  appMetadata?: AppUserMetadata | null;
}

export interface UserDataResponse {
  authenticated?: boolean;
  username?: string;
  customer: User;
  appMetadata?: AppUserMetadata | null;
}

export interface AppUserMetadata {
  groundxUsername?: string;
  onboardingState?: string | null;
}

export interface UpdateAppMetadataInput {
  onboardingState?: string | null;
}

export const login = async (data: LoginI): Promise<LoginResponse> => {
  const encodedCredentials = btoa(`${data.email}:${data.password}`);
  const response = await rawAxios.post<LoginResponse>(customerLoginUrl, undefined, {
    headers: {
      Authorization: `Basic ${encodedCredentials}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    withCredentials: true,
  });

  return { ...response.data, xJwtToken: response.headers["x-jwt-token"] as string };
};

export const register = async (data: RegisterI): Promise<RegisterRes> => {
  const encodedCredentials = btoa(`${data.email}:${data.password}`);
  const response = await rawAxios.post<RegisterRes>(
    customerRegisterUrl,
    { customer: { ...data } },
    {
      headers: {
        Authorization: `Basic ${encodedCredentials}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      withCredentials: true,
    }
  );

  return { ...response.data, xJwtToken: response.headers["x-jwt-token"] as string };
};

export const getUserData = async (accountId: string): Promise<UserDataResponse> => {
  const response = await axios.get<UserDataResponse>(customerDataUrl(accountId));
  return response.data;
};

export const updateAppMetadata = async (data: UpdateAppMetadataInput): Promise<AppUserMetadata> => {
  const response = await axios.patch<{ appMetadata: AppUserMetadata }>(appMetadataUrl, data);
  return response.data.appMetadata;
};

export const logout = async (): Promise<{ success: boolean }> => {
  const response = await axios.post<{ success: boolean }>(customerLogoutUrl);
  return response.data;
};

// DBG-01: debug-overlay session reset. Clears the httpOnly session + csrf
// cookies server-side for any caller (anon or authed). Distinct from
// `logout` (which requires a session and is auth-semantic); reset works
// even with no session, so the next request mints a fresh anon id.
export const resetSession = async (): Promise<{ success: boolean }> => {
  const response = await axios.post<{ success: boolean }>(customerResetUrl);
  return response.data;
};

export const resetUserPassword = async (email: string): Promise<{ message: string }> => {
  const response = await rawAxios.post(
    resetPasswordCodeUrl,
    { email },
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      withCredentials: true,
    }
  );
  return response.data;
};

export const confirmUserChangingPassword = async (
  code: string,
  email: string,
  password: string
): Promise<{ message: string }> => {
  const encodedCredentials = btoa(`${email}:${password}`);
  const response = await rawAxios.post(
    resetPasswordConfirmUrl,
    { email, newPassword: password, code },
    {
      headers: {
        Authorization: `Basic ${encodedCredentials}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      withCredentials: true,
    }
  );
  return response.data;
};
