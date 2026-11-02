import { supabase } from "@/lib/supabase";

// A collection the signed-in user can see: either their own, or one they
// collaborate on (e.g. Frank helping Marge catalog her records).
export type MyCollection = {
  id: string;
  name: string;
  owner_id: string;
  owner_label: string; // owner's display name (e.g. "Marge")
  is_owner: boolean;
  role: string; // 'owner' | 'editor' | 'viewer'
  record_count: number;
};

const KEY = "wd_active_collection";

// Every collection the user can view/add to, owned first.
export async function loadMyCollections(): Promise<MyCollection[]> {
  const { data, error } = await supabase.rpc("list_my_collections");
  if (error || !data) {
    console.error("list_my_collections failed", error);
    return [];
  }
  return data as MyCollection[];
}

// Tab label: your own crate reads "My Crate"; a shared one reads "Marge's Crate".
export function labelFor(c: MyCollection): string {
  if (c.is_owner) return "My Crate";
  const name = (c.owner_label || "Shared").trim();
  const poss = /s$/i.test(name) ? `${name}'` : `${name}'s`;
  return `${poss} Crate`;
}

export function getActiveCollectionId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveCollectionId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage blocked (private window etc.) — selection just won't persist */
  }
}

// Which collection to show: the stored choice if still accessible, else the
// user's own, else the first one available.
export function resolveActive(cols: MyCollection[], storedId: string | null): MyCollection | null {
  if (!cols.length) return null;
  if (storedId) {
    const found = cols.find((c) => c.id === storedId);
    if (found) return found;
  }
  return cols.find((c) => c.is_owner) || cols[0];
}

export function canEdit(c: MyCollection | null): boolean {
  return !!c && (c.is_owner || c.role === "owner" || c.role === "editor" || c.role === "admin");
}
