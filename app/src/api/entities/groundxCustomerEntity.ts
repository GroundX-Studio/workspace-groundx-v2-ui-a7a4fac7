import axios from "@/api/axios";
import { GroundXRequestOptions, groundxRequestConfig, groundxUrl } from "@/api/common";

import { GroundXCustomer } from "./sdkTypes";

export interface GroundXCustomerResponse {
  customer: GroundXCustomer;
}

export const getGroundXCustomer = async (options?: GroundXRequestOptions): Promise<GroundXCustomerResponse> => {
  const response = await axios.get<GroundXCustomerResponse>(groundxUrl("/v1/customer"), groundxRequestConfig(options));
  return response.data;
};

