# Design Document

## Overview

Chatbot RAG (Retrieval-Augmented Generation) built on **Next.js App Router + TypeScript**, deployed to **Vercel** as serverless functions. Documents uploaded by administrators are parsed, chunked, embedded via **Cohere embed-multilingual-v3**, and stored in **PostgreSQL + pgvector (Supabase)**. End-users ask questions that are embedded, matched against stored chunks via cosine similarity, and answered by **Cohere command-r** with grounded context. A `/admin` page manages the document corpus; `/` is the public chat interface.

The architecture is stateless by design: no files are persisted to disk between requests (Vercel constraint); all state lives in the Supabase database.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Vercel Edge                        │
│                                                         │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  / page  │   │  /admin page │   │  API Routes     │  │
│  │ Chat UI  │   │  Admin UI    │   │  (serverless)   │  │
│  └────┬─────┘   └──────┬───────┘   └────────┬───────┘  │
│       │                │                    │           │
│       └────────────────┴──────────── POST/GET/DELETE ───┤
└─────────────────────────────────────────────────────────┘
                                               │
               ┌───────────────────────────────┼──────────────────┐
               │                               │                  │
        ┌──────▼──────┐               ┌────────▼──────┐   ┌───────▼──────┐
        │  Cohere API  │               │  Supabase DB   │   │  Cohere API  │
        │  embed-multi │               │  PostgreSQL     │   │  command-r   │
        │  v3          │               │  + pgvector     │   │  (LLM)       │
        └─────────────┘               └───────────────┘   └─────────────┘
```

**Request flow — upload:**
1. Admin → `POST /api/upload` (multipart + `x-admin-secret`)
2. Auth check → parse file in-memory → chunk text → batch-embed via Cohere
3. Transactional INSERT into `documents` + bulk INSERT into `chunks`
4. Return 201 `{id, nombre}`

**Request flow — chat:**
1. User → `POST /api/chat` `{question}`
2. Embed question → cosine similarity search (top-5) in pgvector
3. If max similarity < 0.4 or no chunks → fallback response
4. Assemble RAG prompt → Cohere command-r → return `{answer, sources}`

---

## Components

### API Layer (`app/api/`)

| Route | File | Purpose |
|---|---|---|
| `POST /api/upload` | `app/api/upload/route.ts` | Receive multipart, validate auth, orchestrate ingestion |
| `GET /api/documents` | `app/api/documents/route.ts` | List all documents (auth required) |
| `DELETE /api/documents/[id]` | `app/api/documents/[id]/route.ts` | Delete document + cascade chunks (auth required) |
| `POST /api/chat` | `app/api/chat/route.ts` | RAG query pipeline |

All API routes are Next.js Route Handlers (Edge-compatible where possible, Node.js runtime for upload).

### Library Layer (`lib/`)

| Module | Responsibility |
|---|---|
| `lib/database.ts` | pg connection pool, typed query helpers |
| `lib/embeddings.ts` | Cohere embed-multilingual-v3 client wrapper |
| `lib/llm.ts` | Cohere command-r client wrapper |
| `lib/chunking.ts` | Text splitting: 500-token window, 50-token overlap |
| `lib/rag.ts` | Orchestrates similarity search + prompt assembly + LLM call |
| `lib/parsers/pdf.ts` | pdf-parse wrapper |
| `lib/parsers/docx.ts` | mammoth wrapper |
| `lib/parsers/xlsx.ts` | xlsx/exceljs wrapper |

### UI Layer

| Component | File | Purpose |
|---|---|---|
| Chat page | `app/page.tsx` | Public chat interface |
| Admin page | `app/admin/page.tsx` | Document management UI |
| `<Chat>` | `components/Chat.tsx` | Chat input + message thread |
| `<Message>` | `components/Message.tsx` | Single answer + sources display |
| `<FileUpload>` | `components/FileUpload.tsx` | Upload form + progress |

---

## Interfaces & Data Models

### Database Schema

```sql
-- Enable extension (run once in Supabase SQL editor)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT        NOT NULL,
  tipo        TEXT        NOT NULL,
  fecha_carga TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  texto       TEXT        NOT NULL,
  embedding   vector(1024) NOT NULL,
  posicion    INTEGER     NOT NULL
);

-- HNSW index for fast cosine similarity queries
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
```

### TypeScript Types

```typescript
// lib/database.ts
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
}

