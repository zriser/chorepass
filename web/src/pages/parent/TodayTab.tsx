import { useCallback, useEffect, useState } from "react";
import { api, type GateStatus } from "../../api.js";
import { formatLocalDateTime } from "../../format.js";

export default function TodayTab() {
  const [rows, setRows] = useState<GateStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await api.get<GateStatus[]>("/api/admin/gate-status"));
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const force = async (kidId: number, action: "block" | "unblock") => {
    setBusyId(kidId);
    try {
      await api.post(`/api/admin/force-${action}`, { kidId });
      await refresh();
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  const resetDay = async () => {
    if (!confirm("Reset today's completions and block all kids?")) return;
    try {
      await api.post("/api/admin/reset-day");
      await refresh();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  if (error) {
    return (
      <div className="sticker bg-tangerine text-paper px-4 py-2 font-display animate-shake-x">
        {error}
      </div>
    );
  }
  if (!rows) return <div className="font-display text-ink-soft/60">loading…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-display font-bold text-2xl">gate status</h2>
        <button onClick={resetDay} className="pill bg-sunshine text-ink">
          reset today
        </button>
      </div>

      {rows.length === 0 && (
        <div className="font-body text-ink-soft italic">No kids yet.</div>
      )}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="sticker bg-paper p-4 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[180px]">
              <div className="font-display font-bold text-xl">{r.name}</div>
              <div className="font-body text-sm text-ink-soft mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  <span className="font-bold">
                    {r.chores.done}/{r.chores.total}
                  </span>{" "}
                  done
                </span>
                <span
                  className={[
                    "font-display font-bold px-2 py-0.5 rounded-full border-2 border-ink text-xs",
                    r.currentlyUnlocked
                      ? "bg-mint text-ink"
                      : "bg-tangerine text-paper",
                  ].join(" ")}
                >
                  {r.currentlyUnlocked ? "unblocked" : "blocked"}
                </span>
                {r.shouldBeUnlocked && (
                  <span className="font-display font-bold px-2 py-0.5 rounded-full border-2 border-ink text-xs bg-sunshine text-ink">
                    earned
                  </span>
                )}
              </div>
              {r.lastAction && (
                <div className="font-mono text-xs text-ink-soft/60 mt-1">
                  last: {r.lastAction} @ {formatLocalDateTime(r.lastActionAt)}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                disabled={busyId === r.id}
                onClick={() => force(r.id, "unblock")}
                className="pill bg-mint text-ink disabled:opacity-50"
              >
                unblock
              </button>
              <button
                disabled={busyId === r.id}
                onClick={() => force(r.id, "block")}
                className="pill bg-tangerine text-paper disabled:opacity-50"
              >
                block
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
