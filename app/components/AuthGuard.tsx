"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Public pages that don't require a session.
const PUBLIC = ["/", "/signin", "/signup", "/forgot-password"];
const isPublic = (path: string) =>
  PUBLIC.includes(path) || path.startsWith("/join/");

export function AuthGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session && !isPublic(pathname)) {
        router.replace("/signin");
        return;
      }
      // Force temp-password users to set their own before using the app.
      if (session && pathname !== "/account/password") {
        const { data: profile } = await supabase
          .from("profiles").select("must_change_password, suspended").eq("id", session.user.id).maybeSingle();
        if (active && profile?.suspended) {
          await supabase.auth.signOut();
          router.replace("/signin?suspended=1");
          return;
        }
        if (active && profile?.must_change_password) {
          router.replace("/account/password?forced=1");
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if ((event === "SIGNED_OUT" || !session) && !isPublic(pathname)) {
        router.replace("/signin");
      }
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [pathname, router]);

  return null;
}
