// Small helpers around WebAuthn passkeys so the UI can talk about "Face ID"
// instead of "passkey" and only offer it where the device can actually do it.

export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

// True when the device has a built-in biometric / PIN authenticator (Face ID,
// Touch ID, Android fingerprint or face unlock, Windows Hello).
export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// What to call it on this device. Apple users know "Face ID"; everyone else
// gets a plain description.
export function biometricLabel(): string {
  if (typeof navigator === "undefined") return "Face ID";
  const ua = navigator.userAgent || "";
  const apple = /iPhone|iPad|iPod|Macintosh/.test(ua);
  if (apple) return "Face ID";
  if (/Android/.test(ua)) return "fingerprint or face unlock";
  return "your device's sign-in";
}

export const NUDGE_KEY = "wd-passkey-nudge";

export function nudgeDismissed(): boolean {
  try { return localStorage.getItem(NUDGE_KEY) === "dismissed" || localStorage.getItem(NUDGE_KEY) === "done"; } catch { return false; }
}
export function setNudge(state: "dismissed" | "done") {
  try { localStorage.setItem(NUDGE_KEY, state); } catch {}
}

// Errors the user should not be shouted at about: they cancelled the prompt,
// or the server has the feature switched off.
export function isQuietPasskeyError(err: unknown): boolean {
  const e = err as { name?: string; code?: string; message?: string } | null;
  if (!e) return true;
  if (e.name === "NotAllowedError" || e.name === "AbortError") return true; // cancelled / timed out
  if (e.code === "passkey_disabled") return true;
  return false;
}
