import rawAxios from "axios";

import axios from "@/api/axios";
import {
  MessageResponse,
  RequestOptions,
  customerLoginUrl,
  customerRegisterUrl,
  partnerRequestConfig,
  partnerUrl,
  resetPasswordCodeUrl,
  resetPasswordConfirmUrl,
} from "@/api/common";

import { PartnerCustomer } from "./sdkTypes";

export interface PartnerCredentials {
  email: string;
  password: string;
}

export interface PartnerCustomerProfileInput {
  company?: string;
  first?: string;
  last?: string;
  partnerUserId?: string;
  phone?: string;
}

export interface PartnerPasswordConfirmInput extends PartnerCredentials {
  code: string;
}

export interface PartnerAuthResponse {
  token: string;
  username: string;
  xJwtToken?: string;
}

export interface PartnerCustomerResponse {
  customer: PartnerCustomer;
}

const basicAuthHeaders = ({ email, password }: PartnerCredentials) => ({
  Authorization: `Basic ${btoa(`${email}:${password}`)}`,
  "Content-Type": "application/json",
  Accept: "application/json",
});

export const registerPartnerCustomer = async (
  credentials: PartnerCredentials,
  customer?: PartnerCustomerProfileInput
): Promise<PartnerAuthResponse> => {
  const response = await rawAxios.post<PartnerAuthResponse>(
    customerRegisterUrl,
    customer ? { customer } : undefined,
    { headers: basicAuthHeaders(credentials), withCredentials: true }
  );
  return { ...response.data, xJwtToken: response.headers["x-jwt-token"] as string | undefined };
};

export const loginPartnerCustomer = async (credentials: PartnerCredentials): Promise<PartnerAuthResponse> => {
  const response = await rawAxios.post<PartnerAuthResponse>(customerLoginUrl, undefined, {
    headers: basicAuthHeaders(credentials),
    withCredentials: true,
  });
  return { ...response.data, xJwtToken: response.headers["x-jwt-token"] as string | undefined };
};

export const getPartnerCustomer = async (
  username: string,
  options?: RequestOptions
): Promise<PartnerCustomerResponse> => {
  const response = await axios.get<PartnerCustomerResponse>(
    partnerUrl(`/customer/${encodeURIComponent(username)}`),
    partnerRequestConfig(options)
  );
  return response.data;
};

export const deletePartnerCustomer = async (
  username: string,
  options?: RequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(
    partnerUrl(`/customer/${encodeURIComponent(username)}`),
    partnerRequestConfig(options)
  );
  return response.data;
};

export const resetPartnerCustomerPassword = async (email: string): Promise<{ message: string }> => {
  const response = await rawAxios.post<{ message: string }>(resetPasswordCodeUrl, { email }, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    withCredentials: true,
  });
  return response.data;
};

export const confirmPartnerCustomerPassword = async ({
  code,
  email,
  password,
}: PartnerPasswordConfirmInput): Promise<{ message: string }> => {
  const response = await rawAxios.post<{ message: string }>(
    resetPasswordConfirmUrl,
    { email, newPassword: password, code },
    {
      headers: basicAuthHeaders({ email, password }),
      withCredentials: true,
    }
  );
  return response.data;
};
