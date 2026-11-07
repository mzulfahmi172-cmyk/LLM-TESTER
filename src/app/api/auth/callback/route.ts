import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase-server";

/** Supabase Auth callback — dipakai setelah Google OAuth redirect. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/?error=no_code", req.url));
  const db = adminClient();
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/?error=${error.message}`, req.url));
  return NextResponse.redirect(new URL("/", req.url));
}
