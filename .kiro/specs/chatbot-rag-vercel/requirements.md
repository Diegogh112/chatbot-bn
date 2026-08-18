# Requirements Document

## Introduction

Chatbot RAG (Retrieval-Augmented Generation) desplegado en Vercel usando Next.js App Router y TypeScript. El sistema permite a usuarios finales hacer preguntas en lenguaje natural y recibir respuestas generadas por el LLM Cohere command-r, enriquecidas con contexto extraído de documentos corporativos almacenados en PostgreSQL con pgvector. Un panel de administración permite gestionar el corpus documental (subir, listar y eliminar documentos). La protección del panel de administración se realiza mediante la variable de entorno `ADMIN_SECRET`.

## Glossary

- **System**: La aplicación Next.js App Router desplegada en Vercel.
- **Chat Interface**: La página pública `/` que expone la interacción de preguntas y respuestas.
- **Admin Panel**: La página `/admin` que permite gestionar documentos.
- **Document**: Archivo en formato PDF, DOCX, XLSX o TXT subido al sistema.
- **Chunk**: Fragmento de texto extraído de un Document, almacenado con su embedding vectorial.
- **Embedding**: Representación vectorial de un texto generada por el modelo Cohere embed-multilingual-v3.
- **Vector Store**: Base de datos PostgreSQL con extensión pgvector (Supabase) que almacena Chunks y sus Embeddings.
- **LLM**: Modelo de lenguaje Cohere command-r utilizado para generar respuestas.
- **Top-K Chunks**: Los 5 Chunks más relevantes recuperados del Vector Store mediante búsqueda de similitud vectorial.
- **ADMIN_SECRET**: Variable de entorno cuyo valor debe estar presente en el header `x-admin-secret` o en el query param `secret` para acceder a las rutas de administración.
- **DATABASE_URL**: Variable de entorno con la cadena de conexión a PostgreSQL (Supabase).
- **COHERE_API_KEY**: Variable de entorno con la clave de acceso a la API de Cohere.

---

## Requirements

### Requirement 1: Ingesta y procesamiento de documentos

**User Story:** As an administrator, I want to upload documents (PDF, DOCX, XLSX, TXT) so that the system can extract, chunk, embed, and store their content for retrieval.

#### Acceptance Criteria

1. WHEN an administrator submits a `POST /api/upload` request with a valid `ADMIN_SECRET` and a file attachment, THE System SHALL accept files in the formats PDF, DOCX, XLSX, and TXT.
2. WHEN a Document is received, THE System SHALL extract the full plain text content from the file.
3. WHEN the text of a Document has been extracted, THE System SHALL split the text into Chunks of at most 500 tokens, with an overlap of 50 tokens between consecutive Chunks.
4. WHEN Chunks are created, THE System SHALL generate an Embedding for each Chunk using the Cohere embed-multilingual-v3 model.
5. WHEN Embeddings are generated, THE System SHALL persist each Chunk (texto, embedding, posicion) in the `chunks` table linked to its parent Document via `document_id`.
6. WHEN a Document is successfully ingested, THE System SHALL persist a record in the `documents` table with the fields: id, nombre (original filename), tipo (file format), fecha_carga (upload timestamp).
7. WHEN a Document is successfully ingested, THE System SHALL return HTTP 201 with the created document id and nombre.
8. IF the file format is not PDF, DOCX, XLSX, or TXT, THEN THE System SHALL return HTTP 400 with an error message indicating the unsupported format.
9. IF the `ADMIN_SECRET` header `x-admin-secret` or query param `secret` does not match the configured `ADMIN_SECRET` environment variable, THEN THE System SHALL return HTTP 401 and reject the request.
10. IF the Cohere API returns an error during embedding generation, THEN THE System SHALL return HTTP 502 with an error message and SHALL NOT persist partial data.
11. IF the database operation fails during ingestion, THEN THE System SHALL return HTTP 500 with an error message and SHALL NOT persist partial data.

---

### Requirement 2: Listado de documentos

**User Story:** As an administrator, I want to list all uploaded documents so that I can see what is in the knowledge base.

#### Acceptance Criteria

1. WHEN an administrator submits a `GET /api/documents` request with a valid `ADMIN_SECRET`, THE System SHALL return HTTP 200 with a JSON array containing all Documents in the `documents` table.
2. THE System SHALL include the fields id, nombre, tipo, and fecha_carga for each Document in the response array.
3. WHEN no Documents exist in the `documents` table, THE System SHALL return HTTP 200 with an empty JSON array.
4. IF the `ADMIN_SECRET` is not provided or does not match, THEN THE System SHALL return HTTP 401 and reject the request.

---

### Requirement 3: Eliminación de documentos

**User Story:** As an administrator, I want to delete a document and all its associated chunks so that I can remove outdated or incorrect content from the knowledge base.

#### Acceptance Criteria

1. WHEN an administrator submits a `DELETE /api/documents/:id` request with a valid `ADMIN_SECRET`, THE System SHALL delete the Document record with the given id from the `documents` table.
2. WHEN a Document is deleted, THE System SHALL also delete all Chunks in the `chunks` table whose `document_id` matches the deleted Document id.
3. WHEN deletion is successful, THE System SHALL return HTTP 200 with a confirmation message.
4. IF no Document with the given id exists, THEN THE System SHALL return HTTP 404 with an error message.
5. IF the `ADMIN_SECRET` is not provided or does not match, THEN THE System SHALL return HTTP 401 and reject the request.

