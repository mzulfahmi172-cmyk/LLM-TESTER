"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase-browser";

export default function SourcesPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [syncState, setSyncState] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const sb = getSupabase();

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (data.user) {
        const { data: p } = await sb.from("profiles").select("*").eq("id", data.user.id).single();
        setProfile(p);
        const { data: s } = await sb.from("sync_state").select("*").eq("id", 1).single();
        setSyncState(s);
      }
    });
  }, []);

  async function scan() {
    setBusy(true); setMsg("");
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch("/api/drive/scan", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setMsg(`Selesai: ${data.discovered} file ditemukan, ${data.indexed} diindeks.`);
      const { data: s } = await sb.from("sync_state").select("*").eq("id", 1).single();
      setSyncState(s);
    } catch (e: any) { setMsg(`Error: ${e.message}`); } finally { setBusy(false); }
  }

  async function sync() {
    setBusy(true); setMsg("");
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch("/api/drive/sync", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setMsg(`Sinkronisasi selesai: ${data.changes} perubahan, ${data.indexed} diindeks.`);
    } catch (e: any) { setMsg(`Error: ${e.message}`); } finally { setBusy(false); }
  }

  if (!user) return <div className="p-8 text-muted">Silakan <a href="/" className="text-steel underline">login</a> terlebih dahulu.</div>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <a href="/" className="text-sm text-steel hover:underline">← Kembali ke Tanya Dokumen</a>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Sumber Dokumen</h1>
      <p className="mt-2 text-muted">Shared Drive ID: <code className="text-xs bg-panel px-2 py-1 rounded">{process.env.NEXT_PUBLIC_SUPABASE_URL ? "dikonfigurasi" : "belum diatur"}</code></p>

      {syncState && (
        <div className="mt-6 rounded-lg border border-line p-4">
          <p className="text-sm"><strong>Status:</strong> {syncState.status === "idle" ? "Siap" : syncState.status}</p>
          <p className="text-sm text-muted mt-1">Scan penuh terakhir: {syncState.last_full_sync ? new Date(syncState.last_full_sync).toLocaleString("id-ID") : "Belum pernah"}</p>
          <p className="text-sm text-muted">Sinkronisasi terakhir: {syncState.last_incremental_sync ? new Date(syncState.last_incremental_sync).toLocaleString("id-ID") : "–"}</p>
          {syncState.error && <p className="text-sm text-danger mt-1">{syncState.error}</p>}
        </div>
      )}

      {profile?.role === "admin" ? (
        <div className="mt-6 flex gap-3">
          <button onClick={scan} disabled={busy} className="h-10 px-4 rounded-md bg-steel text-paper text-sm font-medium disabled:opacity-50">
            {busy ? "Memproses…" : "Scan & Indeks Penuh"}
          </button>
          <button onClick={sync} disabled={busy} className="h-10 px-4 rounded-md border border-line text-sm font-medium disabled:opacity-50">
            Sinkronisasi Inkremental
          </button>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Hanya administrator yang dapat mengelola sinkronisasi.</p>
      )}

      {msg && <p className={`mt-4 rounded-md px-3 py-2 text-sm ${msg.startsWith("Error") ? "border border-danger text-danger" : "bg-steel-soft"}`}>{msg}</p>}
    </div>
  );
}
