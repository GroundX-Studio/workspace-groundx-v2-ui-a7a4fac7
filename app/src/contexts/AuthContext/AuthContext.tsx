import { createContext } from "react";

import { LoginI, RegisterI, UpdateAppMetadataInput, User } from "@/api/entities/customerEntity";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface Auth {
  userName: string;
  token: string;
  isLoggedIn: boolean;
  xJwtToken: string;
}

/**
 * Result of `AuthProvider.login`. A discriminated union whose variant set is
 * derived from the producer's real branches (success / thrown-error /
 * no-response) plus the `banned` outcome the Login view routes on. Replaces a
 * flat three-boolean record whose type was wider than its value space — the
 * meaningless combinations (`{isLoggedIn:true; error:true}`, the all-false
 * silent no-op) are now unrepresentable. `error` rides ONLY the error variant.
 */
export type LoginReqCallback =
  | { kind: "success" }
  | { kind: "error"; error: unknown }
  | { kind: "banned" }
  | { kind: "failed" };

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
