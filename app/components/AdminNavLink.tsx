"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Renders an "Admin" nav pill only for users with the is_admin flag.
// Invisible to everyone else.
export function AdminNavLink() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (active) setIsAdmin(!!data?.is_admin);
    })();
    return () => { active = false; };
  }, []);

  if (!isAdmin) return null;

  return (
    <a href="/admin" className="font-eyebrow text-xs px-4 py-2 rounded-full whitespace-nowrap flex-shrink-0"
      style={{ color: "var(--wd-gold)", border: "1px solid var(--wd-gold)" }}>
      Admin
    </a>
  );
}
