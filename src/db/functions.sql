-- Fungsi pgvector untuk semantic search. Jalankan di Supabase SQL Editor.
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(768),
  match_count int DEFAULT 24
)
RETURNS TABLE (
  chunk_id bigint, document_id uuid, content text, chunk_index int,
  page_number int, sheet_name text, slide_number int,
  similarity float,
  doc_name text, doc_mime text, doc_link text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id AS chunk_id, c.document_id, c.content, c.chunk_index,
    c.page_number, c.sheet_name, c.slide_number,
    1 - (c.embedding <=> query_embedding) AS similarity,
    d.name AS doc_name, d.mime_type AS doc_mime, d.web_view_link AS doc_link
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE d.index_status = 'indexed'
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
