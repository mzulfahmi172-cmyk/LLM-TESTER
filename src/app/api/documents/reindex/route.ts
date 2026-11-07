import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase-server";
import { indexDocument } from "@/lib/indexer";

export async function POST(req: NextRequest) {
  const { documentId } = await req.json();
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = adminClient();
  const { data: { user } } = await db.auth.getUser(auth);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return Response.json({ error: "Hanya admin" }, { status: 403 });

  await db.from("documents").update({ index_status: "pending", error: null }).eq("id", documentId);
  const result = await indexDocument(documentId);
  return Response.json({ result });
}
