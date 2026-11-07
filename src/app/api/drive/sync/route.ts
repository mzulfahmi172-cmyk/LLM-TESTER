import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase-server";
import { incrementalSync } from "@/lib/sync";
import { indexDocument } from "@/lib/indexer";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = adminClient();
  const { data: { user } } = await db.auth.getUser(auth);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = await incrementalSync();

  // Index dokumen pending
  const { data: pending } = await db.from("documents")
    .select("id").eq("index_status", "pending").limit(50);
  for (const doc of (pending || [])) {
    await indexDocument(doc.id);
  }

  return Response.json({ ...result, indexed: pending?.length || 0 });
}
