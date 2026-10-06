// Detects the Capacitor iOS shell. capacitor.config.ts appends this marker to
// the WKWebView user agent, so it works before the native bridge is ready.
export const IOS_APP_UA_MARKER = "WhirlingDiscIOS";

export function isIOSApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(IOS_APP_UA_MARKER);
}

// True when Supabase Auth has the Apple provider switched on. Read from the
// public settings endpoint so the button never shows before it would work.
export async function appleProviderEnabled(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nyappullfviszczefrrx.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return false;
    const json = await res.json();
    return Boolean(json?.external?.apple);
  } catch {
    return false;
  }
}
