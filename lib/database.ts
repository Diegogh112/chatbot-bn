import { Pool, PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Startup guard — Requirement 8.1, 8.4
// ---------------------------------------------------------------------------
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// ---------------------------------------------------------------------------
// Singleton Pool — connection pooling for serverless (Vercel)
// ---------------------------------------------------------------------------
let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Keep the pool small for serverless environments where multiple
      // function instances may run simultaneously.
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

// ---------------------------------------------------------------------------
// TypeScript interfaces — Requirement 7.2, 7.3
// ---------------------------------------------------------------------------

export interface Document {
  id: string;
  nombre: string;
  tipo: string;
  fecha_carga: string; // ISO 8601
}

export interface Chunk {
  id: string;
  document_id: string;
  texto: string;
  embedding: number[];
  posicion: number;
}

export interface ChunkWithSimilarity extends Chunk {
  similarity: number;
  nombre: string; // document nombre from JOIN with documents table
}

// ---------------------------------------------------------------------------
// API response shape — used by lib/rag.ts and app/api/chat/route.ts
// ---------------------------------------------------------------------------

export interface ChatResponse {
  answer: string;
  sources: string[]; // unique document nombres
}

// ---------------------------------------------------------------------------
// Helper — format a vector array as the pgvector literal '[x,y,z,...]'
// ---------------------------------------------------------------------------
function formatVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

// ---------------------------------------------------------------------------
// insertDocument — Requirement 1.6, 7.2
// ---------------------------------------------------------------------------
export async function insertDocument(
  nombre: string,
  tipo: string,
): Promise<Document> {
  const { rows } = await getPool().query<Document>(
    `INSERT INTO documents (nombre, tipo)
     VALUES ($1, $2)
     RETURNING id, nombre, tipo, fecha_carga::text AS fecha_carga`,
    [nombre, tipo],
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// insertChunks — bulk insert; Requirement 1.5, 7.3
// ---------------------------------------------------------------------------
export async function insertChunks(
  chunks: Array<{ document_id: string; texto: string; embedding: number[]; posicion: number }>,
): Promise<void> {
  if (chunks.length === 0) return;

  // Build a multi-row VALUES clause: ($1,$2,$3,$4), ($5,$6,$7,$8), ...
  const values: unknown[] = [];
  const placeholders = chunks.map((chunk, i) => {
    const base = i * 4;
    values.push(
      chunk.document_id,
      chunk.texto,
      formatVector(chunk.embedding),
      chunk.posicion,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}::vector, $${base + 4})`;
  });

  await getPool().query(
    `INSERT INTO chunks (document_id, texto, embedding, posicion)
     VALUES ${placeholders.join(', ')}`,
    values,
  );
}

// ---------------------------------------------------------------------------
// insertDocumentWithChunks — atomic transaction helper; Requirement 1.6, 1.5, 1.11
// ---------------------------------------------------------------------------
export async function insertDocumentWithChunks(
  nombre: string,
  tipo: string,
  chunks: Array<{ texto: string; embedding: number[]; posicion: number }>,
): Promise<Document> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<Document>(
      `INSERT INTO documents (nombre, tipo)
       VALUES ($1, $2)
       RETURNING id, nombre, tipo, fecha_carga::text AS fecha_carga`,
      [nombre, tipo],
    );
    const document = rows[0];

    if (chunks.length > 0) {
      const values: unknown[] = [];
      const placeholders = chunks.map((chunk, i) => {
        const base = i * 4;
        values.push(
          document.id,
          chunk.texto,
          formatVector(chunk.embedding),
          chunk.posicion,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}::vector, $${base + 4})`;
      });

      await client.query(
        `INSERT INTO chunks (document_id, texto, embedding, posicion)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    await client.query('COMMIT');
    return document;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getDocuments — Requirement 2.1, 2.2
// ---------------------------------------------------------------------------
export async function getDocuments(): Promise<Document[]> {
  const { rows } = await getPool().query<Document>(
    `SELECT id, nombre, tipo, fecha_carga::text AS fecha_carga
     FROM documents
     ORDER BY fecha_carga DESC`,
  );
  return rows;
}

// ---------------------------------------------------------------------------
// getDocumentById — Requirement 2.2, 3.4
// ---------------------------------------------------------------------------
export async function getDocumentById(id: string): Promise<Document | null> {
  const { rows } = await getPool().query<Document>(
    `SELECT id, nombre, tipo, fecha_carga::text AS fecha_carga
     FROM documents
     WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// deleteDocument — Requirement 3.1, 3.2 (CASCADE handles chunks)
// ---------------------------------------------------------------------------
export async function deleteDocument(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `DELETE FROM documents WHERE id = $1`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// getChunksByDocumentId — returns all chunks for a document ordered by position
// ---------------------------------------------------------------------------
export async function getChunksByDocumentId(documentId: string): Promise<Chunk[]> {
  const { rows } = await getPool().query<{
    id: string;
    document_id: string;
    texto: string;
    posicion: number;
  }>(
    `SELECT id, document_id, texto, posicion
     FROM chunks
     WHERE document_id = $1
     ORDER BY posicion ASC`,
    [documentId],
  );
  return rows.map(row => ({
    id: row.id,
    document_id: row.document_id,
    texto: row.texto,
    embedding: [],
    posicion: Number(row.posicion),
  }));
}

// ---------------------------------------------------------------------------
// searchChunks — cosine similarity top-K via pgvector; Requirement 4.2, 7.1
// ---------------------------------------------------------------------------
export async function searchChunks(
  embedding: number[],
  topK: number,
): Promise<ChunkWithSimilarity[]> {
  const vectorLiteral = formatVector(embedding);

  const { rows } = await getPool().query<
    {
      id: string;
      document_id: string;
      texto: string;
      embedding: string; // pg returns vector as string
      posicion: number;
      similarity: string;
      nombre: string;
    }
  >(
    `SELECT
       c.id,
       c.document_id,
       c.texto,
       c.embedding::text AS embedding,
       c.posicion,
       (1 - (c.embedding <=> $1::vector))::float8 AS similarity,
       d.nombre
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [vectorLiteral, topK],
  );

  return rows.map((row) => ({
    id: row.id,
    document_id: row.document_id,
    texto: row.texto,
    // Parse the vector string "[x,y,z]" back to number[]
    embedding: row.embedding
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map(Number),
    posicion: Number(row.posicion),
    similarity: Number(row.similarity),
    nombre: row.nombre,
  }));
}
