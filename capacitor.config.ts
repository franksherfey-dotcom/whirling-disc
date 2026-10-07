import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.franksherfey.whirlingdisc",
  appName: "Whirlin' Disc",
  // Offline fallback page. TestFlight builds load the live site via server.url;
  // before App Store submission this becomes the bundled static export.
  webDir: "ios-shell",
  backgroundColor: "#0d0d0d",
  server: {
    url: "https://whirling-disc.vercel.app",
    cleartext: false,
  },
  ios: {
    // Lets the web app detect the native shell (hide purchase UI, use native
    // Sign in with Apple). Checked by lib/native.ts.
    appendUserAgent: "WhirlingDiscIOS",
    backgroundColor: "#0d0d0d",
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
