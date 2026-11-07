import type { ExtractResult } from "./extract";

export interface ChunkData {
  content: string; chunk_index: number; page_number: number | null;
  sheet_name: string | null; slide_number: number | null;
}

export function chunkDocument(result: ExtractResult, target = 1200, overlap = 200): ChunkData[] {
  const chunks: ChunkData[] = [];
  let idx = 0;
  for (const seg of result.segments) {
    const text = seg.text.trim();
    if (!text) continue;
    if (text.length <= target) {
      chunks.push({ content: text, chunk_index: idx++, page_number: seg.page ?? null,
        sheet_name: seg.sheet ?? null, slide_number: seg.slide ?? null });
    } else {
      // Pecah berdasarkan kalimat
      const sentences = text.split(/(?<=[.!?])\s+|\n/);
      let buf = "";
      for (const s of sentences) {
        if (buf.length + s.length > target && buf) {
          chunks.push({ content: buf.trim(), chunk_index: idx++, page_number: seg.page ?? null,
            sheet_name: seg.sheet ?? null, slide_number: seg.slide ?? null });
          buf = buf.slice(-overlap);
        }
        buf += (buf ? " " : "") + s;
      }
      if (buf.trim()) {
        chunks.push({ content: buf.trim(), chunk_index: idx++, page_number: seg.page ?? null,
          sheet_name: seg.sheet ?? null, slide_number: seg.slide ?? null });
      }
    }
  }
  return chunks;
}

export function locationLabel(c: ChunkData): string {
  const parts: string[] = [];
  if (c.page_number) parts.push(`hlm. ${c.page_number}`);
  if (c.sheet_name) parts.push(`sheet '${c.sheet_name}'`);
  if (c.slide_number) parts.push(`slide ${c.slide_number}`);
  return parts.join(", ") || `bagian ${c.chunk_index + 1}`;
}