---

### Requirement 4: Chat público — consulta y respuesta

**User Story:** As a public user, I want to ask questions in natural language and receive answers grounded in the uploaded documents, so that I can find information without browsing raw files.

#### Acceptance Criteria

1. WHEN a user submits a `POST /api/chat` request with a non-empty `question` field, THE System SHALL generate an Embedding for the question using the Cohere embed-multilingual-v3 model.
2. WHEN the question Embedding is generated, THE System SHALL query the Vector Store to retrieve the Top-K Chunks (k=5) most similar to the question Embedding using pgvector cosine similarity.
3. WHEN Top-K Chunks are retrieved, THE System SHALL assemble a prompt containing the Chunk texts as context and forward the prompt to the LLM (Cohere command-r).
4. WHEN the LLM returns a response, THE System SHALL return HTTP 200 with a JSON object containing the fields: `answer` (LLM response text) and `sources` (array of unique Document nombres from the Top-K Chunks).
5. WHEN the Top-K Chunks retrieved have a cosine similarity score below 0.4, THE System SHALL return HTTP 200 with `answer` set to "No encontré información suficiente en la base de conocimiento" and `sources` set to an empty array.
6. WHEN the `chunks` table is empty (no documents have been ingested), THE System SHALL return HTTP 200 with `answer` set to "No encontré información suficiente en la base de conocimiento" and `sources` set to an empty array.
7. IF the `question` field is absent or empty in the request body, THEN THE System SHALL return HTTP 400 with an error message.
8. IF the Cohere API returns an error during question embedding or LLM inference, THEN THE System SHALL return HTTP 502 with an error message.

---

### Requirement 5: Panel de administración (/admin)

**User Story:** As an administrator, I want a web UI to upload, list, and delete documents so that I can manage the knowledge base without using raw API calls.

#### Acceptance Criteria

1. THE System SHALL render a page at the `/admin` route that provides a file upload form, a document list, and delete controls.
2. WHEN the admin page loads, THE System SHALL retrieve and display the list of Documents by calling `GET /api/documents` with the configured `ADMIN_SECRET`.
3. WHEN an administrator selects a file and submits the upload form, THE System SHALL call `POST /api/upload` with the file and the configured `ADMIN_SECRET`.
4. WHEN a Document is successfully uploaded via the admin form, THE System SHALL refresh the document list without a full page reload.
5. WHEN an administrator clicks the delete button for a Document, THE System SHALL call `DELETE /api/documents/:id` with the configured `ADMIN_SECRET` and remove the Document from the displayed list upon success.
6. WHILE an upload or delete operation is in progress, THE System SHALL display a loading indicator in the UI.
7. IF an API call from the admin page returns an error, THE System SHALL display a user-visible error message describing the failure.

---

### Requirement 6: Página de chat pública (/)

**User Story:** As a public user, I want a web UI to submit questions and read answers so that I can interact with the chatbot without using raw API calls.

#### Acceptance Criteria

1. THE System SHALL render a chat interface at the `/` route that includes a text input field and a submit button.
2. WHEN a user submits a question via the chat interface, THE System SHALL call `POST /api/chat` with the question text.
3. WHEN the API returns a successful response, THE System SHALL display the `answer` text and the list of source document names (`sources`) in the chat interface.
4. WHILE a chat request is in progress, THE System SHALL disable the submit button and display a loading indicator.
5. IF the API returns an error, THE System SHALL display a user-visible error message in the chat interface.
6. WHEN `sources` is a non-empty array, THE System SHALL render each source document name as a distinct label beneath the answer.
7. WHEN `answer` is "No encontré información suficiente en la base de conocimiento", THE System SHALL display that message and render an empty sources section.

---

### Requirement 7: Esquema de base de datos

**User Story:** As a developer, I want the database schema to be well-defined so that all components interact with a consistent data model.

#### Acceptance Criteria

1. THE System SHALL use a PostgreSQL database with the pgvector extension enabled.
2. THE System SHALL maintain a `documents` table with columns: `id` (UUID primary key), `nombre` (text, not null), `tipo` (text, not null), `fecha_carga` (timestamptz, not null, default now()).
3. THE System SHALL maintain a `chunks` table with columns: `id` (UUID primary key), `document_id` (UUID, foreign key referencing `documents.id` with ON DELETE CASCADE), `texto` (text, not null), `embedding` (vector(1024), not null), `posicion` (integer, not null).
4. THE System SHALL create an HNSW or IVFFlat index on `chunks.embedding` to support efficient cosine similarity queries.

---

### Requirement 8: Configuración de variables de entorno

**User Story:** As a developer, I want all secrets and external service URLs to be managed via environment variables so that no credentials are hardcoded in the codebase.

#### Acceptance Criteria

1. THE System SHALL read the PostgreSQL connection string exclusively from the `DATABASE_URL` environment variable.
2. THE System SHALL read the Cohere API key exclusively from the `COHERE_API_KEY` environment variable.
3. THE System SHALL read the admin secret exclusively from the `ADMIN_SECRET` environment variable.
4. IF any of `DATABASE_URL`, `COHERE_API_KEY`, or `ADMIN_SECRET` is not set at startup, THEN THE System SHALL log an error and refuse to handle requests that depend on the missing variable.
