"use client";

import { toUiGrade } from "@/lib/conditions";

const usd = (c?: number | null) =>
  c == null ? "—" : `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

type LineItem = {
  artist: string;
  title: string;
  year: number | null;
  label: string | null;
  catalog_number: string | null;
  format: string | null;
  media_condition: string | null;
  sleeve_condition: string | null;
  value_low_cents: number;
  value_high_cents: number;
};

export type Report = {
  doc_number: string;
  purpose: string;
  owner_name: string | null;
  owner_email: string | null;
  line_items: LineItem[];
  item_count: number;
  total_low_cents: number;
  total_high_cents: number;
  total_mid_cents: number;
  methodology: string;
  created_at: string;
};

/**
 * Print-ready insurance/estate schedule. Light theme on purpose — this gets
 * printed to PDF and emailed to an adjuster. Everything is frozen from the
 * report row, not recomputed.
 */
export function ReportDoc({ report }: { report: Report }) {
  const date = new Date(report.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="report-doc">
      <style>{`
        .report-doc { background:#fff; color:#111; padding:48px; max-width:900px; margin:0 auto;
          font-family: ui-sans-serif, system-ui, sans-serif; line-height:1.5; }
        .report-doc h1 { font-size:22px; margin:0 0 4px; }
        .report-doc .muted { color:#666; font-size:13px; }
        .report-doc table { width:100%; border-collapse:collapse; margin:20px 0; font-size:13px; }
        .report-doc th { text-align:left; border-bottom:2px solid #111; padding:8px 6px; font-size:11px;
          letter-spacing:0.06em; text-transform:uppercase; }
        .report-doc td { padding:8px 6px; border-bottom:1px solid #e5e5e5; vertical-align:top; }
        .report-doc td.num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
        .report-doc .total-row td { border-top:2px solid #111; border-bottom:none; font-weight:700; font-size:15px; padding-top:12px; }
        .report-doc .methodology { font-size:12px; color:#444; border-top:1px solid #e5e5e5; margin-top:24px; padding-top:16px; }
        @media print { .report-doc { padding:0; } .no-print { display:none !important; } }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #111", paddingBottom: 16 }}>
        <div>
          <h1>{report.purpose === "estate" ? "Estate Schedule of Sound Recordings" : "Insurance Schedule of Sound Recordings"}</h1>
          <div className="muted">Prepared with Whirling Disc</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{report.doc_number}</div>
          <div className="muted">{date}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 48, margin: "18px 0" }}>
        <div>
          <div className="muted">Owner</div>
          <div>{report.owner_name || "—"}</div>
          {report.owner_email && <div className="muted">{report.owner_email}</div>}
        </div>
        <div>
          <div className="muted">Items</div>
          <div>{report.item_count}</div>
        </div>
        <div>
          <div className="muted">Estimated collection value</div>
          <div style={{ fontWeight: 700 }}>
            {usd(report.total_low_cents)} – {usd(report.total_high_cents)}
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Artist / Title</th>
            <th>Pressing</th>
            <th>Cond.</th>
            <th style={{ textAlign: "right" }}>Low</th>
            <th style={{ textAlign: "right" }}>High</th>
          </tr>
        </thead>
        <tbody>
          {report.line_items.map((it, i) => (
            <tr key={i}>
              <td className="muted">{i + 1}</td>
              <td>
                <div style={{ fontWeight: 600 }}>{it.title}</div>
                <div className="muted">{it.artist}</div>
              </td>
              <td>
                {[it.label, it.catalog_number, it.year].filter(Boolean).join(" · ") || "—"}
                {it.format ? <div className="muted">{it.format}</div> : null}
              </td>
              <td>
                {it.media_condition ? toUiGrade(it.media_condition) : "—"}
                {it.sleeve_condition ? <div className="muted">slv {toUiGrade(it.sleeve_condition)}</div> : null}
              </td>
              <td className="num">{usd(it.value_low_cents)}</td>
              <td className="num">{usd(it.value_high_cents)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td></td>
            <td>Collection total</td>
            <td></td>
            <td></td>
            <td className="num">{usd(report.total_low_cents)}</td>
            <td className="num">{usd(report.total_high_cents)}</td>
          </tr>
        </tbody>
      </table>

      <div className="methodology">
        <strong>Methodology.</strong> {report.methodology}
      </div>
    </div>
  );
}

export function reportToCsv(report: Report): string {
  const head = ["#", "Artist", "Title", "Year", "Label", "Catalog #", "Format", "Media", "Sleeve", "Value Low USD", "Value High USD"];
  const rows = report.line_items.map((it, i) => [
    i + 1,
    it.artist,
    it.title,
    it.year ?? "",
    it.label ?? "",
    it.catalog_number ?? "",
    it.format ?? "",
    it.media_condition ? toUiGrade(it.media_condition) : "",
    it.sleeve_condition ? toUiGrade(it.sleeve_condition) : "",
    (it.value_low_cents / 100).toFixed(2),
    (it.value_high_cents / 100).toFixed(2),
  ]);
  const totals = ["", "Collection total", "", "", "", "", "", "", "", (report.total_low_cents / 100).toFixed(2), (report.total_high_cents / 100).toFixed(2)];
  const esc = (v: any) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head, ...rows, totals].map((r) => r.map(esc).join(",")).join("\n");
}
