import { adminClient } from "./supabase-server";
import { embedQuery } from "./ai";
import type { Citation } from "@/types";

/** Hybrid retrieval: semantic (pgvector) + keyword (ILIKE). */
export async function searchChunks(
  query: string, topK = 8
): Promise<{ chunks: any[]; citations: Citation[] }> {
  const db = adminClient();
  const qvec = await embedQuery(query);

  // Semantic search via pgvector
  const { data: semantic } = await db.rpc("match_chunks", {
    query_embedding: qvec, match_count: topK * 3,
  });

  // Keyword search (fallback untuk kode, nomor, nama spesifik)
  const keywords = query.split(/\s+/).filter(w => w.length > 2).slice(0, 5);
  let keywordHits: any[] = [];
  if (keywords.length) {
    const pattern = keywords.map(k => `%${k}%`).join("");
    const { data } = await db
      .from("chunks")
      .select("*, documents!inner(id, name, mime_type, web_view_link)")
      .ilike("content", `%${keywords[0]}%`)
      .limit(topK);
    keywordHits = data || [];
  }

  // Merge dan deduplikasi
  const seen = new Set<number>();
  const merged: any[] = [];
  for (const row of [...(semantic || []), ...keywordHits]) {
    const id = row.id ?? row.chunk_id;
    if (!seen.has(id)) { seen.add(id); merged.push(row); }
  }

  const top = merged.slice(0, topK);
  const citations: Citation[] = top.map((r, i) => ({
    id: `S${i + 1}`,
    document_id: r.document_id,
    name: r.doc_name || r.documents?.name || "Dokumen",
    mime_type: r.doc_mime || r.documents?.mime_type || "",
    link: r.doc_link || r.documents?.web_view_link || null,
    location: [
      r.page_number && `hlm. ${r.page_number}`,
      r.sheet_name && `sheet '${r.sheet_name}'`,
      r.slide_number && `slide ${r.slide_number}`,
    ].filter(Boolean).join(", ") || `bagian ${(r.chunk_index || 0) + 1}`,
    snippet: (r.content || "").slice(0, 500),
  }));

  return { chunks: top, citations };
}
