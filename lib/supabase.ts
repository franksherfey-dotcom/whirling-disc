import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://nyappullfviszczefrrx.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Keep the user signed in across reloads and background time until they
    // explicitly sign out. Refresh the access token automatically before it
    // expires so long sessions don't get bounced mid-task.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "whirling-disc-auth",
    flowType: "pkce",
  },
});
