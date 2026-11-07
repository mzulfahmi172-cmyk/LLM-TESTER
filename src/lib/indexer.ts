/** Pipeline indexing: download → extract → chunk → embed → store ke Supabase. */
import { adminClient } from "./supabase-server";
import { downloadFile } from "./drive";
import { extract, isSupported, unsupportedReason } from "./extract";
import { chunkDocument } from "./chunk";
import { embedTexts } from "./ai";
import { locationLabel } from "./chunk";

export async function indexDocument(docId: string): Promise<string> {
  const db = adminClient();
  const { data: doc } = await db.from("documents").select("*").eq("id", docId).single();
  if (!doc) return "not_found";

  await db.from("documents").update({ index_status: "processing" }).eq("id", docId);

  try {
    if (!isSupported(doc.mime_type)) {
      const reason = unsupportedReason(doc.mime_type) || "Format tidak didukung";
      await db.from("documents").update({ index_status: "unsupported", error: reason }).eq("id", docId);
      return "unsupported";
    }

    // Download
    const buf = await downloadFile(doc.drive_file_id, doc.mime_type);

    // Extract
    const result = await extract(buf, doc.mime_type, doc.name);
    if (!result.segments.length) {
      await db.from("documents").update({
        index_status: "indexed", chunk_count: 0, error: "Tidak ada teks yang dapat diekstrak",
        page_count: result.pages ?? null, sheet_count: result.sheets ?? null, slide_count: result.slides ?? null,
        last_indexed_at: new Date().toISOString(),
      }).eq("id", docId);
      return "empty";
    }

    // Chunk
    const chunks = chunkDocument(result);

    // Embed (batch)
    const texts = chunks.map((c, i) => `Dokumen: ${doc.name} | ${locationLabel(c)}\n${c.content}`);
    const embeddings = await embedTexts(texts);

    // Hapus chunk lama, simpan yang baru
    await db.from("chunks").delete().eq("document_id", docId);
    const rows = chunks.map((c, i) => ({
      document_id: docId, content: c.content, chunk_index: c.chunk_index,
      page_number: c.page_number, sheet_name: c.sheet_name, slide_number: c.slide_number,
      embedding: JSON.stringify(embeddings[i]),
    }));

    // Insert batch (Supabase maks 1000 rows per call)
    for (let i = 0; i < rows.length; i += 500) {
      await db.from("chunks").insert(rows.slice(i, i + 500));
    }

    await db.from("documents").update({
      index_status: "indexed", chunk_count: chunks.length, error: null,
      page_count: result.pages ?? null, sheet_count: result.sheets ?? null, slide_count: result.slides ?? null,
      last_indexed_at: new Date().toISOString(),
    }).eq("id", docId);

    return "indexed";
  } catch (e: any) {
    await db.from("documents").update({
      index_status: "failed", error: `${e.name}: ${e.message}`.slice(0, 2000),
    }).eq("id", docId);
    return "failed";
  }
}
