import { createContext } from "react";

import { LoginI, RegisterI, UpdateAppMetadataInput, User } from "@/api/entities/customerEntity";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface Auth {
  userName: string;
  token: string;
  isLoggedIn: boolean;
  xJwtToken: string;
}

export interface LoginReqCallback {
  isLoggedIn: boolean;
  error: boolean | unknown;
  banned: boolean;
}

export interface AuthContextI {
  auth: Auth;
  user: User | null;
  setAuth: React.Dispatch<React.SetStateAction<Auth>>;
  login: (data: LoginI) => Promise<LoginReqCallback>;
  register: (data: RegisterI) => Promise<SdkActionResult<void>>;
  logout: () => Promise<void>;
  getUserData: (username?: string) => Promise<SdkActionResult<User>>;
  updateAppMetadata: (metadata: UpdateAppMetadataInput) => Promise<SdkActionResult<void>>;
  resetPassword: (email: string) => Promise<SdkActionResult<void>>;
  confirmChangingPassword: (code: string, email: string, password: string) => Promise<SdkActionResult<void>>;
}

export const AuthContext = createContext<AuthContextI | undefined>(undefined);
