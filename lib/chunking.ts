/**
 * Text chunking utilities for document ingestion.
 * Uses a sliding window approach with whitespace tokenisation (1 word ≈ 1 token).
 *
 * Requirements: 1.3
 */

/**
 * Split `text` into overlapping chunks of at most `maxTokens` words.
 *
 * @param text      - The source text to split.
 * @param maxTokens - Maximum number of tokens (words) per chunk. Default: 500.
 * @param overlap   - Number of tokens shared between consecutive chunks. Default: 50.
 * @returns Array of chunk strings. Returns an empty array when `text` is empty or
 *          contains only whitespace.
 */
export function chunkText(text: string, maxTokens = 500, overlap = 50): string[] {
  // Tokenise by whitespace (approximation: 1 word ≈ 1 token for chunking purposes)
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxTokens, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end === words.length) break;
    start += maxTokens - overlap; // advance window with overlap
  }
  return chunks;
}
