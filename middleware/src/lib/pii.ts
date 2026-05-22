/**
 * PII scrubber — shared by pino, PostHog, Sentry, GA, Hotjar surfaces.
 *
 * Conservative regex pass. Not a substitute for a real DLP service, but it's a
 * single integration point so we never grow divergent scrub logic per
 * surface. Add a pattern here and every downstream surface inherits it.
 */

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// PHONE: requires at least one separator (space, dot, dash) between segments
// so a bare 10-digit run is not classified as a phone — those get handled by
// the account / CC patterns when they appear in those contexts.
const PHONE = /(?:\+?\d{1,3}[\s.-]+)?\(?\d{3}\)?[\s.-]+\d{3}[\s.-]+\d{4}\b/g;
// SSN: 3-2-4 with separators. Won't match all variants but catches the common form.
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
// Credit card (Luhn-free; covers 13-19 contiguous digits with optional spaces/dashes).
const CREDIT_CARD = /\b(?:\d[ -]*?){13,19}\b/g;
// Account-number-ish: "account ... <6+ digits>". Captures the leading context
// word so "account no. 1234567890" → "[REDACTED]" as a single phrase.
const ACCOUNT_NUMBER_HINT = /\baccount\s*(?:#|no\.?|number)?\s*:?\s*\d{6,}\b/gi;

export interface ScrubOptions {
  /** Replacement label per category. Default: "[REDACTED]". */
  placeholder?: string;
  /** When true, emit a category-tagged replacement: `[REDACTED:email]`. */
  categorize?: boolean;
}

export function scrubString(input: string, opts: ScrubOptions = {}): string {
  const placeholder = opts.placeholder ?? "[REDACTED]";
  const tag = (category: string): string => (opts.categorize ? `[REDACTED:${category}]` : placeholder);
  return input
    .replace(EMAIL, tag("email"))
    .replace(SSN, tag("ssn"))
    .replace(CREDIT_CARD, tag("card"))
    // Account context-words come BEFORE phone — "account no. 1234567890" is a
    // single phrase, not "the word `account` next to a phone-shaped run".
    .replace(ACCOUNT_NUMBER_HINT, tag("account"))
    .replace(PHONE, tag("phone"));
}

/**
 * Deep-scrub an arbitrary JSON-serializable value. Cycles are detected via a
 * visited Set; cyclic refs are replaced with `"[CYCLE]"`.
 */
export function scrubValue<T>(value: T, opts: ScrubOptions = {}, seen: WeakSet<object> = new WeakSet()): T {
  if (typeof value === "string") return scrubString(value, opts) as unknown as T;
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[CYCLE]" as unknown as T;
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry, opts, seen)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = scrubValue(v, opts, seen);
  }
  return out as unknown as T;
}
