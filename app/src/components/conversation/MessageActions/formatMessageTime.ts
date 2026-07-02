/**
 * Format a message's send time for the per-message footer.
 *
 * Pure + deterministic: both `ts` (the message time) and `now` (the current
 * time) are passed in, so there is no hidden `Date.now()` and tests are stable.
 * Same calendar day (local) → clock time only (`11:33 AM`); otherwise the date
 * is prefixed (`Jul 1, 11:33 AM`). Locale is pinned to en-US so the footer
 * reads consistently regardless of the host locale.
 */
const TIME_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatMessageTime(ts: number, now: number): string {
  const then = new Date(ts);
  const time = TIME_FMT.format(then);
  if (isSameLocalDay(then, new Date(now))) return time;
  return `${DATE_FMT.format(then)}, ${time}`;
}
