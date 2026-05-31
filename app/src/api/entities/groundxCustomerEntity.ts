import axios from "@/api/axios";
import { RequestOptions, groundxRequestConfig, groundxUrl } from "@/api/common";

import { GroundXCustomer } from "./sdkTypes";

export interface GroundXCustomerResponse {
  customer: GroundXCustomer;
}

export const getGroundXCustomer = async (options?: RequestOptions): Promise<GroundXCustomerResponse> => {
  const response = await axios.get<GroundXCustomerResponse>(groundxUrl("/v1/customer"), groundxRequestConfig(options));
  return response.data;
};

