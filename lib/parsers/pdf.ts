import pdfParse from 'pdf-parse';

// ---------------------------------------------------------------------------
// Types for the pdfjs text-content items exposed by pdf-parse's render hook
// ---------------------------------------------------------------------------

interface PdfTextItem {
  str: string;
  transform: number[]; // [scaleX, skewX, skewY, scaleY, x, y]
  width: number;
  height: number;
}

interface PdfTextContent {
  items: PdfTextItem[];
}

// ---------------------------------------------------------------------------
// Table detection helpers
// ---------------------------------------------------------------------------

/** Round a coordinate to the nearest multiple of `snap` to group near-by items. */
function snap(value: number, snapTo: number): number {
  return Math.round(value / snapTo) * snapTo;
}

/**
 * Given a list of text items from a single PDF page, detect whether they form
 * a grid (table) and, if so, return a Markdown-formatted table.  Returns null
 * when no table structure is detected.
 *
 * Strategy:
 *  1. Collect all unique y-positions (rows) and x-positions (columns).
 *  2. If there are at least 2 rows AND at least 2 columns, treat it as a table.
 *  3. Map each item to its (row, col) cell and render as Markdown.
 */
function detectAndRenderTable(items: PdfTextItem[]): string | null {
  if (items.length < 4) return null; // need at least a 2x2 grid

  // Snap positions to a grid to absorb minor rendering jitter (4 pt tolerance)
  const SNAP = 4;

  const ys = new Set<number>();
  const xs = new Set<number>();

  for (const item of items) {
    if (!item.str.trim()) continue;
    ys.add(snap(item.transform[5], SNAP)); // baseline y
    xs.add(snap(item.transform[4], SNAP)); // left x
  }

  const sortedYs = Array.from(ys).sort((a, b) => b - a); // top→bottom (PDF y grows upward)
  const sortedXs = Array.from(xs).sort((a, b) => a - b); // left→right

  // Require at least 2 rows and 2 columns to call it a table
  if (sortedYs.length < 2 || sortedXs.length < 2) return null;

  // Build a cell map: [rowIndex][colIndex] → text
  const grid: Record<number, Record<number, string>> = {};

  for (const item of items) {
    if (!item.str.trim()) continue;
    const row = sortedYs.indexOf(snap(item.transform[5], SNAP));
    const col = sortedXs.indexOf(snap(item.transform[4], SNAP));
    if (row === -1 || col === -1) continue;
    grid[row] = grid[row] ?? {};
    // Multiple items may map to the same cell (e.g. bold + regular runs) — concatenate
    grid[row][col] = ((grid[row][col] ?? '') + ' ' + item.str).trim();
  }

  const numRows = sortedYs.length;
  const numCols = sortedXs.length;

  const getCell = (r: number, c: number) => (grid[r]?.[c] ?? '').replace(/\|/g, '\\|');

  // Build Markdown table
  const headerCells = Array.from({ length: numCols }, (_, c) => getCell(0, c));
  const header = '| ' + headerCells.join(' | ') + ' |';
  const separator = '| ' + Array(numCols).fill('---').join(' | ') + ' |';

  const bodyRows: string[] = [];
  for (let r = 1; r < numRows; r++) {
    const cells = Array.from({ length: numCols }, (_, c) => getCell(r, c));
    // Skip fully-empty rows
    if (cells.every((c) => c === '')) continue;
    bodyRows.push('| ' + cells.join(' | ') + ' |');
  }

  return [header, separator, ...bodyRows].join('\n');
}

// ---------------------------------------------------------------------------
// Page-level renderer
// ---------------------------------------------------------------------------

/**
 * Custom pdfjs page renderer used by pdf-parse.
 * Attempts to detect tables on each page and renders them as Markdown.
 * Non-tabular text is emitted as plain text in reading order.
 */
function buildPageRenderer() {
  // Accumulate page text across all pages
  const pages: string[] = [];

  function renderPage(pageData: { getTextContent: () => Promise<PdfTextContent> }): Promise<string> {
    return pageData.getTextContent().then((textContent) => {
      const items = textContent.items;

      // --- Try to detect a table in the full item list first ---
      const tableMarkdown = detectAndRenderTable(items);
      if (tableMarkdown) {
        pages.push(tableMarkdown);
        return tableMarkdown + '\n\n';
      }

      // --- Fall back to line-based plain text extraction ---
      // Group items by their snapped y-coordinate (line)
      const SNAP = 3;
      const lineMap: Record<number, PdfTextItem[]> = {};

      for (const item of items) {
        if (!item.str) continue;
        const y = snap(item.transform[5], SNAP);
        lineMap[y] = lineMap[y] ?? [];
        lineMap[y].push(item);
      }

      // Sort lines top→bottom (larger y = higher on page in PDF coords)
      const sortedYs = Object.keys(lineMap)
        .map(Number)
        .sort((a, b) => b - a);

      const lines: string[] = [];
      for (const y of sortedYs) {
        // Sort items within a line left→right
        const lineItems = lineMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
        lines.push(lineItems.map((i) => i.str).join(' ').trim());
      }

      const pageText = lines.filter(Boolean).join('\n');
      pages.push(pageText);
      return pageText + '\n\n';
    });
  }

  return renderPage;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts plain text from a PDF file buffer.
 * Satisfies Requirements 1.1 (accept PDF format) and 1.2 (extract full plain text content).
 *
 * Tables inside the PDF are detected heuristically based on the x/y positions
 * of text items and rendered as Markdown tables so their row/column structure
 * is preserved through the RAG pipeline.
 *
 * @param buffer - Raw bytes of the PDF file
 * @returns The extracted text content, with tables rendered as Markdown tables
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const renderer = buildPageRenderer();

  const result = await pdfParse(buffer, {
    // Provide a custom page renderer so we can access raw text items with
    // their position metadata (transform / width / height).
    pagerender: renderer as unknown as (pageData: unknown) => Promise<string>,
  });

  // pdf-parse concatenates the strings returned by pagerender into result.text,
  // but the renderer above already assembles the final content — use it directly.
  return result.text.trim();
}
