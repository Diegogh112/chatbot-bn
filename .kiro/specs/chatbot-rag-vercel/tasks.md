# Implementation Plan: Chatbot RAG — Next.js + TypeScript + Vercel

## Overview

Implementación incremental del chatbot RAG sobre Next.js App Router, TypeScript, PostgreSQL + pgvector (Supabase) y Cohere API. Cada tarea produce código funcional que se integra en la tarea siguiente, terminando con la interfaz de usuario y los tests de propiedades.

---

## Tasks

- [x] 1. Inicializar proyecto y configuración base
  - Crear proyecto Next.js con App Router y TypeScript (`npx create-next-app@latest`)
  - Instalar dependencias: `pg`, `cohere-ai`, `pdf-parse`, `mammoth`, `xlsx`, `fast-check`, `@types/pg`, `@types/pdf-parse`, `@types/mammoth`
  - Configurar `next.config.ts` con `serverExternalPackages: ['pdf-parse', 'mammoth']`
  - Crear `.env.local` con placeholders y `.env.example` con las variables documentadas
  - Crear `vercel.json` con configuración de runtime y timeout
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 2. Esquema SQL y migraciones
  - [x] 2.1 Crear archivo `supabase/migrations/001_initial_schema.sql`
    - Habilitar extensión `vector`
    - Definir tabla `documents` (id UUID PK, nombre TEXT, tipo TEXT, fecha_carga TIMESTAMPTZ)
    - Definir tabla `chunks` (id UUID PK, document_id UUID FK → documents ON DELETE CASCADE, texto TEXT, embedding vector(1024), posicion INTEGER)
    - Crear índice HNSW sobre `chunks.embedding` con `vector_cosine_ops`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 3. Capa de datos — `lib/database.ts`
  - [x] 3.1 Implementar cliente pg y helpers tipados
    - Guard de startup para `DATABASE_URL`
    - Singleton `Pool` con connection pooling
    - Funciones: `insertDocument`, `insertChunks`, `getDocuments`, `getDocumentById`, `deleteDocument`, `searchChunks` (cosine similarity top-K via pgvector)
    - Exportar interfaces TypeScript: `Document`, `Chunk`, `ChunkWithSimilarity`
    - _Requirements: 7.1, 7.2, 7.3, 8.1_

- [x] 4. Autenticación admin — `lib/auth.ts`
  - [x] 4.1 Implementar `validateAdminSecret`
    - Leer secreto desde header `x-admin-secret` y desde query param `secret`
    - Guard de startup para `ADMIN_SECRET`
    - Retornar `false` si la variable no está configurada
    - _Requirements: 1.9, 2.4, 3.5, 8.3, 8.4_
  - [ ]* 4.2 Escribir property test para autenticación admin (Property 7)
    - **Property 7: Admin endpoint authentication**
    - Para cualquier string distinto de `ADMIN_SECRET`, `validateAdminSecret` debe retornar `false`
    - Para el string igual a `ADMIN_SECRET`, debe retornar `true`
    - **Validates: Requirements 1.9, 2.4, 3.5**

- [x] 5. Chunking — `lib/chunking.ts`
  - [x] 5.1 Implementar `chunkText(text, maxTokens=500, overlap=50)`
    - Tokenización por whitespace (1 palabra ≈ 1 token)
    - Ventana deslizante con overlap de 50 tokens
    - Retornar array de strings
    - _Requirements: 1.3_
  - [ ]* 5.2 Escribir property test para invariante de tamaño de chunk (Property 2)
    - **Property 2: Chunking size invariant**
    - Para cualquier texto, ningún chunk debe superar 500 tokens
    - Dos chunks consecutivos deben compartir al menos `min(50, len)` tokens de sufijo/prefijo
    - **Validates: Requirements 1.3**
  - [ ]* 5.3 Escribir property test para cobertura completa del contenido (Property 3)
    - **Property 3: Chunking covers full content**
    - La unión de todos los chunks debe cubrir cada token del texto original
    - **Validates: Requirements 1.3**

- [ ] 6. Parsers de documentos
  - [x] 6.1 Implementar `lib/parsers/pdf.ts`
    - Wrapper de `pdf-parse` que acepta `Buffer` y retorna `string`
    - _Requirements: 1.1, 1.2_
  - [x] 6.2 Implementar `lib/parsers/docx.ts`
    - Wrapper de `mammoth` que acepta `Buffer` y retorna `string`
    - _Requirements: 1.1, 1.2_
  - [x] 6.3 Implementar `lib/parsers/xlsx.ts`
    - Wrapper de `xlsx` que acepta `Buffer` y retorna `string` (serialización de celdas)
    - _Requirements: 1.1, 1.2_
  - [ ]* 6.4 Escribir property test para validación exhaustiva de formatos (Property 1)
    - **Property 1: File format validation is exhaustive**
    - El validador debe aceptar exactamente `{pdf, docx, xlsx, txt}` y rechazar cualquier otra extensión
    - **Validates: Requirements 1.1, 1.8**

