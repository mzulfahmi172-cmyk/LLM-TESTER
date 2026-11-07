import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase-server";
import { fullSync } from "@/lib/sync";
import { indexDocument } from "@/lib/indexer";

export const maxDuration = 300; // Vercel Pro: 5 menit

export async function POST(req: NextRequest) {
  // Cek admin
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = adminClient();
  const { data: { user } } = await db.auth.getUser(auth);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return Response.json({ error: "Hanya admin" }, { status: 403 });

  const result = await fullSync();

  // Index dokumen pending (dalam satu request — di produksi gunakan background job)
  const { data: pending } = await db.from("documents")
    .select("id").eq("index_status", "pending").limit(50);
  let indexed = 0;
  for (const doc of (pending || [])) {
    await indexDocument(doc.id);
    indexed++;
  }

  return Response.json({ ...result, indexed });
}
