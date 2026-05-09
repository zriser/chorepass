// Sticker-style avatar. Renders an uploaded image (URL starting with "/") OR a single emoji
// OR falls back to a colored badge with the first initial. Each kid has a deterministic
// signature color derived from their name.
const PALETTE = ["#E94886", "#2BB7C4", "#FFC93C", "#FF7A45", "#5BD9A4", "#9B6FE0"];

export function colorForName(name: string): string {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return PALETTE[hash % PALETTE.length];
}

type Props = {
  name: string;
  avatar?: string | null;
  size?: number;
  /** override the auto-derived color */
  color?: string;
  /** add a tiny rotation for sticker feel */
  tilt?: boolean;
  className?: string;
};

export function Avatar({ name, avatar, size = 96, color, tilt = false, className }: Props) {
  const bg = color ?? colorForName(name);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const isImage = !!avatar && (avatar.startsWith("/") || avatar.startsWith("http"));
  const isEmoji = !!avatar && !isImage;

  const tiltStyle = tilt ? { transform: `rotate(${nameTilt(name)}deg)` } : {};

  return (
    <div
      className={[
        "relative inline-flex items-center justify-center rounded-full border-3 border-ink shadow-sticker overflow-hidden",
        className ?? "",
      ].join(" ")}
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        ...tiltStyle,
      }}
      aria-hidden
    >
      {isImage ? (
        <img
          src={avatar!}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : isEmoji ? (
        <span className="font-display font-bold leading-none" style={{ fontSize: size * 0.55 }}>
          {avatar}
        </span>
      ) : (
        <span
          className="font-display font-bold text-paper leading-none drop-shadow-[1px_2px_0_rgba(31,22,17,0.35)]"
          style={{ fontSize: size * 0.5 }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}

function nameTilt(name: string): number {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return ((h % 11) - 5) * 0.6;
}
