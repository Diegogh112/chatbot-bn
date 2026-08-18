import mammoth from 'mammoth';

/**
 * Extracts plain text from a DOCX file buffer.
 * Satisfies Requirements 1.1 (accept DOCX format) and 1.2 (extract full plain text content).
 *
 * @param buffer - Raw bytes of the DOCX file
 * @returns The extracted plain text content
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