// API request/response shapes
export interface UploadResponse {
  id: string;
  nombre: string;
}

export interface ChatRequest {
  question: string;
}

export interface ChatResponse {
  answer: string;
  sources: string[]; // unique document nombres
}
```

### Chunking Algorithm

```typescript
// lib/chunking.ts
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
```

### Embedding Client

```typescript
// lib/embeddings.ts
import { CohereClient } from 'cohere-ai';

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! });

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await cohere.embed({
    texts,
    model: 'embed-multilingual-v3',
    inputType: 'search_document',
  });
  return res.embeddings as number[][];
}

export async function embedQuery(question: string): Promise<number[]> {
  const res = await cohere.embed({
    texts: [question],
    model: 'embed-multilingual-v3',
    inputType: 'search_query',
  });
  return (res.embeddings as number[][])[0];
}
```

### RAG Pipeline

```typescript
// lib/rag.ts
export const SIMILARITY_THRESHOLD = 0.4;
export const TOP_K = 5;
export const FALLBACK_ANSWER = 'No encontré información suficiente en la base de conocimiento';

export async function ragQuery(question: string): Promise<ChatResponse> {
  const queryEmbedding = await embedQuery(question);
  const chunks = await searchChunks(queryEmbedding, TOP_K); // pgvector query

  if (chunks.length === 0 || chunks[0].similarity < SIMILARITY_THRESHOLD) {
    return { answer: FALLBACK_ANSWER, sources: [] };
  }

  const context = chunks.map(c => c.texto).join('\n\n');
  const prompt = buildPrompt(question, context);
  const answer = await generateAnswer(prompt);
  const sources = [...new Set(chunks.map(c => c.nombre))]; // unique doc names

  return { answer, sources };
}
```

### Auth Middleware

```typescript
// lib/auth.ts
export function validateAdminSecret(request: Request): boolean {
  const headerSecret = request.headers.get('x-admin-secret');
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  const configured = process.env.ADMIN_SECRET;
  if (!configured) return false;
  return headerSecret === configured || querySecret === configured;
}
```

---

## Error Handling

| Scenario | HTTP Status | Body |
|---|---|---|
| Missing/invalid ADMIN_SECRET | 401 | `{error: "Unauthorized"}` |
| Unsupported file format | 400 | `{error: "Unsupported file format: <ext>"}` |
| Missing/empty question | 400 | `{error: "question is required"}` |
| Document not found | 404 | `{error: "Document not found"}` |
| Cohere API failure | 502 | `{error: "Embedding service unavailable"}` |
| Database failure | 500 | `{error: "Internal server error"}` |
| Missing env var | 500 | `{error: "Server misconfiguration"}` |

**Atomicity on upload:** The upload handler wraps `INSERT INTO documents` + bulk `INSERT INTO chunks` in a single database transaction. If the Cohere embed call fails, neither insert is attempted. If the DB transaction fails, it rolls back entirely — no partial data.

**Env var validation:** Each module (database, embeddings, llm) performs a startup guard:
```typescript
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}
```

---

## Vercel Deployment Constraints

- **No filesystem persistence**: All file processing uses in-memory `Buffer`; the original file bytes are discarded after chunking/embedding.
- **Serverless function timeout**: Upload route uses `export const runtime = 'nodejs'` and `export const maxDuration = 60` (seconds) to allow processing large documents.
- **Connection pooling**: Use `pg` with a module-level singleton client or Supabase's connection pooler (PgBouncer) to avoid exhausting connections across serverless invocations.
- **Batch embedding**: Cohere embed accepts up to 96 texts per request; large documents are split into batches of 96 chunks before embedding.

---

## File Structure

```
app/
  page.tsx                         # Public chat UI
  admin/
    page.tsx                       # Admin document management UI
  api/
    chat/
      route.ts                     # POST /api/chat
    upload/
      route.ts                     # POST /api/upload
    documents/
      route.ts                     # GET /api/documents
      [id]/
        route.ts                   # DELETE /api/documents/:id

lib/
  database.ts                      # PostgreSQL client + query helpers
  embeddings.ts                    # Cohere embed wrapper
  llm.ts                           # Cohere command-r wrapper
  chunking.ts                      # Text chunking (500 tokens, 50 overlap)
  rag.ts                           # RAG orchestration
  auth.ts                          # ADMIN_SECRET validation
  parsers/
    pdf.ts                         # pdf-parse wrapper
    docx.ts                        # mammoth wrapper
    xlsx.ts                        # xlsx/exceljs wrapper

