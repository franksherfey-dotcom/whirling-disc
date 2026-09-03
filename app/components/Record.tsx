type RecordProps = {
  size?: number;
  spinning?: boolean;
};

/**
 * The Whirling Disc mark — black vinyl with a classic red center label.
 * Used as the brand logo and, with spinning, as the loading indicator.
 */
export function Record({ size = 40, spinning = false }: RecordProps) {
  const uid = `r${size}`;
  const grooves = [44, 40, 36, 32, 28, 24];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={spinning ? "wd-spin" : undefined}
      role="img"
      aria-label="Whirling Disc"
    >
      <defs>
        <radialGradient id={`sheen-${uid}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#0f0f0f" />
      {grooves.map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#000000" strokeOpacity="0.55" strokeWidth="0.5" />
      ))}
      <circle cx="50" cy="50" r="48" fill={`url(#sheen-${uid})`} />
      <circle cx="50" cy="50" r="48" fill="none" stroke="#000000" strokeOpacity="0.4" strokeWidth="1.5" />
      {/* Classic red label */}
      <circle cx="50" cy="50" r="19" fill="#b0281c" />
      <circle cx="50" cy="50" r="19" fill="none" stroke="#7d1a12" strokeWidth="0.75" />
      <circle cx="50" cy="50" r="6.5" fill="none" stroke="#0d0d0d" strokeOpacity="0.35" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="2.2" fill="#0d0d0d" />
    </svg>
  );
}

/** Spinning-record loader — replaces the spinner. */
export function RecordLoader({ size = 56, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <Record size={size} spinning />
      <span className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>{label}</span>
    </div>
  );
}
