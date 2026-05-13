export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export async function sendUpstreamResponse(response: Response, res: import("express").Response): Promise<void> {
  const data = await readJson(response);
  res.status(response.status).json(data);
}

export function basicAuth(email: string, password: string): string {
  return `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`;
}

export function ensureJsonHeaders(init: RequestInit = {}): Headers {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  return headers;
}
