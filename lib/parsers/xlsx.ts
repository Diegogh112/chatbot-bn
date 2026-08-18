import * as XLSX from 'xlsx';

/**
 * Extracts plain text from an Excel (XLSX/XLS/etc.) file buffer.
 * Iterates over all sheets in the workbook and serializes each one to
 * CSV-like text, joining them with newlines.
 *
 * Satisfies Requirements 1.1 (accept XLSX format) and 1.2 (extract full
 * plain text content from the file).
 *
 * @param buffer - Raw bytes of the Excel file
 * @returns The extracted plain text content from all sheets combined
 */
export function parseXlsx(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetTexts = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_txt(sheet);
  });

  return sheetTexts.join('\n');
}
