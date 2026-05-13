import axios from "axios";

import { ROUTER_PATHS } from "@/router/routerPaths";

const axiosInstance = axios.create({
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true,
  timeout: 30000,
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === "ERR_BAD_REQUEST" && error?.response?.data?.error === "This customer is archived") {
      localStorage.clear();
      localStorage.setItem("banned", "archived");
      window.location.href = ROUTER_PATHS.BANNED;
    }

    if (error?.response?.status === 403 && error?.response?.data?.error === "Token not valid.") {
      window.location.href = ROUTER_PATHS.AUTH_LOGIN;
    }

    return Promise.reject((error?.response && error?.response.data) || "Something went wrong");
  }
);

export default axiosInstance;
