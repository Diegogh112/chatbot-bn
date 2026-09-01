/**
 * Text chunking utilities for document ingestion.
 * Uses a sliding window approach with whitespace tokenisation (1 word ≈ 1 token).
 *
 * Tables rendered as Markdown (lines starting with "|") are treated as atomic
 * blocks and never split across chunk boundaries.
 *
 * Requirements: 1.3
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Split the source text into logical blocks:
 *   - A "table" block is a consecutive run of lines that start with "|".
 *   - A "text" block is everything else (may span multiple paragraphs).
 *
 * This lets the chunker keep each Markdown table intact.
 */
function splitIntoBlocks(text: string): Array<{ type: 'table' | 'text'; content: string }> {
  const lines = text.split('\n');
  const blocks: Array<{ type: 'table' | 'text'; content: string }> = [];
  let buffer: string[] = [];
  let currentType: 'table' | 'text' = 'text';

  const flush = () => {
    if (buffer.length === 0) return;
    const content = buffer.join('\n').trim();
    if (content) blocks.push({ type: currentType, content });
    buffer = [];
  };

  for (const line of lines) {
    const isTableLine = /^\s*\|/.test(line);
    const lineType: 'table' | 'text' = isTableLine ? 'table' : 'text';

    if (lineType !== currentType) {
      flush();
      currentType = lineType;
    }
    buffer.push(line);
  }
  flush();

  return blocks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split `text` into overlapping chunks of at most `maxTokens` words.
 *
 * Tables (Markdown pipe-table blocks) are kept as atomic units:
 *   - A table that fits within `maxTokens` words is emitted as a single chunk.
 *   - A table that exceeds `maxTokens` words is still emitted as one chunk to
 *     avoid breaking row/column structure (the LLM context window is usually
 *     large enough to handle even wide tables).
 * Non-table text uses the original sliding-window algorithm.
 *
 * @param text      - The source text to split (may contain Markdown tables).
 * @param maxTokens - Maximum number of tokens (words) per chunk. Default: 500.
 * @param overlap   - Number of tokens shared between consecutive text chunks. Default: 50.
 * @returns Array of chunk strings. Returns an empty array when `text` is empty or
 *          contains only whitespace.
 */
export function chunkText(text: string, maxTokens = 500, overlap = 50): string[] {
  const blocks = splitIntoBlocks(text);
  const chunks: string[] = [];

  // Buffer for accumulating plain-text words between table blocks
  let wordBuffer: string[] = [];

  const flushWordBuffer = () => {
    if (wordBuffer.length === 0) return;
    let start = 0;
    while (start < wordBuffer.length) {
      const end = Math.min(start + maxTokens, wordBuffer.length);
      chunks.push(wordBuffer.slice(start, end).join(' '));
      if (end === wordBuffer.length) break;
      start += maxTokens - overlap;
    }
    wordBuffer = [];
  };

  for (const block of blocks) {
    if (block.type === 'table') {
      // Flush any accumulated plain text first so ordering is preserved
      flushWordBuffer();
      // Emit the entire table as one chunk (never split it)
      chunks.push(block.content);
    } else {
      // Append plain-text words to the running buffer
      const words = block.content.split(/\s+/).filter(Boolean);
      wordBuffer.push(...words);
    }
  }

  // Flush any remaining plain-text words
  flushWordBuffer();

  return chunks;
}
