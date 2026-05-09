import { useCallback, useEffect, useState } from "react";
import { api, type Chore, type Kid } from "../../api.js";

const DAY_LABELS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

type Draft = {
  id?: number;
  name: string;
  points: number;
  active: boolean;
  kidIds: number[];
  weekdays: number[];
};

const EMPTY: Draft = {
  name: "",
  points: 1,
  active: true,
  kidIds: [],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
};

export default function ChoresTab() {
  const [chores, setChores] = useState<Chore[] | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [c, k] = await Promise.all([
        api.get<Chore[]>("/api/chores"),
        api.get<Kid[]>("/api/kids"),
      ]);
      setChores(c);
      setKids(k);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startNew = () => setDraft({ ...EMPTY });
  const startEdit = (c: Chore) => {
    const weekdays = c.assignments[0]?.weekdays ?? [0, 1, 2, 3, 4, 5, 6];
    setDraft({
      id: c.id,
      name: c.name,
      points: c.points,
      active: c.active,
      kidIds: c.assignments.map((a) => a.kidId),
      weekdays,
    });
  };

  const save = async () => {
    if (!draft) return;
    const payload = {
      name: draft.name.trim(),
      points: draft.points,
      active: draft.active,
      kidIds: draft.kidIds,
      weekdays: draft.weekdays,
    };
    try {
      if (draft.id) {
        await api.put(`/api/chores/${draft.id}`, payload);
      } else {
        await api.post("/api/chores", payload);
      }
      setDraft(null);
      await refresh();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this chore and all its completion history?")) return;
    try {
      await api.del(`/api/chores/${id}`);
      await refresh();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const kidName = (id: number) => kids.find((k) => k.id === id)?.name ?? `#${id}`;
  const daysLabel = (days: number[]) => {
    if (days.length === 7) return "every day";
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "weekdays";
    if (days.length === 2 && days.includes(0) && days.includes(6)) return "weekends";
    return days.map((d) => DAY_LABELS[d]).join(" · ");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-display font-bold text-2xl">chores</h2>
        <button onClick={startNew} className="pill bg-mint text-ink">
          + add chore
        </button>
      </div>

      {error && (
        <div className="sticker bg-tangerine text-paper px-4 py-2 mb-4 font-display animate-shake-x">
          {error}
        </div>
      )}
      {!chores && <div className="font-display text-ink-soft/60">loading…</div>}
      {chores && chores.length === 0 && (
        <div className="font-body text-ink-soft italic mb-4">No chores yet.</div>
      )}

      <ul className="space-y-3 mb-6">
        {chores?.map((c) => (
          <li
            key={c.id}
            className={[
              "sticker p-4",
              c.active ? "bg-paper" : "bg-paper-deep opacity-60",
            ].join(" ")}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <div className="font-display font-bold text-xl flex items-center gap-2 flex-wrap">
                  {c.name}
                  {!c.active && (
                    <span className="font-body text-xs px-2 py-0.5 bg-paper-deep border-2 border-ink rounded-full">
                      inactive
                    </span>
                  )}
                </div>
                <div className="font-body text-sm text-ink-soft mt-0.5">
                  <span className="font-bold">{c.points} pt</span> · {daysLabel(c.assignments[0]?.weekdays ?? [])}
                </div>
                <div className="font-body text-xs text-ink-soft/70 mt-1">
                  {c.assignments.length
                    ? c.assignments.map((a) => kidName(a.kidId)).join(", ")
                    : "— unassigned —"}
                </div>
              </div>
              <button onClick={() => startEdit(c)} className="pill bg-paper-deep">
                edit
              </button>
              <button
                onClick={() => remove(c.id)}
                className="pill bg-tangerine text-paper"
              >
                delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {draft && (
        <ChoreForm
          draft={draft}
          setDraft={setDraft}
          kids={kids}
          onCancel={() => setDraft(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

function ChoreForm({
  draft,
  setDraft,
  kids,
  onCancel,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  kids: Kid[];
  onCancel: () => void;
  onSave: () => void;
}) {
  const toggleKid = (id: number) => {
    const next = draft.kidIds.includes(id)
      ? draft.kidIds.filter((k) => k !== id)
      : [...draft.kidIds, id];
    setDraft({ ...draft, kidIds: next });
  };
  const toggleDay = (d: number) => {
    const next = draft.weekdays.includes(d)
      ? draft.weekdays.filter((x) => x !== d)
      : [...draft.weekdays, d].sort();
    setDraft({ ...draft, weekdays: next });
  };

  return (
    <div className="sticker-lg bg-paper-deep p-6 space-y-5 animate-pop-in">
      <h3 className="font-display font-bold text-2xl">
        {draft.id ? "edit chore" : "new chore"}
      </h3>

      <label className="block">
        <span className="block font-display font-semibold text-ink-soft text-sm mb-1">name</span>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="input"
          placeholder="Dishes"
        />
      </label>

      <label className="block">
        <span className="block font-display font-semibold text-ink-soft text-sm mb-1">points</span>
        <input
          type="number"
          min={0}
          value={draft.points}
          onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })}
          className="input w-28"
        />
      </label>

      <div>
        <span className="block font-display font-semibold text-ink-soft text-sm mb-2">assigned to</span>
        <div className="flex flex-wrap gap-2">
          {kids.map((k) => {
            const on = draft.kidIds.includes(k.id);
            return (
              <button
                key={k.id}
                onClick={() => toggleKid(k.id)}
                className={[
                  "tab",
                  on ? "bg-berry text-paper" : "bg-paper text-ink-soft",
                ].join(" ")}
              >
                {k.name}
              </button>
            );
          })}
          {kids.length === 0 && (
            <span className="font-body text-ink-soft italic text-sm">No kids yet.</span>
          )}
        </div>
      </div>

      <div>
        <span className="block font-display font-semibold text-ink-soft text-sm mb-2">days</span>
        <div className="flex flex-wrap gap-1.5">
          {DAY_LABELS.map((label, i) => {
            const on = draft.weekdays.includes(i);
            return (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                className={[
                  "w-14 py-2 rounded-lg border-3 border-ink font-display font-semibold text-sm transition-transform sticker-press",
                  on ? "bg-ocean text-paper shadow-sticker-sm" : "bg-paper text-ink-soft",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-center gap-3 font-display">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          className="w-6 h-6 accent-berry"
        />
        <span className="text-ink font-semibold">active</span>
      </label>

      <div className="flex gap-3 pt-2">
        <button onClick={onSave} className="pill bg-mint text-ink">
          save
        </button>
        <button onClick={onCancel} className="pill bg-paper text-ink-soft">
          cancel
        </button>
      </div>
    </div>
  );
}
