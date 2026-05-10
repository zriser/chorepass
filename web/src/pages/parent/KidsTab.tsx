import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Bedtime, type Kid } from "../../api.js";
import { Avatar, colorForName } from "../../components/Avatar.js";

type Draft = {
  id?: number;
  name: string;
  slug: string;
  // Index 0..6 (0=Sun..6=Sat), each holds the time string or "" for "no bedtime that day".
  bedtimes: string[];
  avatar: string;
  macs: { mac: string; label: string }[];
};

// Display order in the bedtime grid: Mon..Sun. Stored values stay 0=Sun..6=Sat
// so they line up with util/date.ts weekdayIndex on the server.
const WEEKDAY_DISPLAY: { weekday: number; short: string; long: string }[] = [
  { weekday: 1, short: "Mon", long: "Monday" },
  { weekday: 2, short: "Tue", long: "Tuesday" },
  { weekday: 3, short: "Wed", long: "Wednesday" },
  { weekday: 4, short: "Thu", long: "Thursday" },
  { weekday: 5, short: "Fri", long: "Friday" },
  { weekday: 6, short: "Sat", long: "Saturday" },
  { weekday: 0, short: "Sun", long: "Sunday" },
];

const EMPTY: Draft = {
  name: "",
  slug: "",
  bedtimes: ["20:00", "20:00", "20:00", "20:00", "20:00", "20:00", "20:00"],
  avatar: "",
  macs: [{ mac: "", label: "" }],
};

function bedtimesToDraft(bedtimes: Bedtime[]): string[] {
  const out = ["", "", "", "", "", "", ""];
  for (const b of bedtimes) {
    if (b.weekday >= 0 && b.weekday <= 6) out[b.weekday] = b.time;
  }
  return out;
}

function draftToBedtimes(draft: string[]): Bedtime[] {
  const out: Bedtime[] = [];
  for (let i = 0; i < 7; i++) {
    if (draft[i]) out.push({ weekday: i, time: draft[i] });
  }
  return out;
}

function summarizeBedtimes(bedtimes: Bedtime[]): string {
  if (!bedtimes.length) return "no scheduled bedtimes";
  const byTime = new Map<string, number[]>();
  for (const b of bedtimes) {
    const list = byTime.get(b.time) ?? [];
    list.push(b.weekday);
    byTime.set(b.time, list);
  }
  // If every weekday shares the same time, show the simple form.
  if (byTime.size === 1 && bedtimes.length === 7) {
    return `bedtime ${bedtimes[0].time} every day`;
  }
  const labelFor = (weekday: number) =>
    WEEKDAY_DISPLAY.find((d) => d.weekday === weekday)?.short ?? `?${weekday}`;
  const parts: string[] = [];
  for (const { weekday } of WEEKDAY_DISPLAY) {
    const time = bedtimes.find((b) => b.weekday === weekday)?.time;
    if (time) parts.push(`${labelFor(weekday)} ${time}`);
  }
  return parts.join(" · ");
}

