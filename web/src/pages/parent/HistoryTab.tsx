import { useCallback, useEffect, useState } from "react";
import { api, type HistoryRow, type Kid } from "../../api.js";

export default function HistoryTab() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [kidId, setKidId] = useState<number | "all">("all");
  const [days, setDays] = useState(14);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      const qs = new URLSearchParams({ from, limit: "1000" });
      if (kidId !== "all") qs.set("kidId", String(kidId));
      const [h, k] = await Promise.all([
        api.get<HistoryRow[]>(`/api/history?${qs}`),
        kids.length ? Promise.resolve(kids) : api.get<Kid[]>("/api/kids"),
      ]);
      setRows(h);
      if (!kids.length) setKids(k);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, [kidId, days, kids]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-display font-bold text-2xl">history</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={String(kidId)}
            onChange={(e) =>
              setKidId(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            className="input w-auto text-sm"
          >
            <option value="all">all kids</option>
            {kids.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="input w-auto text-sm"
          >
            <option value={7}>last 7 days</option>
            <option value={14}>last 14 days</option>
            <option value={30}>last 30 days</option>
            <option value={90}>last 90 days</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="sticker bg-tangerine text-paper px-4 py-2 mb-4 font-display animate-shake-x">
          {error}
        </div>
      )}
      {!rows && <div className="font-display text-ink-soft/60">loading…</div>}

      {rows && rows.length === 0 && (
        <div className="font-body text-ink-soft italic">No completions in this window.</div>
      )}

      {rows && rows.length > 0 && (
        <div className="sticker bg-paper p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paper-deep border-b-3 border-ink">
              <tr className="font-display uppercase tracking-wider text-xs text-ink-soft">
                <th className="px-4 py-2.5 text-left">date</th>
                <th className="px-4 py-2.5 text-left">kid</th>
                <th className="px-4 py-2.5 text-left">chore</th>
                <th className="px-4 py-2.5 text-left">by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  className={[
                    "border-t border-ink/10",
                    i % 2 === 0 ? "" : "bg-paper-deep/40",
                  ].join(" ")}
                >
                  <td className="px-4 py-2 font-mono text-ink-soft">{r.completed_date}</td>
                  <td className="px-4 py-2 font-display font-semibold">{r.kid_name}</td>
                  <td className="px-4 py-2">{r.chore_name}</td>
                  <td className="px-4 py-2 text-ink-soft">{r.completed_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
