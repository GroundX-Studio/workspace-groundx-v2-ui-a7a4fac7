import { FC, ReactNode, useCallback, useState } from "react";

import type { LoginI, RegisterI, UpdateAppMetadataInput, User } from "@/api/entities/customerEntity";
import { useApi } from "@/contexts/ApiContext";
import { useIsLoading } from "@/contexts/LoadingContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { SdkActionResult, sdkFailure, sdkSuccess } from "@/contexts/sdkContextTypes";

import { Auth, AuthContext, LoginReqCallback } from "./AuthContext";

const emptyAuth: Auth = {
  userName: "",
  token: "",
  isLoggedIn: false,
  xJwtToken: "",
};

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }): JSX.Element => {
  const api = useApi();
  const authApi = api.auth;
  const telemetryApi = api.telemetry;
  const { setIsLoading } = useIsLoading();
  const { setErrorMessage } = useMessageContext();
  const [auth, setAuth] = useState<Auth>(emptyAuth);
  const [user, setUser] = useState<User | null>(null);

  const getUserData = useCallback(
    async (userName = ""): Promise<SdkActionResult<User>> => {
      setIsLoading(true);
      try {
        const response = await authApi.getUserData(userName);
        if (response) {
          const customer = {
            ...response.customer,
            appMetadata: response.appMetadata ?? response.customer.appMetadata ?? null,
          };
          setUser(customer);
          setAuth({
            isLoggedIn: true,
            userName: response.username ?? customer.username,
            token: "",
            xJwtToken: "",
          });
          return sdkSuccess(customer);
        }
        // No user came back — not an error, but no response either; surface as a
        // failure so the caller (AppInitialization) routes to the login screen.
        return sdkFailure<User>(new Error("No user data"));
      } catch (error) {
        telemetryApi.captureException(error, { context: "AuthProvider.getUserData", userName });
        setErrorMessage("Could not get user data");
        return sdkFailure<User>(error);
      } finally {
        setIsLoading(false);
      }
    },
    [authApi, telemetryApi, setErrorMessage, setIsLoading]
  );

  const login = useCallback(
    async (data: LoginI): Promise<LoginReqCallback> => {
      try {
        const response = await authApi.login(data);
        if (response) {
          setAuth({
            isLoggedIn: true,
            userName: response.username,
            token: "",
            xJwtToken: "",
          });

          await getUserData(response.username);

          return { kind: "success" };
        }
      } catch (error) {
        telemetryApi.captureException(error, { context: "AuthProvider.login" });
        return { kind: "error", error };
      }

      return { kind: "failed" };
    },
    [authApi, getUserData, telemetryApi]
  );

  const register = useCallback(
    async (data: RegisterI): Promise<SdkActionResult<void>> => {
      setIsLoading(true);
      try {
        const response = await authApi.register(data);
        if (response) {
          setAuth({
            isLoggedIn: true,
            userName: response.username,
            token: "",
            xJwtToken: "",
          });

          await getUserData(response.username);
          return sdkSuccess(undefined);
        }
        return sdkFailure<void>(new Error("Registration failed"));
      } catch (error: unknown) {
        if ((error as { response?: { status?: number } })?.response?.status === 409) {
          setErrorMessage("An account with this email already exists. Please login or sign up with a different email.");
        } else {
          setErrorMessage("Registration failed. Please try again.");
        }
        return sdkFailure<void>(error);
      } finally {
        setIsLoading(false);
      }
    },
    [authApi, getUserData, setErrorMessage, setIsLoading]
  );

  const resetPassword = useCallback(
    async (email: string): Promise<SdkActionResult<void>> => {
      setIsLoading(true);
      try {
        const response = await authApi.resetUserPassword(email);
        if (response.message === "OK") return sdkSuccess(undefined);
        return sdkFailure<void>(new Error("Could not send reset code."));
      } catch (error: unknown) {
        setErrorMessage((error as { message?: string }).message || "Could not send reset code.");
        return sdkFailure<void>(error);
      } finally {
        setIsLoading(false);
      }
    },
    [authApi, setErrorMessage, setIsLoading]
  );

  const confirmChangingPassword = useCallback(
    async (code: string, email: string, password: string): Promise<SdkActionResult<void>> => {
      setIsLoading(true);
      try {
        const response = await authApi.confirmUserChangingPassword(code, email, password);
        if (response.message === "OK") return sdkSuccess(undefined);
        return sdkFailure<void>(new Error("Could not update password."));
      } catch (error: unknown) {
        setErrorMessage((error as { message?: string }).message || "Could not update password.");
        return sdkFailure<void>(error);
      } finally {
        setIsLoading(false);
      }
    },
    [authApi, setErrorMessage, setIsLoading]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      telemetryApi.captureException(error, { context: "AuthProvider.logout" });
    } finally {
      setUser(null);
      setAuth(emptyAuth);
    }
  }, [authApi, telemetryApi]);

  const updateAppMetadata = useCallback(
    async (metadata: UpdateAppMetadataInput): Promise<SdkActionResult<void>> => {
      setIsLoading(true);
      try {
        const appMetadata = await authApi.updateAppMetadata(metadata);
        setUser((currentUser) => {
          if (!currentUser) return currentUser;
          return {
            ...currentUser,
            appMetadata: {
              ...(currentUser.appMetadata ?? {}),
              ...appMetadata,
            },
          };
        });
        return sdkSuccess(undefined);
      } catch (error: unknown) {
        telemetryApi.captureException(error, { context: "AuthProvider.updateAppMetadata" });
        setErrorMessage("Could not update app metadata.");
        return sdkFailure<void>(error);
      } finally {
        setIsLoading(false);
      }
    },
    [authApi, telemetryApi, setErrorMessage, setIsLoading]
  );

  return (
    <AuthContext.Provider
      value={{
        auth,
        setAuth,
        login,
        register,
        logout,
        user,
        updateAppMetadata,
        resetPassword,
        getUserData,
        confirmChangingPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