components/
  Chat.tsx                         # Chat thread + input form
  Message.tsx                      # Single message + sources
  FileUpload.tsx                   # Upload form + progress indicator

supabase/
  migrations/
    001_initial_schema.sql         # documents + chunks tables + HNSW index
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: File format validation is exhaustive

*For any* string representing a file extension or MIME type, the format validator SHALL return `accepted` if and only if the type is one of `{pdf, docx, xlsx, txt}` — and `rejected` for all other inputs.

**Validates: Requirements 1.1, 1.8**

---

### Property 2: Chunking size invariant

*For any* non-empty text string, every chunk produced by `chunkText` SHALL have a token count of at most 500; and for any two consecutive chunks, they SHALL share a suffix/prefix of at least `min(50, chunk_length)` tokens.

**Validates: Requirements 1.3**

---

### Property 3: Chunking covers full content

*For any* text string, the concatenation of all chunk texts (with their overlaps) SHALL cover every token in the original text — no tokens are dropped.

**Validates: Requirements 1.3**

---

### Property 4: Document ingestion round-trip

*For any* valid document upload (correct auth, supported format), after a successful ingestion the document SHALL appear in the `GET /api/documents` response with the same `nombre` and `tipo` as the uploaded file.

**Validates: Requirements 1.6, 2.1, 2.2**

---

### Property 5: Chunk persistence round-trip

*For any* set of chunks generated and persisted for a given `document_id`, querying the `chunks` table by `document_id` SHALL return the same `texto` values at the same `posicion` indices.

**Validates: Requirements 1.5**

---

### Property 6: Deletion removes document and all its chunks

*For any* document that has been ingested (with any number of chunks), after a successful `DELETE /api/documents/:id`, the document SHALL NOT appear in `GET /api/documents`, and the `chunks` table SHALL contain zero rows with that `document_id`.

**Validates: Requirements 3.1, 3.2**

---

### Property 7: Admin endpoint authentication

*For any* request to an admin-protected endpoint (`POST /api/upload`, `GET /api/documents`, `DELETE /api/documents/:id`) where the provided secret does not equal `ADMIN_SECRET`, the system SHALL return HTTP 401 and SHALL NOT modify or expose any data.

**Validates: Requirements 1.9, 2.4, 3.5**

---

### Property 8: Chat response shape invariant

*For any* valid `POST /api/chat` request with a non-empty question (regardless of whether matching chunks are found), the HTTP 200 response body SHALL always contain exactly the fields `answer` (non-null string) and `sources` (array).

**Validates: Requirements 4.4**

---

### Property 9: Fallback when similarity is below threshold

*For any* question whose top retrieved chunk has a cosine similarity score strictly below 0.4 (or when no chunks exist), the `answer` field SHALL equal `"No encontré información suficiente en la base de conocimiento"` and `sources` SHALL be an empty array.

**Validates: Requirements 4.5, 4.6**

---

### Property 10: Prompt contains all retrieved chunk texts

*For any* set of retrieved chunks, the RAG prompt assembled by `buildPrompt` SHALL contain each chunk's `texto` as a substring, ensuring context is never silently dropped.

**Validates: Requirements 4.3**

---

### Property 11: Top-K retrieval count bound

*For any* question embedding queried against the vector store, the number of returned chunks SHALL be at most 5 (`TOP_K`).

**Validates: Requirements 4.2**

---

### Property 12: Sources are unique document names

*For any* successful chat response where chunks are returned above threshold, the `sources` array SHALL contain only unique `nombre` values — no document name appears more than once.

**Validates: Requirements 4.4**

---

### Property 13: Empty question is rejected

*For any* `POST /api/chat` request where the `question` field is absent, null, or composed entirely of whitespace, the system SHALL return HTTP 400 and SHALL NOT call the Cohere API.

**Validates: Requirements 4.7**

---

### Property 14: Document list field completeness

*For any* document returned by `GET /api/documents`, the response object SHALL contain all four required fields: `id` (UUID string), `nombre` (non-empty string), `tipo` (non-empty string), and `fecha_carga` (ISO 8601 timestamp string).

**Validates: Requirements 2.2**
