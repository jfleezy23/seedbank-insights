function neutralizeFormulaText(value: string): string {
  // Spreadsheet programs can evaluate a CSV text field as a formula even when
  // the CSV syntax is correctly quoted. Preserve numeric analysis columns as
  // numbers while marking workbook-derived text as literal spreadsheet text.
  return /^[\u0000-\u0020\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function csvValue(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "string" ? neutralizeFormulaText(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvFromRows(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))].join("\r\n");
}
