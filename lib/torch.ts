import { Capacitor, registerPlugin } from "@capacitor/core";

// Native torch control for the iOS shell (ios/App/App/WDTorchPlugin.swift).
// Safari does not expose the torch to web pages, so the shell does it.
type WDTorchPlugin = {
  setTorch(options: { on: boolean; level: number }): Promise<{ supported: boolean }>;
};
const WDTorch = registerPlugin<WDTorchPlugin>("WDTorch");

// Turns the camera light on or off. level is 0 to 1 (brightness, native only).
// Resolves true when this device can drive the light, false otherwise.
export async function setTorch(on: boolean, level: number, track?: MediaStreamTrack | null): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const r = await WDTorch.setTorch({ on, level });
      return r.supported;
    } catch {
      return false;
    }
  }
  // Browsers that expose the torch (Android Chrome) through the camera track.
  if (!track) return false;
  try {
    const caps = (track.getCapabilities?.() || {}) as MediaTrackCapabilities & { torch?: boolean };
    if (!caps.torch) return false;
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
}
