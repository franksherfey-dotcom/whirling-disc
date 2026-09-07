export type ConditionGrade = "M" | "NM" | "VG+" | "VG" | "G+" | "G" | "F" | "P";

export interface Record {
  id: string;
  user_id: string;
  collection_id: string;
  artist: string;
  title: string;
  year?: number | null;
  label?: string | null;
  catalog_number?: string | null;
  format?: string | null;
  rpm?: string | null;
  country?: string | null;
  genres?: string[] | null;
  media_condition?: string | null;
  sleeve_condition?: string | null;
  cover_url?: string | null;
  back_url?: string | null;
  deadwax_url?: string | null;
  location?: string | null;
  label_url?: string | null;
  side_a_url?: string | null;
  side_b_url?: string | null;
  side_a_label?: string | null;
  side_b_label?: string | null;
  disc_photo_urls?: string[] | null;
  disc_count?: number | null;
  value_low_cents?: number | null;
  value_high_cents?: number | null;
  value_source?: string | null;
  value_breakdown?: { [key: string]: number | null } | null;
  discogs_release_url?: string | null;
  ai_confidence?: number | null;
  summary?: string | null;
  condition_notes?: string | null;
  reasoning?: { sleeve?: string | null; condition?: string | null; pressing?: string | null } | null;
  pressing_details?: {
    identification?: string | null;
    is_first_pressing?: boolean | null;
    matrix_runout?: string | null;
    country_of_pressing?: string | null;
    distinguishing_marks?: string | null;
    uncertainty?: string | null;
  } | null;
  created_at: string;
  updated_at: string;
}
