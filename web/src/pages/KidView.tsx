import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Today, type TodayChore } from "../api.js";
import { Avatar, colorForName } from "../components/Avatar.js";
import { ProgressRing } from "../components/ProgressRing.js";

// Per-chore decoration: a color and a tiny sticker glyph derived from the chore id
// so the same chore looks the same every time but kids see variety across the list.
const CHORE_COLORS = ["#FFC93C", "#5BD9A4", "#FF7A45", "#9B6FE0", "#E94886", "#2BB7C4"];
const CHORE_GLYPHS = ["✿", "★", "✦", "✶", "❀", "♡", "✸", "❉"];

function decorate(chore: TodayChore) {
  return {
    color: CHORE_COLORS[chore.id % CHORE_COLORS.length],
    glyph: CHORE_GLYPHS[chore.id % CHORE_GLYPHS.length],
  };
}

export default function KidView() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [floats, setFloats] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const stampedOnce = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const t = await api.get<Today>(`/api/kids/${slug}/today`);
      setData(t);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, [slug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const done = data?.chores.filter((c) => c.completed).length ?? 0;
  const total = data?.chores.length ?? 0;
  const allDone = total > 0 && done === total;
  const kidColor = useMemo(
    () => (data ? data.kid.color ?? colorForName(data.kid.name) : "#2BB7C4"),
    [data],
  );

  useEffect(() => {
    if (allDone && !stampedOnce.current) {
      stampedOnce.current = true;
      setCelebrated(true);
    }
    if (!allDone) stampedOnce.current = false;
  }, [allDone]);

  const complete = async (chore: TodayChore, evt: React.MouseEvent) => {
    if (chore.completed || pendingId) return;
    setPendingId(chore.id);
    // Floating "+points" indicator at the click point
    const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
    const floatId = Date.now();
    setFloats((f) => [
      ...f,
      {
        id: floatId,
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
        text: chore.points > 0 ? `+${chore.points}` : "✓",
      },
    ]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== floatId)), 1000);

    try {
      await api.post(`/api/kids/${slug}/complete/${chore.id}`);
      await refresh();
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setPendingId(null);
    }
  };

  if (error) {
    return (
      <main className="min-h-screen p-6 flex flex-col items-center justify-center gap-5">
        <div className="sticker bg-tangerine text-paper px-6 py-4 font-display text-xl animate-shake-x">
          {error}
        </div>
        <Link to="/" className="pill bg-ocean text-paper">← back</Link>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center">
        <div className="font-display text-3xl text-ink-soft/60 animate-wiggle-slow">loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-7 max-w-2xl mx-auto relative">
      <Link
        to="/"
        className="pill border-ink/40 bg-transparent text-ink-soft hover:bg-paper-deep mb-5"
      >
        <span>←</span>
        <span>back</span>
      </Link>

      <header className="sticker-lg p-6 mb-6 relative" style={{ backgroundColor: kidColor }}>
        <div className="absolute inset-0 candy-stripes opacity-40 rounded-[inherit] pointer-events-none" />
        <div className="relative flex items-center gap-5">
          <Avatar name={data.kid.name} avatar={data.kid.avatar} size={96} color="#FFF7E8" />
          <div className="flex-1 min-w-0">
            <div className="font-body uppercase tracking-[0.2em] text-paper/80 text-xs font-bold">
              {humanDate(data.date)}
            </div>
            <h1 className="font-display font-bold text-5xl text-paper leading-none mt-1">
              hi, {data.kid.name.toLowerCase()}
            </h1>
          </div>
        </div>
      </header>

      <section className="sticker p-5 mb-7">
        <ProgressRing done={done} total={total} color={kidColor} />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <PointsBadge label="this week" value={data.pointsWeek} color={kidColor} />
          <PointsBadge label="all time" value={data.pointsAllTime} color={kidColor} />
        </div>
      </section>

      {total === 0 ? (
        <div className="sticker bg-paper-deep p-8 text-center">
          <div className="font-display text-4xl mb-2">no chores today!</div>
          <p className="font-body text-ink-soft text-lg">go play. you've earned it.</p>
        </div>
      ) : (
        <ul className="space-y-4 relative">
          {data.chores.map((c, i) => {
            const dec = decorate(c);
            return (
              <li
                key={c.id}
                className="animate-pop-in"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <ChoreCard
                  chore={c}
                  color={dec.color}
                  glyph={dec.glyph}
                  pending={pendingId === c.id}
                  onComplete={(e) => complete(c, e)}
                />
              </li>
            );
          })}

          {floats.map((f) => (
            <span
              key={f.id}
              className="pointer-events-none absolute font-display font-bold text-3xl text-mint animate-float-up"
              style={{
                left: f.x,
                top: f.y,
                textShadow: "2px 2px 0 #1F1611",
              }}
            >
              {f.text}
            </span>
          ))}
        </ul>
      )}

      {allDone && celebrated && (
        <Celebration
          name={data.kid.name}
          color={kidColor}
          onDismiss={() => setCelebrated(false)}
        />
      )}
    </main>
  );
}

