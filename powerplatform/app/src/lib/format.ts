/** Number and date formatting, in the reader's own locale. */

const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });
const longDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const fmt = {
  n: (value: number) => integer.format(value),
  pct: (part: number, whole: number) => (whole ? percent.format(part / whole) : "Not available"),
  /** Formats a yyyy-mm-dd date without shifting it by the reader's time zone. */
  date: (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? longDate.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : "Not available"),
  plural: (n: number, one: string, many = `${one}s`) => `${integer.format(n)} ${n === 1 ? one : many}`,
};

/** Days from today to a yyyy-mm-dd date; negative when it has passed. */
export function daysUntil(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - start) / 86_400_000);
}
