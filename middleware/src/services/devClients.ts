import type {
  AuthResponse,
  ConfirmPasswordInput,
  GroundXClient,
  GroundXPartnerClient,
  LoginCustomerInput,
  RegisterCustomerInput,
  LlmClient,
} from "../types.js";

function devUsername(email: string): string {
  return email.trim().toLowerCase() || "dev-user@example.com";
}

export class DevGroundXPartnerClient implements GroundXPartnerClient {
  async registerCustomer(input: RegisterCustomerInput): Promise<AuthResponse> {
    return { username: devUsername(input.email), token: "dev-register-token" };
  }

  async loginCustomer(input: LoginCustomerInput): Promise<AuthResponse> {
    return { username: devUsername(input.email), token: "dev-login-token" };
  }

  async getCustomer(username: string): Promise<{ customer: Record<string, unknown> }> {
    return { customer: { username, email: username, first: "Dev", last: "User" } };
  }

  async requestPasswordReset(email: string): Promise<unknown> {
    return { message: `Development reset requested for ${email}` };
  }

  async confirmPasswordReset(_input: ConfirmPasswordInput): Promise<unknown> {
    return { message: "Development password reset confirmed" };
  }

  async createApiKey(username: string, name: string): Promise<string> {
    return `dev-api-key:${username}:${name}`;
  }

  async forward(path: string, init: RequestInit & { customerKey?: string }): Promise<Response> {
    return Response.json({ mode: "development", path, method: init.method ?? "GET", customerKey: init.customerKey ?? null });
  }
}

export class DevGroundXClient implements GroundXClient {
  async forward(path: string, init: RequestInit & { apiKey: string }): Promise<Response> {
    return Response.json({ mode: "development", path, method: init.method ?? "GET", hasApiKey: Boolean(init.apiKey) });
  }
}

export class DevLlmClient implements LlmClient {
  async forward(path: string, init: RequestInit): Promise<Response> {
    return Response.json({ mode: "development", path, method: init.method ?? "GET", answer: "Development LLM response" });
  }
}
