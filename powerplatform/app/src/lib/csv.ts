/** Builds a CSV file and hands it to the browser to save. Values are quoted per RFC 4180. */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const quote = (v: string | number) => {
    const s = String(v ?? "");
    // A leading = + - @ would run as a formula in Excel; prefix it so it stays text.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const text = rows.map((r) => r.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
