import { NextRequest } from "next/server";
import { searchChunks } from "@/lib/retrieval";
import { streamAnswer } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { question, history } = await req.json();
  if (!question?.trim()) return Response.json({ error: "Pertanyaan kosong" }, { status: 400 });

  const { chunks, citations } = await searchChunks(question);
  const sources = chunks.map((c: any, i: number) => ({
    id: `S${i + 1}`, name: c.doc_name || c.documents?.name || "Dokumen",
    location: [c.page_number && `hlm. ${c.page_number}`, c.sheet_name && `sheet '${c.sheet_name}'`,
               c.slide_number && `slide ${c.slide_number}`].filter(Boolean).join(", ") || `bagian ${(c.chunk_index||0)+1}`,
    content: c.content,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Kirim coverage
      controller.enqueue(encoder.encode(`event: coverage\ndata: ${JSON.stringify({
        chunks_used: chunks.length, documents_used: new Set(chunks.map((c:any) => c.document_id)).size,
      })}\n\n`));

      if (!sources.length) {
        const msg = "Informasi tersebut tidak ditemukan dalam dokumen yang tersedia.";
        controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify(msg)}\n\n`));
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ answer: msg, citations: [] })}\n\n`));
        controller.close(); return;
      }

      let full = "";
      try {
        for await (const token of streamAnswer(question, sources, history || [])) {
          full += token;
          controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify(token)}\n\n`));
        }
      } catch (e: any) {
        full += `\n\n[Error: ${e.message}]`;
      }

      // Resolusi sitasi: hapus referensi palsu
      const usedIds = new Set<string>();
      full.replace(/\[S(\d+)\]/g, (_, n) => { if (parseInt(n) <= citations.length) usedIds.add(`S${n}`); return _; });
      const usedCitations = citations.filter(c => usedIds.has(c.id));

      controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ answer: full, citations: usedCitations })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
}
