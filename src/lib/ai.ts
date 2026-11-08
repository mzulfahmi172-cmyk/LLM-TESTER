import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = () => new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = genAI().getGenerativeModel({ model: "gemini-embedding-001" });
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await model.batchEmbedContents({
      requests: batch.map(t => ({
        content: { parts: [{ text: t }], role: "user" },
      })),
    });
    out.push(...res.embeddings.map(e => e.values.slice(0, 768)));
  }
  return out;
}
export async function embedQuery(text: string) { return (await embedTexts([text]))[0]; }

const INSTRUKSI = `INSTRUKSI SISTEM (wajib diikuti):
1. Jawab HANYA berdasarkan isi <source> yang diberikan di bawah.
2. Jangan memakai pengetahuan umum untuk fakta perusahaan.
3. Setiap kalimat faktual WAJIB diberi sitasi [S#] sesuai ID sumber.
4. Jangan membuat nomor halaman, sheet, slide, atau kutipan palsu.
5. Jika informasi tidak ada, katakan: "Informasi tersebut tidak ditemukan dalam dokumen yang tersedia."
6. Jika sumber bertentangan, tampilkan perbedaannya.
7. Jawab dalam bahasa pertanyaan (default Bahasa Indonesia formal).`;

export async function* streamAnswer(
  question: string,
  sources: { id: string; name: string; location: string; content: string }[],
  history: { role: string; content: string }[] = [],
): AsyncGenerator<string> {
  const model = genAI().getGenerativeModel({ model: "gemini-2.5-flash" });
  const block = sources.map((s, i) =>
    `<source id="S${i+1}">\nDokumen: ${s.name}\nLokasi: ${s.location}\nIsi:\n${s.content}\n</source>`
  ).join("\n\n");
  const hist = history.slice(-6).map(h => ({
    role: h.role === "user" ? "user" as const : "model" as const,
    parts: [{ text: h.content }],
  }));
  const chat = model.startChat({ history: hist });
  const prompt = `${INSTRUKSI}\n\n${block}\n\nPertanyaan: ${question}`;
  const res = await chat.sendMessageStream(prompt);
  for await (const chunk of res.stream) { const t = chunk.text(); if (t) yield t; }
}
