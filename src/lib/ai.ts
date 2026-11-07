import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = () => new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = genAI().getGenerativeModel({ model: "text-embedding-004" });
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await model.batchEmbedContents({
      requests: batch.map(t => ({ content: { parts: [{ text: t }], role: "user" } })),
    });
    out.push(...res.embeddings.map(e => e.values));
  }
  return out;
}
export async function embedQuery(text: string) { return (await embedTexts([text]))[0]; }

const SYS = `Anda adalah asisten dokumen internal perusahaan. Aturan wajib:
1. Jawab HANYA berdasarkan isi <source>. Jangan memakai pengetahuan umum untuk fakta perusahaan.
2. Setiap kalimat faktual WAJIB diberi sitasi [S#] sesuai ID sumber.
3. Jangan membuat nomor halaman, sheet, slide, atau kutipan palsu.
4. Jika informasi tidak ada: "Informasi tersebut tidak ditemukan dalam dokumen yang tersedia."
5. Jika sumber bertentangan, tampilkan perbedaannya.
6. Jawab dalam bahasa pertanyaan (default Bahasa Indonesia formal).`;

export async function* streamAnswer(
  question: string,
  sources: { id: string; name: string; location: string; content: string }[],
  history: { role: string; content: string }[] = [],
): AsyncGenerator<string> {
  const model = genAI().getGenerativeModel({ model: "gemini-2.0-flash" });
  const block = sources.map((s, i) =>
    `<source id="S${i+1}">\nDokumen: ${s.name}\nLokasi: ${s.location}\nIsi:\n${s.content}\n</source>`
  ).join("\n\n");
  const hist = history.slice(-6).map(h => ({
    role: h.role === "user" ? "user" as const : "model" as const,
    parts: [{ text: h.content }],
  }));
  const chat = model.startChat({ history: hist, systemInstruction: SYS });
  const res = await chat.sendMessageStream(`${block}\n\nPertanyaan: ${question}`);
  for await (const chunk of res.stream) { const t = chunk.text(); if (t) yield t; }
}