export default function KidsTab() {
  const [kids, setKids] = useState<Kid[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setKids(await api.get<Kid[]>("/api/kids"));
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startNew = () =>
    setDraft({ ...EMPTY, bedtimes: [...EMPTY.bedtimes], macs: [{ mac: "", label: "" }] });
  const startEdit = (k: Kid) =>
    setDraft({
      id: k.id,
      name: k.name,
      slug: k.slug,
      bedtimes: bedtimesToDraft(k.bedtimes),
      avatar: k.avatar ?? "",
      macs: k.macs.length
        ? k.macs.map((m) => ({ mac: m.mac, label: m.label ?? "" }))
        : [{ mac: "", label: "" }],
    });

  const save = async () => {
    if (!draft) return;
    const payload = {
      name: draft.name.trim(),
      slug: draft.slug.trim() || draft.name.trim().toLowerCase().replace(/\s+/g, "-"),
      bedtimes: draftToBedtimes(draft.bedtimes),
      avatar: draft.avatar.trim() || null,
      macs: draft.macs
        .map((m) => ({ mac: m.mac.trim(), label: m.label.trim() || undefined }))
        .filter((m) => m.mac),
    };
    try {
      if (draft.id) {
        await api.put(`/api/kids/${draft.id}`, payload);
      } else {
        await api.post("/api/kids", payload);
      }
      setDraft(null);
      await refresh();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this kid? Their chores, completions, and gate log entries will cascade.")) return;
    try {
      await api.del(`/api/kids/${id}`);
      await refresh();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const uploadAvatar = async (kidId: number, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError("image too large (max 5 MB)");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    try {
      const updated = await api.post<Kid>(`/api/kids/${kidId}/avatar`, { dataUrl });
      // If the form is open for this kid, sync the avatar field too.
      setDraft((d) => (d && d.id === kidId ? { ...d, avatar: updated.avatar ?? "" } : d));
      await refresh();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const clearAvatar = async (kidId: number) => {
    try {
      await api.del(`/api/kids/${kidId}/avatar`);
      setDraft((d) => (d && d.id === kidId ? { ...d, avatar: "" } : d));
      await refresh();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-display font-bold text-2xl">kids</h2>
        <button onClick={startNew} className="pill bg-berry text-paper">
          + add kid
        </button>
      </div>

      {error && (
        <div className="sticker bg-tangerine text-paper px-4 py-2 mb-4 font-display animate-shake-x">
          {error}
        </div>
      )}
      {!kids && <div className="font-display text-ink-soft/60">loading…</div>}

      <ul className="space-y-3 mb-6">
        {kids?.map((k) => (
          <li key={k.id} className="sticker bg-paper p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Avatar name={k.name} avatar={k.avatar} size={64} />
              <div className="flex-1 min-w-[140px]">
                <div className="font-display font-bold text-xl">{k.name}</div>
                <div className="font-body text-sm text-ink-soft">
                  <code className="font-mono">{k.slug}</code> · {summarizeBedtimes(k.bedtimes)}
                </div>
                <div className="font-body text-xs text-ink-soft/70 mt-1 break-all">
                  {k.macs.length} MAC{k.macs.length === 1 ? "" : "s"}:{" "}
                  {k.macs.map((m) => m.mac).join(", ") || "—"}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(k)} className="pill bg-paper-deep">
                  edit
                </button>
                <button
                  onClick={() => remove(k.id)}
                  className="pill bg-tangerine text-paper"
                >
                  delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {draft && (
        <KidForm
          draft={draft}
          setDraft={setDraft}
          onCancel={() => setDraft(null)}
          onSave={save}
          onUploadAvatar={(f) => draft.id && uploadAvatar(draft.id, f)}
          onClearAvatar={() => draft.id && clearAvatar(draft.id)}
        />
      )}
    </div>
  );
}

function KidForm({
  draft,
  setDraft,
  onCancel,
  onSave,
  onUploadAvatar,
  onClearAvatar,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  onUploadAvatar: (file: File) => void;
  onClearAvatar: () => void;
}) {
  const update = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft({ ...draft, [k]: v });
  const fileRef = useRef<HTMLInputElement>(null);
  const isImageAvatar = !!draft.avatar && (draft.avatar.startsWith("/") || draft.avatar.startsWith("http"));
  const previewName = draft.name || "new kid";

  return (
    <div className="sticker-lg bg-paper-deep p-6 space-y-5 animate-pop-in">
      <h3 className="font-display font-bold text-2xl">
        {draft.id ? "edit kid" : "new kid"}
      </h3>

      <div className="flex items-start gap-5 flex-wrap">
        <div className="flex flex-col items-center gap-2">
          <Avatar
            name={previewName}
            avatar={draft.avatar}
            size={120}
            color={colorForName(previewName)}
          />
          <div className="flex flex-col gap-1.5 w-32">
            {draft.id ? (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="pill bg-ocean text-paper justify-center"
                >
                  {isImageAvatar ? "replace" : "upload photo"}
                </button>
                {draft.avatar && (
                  <button
                    onClick={onClearAvatar}
                    className="pill bg-paper text-ink-soft justify-center text-xs"
                  >
                    remove
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUploadAvatar(f);
                    e.target.value = "";
                  }}
                />
              </>
            ) : (
              <p className="font-body text-xs text-ink-soft text-center">
                save first, then upload a photo
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-[240px] space-y-3">
          <Field label="name">
            <input
              value={draft.name}
              onChange={(e) => update("name", e.target.value)}
              className="input"
              placeholder="Alex"
            />
          </Field>
          <Field label="slug (url)">
            <input
              value={draft.slug}
              onChange={(e) => update("slug", e.target.value)}
              className="input"
              placeholder="alex"
            />
          </Field>
          <Field label="emoji avatar (optional, used if no photo)">
            <input
              value={isImageAvatar ? "" : draft.avatar}
              onChange={(e) => update("avatar", e.target.value)}
              className="input"
              maxLength={2}
              placeholder="🐱"
              disabled={isImageAvatar}
            />
          </Field>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
          <label className="block font-display font-semibold text-ink-soft">
            bedtimes
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const first = draft.bedtimes.find((t) => t) ?? "20:00";
                update("bedtimes", new Array(7).fill(first));
              }}
              className="pill bg-paper text-ink-soft text-xs"
              title="Set every day to the first non-empty bedtime"
            >
              same every day
            </button>
            <button
              type="button"
              onClick={() => update("bedtimes", new Array(7).fill(""))}
              className="pill bg-paper text-ink-soft text-xs"
              title="Clear all bedtimes (no scheduled blocks)"
            >
              clear all
            </button>
          </div>
        </div>
        <p className="font-body text-xs text-ink-soft mb-3">
          empty = no scheduled block that day. parents can still force-block from the Today tab.
        </p>
        <div className="space-y-2">
          {WEEKDAY_DISPLAY.map(({ weekday, short, long }) => (
            <div key={weekday} className="flex items-center gap-3">
              <span
                className="font-display font-semibold text-ink-soft w-12 text-sm"
                title={long}
              >
                {short}
              </span>
              <input
                type="time"
                value={draft.bedtimes[weekday]}
                onChange={(e) => {
                  const next = [...draft.bedtimes];
                  next[weekday] = e.target.value;
                  update("bedtimes", next);
                }}
                className="input"
              />
              {draft.bedtimes[weekday] && (
                <button
                  type="button"
                  onClick={() => {
                    const next = [...draft.bedtimes];
                    next[weekday] = "";
                    update("bedtimes", next);
                  }}
                  className="pill bg-paper text-ink-soft px-3 text-xs"
                  title="No scheduled bedtime this day"
                >
                  clear
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block font-display font-semibold text-ink-soft mb-2">
          mac addresses
        </label>
        <div className="space-y-2">
          {draft.macs.map((m, i) => (
            <div key={i} className="flex gap-2 flex-wrap">
              <input
                value={m.mac}
                onChange={(e) => {
                  const next = [...draft.macs];
                  next[i] = { ...next[i], mac: e.target.value };
                  update("macs", next);
                }}
                placeholder="aa:bb:cc:dd:ee:ff"
                className="input-mono flex-1 min-w-[200px]"
              />
              <input
                value={m.label}
                onChange={(e) => {
                  const next = [...draft.macs];
                  next[i] = { ...next[i], label: e.target.value };
                  update("macs", next);
                }}
                placeholder="label"
                className="input w-40"
              />
              <button
                onClick={() => {
                  const next = draft.macs.filter((_, j) => j !== i);
                  update("macs", next.length ? next : [{ mac: "", label: "" }]);
                }}
                className="pill bg-paper text-ink-soft px-3"
                title="Remove MAC"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => update("macs", [...draft.macs, { mac: "", label: "" }])}
          className="mt-3 pill bg-paper text-ocean-deep"
        >
          + add mac
        </button>
      </div>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-display font-semibold text-ink-soft text-sm mb-1">{label}</span>
      {children}
    </label>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
