import mammoth from 'mammoth';

/**
 * Converts an HTML table element into a Markdown-formatted table string.
 * Used internally to preserve table structure when parsing DOCX files.
 */
function htmlTableToMarkdown(tableHtml: string): string {
  // Pull all rows from the table HTML
  const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!rowMatches) return '';

  const rows: string[][] = rowMatches.map((row) => {
    // Match both <th> and <td> cells
    const cellMatches = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [];
    return cellMatches.map((cell) =>
      cell
        .replace(/<[^>]+>/g, '') // strip inner HTML tags
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
  });

  if (rows.length === 0) return '';

  // Build Markdown table: header row | separator | data rows
  const colCount = Math.max(...rows.map((r) => r.length));
  const pad = (cells: string[]) =>
    '| ' + cells.map((c) => c || '').concat(Array(colCount - cells.length).fill('')).join(' | ') + ' |';

  const header = pad(rows[0]);
  const separator = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
  const body = rows.slice(1).map(pad);

  return [header, separator, ...body].join('\n');
}

/**
 * Replaces every <table>…</table> block in the HTML string with its
 * Markdown equivalent so the text extraction step preserves structure.
 */
function replaceTablesWithMarkdown(html: string): string {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match) =>
    '\n\n' + htmlTableToMarkdown(match) + '\n\n'
  );
}

/**
 * Strips remaining HTML tags from a string, turning block elements into
 * newlines and collapsing excess whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|div|h[1-6]|li|br)[^>]*>/gi, '\n') // block elements → newlines
    .replace(/<[^>]+>/g, '')                              // remove all other tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')                          // max two consecutive newlines
    .trim();
}

/**
 * Extracts plain text (with Markdown tables) from a DOCX file buffer.
 * Satisfies Requirements 1.1 (accept DOCX format) and 1.2 (extract full plain text content).
 *
 * Tables inside the document are rendered as Markdown tables so their
 * row/column structure is preserved through the RAG pipeline.
 *
 * @param buffer - Raw bytes of the DOCX file
 * @returns The extracted text content, with tables as Markdown tables
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  // convertToHtml preserves tables; extractRawText would flatten them
  const result = await mammoth.convertToHtml({ buffer });
  const htmlWithMarkdownTables = replaceTablesWithMarkdown(result.value);
  return stripHtml(htmlWithMarkdownTables);
}