function ChoreCard({
  chore,
  color,
  glyph,
  pending,
  onComplete,
}: {
  chore: TodayChore;
  color: string;
  glyph: string;
  pending: boolean;
  onComplete: (e: React.MouseEvent) => void;
}) {
  const completed = chore.completed;
  return (
    <button
      onClick={onComplete}
      disabled={completed || pending}
      className={[
        "w-full flex items-center gap-4 p-5 rounded-3xl border-3 border-ink shadow-sticker text-left",
        "transition-[transform,box-shadow] duration-100",
        "disabled:cursor-default",
        completed
          ? "bg-paper-deep"
          : "bg-paper hover:-translate-y-[2px] hover:-translate-x-[1px] hover:shadow-sticker-lg active:translate-x-[2px] active:translate-y-[2px] active:shadow-sticker-sm",
      ].join(" ")}
    >
      {/* Stamp box */}
      <div
        className={[
          "relative w-16 h-16 rounded-2xl border-3 border-ink flex items-center justify-center flex-shrink-0",
          completed ? "" : "bg-paper",
        ].join(" ")}
        style={completed ? { backgroundColor: color } : undefined}
      >
        {completed ? (
          <span
            className="font-display font-bold text-4xl text-paper animate-stamp leading-none"
            style={{ textShadow: "2px 2px 0 rgba(31,22,17,0.4)" }}
          >
            ✓
          </span>
        ) : (
          <span className="font-display text-3xl" style={{ color }}>
            {glyph}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={[
            "font-display font-semibold text-2xl leading-tight",
            completed ? "text-ink-soft/50 line-through decoration-3 decoration-ink-soft/40" : "text-ink",
          ].join(" ")}
        >
          {chore.name}
        </div>
        {chore.points > 0 && (
          <div className="mt-1 flex items-center gap-1.5 font-body font-bold text-sm">
            <span
              className="inline-block w-5 h-5 rounded-full border-2 border-ink text-center leading-none"
              style={{ backgroundColor: color, fontSize: "12px", lineHeight: "16px" }}
            >
              ★
            </span>
            <span className={completed ? "text-ink-soft/50" : "text-ink-soft"}>
              {chore.points} {chore.points === 1 ? "point" : "points"}
            </span>
          </div>
        )}
      </div>

      {!completed && !pending && (
        <span
          className="font-display font-semibold uppercase tracking-wider text-xs px-3 py-2 rounded-full border-3 border-ink shadow-sticker-sm flex-shrink-0"
          style={{ backgroundColor: color, color: "#FFF7E8" }}
        >
          tap
        </span>
      )}
      {pending && (
        <span className="font-display text-xs text-ink-soft animate-wiggle-slow">…</span>
      )}
    </button>
  );
}

function Celebration({
  name,
  color,
  onDismiss,
}: {
  name: string;
  color: string;
  onDismiss: () => void;
}) {
  // Pre-compute confetti pieces — deterministic-ish so render is stable.
  const pieces = useMemo(() => {
    const palette = ["#E94886", "#2BB7C4", "#FFC93C", "#FF7A45", "#5BD9A4", "#9B6FE0"];
    return Array.from({ length: 60 }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 0.6}s`,
      duration: `${1.4 + Math.random() * 1.2}s`,
      bg: palette[Math.floor(Math.random() * palette.length)],
      rotate: `${Math.random() * 360}deg`,
      shape: i % 4 === 0 ? "circle" : "square",
    }));
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm overflow-hidden"
      onClick={onDismiss}
    >
      <div className="absolute inset-0 pointer-events-none">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti-bit animate-[confetti-fall_var(--d)_linear_var(--delay)_forwards]"
            style={{
              left: p.left,
              top: "-5vh",
              backgroundColor: p.bg,
              borderRadius: p.shape === "circle" ? "999px" : "3px",
              transform: `rotate(${p.rotate})`,
              ["--d" as any]: p.duration,
              ["--delay" as any]: p.delay,
            }}
          />
        ))}
      </div>

      <div
        className="sticker-lg px-10 py-9 text-center max-w-sm mx-4 animate-pop-in relative z-10"
        style={{ backgroundColor: color }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-display text-7xl mb-2 leading-none animate-wiggle-slow">🎉</div>
        <div className="font-display font-bold text-5xl text-paper leading-tight">
          all done,
          <br />
          {name.toLowerCase()}!
        </div>
        <div
          className="mt-4 inline-block font-display font-semibold uppercase tracking-[0.18em] text-paper/90 text-sm px-4 py-2 rounded-full border-3 border-paper/70"
        >
          internet unlocked
        </div>
        <div className="mt-7">
          <button
            onClick={onDismiss}
            className="pill bg-paper text-ink shadow-sticker"
          >
            <span className="font-display font-bold text-lg">nice →</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function humanDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function PointsBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="sticker bg-paper-deep px-4 py-3 flex flex-col items-center text-center">
      <span
        className="font-display font-bold text-4xl leading-none"
        style={{ color, textShadow: "1px 2px 0 rgba(31,22,17,0.25)" }}
      >
        {value}
      </span>
      <span className="font-display uppercase tracking-[0.15em] text-xs text-ink-soft mt-1">
        {label}
      </span>
    </div>
  );
}
