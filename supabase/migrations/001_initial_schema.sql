-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table: stores metadata for each uploaded document
CREATE TABLE documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT        NOT NULL,
  tipo        TEXT        NOT NULL,
  fecha_carga TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chunks table: stores text fragments and their vector embeddings
CREATE TABLE chunks (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID         NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  texto       TEXT         NOT NULL,
  embedding   vector(1024) NOT NULL,
  posicion    INTEGER      NOT NULL
);

-- HNSW index for fast cosine similarity queries on embeddings
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
