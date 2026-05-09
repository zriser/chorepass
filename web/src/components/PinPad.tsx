import { useState } from "react";

type Props = {
  onSubmit: (pin: string) => Promise<boolean>;
  max?: number;
};

export function PinPad({ onSubmit, max = 8 }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const add = (d: string) => {
    setError(null);
    setPin((p) => (p.length < max ? p + d : p));
  };
  const back = () => {
    setError(null);
    setPin((p) => p.slice(0, -1));
  };
  const submit = async () => {
    if (!pin || busy) return;
    setBusy(true);
    const ok = await onSubmit(pin);
    setBusy(false);
    if (!ok) {
      setError("nope, try again");
      setPin("");
      setShake((s) => s + 1);
    }
  };

  const dots = Array.from({ length: Math.max(4, pin.length) }, (_, i) => i < pin.length);

  return (
    <div className="flex flex-col items-center gap-7">
      <div
        key={shake}
        className={["flex gap-3 items-center justify-center min-h-[44px]", error ? "animate-shake-x" : ""].join(" ")}
      >
        {dots.map((filled, i) => (
          <div
            key={i}
            className={[
              "w-5 h-5 rounded-full border-3 border-ink transition-all duration-150",
              filled ? "bg-berry shadow-sticker-sm scale-110" : "bg-paper-deep",
            ].join(" ")}
          />
        ))}
      </div>

      {error && (
        <div className="font-display text-tangerine text-lg">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <PinKey key={d} label={d} onPress={() => add(d)} />
        ))}
        <PinKey label="←" onPress={back} muted />
        <PinKey label="0" onPress={() => add("0")} />
        <PinKey label="↵" onPress={submit} accent disabled={pin.length === 0 || busy} />
      </div>
    </div>
  );
}

function PinKey({
  label,
  onPress,
  muted,
  accent,
  disabled,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className={[
        "w-20 h-20 rounded-2xl border-3 border-ink font-display font-bold text-3xl shadow-sticker",
        "transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-sticker-press",
        "disabled:opacity-40 disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-sticker",
        accent
          ? "bg-mint text-ink"
          : muted
          ? "bg-paper-deep text-ink-soft"
          : "bg-paper text-ink hover:bg-paper-deep",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
