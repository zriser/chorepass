// Chunky cartoon progress: row of "stickers" that fill in. Replaces the previous SVG ring.
// Each completed chore lights up one slot with the kid's signature color.
type Props = {
  done: number;
  total: number;
  color?: string;
};

export function ProgressRing({ done, total, color = "#2BB7C4" }: Props) {
  const slots = total === 0 ? 1 : total;
  const filled = total === 0 ? 1 : done;
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);

  return (
    <div className="w-full">
      <div className="flex items-end justify-between mb-3 gap-3">
        <div className="font-display text-ink-soft/70 text-sm uppercase tracking-[0.18em]">
          today's progress
        </div>
        <div className="font-display font-bold text-2xl tabular-nums">
          {done}<span className="text-ink-soft/40">/{total}</span>
        </div>
      </div>

      <div className="flex gap-2 mb-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        {Array.from({ length: slots }).map((_, i) => {
          const isFilled = i < filled;
          return (
            <div
              key={i}
              className={[
                "flex-1 h-7 rounded-full border-3 border-ink transition-all duration-300",
                isFilled ? "shadow-sticker-sm" : "bg-paper-deep",
              ].join(" ")}
              style={{
                backgroundColor: isFilled ? color : undefined,
                transitionDelay: isFilled ? `${i * 60}ms` : undefined,
              }}
            />
          );
        })}
      </div>

      {total > 0 && done < total && (
        <p className="text-ink-soft/70 font-body text-sm">
          {total - done} to go — you got this
        </p>
      )}
    </div>
  );
}
