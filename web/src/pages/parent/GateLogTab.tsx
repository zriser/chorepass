import { useCallback, useEffect, useState } from "react";
import { api, type GateLogRow } from "../../api.js";

export default function GateLogTab() {
  const [rows, setRows] = useState<GateLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await api.get<GateLogRow[]>("/api/admin/gate-log?limit=200"));
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-display font-bold text-2xl">gate log</h2>
        <button onClick={refresh} className="pill bg-paper-deep">
          refresh
        </button>
      </div>

      {error && (
        <div className="sticker bg-tangerine text-paper px-4 py-2 mb-4 font-display animate-shake-x">
          {error}
        </div>
      )}
      {!rows && <div className="font-display text-ink-soft/60">loading…</div>}

      {rows && rows.length === 0 && (
        <div className="font-body text-ink-soft italic">No gate events yet.</div>
      )}

      {rows && rows.length > 0 && (
        <div className="sticker bg-paper p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-paper-deep border-b-3 border-ink">
              <tr className="font-display uppercase tracking-wider text-xs text-ink-soft">
                <th className="px-3 py-2.5 text-left">when</th>
                <th className="px-3 py-2.5 text-left">kid</th>
                <th className="px-3 py-2.5 text-left">action</th>
                <th className="px-3 py-2.5 text-left">source</th>
                <th className="px-3 py-2.5 text-left">pi-hole</th>
                <th className="px-3 py-2.5 text-left">unifi</th>
                <th className="px-3 py-2.5 text-left">note</th>
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
                  <td className="px-3 py-2 font-mono text-xs text-ink-soft">{r.created_at}</td>
                  <td className="px-3 py-2 font-display font-semibold">{r.kid_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={[
                        "font-display font-bold px-2 py-0.5 rounded-full border-2 border-ink text-xs",
                        r.action === "block"
                          ? "bg-tangerine text-paper"
                          : "bg-mint text-ink",
                      ].join(" ")}
                    >
                      {r.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{r.source}</td>
                  <td className="px-3 py-2">
                    {r.pihole_ok === null ? (
                      <span className="text-ink-soft/40">—</span>
                    ) : r.pihole_ok ? (
                      <span className="text-mint font-bold">✓</span>
                    ) : (
                      <span className="text-tangerine font-bold">✕</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.unifi_ok === null ? (
                      <span className="text-ink-soft/40">—</span>
                    ) : r.unifi_ok ? (
                      <span className="text-mint font-bold">✓</span>
                    ) : (
                      <span className="text-tangerine font-bold">✕</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-soft text-xs">{r.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
