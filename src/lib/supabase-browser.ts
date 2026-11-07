import { createClient } from "@supabase/supabase-js";
let _c: ReturnType<typeof createClient> | null = null;
export function getSupabase() {
  if (!_c) _c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return _c;
}
