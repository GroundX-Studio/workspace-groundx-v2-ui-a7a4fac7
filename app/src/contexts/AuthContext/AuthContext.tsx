import { createContext } from "react";

import { LoginI, RegisterI, UpdateAppMetadataInput, User } from "@/api/entities/customerEntity";

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
  register: (data: RegisterI) => Promise<{ isSuccess: boolean; error: boolean }>;
  logout: () => Promise<void>;
  getUserData: (username?: string) => Promise<{ response: User | null; error: boolean }>;
  updateAppMetadata: (metadata: UpdateAppMetadataInput) => Promise<{ isSuccess: boolean; error: boolean }>;
  resetPassword: (email: string) => Promise<{ isSuccess: boolean; error: boolean }>;
  confirmChangingPassword: (
    code: string,
    email: string,
    password: string
  ) => Promise<{ isSuccess: boolean; error: boolean }>;
}

export const AuthContext = createContext<AuthContextI | undefined>(undefined);