- [x] 7. Checkpoint — base sólida antes de los servicios externos
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Cliente de embeddings — `lib/embeddings.ts`
  - [x] 8.1 Implementar `embedTexts(texts: string[]): Promise<number[][]>`
    - Guard de startup para `COHERE_API_KEY`
    - Usar modelo `embed-multilingual-v3`, inputType `search_document`
    - Batching automático en grupos de 96 (límite Cohere)
    - _Requirements: 1.4, 8.2_
  - [x] 8.2 Implementar `embedQuery(question: string): Promise<number[]>`
    - Mismo modelo con inputType `search_query`
    - _Requirements: 4.1, 8.2_

- [x] 9. Cliente LLM — `lib/llm.ts`
  - [x] 9.1 Implementar `generateAnswer(prompt: string): Promise<string>`
    - Guard de startup para `COHERE_API_KEY`
    - Usar modelo `command-r` de Cohere
    - Manejar errores retornando descriptivo para propagación al caller
    - _Requirements: 4.3, 8.2_

- [x] 10. Pipeline RAG — `lib/rag.ts`
  - [x] 10.1 Implementar `ragQuery(question: string): Promise<ChatResponse>`
    - Constantes: `SIMILARITY_THRESHOLD = 0.4`, `TOP_K = 5`, `FALLBACK_ANSWER`
    - Flujo: embed question → searchChunks → threshold check → buildPrompt → generateAnswer → dedup sources
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [x] 10.2 Implementar `buildPrompt(question: string, context: string): string`
    - El prompt debe incluir todos los textos de chunks recuperados como substrings
    - _Requirements: 4.3_
  - [ ]* 10.3 Escribir property test para shape invariante de respuesta chat (Property 8)
    - **Property 8: Chat response shape invariant**
    - Para cualquier pregunta válida no vacía, la respuesta debe contener `answer` (string) y `sources` (array)
    - **Validates: Requirements 4.4**
  - [ ]* 10.4 Escribir property test para fallback por umbral de similitud (Property 9)
    - **Property 9: Fallback when similarity is below threshold**
    - Cuando similarity < 0.4 o no hay chunks, `answer` debe ser el FALLBACK_ANSWER y `sources` debe ser `[]`
    - **Validates: Requirements 4.5, 4.6**
  - [ ]* 10.5 Escribir property test para que el prompt contenga todos los textos de chunks (Property 10)
    - **Property 10: Prompt contains all retrieved chunk texts**
    - `buildPrompt` debe incluir el `texto` de cada chunk como substring
    - **Validates: Requirements 4.3**
  - [ ]* 10.6 Escribir property test para límite de Top-K chunks (Property 11)
    - **Property 11: Top-K retrieval count bound**
    - El número de chunks retornados por `searchChunks` no debe superar 5
    - **Validates: Requirements 4.2**
  - [ ]* 10.7 Escribir property test para unicidad de sources (Property 12)
    - **Property 12: Sources are unique document names**
    - En cualquier respuesta exitosa, el array `sources` no debe contener nombres duplicados
    - **Validates: Requirements 4.4**
  - [ ]* 10.8 Escribir property test para rechazo de pregunta vacía (Property 13)
    - **Property 13: Empty question is rejected**
    - Toda pregunta ausente, nula o compuesta únicamente de whitespace debe retornar HTTP 400 sin llamar a Cohere
    - **Validates: Requirements 4.7**

- [x] 11. API Routes — Upload e ingesta
  - [x] 11.1 Implementar `app/api/upload/route.ts`
    - `export const runtime = 'nodejs'` y `export const maxDuration = 60`
    - Validar `ADMIN_SECRET` → 401 si falla
    - Parsear multipart con `request.formData()`
    - Detectar extensión y delegar al parser correcto → 400 si formato no soportado
    - Chunk → embed en batches → transacción DB (INSERT documents + bulk INSERT chunks) → 201 `{id, nombre}`
    - Manejar errores Cohere → 502; DB → 500; no datos parciales
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11_

