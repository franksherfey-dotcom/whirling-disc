// The database enum condition_grade uses: M, NM, VGP, VG, GP, G, F, P
// The UI (and Discogs convention) uses: M, NM, VG+, VG, G+, G, F, P
// These helpers translate between them so inserts never fail on the enum.

export type UiGrade = "M" | "NM" | "VG+" | "VG" | "G+" | "G" | "F" | "P";
export type DbGrade = "M" | "NM" | "VGP" | "VG" | "GP" | "G" | "F" | "P";

const UI_TO_DB: Record<string, DbGrade> = {
  M: "M", NM: "NM", "VG+": "VGP", VG: "VG", "G+": "GP", G: "G", F: "F", P: "P",
};
const DB_TO_UI: Record<string, UiGrade> = {
  M: "M", NM: "NM", VGP: "VG+", VG: "VG", GP: "G+", G: "G", F: "F", P: "P",
};

export function toDbGrade(g: string | null | undefined): DbGrade {
  if (!g) return "VG";
  return UI_TO_DB[g] ?? UI_TO_DB[g.toUpperCase()] ?? "VG";
}

export function toUiGrade(g: string | null | undefined): UiGrade {
  if (!g) return "VG";
  return DB_TO_UI[g] ?? "VG";
}

export const GRADE_LABELS: Record<UiGrade, string> = {
  M: "Mint",
  NM: "Near Mint",
  "VG+": "Very Good Plus",
  VG: "Very Good",
  "G+": "Good Plus",
  G: "Good",
  F: "Fair",
  P: "Poor",
};

// Ordinal scale for averaging two disc sides. Higher index = better.
const GRADE_ORDER: UiGrade[] = ["P", "F", "G", "G+", "VG", "VG+", "NM", "M"];

/**
 * Average two UI grades on the ordinal scale and return the nearest grade.
 * A single deep scratch on one side pulls the record down without erasing
 * the value of a clean side. If one side is missing, the other stands.
 */
export function averageGrades(a?: string | null, b?: string | null): UiGrade {
  const ia = a ? GRADE_ORDER.indexOf(toUiGrade(a)) : -1;
  const ib = b ? GRADE_ORDER.indexOf(toUiGrade(b)) : -1;
  if (ia < 0 && ib < 0) return "VG";
  if (ia < 0) return GRADE_ORDER[ib];
  if (ib < 0) return GRADE_ORDER[ia];
  const avg = Math.round((ia + ib) / 2);
  return GRADE_ORDER[Math.max(0, Math.min(GRADE_ORDER.length - 1, avg))];
}

// Goldmine Standard grading definitions — the record-industry norm. Used both
// to instruct the AI's visual grading and as the reference shown to users.
// G and G+ share a description in the Goldmine standard, as do F and P; we keep
// all eight grades distinct but reuse the paired language where it applies.
export const GRADE_DEFINITIONS: Record<UiGrade, string> = {
  M: "Perfect, brand new, usually factory-sealed. Record and cover have zero flaws or signs of handling.",
  NM: "Nearly perfect. Handled or played very carefully with zero drop in sound quality. Cover has no creases, splits, or major wear.",
  "VG+": "Slight signs of previous use. Light scuffs or very minor scratches that do not affect the music. Cover may have minor shelf wear.",
  VG: "Noticeable wear and use. Light scratches and background surface noise may be audible in quiet parts but do not overpower the music. Cover may have ring wear, small seam splits, or sticker marks.",
  "G+": "Heavy wear. Plays through without skipping, but expect constant surface noise, clicks, and visible groove wear. Cover has heavy ring wear, tape, or split seams.",
  G: "Heavy wear. Plays through without skipping, but expect constant surface noise, clicks, and visible groove wear. Cover has heavy ring wear, tape, or split seams.",
  F: "Severely damaged. May warp heavily, skip repeatedly, or fail to play. Usually only kept if the release is extremely rare.",
  P: "Severely damaged. May warp heavily, skip repeatedly, or fail to play. Usually only kept if the release is extremely rare.",
};

// A compact scale string for the AI prompt (best to worst).
export function gradingRubricForPrompt(): string {
  const order: UiGrade[] = ["M", "NM", "VG+", "VG", "G+", "G", "F", "P"];
  return order.map((g) => `${g} (${GRADE_LABELS[g]}): ${GRADE_DEFINITIONS[g]}`).join("\n");
}
