import pdfParse from 'pdf-parse';

/**
 * Extracts plain text from a PDF file buffer.
 * Satisfies Requirements 1.1 (accept PDF format) and 1.2 (extract full plain text content).
 *
 * @param buffer - Raw bytes of the PDF file
 * @returns The extracted plain text content
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}
