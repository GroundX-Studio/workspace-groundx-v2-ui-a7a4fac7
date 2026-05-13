import crypto from "node:crypto";

export function signValue(value: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(value);
  return `${value}.${hmac.digest("base64url")}`;
}

export function unsignValue(signedValue: string, secret: string): string | null {
  const dotIndex = signedValue.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const value = signedValue.slice(0, dotIndex);
  const expected = signValue(value, secret);
  const actualBuffer = Buffer.from(signedValue);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) return null;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer) ? value : null;
}

export function randomId(): string {
  return crypto.randomBytes(32).toString("hex");
}

function encryptionKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(value: string, secret: string): string {
  const data = Buffer.from(value, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