- [x] 12. API Routes — Gestión de documentos
  - [x] 12.1 Implementar `app/api/documents/route.ts` (GET)
    - Validar `ADMIN_SECRET` → 401
    - Retornar todos los documentos con campos id, nombre, tipo, fecha_carga
    - Lista vacía → 200 con `[]`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 12.2 Implementar `app/api/documents/[id]/route.ts` (DELETE)
    - Validar `ADMIN_SECRET` → 401
    - Eliminar documento; CASCADE elimina chunks → 200 con confirmación
    - Documento no encontrado → 404
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]* 12.3 Escribir property test para completitud de campos en document list (Property 14)
    - **Property 14: Document list field completeness**
    - Cada objeto en la respuesta debe contener `id` (UUID), `nombre` (string no vacío), `tipo` (string no vacío), `fecha_carga` (ISO 8601)
    - **Validates: Requirements 2.2**

- [x] 13. API Route — Chat
  - [x] 13.1 Implementar `app/api/chat/route.ts`
    - Validar presencia y no-vacío de `question` → 400
    - Llamar `ragQuery(question)` → 200 `{answer, sources}`
    - Propagar errores Cohere → 502; DB → 500
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

- [x] 14. Checkpoint — API completa antes de UI
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Componentes React
  - [x] 15.1 Implementar `components/Message.tsx`
    - Renderizar `answer` como texto
    - Renderizar `sources` como labels distintas bajo la respuesta
    - Mostrar mensaje de fallback cuando `sources` está vacío
    - _Requirements: 6.3, 6.6, 6.7_
  - [x] 15.2 Implementar `components/FileUpload.tsx`
    - Formulario de subida con input de archivo y botón de submit
    - Indicador de carga mientras la operación está en progreso
    - Mostrar error visible si la API retorna error
    - _Requirements: 5.3, 5.6, 5.7_
  - [x] 15.3 Implementar `components/Chat.tsx`
    - Campo de texto + botón de submit
    - Hilo de mensajes que acumula intercambios de la sesión
    - Deshabilitar submit y mostrar indicador de carga durante la petición
    - Mostrar error visible si la API retorna error
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [x] 16. Páginas
  - [x] 16.1 Implementar `app/page.tsx` — chat público
    - Montar `<Chat>` y conectar a `POST /api/chat`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_
  - [x] 16.2 Implementar `app/admin/page.tsx` — panel de administración
    - Cargar lista de documentos al montar via `GET /api/documents`
    - Montar `<FileUpload>` conectado a `POST /api/upload`
    - Mostrar lista de documentos con botón de eliminar por cada uno
    - Actualizar lista sin recarga de página tras subida o eliminación exitosa
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [ ] 17. Tests de propiedades de ingesta y persistencia
  - [ ]* 17.1 Escribir property test para round-trip de ingesta de documento (Property 4)
    - **Property 4: Document ingestion round-trip**
    - Tras una ingesta exitosa, el documento debe aparecer en `GET /api/documents` con el mismo `nombre` y `tipo`
    - **Validates: Requirements 1.6, 2.1, 2.2**
  - [ ]* 17.2 Escribir property test para round-trip de persistencia de chunks (Property 5)
    - **Property 5: Chunk persistence round-trip**
    - Consultar `chunks` por `document_id` debe retornar los mismos `texto` en los mismos `posicion` índices
    - **Validates: Requirements 1.5**
  - [ ]* 17.3 Escribir property test para eliminación completa de documento y chunks (Property 6)
    - **Property 6: Deletion removes document and all its chunks**
    - Tras `DELETE /api/documents/:id`, el documento no debe aparecer en el listado y no deben existir chunks con ese `document_id`
    - **Validates: Requirements 3.1, 3.2**

- [x] 18. Checkpoint final — todos los tests pasan
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia los requisitos específicos para trazabilidad completa
- Los checkpoints aseguran validación incremental antes de continuar
- Los property tests usan `fast-check` para generar casos arbitrarios y verificar invariantes universales
- Los unit tests verifican casos específicos y condiciones de borde
- Las properties 4, 5 y 6 (tasks 17.x) requieren una base de datos de test; pueden ejecutarse contra una DB de staging o usando un mock del pool de pg
- La transacción atómica en upload garantiza que no hay datos parciales ante fallos de Cohere o DB

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["4.1", "5.1", "6.1", "6.2", "6.3"] },
    { "id": 3, "tasks": ["4.2", "5.2", "5.3", "6.4", "8.1", "8.2", "9.1"] },
    { "id": 4, "tasks": ["10.1", "10.2"] },
    { "id": 5, "tasks": ["10.3", "10.4", "10.5", "10.6", "10.7", "10.8", "11.1"] },
    { "id": 6, "tasks": ["12.1", "12.2", "13.1"] },
    { "id": 7, "tasks": ["12.3", "15.1", "15.2", "15.3"] },
    { "id": 8, "tasks": ["16.1", "16.2"] },
    { "id": 9, "tasks": ["17.1", "17.2", "17.3"] }
  ]
}
```
