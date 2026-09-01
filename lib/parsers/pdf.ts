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
// Helpers
// ---------------------------------------------------------------------------

/** Round a coordinate to the nearest multiple of `snapTo`. */
function snapCoord(value: number, snapTo: number): number {
  return Math.round(value / snapTo) * snapTo;
}

/**
 * Given a set of text items that belong to a single horizontal band,
 * decide if they form a table row (i.e. 2+ distinct x-positions with
 * a reasonable gap between them).
 */
function isTableBand(items: PdfTextItem[], minCols = 2): boolean {
  const xs = new Set(items.map((i) => snapCoord(i.transform[4], 6)));
  return xs.size >= minCols;
}

/**
 * Convert a group of items that form a table (multiple rows × multiple cols)
 * into a Markdown pipe-table string.
 */
function renderTableMarkdown(rows: PdfTextItem[][]): string {
  // Collect all unique x positions (columns) across all rows
  const allXs = new Set<number>();
  for (const row of rows) {
    for (const item of row) {
      allXs.add(snapCoord(item.transform[4], 6));
    }
  }
  const sortedXs = Array.from(allXs).sort((a, b) => a - b);
  const numCols = sortedXs.length;

  // Build cell grid
  const grid: string[][] = rows.map((rowItems) => {
    const cells = Array<string>(numCols).fill('');
    for (const item of rowItems) {
      const col = sortedXs.indexOf(snapCoord(item.transform[4], 6));
      if (col !== -1) {
        cells[col] = (cells[col] + ' ' + item.str).trim();
      }
    }
    return cells.map((c) => c.replace(/\|/g, '\\|'));
  });

  const makeRow = (cells: string[]) => '| ' + cells.join(' | ') + ' |';
  const separator = '| ' + Array(numCols).fill('---').join(' | ') + ' |';

  return [makeRow(grid[0]), separator, ...grid.slice(1).map(makeRow)].join('\n');
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------

/**
 * Processes one PDF page's text items into a string that preserves table
 * structure as Markdown pipe-tables while leaving plain text untouched.
 *
 * Algorithm:
 *  1. Group items into horizontal bands by snapping their y-coordinate.
 *  2. Scan bands top→bottom. A band is a "table band" when it has ≥2
 *     distinct x-positions (i.e. multiple columns).
 *  3. Consecutive table bands form a table region; consecutive non-table
 *     bands form plain-text regions.
 *  4. Each region is rendered independently and joined.
 */
function renderPage(pageData: { getTextContent: () => Promise<PdfTextContent> }): Promise<string> {
  return pageData.getTextContent().then((textContent) => {
    const items = textContent.items.filter((i) => i.str.trim() !== '');
    if (items.length === 0) return '';

    // --- Step 1: group items into horizontal bands ---
    const Y_SNAP = 4; // pt tolerance for same-line items
    const bandMap = new Map<number, PdfTextItem[]>();
    for (const item of items) {
      const y = snapCoord(item.transform[5], Y_SNAP);
      if (!bandMap.has(y)) bandMap.set(y, []);
      bandMap.get(y)!.push(item);
    }

    // Sort bands top→bottom (PDF y-axis grows upward, so higher y = higher on page)
    const sortedYs = Array.from(bandMap.keys()).sort((a, b) => b - a);

    // --- Step 2 & 3: classify bands and group into regions ---
    type Region =
      | { type: 'table'; rows: PdfTextItem[][] }
      | { type: 'text'; lines: string[] };

    const regions: Region[] = [];

    for (const y of sortedYs) {
      const bandItems = bandMap.get(y)!.sort((a, b) => a.transform[4] - b.transform[4]);
      const isTable = isTableBand(bandItems);

      const last = regions[regions.length - 1];

      if (isTable) {
        if (last?.type === 'table') {
          last.rows.push(bandItems);
        } else {
          regions.push({ type: 'table', rows: [bandItems] });
        }
      } else {
        const lineText = bandItems.map((i) => i.str).join(' ').trim();
        if (last?.type === 'text') {
          last.lines.push(lineText);
        } else {
          regions.push({ type: 'text', lines: [lineText] });
        }
      }
    }

    // --- Step 4: render each region ---
    const parts: string[] = [];
    for (const region of regions) {
      if (region.type === 'table' && region.rows.length >= 2) {
        // Only render as table if there are at least 2 rows
        parts.push(renderTableMarkdown(region.rows));
      } else if (region.type === 'table') {
        // Single-row "table" is just plain text
        const line = region.rows[0].map((i) => i.str).join(' ').trim();
        parts.push(line);
      } else {
        parts.push(region.lines.filter(Boolean).join('\n'));
      }
    }

    return parts.filter(Boolean).join('\n\n') + '\n\n';
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts text from a PDF buffer, preserving table structure as Markdown
 * pipe-tables while leaving non-tabular text as plain text.
 *
 * Each page is segmented into horizontal bands. Consecutive bands with
 * ≥2 distinct x-positions are treated as table rows; everything else is
 * rendered as plain text lines.
 *
 * @param buffer - Raw bytes of the PDF file
 * @returns Extracted text with tables as Markdown pipe-tables
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer, {
    pagerender: renderPage as unknown as (pageData: unknown) => Promise<string>,
  });

  return result.text.trim();
}
