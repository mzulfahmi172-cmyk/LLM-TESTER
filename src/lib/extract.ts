interface Segment { text: string; page?: number; sheet?: string; slide?: number; }
export interface ExtractResult { segments: Segment[]; pages?: number; sheets?: number; slides?: number; }

const SUPPORTED = new Set([
  "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "text/markdown",
  "application/vnd.google-apps.document", "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
]);

export function isSupported(mime: string): boolean { return SUPPORTED.has(mime); }
export function unsupportedReason(mime: string): string | null {
  if (SUPPORTED.has(mime)) return null;
  if (mime.startsWith("image/")) return "Format gambar belum didukung.";
  if (mime.startsWith("video/")) return "Format video belum didukung.";
  return `Format tidak didukung: ${mime}`;
}

export async function extract(buf: Buffer, mime: string, name: string): Promise<ExtractResult> {
  const eff: Record<string,string> = {
    "application/vnd.google-apps.document": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.google-apps.presentation": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  const m = eff[mime] || mime;
  if (m === "application/pdf") return extractPdf(buf);
  if (m.includes("wordprocessing")) return extractDocx(buf);
  if (m.includes("spreadsheet")) return extractXlsx(buf);
  if (m.includes("presentation")) return extractPptx(buf);
  if (m === "text/csv") return extractCsv(buf, name);
  return extractText(buf);
}

async function extractPdf(buf: Buffer): Promise<ExtractResult> {
  const pdf = (await import("pdf-parse")).default;
  const data = await pdf(buf);
  const pages = data.text.split("\f").filter((p: string) => p.trim());
  return { segments: pages.map((t: string, i: number) => ({ text: t.trim(), page: i + 1 })), pages: data.numpages };
}

async function extractDocx(buf: Buffer): Promise<ExtractResult> {
  const mammoth = await import("mammoth");
  const res = await mammoth.extractRawText({ buffer: buf });
  return { segments: res.value.split(/\n{2,}/).filter((b: string) => b.trim()).map((t: string) => ({ text: t.trim() })) };
}

async function extractXlsx(buf: Buffer): Promise<ExtractResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const segments: Segment[] = [];
  for (const name of wb.SheetNames) {
    const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
    if (rows.length < 2) continue;
    const header = rows[0].map(String);
    for (let r = 1; r < rows.length; r++) {
      const pairs = rows[r].map((v: any, c: number) => {
        const val = String(v ?? "").trim();
        return val ? `${header[c] || `Kolom ${c+1}`}: ${val}` : "";
      }).filter(Boolean);
      if (pairs.length) segments.push({ text: `Baris ${r+1}: ${pairs.join("; ")}`, sheet: name });
    }
  }
  return { segments, sheets: wb.SheetNames.length };
}

async function extractPptx(buf: Buffer): Promise<ExtractResult> {
  // PPTX = ZIP berisi XML. Gunakan xlsx (yang bundles jszip) untuk membaca
  try {
    const XLSX = await import("xlsx");
    // xlsx tidak bisa membaca pptx; fallback: catat ukuran file
    const sizeKB = Math.round(buf.length / 1024);
    return { segments: [{ text: `[Presentasi ${sizeKB} KB — untuk ekstraksi lengkap gunakan versi server]`, slide: 1 }], slides: 1 };
  } catch {
    return { segments: [], slides: 0 };
  }
}

function extractCsv(buf: Buffer, name: string): ExtractResult {
  const text = buf.toString("utf-8");
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return { segments: [], sheets: 1 };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ""));
  const segments: Segment[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
    const pairs = cols.map((v, j) => v ? `${header[j] || `Kolom ${j+1}`}: ${v}` : "").filter(Boolean);
    if (pairs.length) segments.push({ text: `Baris ${i+1}: ${pairs.join("; ")}`, sheet: name });
  }
  return { segments, sheets: 1 };
}

function extractText(buf: Buffer): ExtractResult {
  const text = buf.toString("utf-8");
  return { segments: text.split(/\n{2,}/).filter(b => b.trim()).map(t => ({ text: t.trim() })) };
}
