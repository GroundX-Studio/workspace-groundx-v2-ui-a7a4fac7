export interface SessionRecord {
  id: string;
  groundxUsername: string;
  groundxApiKeyEnc?: string | null;
  expiresAt: Date;
}

export interface AppUserMetadata {
  groundxUsername: string;
  onboardingState?: string | null;
  uiPreferencesJson?: string | null;
  featureFlagsJson?: string | null;
  lastActiveProjectId?: string | null;
  acceptedTermsAt?: Date | null;
  appRole?: string | null;
}

export interface AppRepository {
  createSchema(): Promise<void>;
  createSession(session: SessionRecord): Promise<void>;
  getSession(id: string): Promise<SessionRecord | null>;
  deleteSession(id: string): Promise<void>;
  upsertMetadata(metadata: AppUserMetadata): Promise<void>;
  getMetadata(groundxUsername: string): Promise<AppUserMetadata | null>;
}

export interface GroundXPartnerClient {
  registerCustomer(input: RegisterCustomerInput): Promise<AuthResponse>;
  loginCustomer(input: LoginCustomerInput): Promise<AuthResponse>;
  getCustomer(username: string): Promise<{ customer: Record<string, unknown> }>;
  requestPasswordReset(email: string): Promise<unknown>;
  confirmPasswordReset(input: ConfirmPasswordInput): Promise<unknown>;
  createApiKey(username: string, name: string): Promise<string>;
  forward(path: string, init: RequestInit & { customerKey?: string }): Promise<Response>;
}

export interface GroundXClient {
  forward(path: string, init: RequestInit & { apiKey: string }): Promise<Response>;
}

export interface LlmClient {
  forward(path: string, init: RequestInit): Promise<Response>;
}

export interface RegisterCustomerInput {
  email: string;
  password: string;
  first?: string;
  last?: string;
  company?: string;
  partnerUserId?: string;
  phone?: string;
}

export interface LoginCustomerInput {
  email: string;
  password: string;
}

export interface ConfirmPasswordInput {
  email: string;
  newPassword: string;
  code: string;
}

export interface AuthResponse {
  token: string;
  username: string;
}
