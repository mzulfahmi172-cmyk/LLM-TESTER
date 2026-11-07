"use client";
import { useEffect, useRef, useState, Fragment } from "react";
import { getSupabase } from "@/lib/supabase-browser";
import type { ChatMessage, Citation } from "@/types";

export default function ChatPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [activeCite, setActiveCite] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sb = getSupabase();

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => { setUser(data.user); setLoading(false); });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null); setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  async function login() {
    await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + "/api/auth/callback" } });
  }

  async function send() {
    const q = input.trim(); if (!q || busy) return;
    setInput(""); setBusy(true);
    const history = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(prev => [...prev, { role: "user", content: q }, { role: "assistant", content: "" }]);
    const idx = msgs.length + 1;

    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ question: q, history }),
      });
      if (!res.ok || !res.body) throw new Error("Request gagal");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(raw)?.[1];
          const data = /^data: (.*)$/m.exec(raw)?.[1];
          if (!ev || !data) continue;
          const parsed = JSON.parse(data);
          if (ev === "token") setMsgs(prev => prev.map((m, k) => k === idx ? { ...m, content: m.content + parsed } : m));
          if (ev === "done") {
            setMsgs(prev => prev.map((m, k) => k === idx ? { ...m, content: parsed.answer, citations: parsed.citations } : m));
            setCitations(parsed.citations || []);
          }
        }
      }
    } catch (e: any) {
      setMsgs(prev => prev.map((m, k) => k === idx ? { ...m, content: `Terjadi kesalahan: ${e.message}` } : m));
    } finally { setBusy(false); }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted">Memuat…</div>;

  if (!user) return (
    <div className="mx-auto max-w-xl px-6 py-20">
      <p className="font-serif text-3xl font-semibold leading-tight">Masuk untuk bertanya ke dokumen perusahaan</p>
      <p className="mt-3 text-muted">Jawaban diambil dari dokumen Google Drive yang diizinkan.</p>
      <button onClick={login} className="mt-8 h-10 px-4 rounded-md bg-steel text-paper text-sm font-medium">Masuk dengan Google</button>
    </div>
  );

  function renderAnswer(text: string) {
    return text.split(/(\[S\d+\])/g).map((part, i) => {
      const m = /^\[(S\d+)\]$/.exec(part);
      if (!m) return <Fragment key={i}>{part}</Fragment>;
      return <button key={i} className={`cite ${activeCite === m[1] ? "active" : ""}`}
        onClick={() => { setActiveCite(m[1]); document.getElementById(`ev-${m[1]}`)?.scrollIntoView({ block: "nearest" }); }}>{m[1]}</button>;
    });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_340px]">
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between border-b border-line px-6 py-3">
          <p className="font-serif text-lg font-semibold">{process.env.NEXT_PUBLIC_APP_NAME || "Arsip Aftersales"}</p>
          <div className="flex items-center gap-3">
            <a href="/sources" className="text-sm text-muted hover:text-ink">Sumber</a>
            <a href="/monitoring" className="text-sm text-muted hover:text-ink">Pemantauan</a>
            <button onClick={() => sb.auth.signOut().then(() => setUser(null))} className="text-sm text-muted hover:text-ink">Keluar</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-[64ch] space-y-6">
            {msgs.length === 0 && (
              <div className="pt-10">
                <p className="font-serif text-3xl font-semibold leading-tight">Tanyakan apa saja dari dokumen perusahaan.</p>
                <p className="mt-3 text-muted">Setiap jawaban menyertakan sumber: nama file, halaman, sheet, atau slide.</p>
              </div>
            )}
            {msgs.map((m, i) => m.role === "user" ? (
              <p key={i} className="ml-auto max-w-[85%] rounded-lg bg-panel px-4 py-3 text-[15px]">{m.content}</p>
            ) : (
              <div key={i} className="border-l-2 border-steel pl-4">
                <div className="font-serif text-[17px] leading-[1.7] whitespace-pre-wrap">
                  {m.content ? renderAnswer(m.content) : <span className="text-muted text-sm">Mencari sumber…</span>}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
        <form className="sticky bottom-0 border-t border-line bg-paper px-6 py-4" onSubmit={e => { e.preventDefault(); send(); }}>
          <div className="mx-auto max-w-[64ch] flex gap-2">
            <textarea value={input} onChange={e => setInput(e.target.value)} rows={2} placeholder="Tulis pertanyaan…"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="flex-1 min-h-[44px] resize-none rounded-md border border-line bg-paper px-3 py-2 text-[15px] placeholder:text-muted" />
            <button type="submit" disabled={busy || !input.trim()} className="self-end h-10 px-4 rounded-md bg-steel text-paper text-sm font-medium disabled:opacity-50">Kirim</button>
          </div>
        </form>
      </div>
      <aside className="hidden lg:block border-l border-line bg-panel px-5 py-6 sticky top-0 h-screen overflow-y-auto">
        <p className="text-sm font-semibold mb-4">Bukti sumber</p>
        {!citations.length && <p className="text-sm text-muted">Klik penanda <span className="cite">S1</span> untuk melihat bukti.</p>}
        {citations.map(c => (
          <div key={c.id} id={`ev-${c.id}`} className={`w-full rounded-md border p-3 mb-3 text-left cursor-pointer ${activeCite === c.id ? "border-steel bg-steel-soft" : "border-line bg-paper"}`}
            onClick={() => setActiveCite(c.id)}>
            <div className="flex items-baseline gap-2"><span className="cite">{c.id}</span><span className="text-sm font-medium truncate">{c.name}</span></div>
            <p className="mt-1 text-xs text-muted">{c.location}</p>
            <p className="mt-2 text-sm font-serif leading-relaxed line-clamp-5">{c.snippet}</p>
            {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-steel hover:underline">Buka di Google Drive</a>}
          </div>
        ))}
      </aside>
    </div>
  );
}
