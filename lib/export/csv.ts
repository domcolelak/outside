const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Encodes an untrusted value as a CSV cell and prevents spreadsheet formula
 * execution when an exported file is opened in Excel or similar software.
 */
export function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  const safe = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
