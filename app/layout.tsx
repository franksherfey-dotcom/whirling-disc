import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { Record } from "./components/Record";
import { VersionWatcher } from "./components/VersionWatcher";
import { AuthGuard } from "./components/AuthGuard";
import { AdminNavLink } from "./components/AdminNavLink";

const playfair = Playfair_Display({
  subsets: ["latin"],
  style: ["italic", "normal"],
  variable: "--font-playfair",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Whirling Disc",
  description: "Catalog, value, and protect your vinyl collection.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Whirling Disc",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#0d0d0d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>
        <VersionWatcher />
        <AuthGuard />
        <nav className="border-b" style={{ borderColor: "var(--wd-border)", background: "rgba(13,13,13,0.85)" }}>
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <div className="flex justify-between items-center h-16">
              <a href="/records" className="flex items-center gap-3 flex-shrink-0 mr-3">
                <Record size={30} />
                <span className="font-display text-xl whitespace-nowrap hidden sm:inline" style={{ color: "var(--wd-text)" }}>
                  The Whirlin&apos; Disc
                </span>
              </a>
              <div className="flex items-center gap-2 overflow-x-auto whirl-nav-scroll" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                <AdminNavLink />
                <a href="/stats" className="font-eyebrow text-xs px-4 py-2 rounded-full whitespace-nowrap flex-shrink-0" style={{ color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>
                  Stats
                </a>
                <a href="/share" className="font-eyebrow text-xs px-4 py-2 rounded-full whitespace-nowrap flex-shrink-0" style={{ color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>
                  Share
                </a>
                <a href="/price-check" className="font-eyebrow text-xs px-4 py-2 rounded-full whitespace-nowrap flex-shrink-0" style={{ color: "var(--wd-red-bright, #e0503f)", border: "1px solid var(--wd-red, #b02418)", background: "rgba(176,40,28,0.12)" }}>
                  Price Check
                </a>
                <a href="/report" className="font-eyebrow text-xs px-4 py-2 rounded-full whitespace-nowrap flex-shrink-0" style={{ color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>
                  Insure
                </a>
                <a href="/records/add" className="font-eyebrow text-xs px-4 py-2 rounded-full whitespace-nowrap flex-shrink-0" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
                  + Catalog
                </a>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-5 sm:px-8 py-8">{children}</main>
      </body>
    </html>
  );
}
