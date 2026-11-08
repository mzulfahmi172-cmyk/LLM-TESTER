import { adminClient } from "./supabase-server";
import { downloadFile } from "./drive";
import { extract, isSupported, unsupportedReason } from "./extract";
import { chunkDocument, locationLabel } from "./chunk";
import { embedTexts } from "./ai";

export async function indexDocument(docId: string): Promise<string> {
  const db = adminClient();
  const { data: doc } = await db.from("documents").select("*").eq("id", docId).single();
  if (!doc) return "not_found";

  await db.from("documents").update({ index_status: "processing", error: null }).eq("id", docId);

  try {
    if (!isSupported(doc.mime_type)) {
      const reason = unsupportedReason(doc.mime_type) || "Format tidak didukung";
      await db.from("documents").update({ index_status: "unsupported", error: reason }).eq("id", docId);
      return "unsupported";
    }

    // Download
    console.log(`[indexer] Downloading ${doc.name}...`);
    const buf = await downloadFile(doc.drive_file_id, doc.mime_type);
    console.log(`[indexer] Downloaded ${buf.length} bytes`);

    // Extract
    const result = await extract(buf, doc.mime_type, doc.name);
    console.log(`[indexer] Extracted ${result.segments.length} segments`);

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
    console.log(`[indexer] Created ${chunks.length} chunks`);

    // Embed (batch)
    const texts = chunks.map((c, i) => `Dokumen: ${doc.name} | ${locationLabel(c)}\n${c.content}`);
    console.log(`[indexer] Embedding ${texts.length} texts...`);
    const embeddings = await embedTexts(texts);
    console.log(`[indexer] Got ${embeddings.length} embeddings, dim=${embeddings[0]?.length}`);

    // Hapus chunk lama
    const { error: delErr } = await db.from("chunks").delete().eq("document_id", docId);
    if (delErr) console.error(`[indexer] Delete error:`, delErr);

    // Simpan chunk baru
    const rows = chunks.map((c, i) => ({
      document_id: docId, content: c.content, chunk_index: c.chunk_index,
      page_number: c.page_number, sheet_name: c.sheet_name, slide_number: c.slide_number,
      embedding: `[${embeddings[i].join(",")}]`,
    }));

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: insErr, count } = await db.from("chunks").insert(batch);
      if (insErr) {
        console.error(`[indexer] Insert error batch ${i}:`, JSON.stringify(insErr));
        throw new Error(`Gagal menyimpan chunks: ${insErr.message}`);
      }
      console.log(`[indexer] Inserted batch ${i}, count=${count}`);
    }

    // Verifikasi
    const { count: totalChunks } = await db.from("chunks").select("*", { count: "exact", head: true }).eq("document_id", docId);
    console.log(`[indexer] Verified ${totalChunks} chunks in DB for ${doc.name}`);

    await db.from("documents").update({
      index_status: "indexed", chunk_count: totalChunks || chunks.length, error: null,
      page_count: result.pages ?? null, sheet_count: result.sheets ?? null, slide_count: result.slides ?? null,
      last_indexed_at: new Date().toISOString(),
    }).eq("id", docId);

    return "indexed";
  } catch (e: any) {
    const errMsg = `${e.name}: ${e.message}`.slice(0, 2000);
    console.error(`[indexer] FAILED ${doc.name}:`, errMsg);
    await db.from("documents").update({
      index_status: "failed", error: errMsg,
    }).eq("id", docId);
    return "failed";
  }
}
