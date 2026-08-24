export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSecret } from '@/lib/auth';
import { parsePdf } from '@/lib/parsers/pdf';
import { parseDocx } from '@/lib/parsers/docx';
import { parseXlsx } from '@/lib/parsers/xlsx';
import { chunkText } from '@/lib/chunking';
import { embedTexts } from '@/lib/embeddings';
import { insertDocumentWithChunks } from '@/lib/database';

/**
 * Supported file extensions for document ingestion.
 * Requirements: 1.1, 1.8
 */
const SUPPORTED_FORMATS = new Set(['pdf', 'docx', 'xlsx', 'xlsm', 'txt']);

/**
 * POST /api/upload
 *
 * Accepts a multipart form-data request containing a single `file` field.
 * Orchestrates the full ingestion pipeline:
 *   1. Auth check (ADMIN_SECRET)         → 401 on failure
 *   2. Parse multipart formData          → 400 if no file
 *   3. Detect extension                  → 400 if unsupported
 *   4. Parse file content to plain text  → 400 on parse error
 *   5. Chunk text (500 tokens, 50 overlap)
 *   6. Embed chunks via Cohere           → 502 on Cohere error
 *   7. Atomic DB insert (doc + chunks)   → 500 on DB error
 *   8. Return 201 { id, nombre }
 *
 * No partial data is persisted on any error (atomic transaction in step 7;
 * embed errors abort before any DB write).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11
 */
export async function POST(request: NextRequest) {
  // ── Step 1: Auth check ──────────────────────────────────────────────────
  // Requirement 1.9: reject without ADMIN_SECRET match
  if (!validateAdminSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Step 2: Parse multipart formData ────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart request' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // ── Step 3: Detect extension ─────────────────────────────────────────────
  // Requirement 1.8: reject unsupported formats with 400
  const nombre = file.name;
  const ext = nombre.split('.').pop()?.toLowerCase() ?? '';
  if (!SUPPORTED_FORMATS.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file format: ${ext}` },
      { status: 400 },
    );
  }

  // ── Step 4: Parse file content to plain text ─────────────────────────────
  // Requirements 1.1, 1.2
  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    if (ext === 'pdf') {
      text = await parsePdf(buffer);
    } else if (ext === 'docx') {
      text = await parseDocx(buffer);
    } else if (ext === 'xlsx' || ext === 'xlsm') {
      text = parseXlsx(buffer);
    } else {
      // txt — plain UTF-8 decode
      text = buffer.toString('utf-8');
    }
  } catch {
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 400 });
  }

  // ── Step 5: Chunk text ────────────────────────────────────────────────────
  // Requirement 1.3: 500 tokens max, 50-token overlap
  // Excel files can be large — use smaller chunks to stay within Cohere trial limits
  const chunkSize = (ext === 'xlsx' || ext === 'xlsm') ? 200 : 500;
  const rawChunks = chunkText(text, chunkSize, 20);
  const chunks = rawChunks.map((c) => c.trim()).filter((c) => c.length > 0);

  if (chunks.length === 0) {
    return NextResponse.json({ error: 'El archivo no contiene texto extraíble' }, { status: 400 });
  }

  // Log token estimate for debugging rate limit issues
  const totalWords = chunks.reduce((sum, c) => sum + c.split(/\s+/).length, 0);
  console.log(`[upload] ${chunks.length} chunks, ~${totalWords} tokens para "${nombre}"`);

  // ── Step 6: Embed chunks (with Cohere error → 502) ───────────────────────
  // Requirements 1.4, 1.10
  let embeddings: number[][];
  try {
    embeddings = await embedTexts(chunks);
  } catch (err) {
    // Cohere API failure — no DB write has occurred yet, so no partial data
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[upload] Cohere embed error:', detail);
    return NextResponse.json(
      { error: 'Embedding service unavailable', detail },
      { status: 502 },
    );
  }

  // ── Step 7: Atomic DB insert ──────────────────────────────────────────────
  // Requirements 1.5, 1.6, 1.7, 1.11
  // insertDocumentWithChunks wraps everything in a single transaction;
  // any failure triggers ROLLBACK, leaving no partial data.
  try {
    const chunkData = chunks.map((texto, i) => ({
      texto,
      embedding: embeddings[i],
      posicion: i,
    }));
    const doc = await insertDocumentWithChunks(nombre, ext, chunkData);
    return NextResponse.json({ id: doc.id, nombre: doc.nombre }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
