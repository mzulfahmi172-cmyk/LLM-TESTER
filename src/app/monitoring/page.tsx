"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase-browser";

export default function MonitoringPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState("");
  const sb = getSupabase();

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [filter]);

  async function load() {
    let q = sb.from("documents").select("*").order("updated_at", { ascending: false }).limit(100);
    if (filter) q = q.eq("index_status", filter);
    const { data } = await q;
    setDocs(data || []);
    // Stats
    const { data: all } = await sb.from("documents").select("index_status, chunk_count") as { data: {index_status: string; chunk_count: number}[] | null };
    if (all) {
      const s: any = { total: all.length, indexed: 0, processing: 0, pending: 0, failed: 0, unsupported: 0, chunks: 0 };
      for (const d of all) { s[d.index_status] = (s[d.index_status] || 0) + 1; s.chunks += d.chunk_count || 0; }
      setStats(s);
    }
  }

  const badge = (status: string) => {
    const cls: Record<string,string> = { indexed: "text-ok", failed: "text-danger", unsupported: "text-muted", processing: "text-steel", pending: "text-steel" };
    const lbl: Record<string,string> = { indexed: "Terindeks", failed: "Gagal", unsupported: "Tidak didukung", processing: "Diproses", pending: "Menunggu" };
    return <span className={`inline-flex items-center gap-1.5 text-sm ${cls[status]||""}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{lbl[status]||status}</span>;
  };

  const filters = ["", "indexed", "processing", "pending", "failed", "unsupported"];
  const filterLabels: Record<string,string> = { "": "Semua", indexed: "Terindeks", processing: "Diproses", pending: "Menunggu", failed: "Gagal", unsupported: "Tidak didukung" };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <a href="/" className="text-sm text-steel hover:underline">← Kembali ke Tanya Dokumen</a>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Pemantauan Indeks</h1>

      {stats && (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-line rounded-lg border border-line overflow-hidden">
          {[["File", stats.total], ["Terindeks", stats.indexed], ["Diproses", stats.processing],
            ["Menunggu", stats.pending], ["Gagal", stats.failed, stats.failed > 0], ["Tidak didukung", stats.unsupported]
          ].map(([label, val, danger]) => (
            <div key={label as string} className="bg-paper p-4">
              <p className="text-xs text-muted">{label as string}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${danger ? "text-danger" : ""}`}>{val as number}</p>
            </div>
          ))}
        </div>
      )}
      {stats && <p className="mt-3 text-sm text-muted">{stats.chunks.toLocaleString("id-ID")} potongan teks terindeks.</p>}

      <div className="mt-6 flex flex-wrap gap-1">
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm ${filter === f ? "bg-steel-soft text-steel font-medium" : "text-muted hover:text-ink"}`}>
            {filterLabels[f]}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-muted"><tr className="border-b border-line">
            <th className="py-2 font-normal">Dokumen</th><th className="font-normal">Folder</th>
            <th className="font-normal">Status</th><th className="font-normal">Potongan</th></tr></thead>
          <tbody>
            {!docs.length && <tr><td colSpan={4} className="py-6 text-muted">Tidak ada dokumen.</td></tr>}
            {docs.map(d => (
              <tr key={d.id} className="border-b border-line align-top">
                <td className="py-2 pr-3">
                  {d.name}
                  {d.error && <p className={`mt-1 text-xs ${d.index_status === "unsupported" ? "text-muted" : "text-danger"}`}>{d.error}</p>}
                </td>
                <td className="py-2 pr-3 text-muted">{d.folder_path}</td>
                <td className="py-2">{badge(d.index_status)}</td>
                <td className="py-2 text-muted">{d.chunk_count || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
