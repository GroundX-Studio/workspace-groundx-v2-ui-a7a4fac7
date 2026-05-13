export const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "mail.com",
  "googlemail.com",
  "fastmail.com",
  "hey.com",
  "duck.com",
]);

export const getEmailType = (email: string): "personal" | "business" | "invalid" => {
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split("@");

  if (parts.length !== 2 || !parts[0] || !parts[1]) return "invalid";

  return PERSONAL_EMAIL_DOMAINS.has(parts[1]) ? "personal" : "business";
};
