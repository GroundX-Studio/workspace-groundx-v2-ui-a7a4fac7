import type { AppEnv } from "../config/env.js";
import type {
  AuthResponse,
  ConfirmPasswordInput,
  GroundXPartnerClient,
  LoginCustomerInput,
  RegisterCustomerInput,
} from "../types.js";
import { basicAuth, ensureJsonHeaders, readJson } from "./http.js";

export class FetchGroundXPartnerClient implements GroundXPartnerClient {
  constructor(private env: AppEnv) {}

  async registerCustomer(input: RegisterCustomerInput): Promise<AuthResponse> {
    const response = await this.forward("/customer/register", {
      method: "POST",
      headers: { Authorization: basicAuth(input.email, input.password) },
      body: JSON.stringify({
        customer: {
          first: input.first,
          last: input.last,
          company: input.company,
          partnerUserId: input.partnerUserId,
          phone: input.phone,
        },
      }),
    });
    if (!response.ok) throw await this.error(response, "GroundX register failed");
    return this.parseAuth(response);
  }

  async loginCustomer(input: LoginCustomerInput): Promise<AuthResponse> {
    const response = await this.forward("/customer/login", {
      method: "POST",
      headers: { Authorization: basicAuth(input.email, input.password) },
    });
    if (!response.ok) throw await this.error(response, "GroundX login failed");
    return this.parseAuth(response);
  }

  async getCustomer(username: string): Promise<{ customer: Record<string, unknown> }> {
    const response = await this.forward(`/customer/${encodeURIComponent(username)}`, { method: "GET" });
    if (!response.ok) throw await this.error(response, "GroundX customer lookup failed");
    return (await response.json()) as { customer: Record<string, unknown> };
  }

  async requestPasswordReset(email: string): Promise<unknown> {
    const response = await this.forward("/customer/password/reset", {
      method: "GET",
      body: JSON.stringify({ customer: { email } }),
    });
    if (!response.ok) throw await this.error(response, "GroundX password reset failed");
    return readJson(response);
  }

  async confirmPasswordReset(input: ConfirmPasswordInput): Promise<unknown> {
    const response = await this.forward("/customer/password/confirm", {
      method: "GET",
      headers: { Authorization: basicAuth(input.email, input.newPassword) },
      body: JSON.stringify({ customer: { code: input.code } }),
    });
    if (!response.ok) throw await this.error(response, "GroundX password confirm failed");
    return readJson(response);
  }

  async createApiKey(username: string, name: string): Promise<string> {
    const response = await this.forward("/apikey", {
      method: "POST",
      customerKey: username,
      body: JSON.stringify({ apiKey: { name } }),
    });
    if (!response.ok) throw await this.error(response, "GroundX API key create failed");
    const data = (await response.json()) as { apiKeys?: Array<{ apiKey: string }> };
    const apiKey = data.apiKeys?.[0]?.apiKey;
    if (!apiKey) throw new Error("GroundX did not return an API key");
    return apiKey;
  }

  async forward(path: string, init: RequestInit & { customerKey?: string }): Promise<Response> {
    const headers = ensureJsonHeaders(init);
    headers.set("X-API-Key", this.env.GROUNDX_PARTNER_API_KEY ?? "");
    if (init.customerKey) headers.set("X-Customer-Key", init.customerKey);
    return fetch(`${this.env.GROUNDX_BASE_URL}${path}`, { ...init, headers });
  }

  private async parseAuth(response: Response): Promise<AuthResponse> {
    const data = (await response.json()) as { token: string; username?: string; customer?: { username?: string } };
    const username = data.username ?? data.customer?.username;
    if (!username) throw new Error("GroundX auth response did not include username");
    return { token: data.token, username };
  }

  private async error(response: Response, label: string): Promise<Error> {
    const body = await response.text();
    return Object.assign(new Error(`${label}: ${response.status}`), { status: response.status, body });
  }
}
