/**
 * Home-hero turntable: the black/red record spins continuously while a tonearm
 * drops onto it once on load. Pure SVG + CSS so it's crisp at any size and
 * respects prefers-reduced-motion (disc stops, tonearm rests on the record).
 */
export function HeroTurntable({ size = 150 }: { size?: number }) {
  const grooves = [46, 42, 38, 34, 30, 26];
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Spinning record on a turntable">
      <defs>
        <radialGradient id="hero-sheen" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
        </radialGradient>
      </defs>

      {/* Disc — spins */}
      <g className="wd-spin-hero" style={{ transformOrigin: "60px 60px" }}>
        <circle cx="60" cy="60" r="52" fill="#0f0f0f" />
        {grooves.map((r) => (
          <circle key={r} cx="60" cy="60" r={r} fill="none" stroke="#000000" strokeOpacity="0.5" strokeWidth="0.6" />
        ))}
        <circle cx="60" cy="60" r="52" fill="url(#hero-sheen)" />
        <circle cx="60" cy="60" r="52" fill="none" stroke="#000000" strokeOpacity="0.4" strokeWidth="1.5" />
        {/* Red label */}
        <circle cx="60" cy="60" r="21" fill="#b0281c" />
        <circle cx="60" cy="60" r="21" fill="none" stroke="#7d1a12" strokeWidth="0.75" />
        {/* A little groove-shine sweep so the spin is visible */}
        <path d="M60 8 A52 52 0 0 1 112 60" fill="none" stroke="#2a2a2a" strokeWidth="1" opacity="0.5" />
        <circle cx="60" cy="60" r="2.4" fill="#0d0d0d" />
      </g>

      {/* Tonearm — drops once on load, then holds on the record */}
      <g className="wd-tonearm">
        <line x1="106" y1="16" x2="72" y2="52" stroke="#8a8a8a" strokeWidth="3" strokeLinecap="round" />
        <circle cx="106" cy="16" r="5" fill="#6a6a6a" />
        <circle cx="106" cy="16" r="2" fill="#4a4a4a" />
        {/* headshell / needle */}
        <circle cx="72" cy="52" r="3" fill="#333333" />
      </g>
    </svg>
  );
}
