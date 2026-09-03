import Link from "next/link";
import { HeroTurntable } from "./components/HeroTurntable";

export default function Home() {
  return (
    <div className="flex flex-col items-center text-center py-16">
      <HeroTurntable size={168} />
      <p className="font-eyebrow text-xs mt-8 mb-4" style={{ color: "var(--wd-text-faint)" }}>
        Catalog · Value · Protect
      </p>
      <h1 className="font-display text-6xl max-w-2xl leading-[1.05]" style={{ color: "var(--wd-text)" }}>
        Spin it. Snap it. Prove it.
      </h1>
      <p className="text-base mt-5 max-w-lg leading-relaxed" style={{ color: "var(--wd-text-dim)" }}>
        Photograph any record and get an itemized, condition-graded value — and an
        insurance-ready schedule you can hand to an underwriter.
      </p>
      <div className="flex gap-3 mt-9">
        <Link href="/records/add" className="px-7 py-3.5 rounded-full font-eyebrow text-xs" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
          Catalog a Record
        </Link>
        <Link href="/records" className="px-7 py-3.5 rounded-full font-eyebrow text-xs" style={{ color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>
          View Crate
        </Link>
      </div>
    </div>
  );
}
