import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Kid } from "../api.js";
import { Avatar, colorForName } from "../components/Avatar.js";

const GREETINGS = ["hey hey!", "what's up?", "look who's here", "ready?"];
const STAR_PALETTE = ["#FFC93C", "#FF7A45", "#5BD9A4", "#E94886", "#9B6FE0", "#2BB7C4"];

export default function Landing() {
  const [kids, setKids] = useState<Kid[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);

  useEffect(() => {
    api.get<Kid[]>("/api/kids").then(setKids).catch((e) => setError(String(e.message ?? e)));
  }, []);

  return (
    <main className="min-h-screen px-6 py-10 flex flex-col items-center relative overflow-hidden">
      <FloatingStars />

      <header className="relative z-10 flex flex-col items-center gap-3 mb-12">
        <div className="ribbon -rotate-2 animate-pop-in">{greeting}</div>
        <h1 className="font-display font-bold text-7xl md:text-8xl tracking-tight text-ink animate-pop-in [animation-delay:80ms]">
          chores<span className="text-berry">.</span>
        </h1>
        <p className="font-body text-ink-soft/80 text-lg animate-pop-in [animation-delay:160ms]">
          tap your face to start
        </p>
      </header>

      {error && (
        <div className="sticker bg-tangerine text-paper px-5 py-3 font-display animate-shake-x">
          {error}
        </div>
      )}
      {!kids && !error && (
        <div className="font-display text-2xl text-ink-soft/60 animate-wiggle-slow">loading…</div>
      )}

      {kids && kids.length === 0 && (
        <div className="sticker bg-paper-deep px-6 py-5 max-w-md text-center font-body">
          <div className="font-display text-2xl mb-2">no one's here yet</div>
          <p className="text-ink-soft mb-3">add your first kid in the parent area.</p>
          <Link to="/parent" className="pill bg-ocean text-paper border-ink">
            go to parent →
          </Link>
        </div>
      )}

      <div className="relative z-10 flex flex-wrap justify-center gap-8 mt-2">
        {kids?.map((k, i) => (
          <KidTile key={k.id} kid={k} index={i} />
        ))}
      </div>

      <Link
        to="/parent"
        className="mt-20 pill border-ink/30 bg-transparent text-ink-soft hover:bg-paper-deep relative z-10"
      >
        <span className="text-base">parent</span>
        <span className="opacity-50">→</span>
      </Link>
    </main>
  );
}

function KidTile({ kid, index }: { kid: Kid; index: number }) {
  const color = colorForName(kid.name);
  const tilt = (index % 2 === 0 ? -1 : 1) * (1.5 + (index % 3) * 0.7);

  return (
    <Link
      to={`/kid/${kid.slug}`}
      className="group relative animate-pop-in sticker-press"
      style={{ animationDelay: `${240 + index * 90}ms` }}
    >
      <div
        className="sticker-lg flex flex-col items-center gap-4 px-8 pt-7 pb-6 min-w-[220px]"
        style={{ transform: `rotate(${tilt}deg)` }}
      >
        <div className="relative">
          <span
            className="absolute -top-3 -left-4 font-display text-3xl select-none"
            style={{ color }}
          >
            ★
          </span>
          <Avatar name={kid.name} avatar={kid.avatar} size={140} color={color} />
          <span
            className="absolute -bottom-2 -right-3 font-display text-2xl select-none"
            style={{ color }}
          >
            ✦
          </span>
        </div>
        <div className="font-display font-semibold text-3xl text-ink">{kid.name.toLowerCase()}</div>
        <span
          className="font-display text-sm uppercase tracking-[0.18em] px-3 py-1 rounded-full border-3 border-ink"
          style={{ backgroundColor: color, color: "#FFF7E8" }}
        >
          let's go
        </span>
      </div>
    </Link>
  );
}

function FloatingStars() {
  // Decorative scatter; deterministic so the layout doesn't reflow on hover.
  const stars = Array.from({ length: 14 }, (_, i) => {
    const seed = (i * 9301 + 49297) % 233280;
    const nx = ((seed * 1.7) % 100) / 100;
    const ny = ((seed * 2.3) % 100) / 100;
    return {
      top: `${10 + ny * 80}%`,
      left: `${4 + nx * 92}%`,
      size: 14 + ((i * 5) % 18),
      color: STAR_PALETTE[i % STAR_PALETTE.length],
      delay: `${(i % 6) * 0.4}s`,
      char: i % 3 === 0 ? "✦" : i % 3 === 1 ? "★" : "✶",
    };
  });
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute font-display animate-drift-slow"
          style={{
            top: s.top,
            left: s.left,
            fontSize: s.size,
            color: s.color,
            opacity: 0.55,
            animationDelay: s.delay,
            textShadow: "1px 1px 0 #1F1611",
          }}
        >
          {s.char}
        </span>
      ))}
    </div>
  );
}
