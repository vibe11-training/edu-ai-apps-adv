function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function rowsToCsv(rows) {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
