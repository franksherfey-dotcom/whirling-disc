"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Record } from "../components/Record";
import Link from "next/link";

type U = {
  id: string; email: string; created_at: string; last_sign_in_at: string | null;
  confirmed: boolean; entitlement: string; is_admin: boolean; suspended: boolean;
  must_change_password: boolean; records: number; is_self: boolean;
};
type Stats = { total: number; pro: number; free: number; suspended: number; totalRecords: number; activeWeek: number };

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<U[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const router = useRouter();

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${await token()}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load");
      setUsers(json.users); setStats(json.stats);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/signin"); return; }
      const { data: p } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      setIsAdmin(!!p?.is_admin);
      setChecking(false);
      if (p?.is_admin) load();
    })();
  }, [router, load]);

  const act = async (id: string, action: string) => {
    setBusyId(id); setError(null);
    try {
      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Action failed");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); }
  };

  const addUser = async () => {
    setAddBusy(true); setAddMsg(null); setError(null);
    try {
      const res = await fetch("/api/admin/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ email: addEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");
      setAddMsg(`${json.message} Temp password: ${json.tempPassword}`);
      setAddEmail("");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setAddBusy(false); }
  };

  if (checking) return <div className="py-28 flex justify-center"><Record size={48} spinning /></div>;
  if (!isAdmin) return (
    <div className="max-w-md mx-auto py-20 text-center">
      <h1 className="font-display text-2xl mb-2" style={{ color: "var(--wd-text)" }}>Not available</h1>
      <Link href="/records" className="font-eyebrow text-xs" style={{ color: "var(--wd-gold)" }}>← Back to crate</Link>
    </div>
  );

  const S = ({ n, label }: { n: number | string; label: string }) => (
    <div className="rounded-2xl p-4 text-center" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
      <p className="text-2xl font-bold" style={{ color: "var(--wd-gold)" }}>{n}</p>
      <p className="font-eyebrow text-[10px] mt-1" style={{ color: "var(--wd-text-faint)" }}>{label}</p>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/records" className="font-eyebrow text-xs mb-4 inline-block" style={{ color: "var(--wd-text-dim)" }}>← Back to crate</Link>
      <h1 className="font-display text-4xl mb-6" style={{ color: "var(--wd-text)" }}>Admin</h1>

      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
          <S n={stats.total} label="Users" />
          <S n={stats.pro} label="Pro" />
          <S n={stats.free} label="Free" />
          <S n={stats.suspended} label="Suspended" />
          <S n={stats.activeWeek} label="Active 7d" />
          <S n={stats.totalRecords} label="Records" />
        </div>
      )}

      <div className="rounded-2xl p-5 mb-6" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        <p className="font-eyebrow text-xs mb-3" style={{ color: "var(--wd-text-faint)" }}>Add a person (full Pro, no charge)</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="person@example.com"
            className="flex-1 px-4 py-3 rounded-xl text-sm" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }} />
          <button onClick={addUser} disabled={addBusy} className="px-6 py-3 rounded-xl font-eyebrow text-xs disabled:opacity-60" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
            {addBusy ? "Creating…" : "Create Pro account"}
          </button>
        </div>
        {addMsg && <p className="text-xs mt-3" style={{ color: "var(--wd-gold)" }}>{addMsg}</p>}
      </div>

      {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}>{error}</div>}

      {loading ? <div className="py-16 flex justify-center"><Record size={40} spinning /></div> : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="rounded-2xl p-4" style={{ background: "var(--wd-surface)", border: `1px solid ${u.suspended ? "rgba(176,40,28,0.4)" : "var(--wd-border)"}` }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--wd-text)" }}>
                    {u.email} {u.is_admin && <span className="font-eyebrow text-[9px] ml-1" style={{ color: "var(--wd-gold)" }}>ADMIN</span>}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--wd-text-faint)" }}>
                    {u.entitlement} · {u.records} records · joined {fmtDate(u.created_at)} · last in {fmtDate(u.last_sign_in_at)}
                    {u.suspended && <span style={{ color: "#f0a89f" }}> · SUSPENDED</span>}
                    {!u.confirmed && <span> · unconfirmed</span>}
                  </p>
                </div>
                {u.is_self ? (
                  <span className="font-eyebrow text-[10px] px-3 py-1.5" style={{ color: "var(--wd-text-faint)" }}>you</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {u.entitlement === "free"
                      ? <Btn onClick={() => act(u.id, "make_pro")} busy={busyId === u.id}>Make Pro</Btn>
                      : <Btn onClick={() => act(u.id, "make_free")} busy={busyId === u.id}>Make Free</Btn>}
                    {u.is_admin
                      ? <Btn onClick={() => act(u.id, "remove_admin")} busy={busyId === u.id}>Remove Admin</Btn>
                      : <Btn onClick={() => act(u.id, "make_admin")} busy={busyId === u.id} gold>Make Admin</Btn>}
                    {u.suspended
                      ? <Btn onClick={() => act(u.id, "unsuspend")} busy={busyId === u.id} gold>Unsuspend</Btn>
                      : <Btn onClick={() => act(u.id, "suspend")} busy={busyId === u.id} danger>Suspend</Btn>}
                    <Btn onClick={() => act(u.id, "force_password")} busy={busyId === u.id}>Reset pw</Btn>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Btn({ children, onClick, busy, danger, gold }: any) {
  return (
    <button onClick={onClick} disabled={busy}
      className="font-eyebrow text-[10px] px-3 py-1.5 rounded-full disabled:opacity-50"
      style={{
        border: `1px solid ${danger ? "rgba(176,40,28,0.5)" : gold ? "var(--wd-gold)" : "var(--wd-border)"}`,
        color: danger ? "#f0a89f" : gold ? "var(--wd-gold)" : "var(--wd-text-dim)",
      }}>
      {children}
    </button>
  );
}
