import { useEffect, useState } from "react";
import { api, ApiError } from "../../api.js";

export default function SettingsTab() {
  return (
    <div className="space-y-6">
      <h2 className="font-display font-bold text-2xl">settings</h2>
      <MorningResetSection />
      <ChangePinSection />
      <DeployConfigSection />
    </div>
  );
}

type DeployConfig = {
  tz: string;
  pihole: { unblockedGroup: string; blockedGroup: string };
  unifi: { host: string; site: string };
};

function DeployConfigSection() {
  const [cfg, setCfg] = useState<DeployConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setCfg(await api.get<DeployConfig>("/api/admin/deploy-config"));
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    })();
  }, []);

  return (
    <div className="sticker-lg bg-paper-deep p-6 max-w-md">
      <h3 className="font-display font-bold text-xl mb-1">deploy config</h3>
      <p className="font-body text-sm text-ink-soft mb-5">
        read-only. these are set as env vars at deploy time — change them by
        editing <code className="font-mono text-xs">/opt/stacks/chorepass/.env</code> and restarting the container.
      </p>

      {error && (
        <div className="sticker bg-tangerine text-paper px-4 py-2 font-display animate-shake-x">
          {error}
        </div>
      )}
      {!cfg && !error && <div className="font-display text-ink-soft/60">loading…</div>}
      {cfg && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 font-mono text-sm">
          <dt className="text-ink-soft">timezone</dt>
          <dd>{cfg.tz}</dd>
          <dt className="text-ink-soft">pi-hole unblocked</dt>
          <dd>{cfg.pihole.unblockedGroup}</dd>
          <dt className="text-ink-soft">pi-hole blocked</dt>
          <dd>{cfg.pihole.blockedGroup}</dd>
          <dt className="text-ink-soft">unifi host</dt>
          <dd>{cfg.unifi.host || <span className="text-ink-soft/60">—</span>}</dd>
          <dt className="text-ink-soft">unifi site</dt>
          <dd>{cfg.unifi.site}</dd>
        </dl>
      )}
    </div>
  );
}

function MorningResetSection() {
  const [time, setTime] = useState<string>("");
  const [original, setOriginal] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ time: string }>("/api/admin/morning-reset-time");
        setTime(r.time);
        setOriginal(r.time);
      } catch (e: any) {
        setError(String(e.message ?? e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const submit = async () => {
    setError(null);
    setDone(false);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError("time must be HH:MM (24-hour)");
      return;
    }
    setBusy(true);
    try {
      const r = await api.put<{ ok: true; time: string }>(
        "/api/admin/morning-reset-time",
        { time },
      );
      setOriginal(r.time);
      setTime(r.time);
      setDone(true);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const dirty = time !== original;

  return (
    <div className="sticker-lg bg-paper-deep p-6 max-w-md">
      <h3 className="font-display font-bold text-xl mb-1">morning reset time</h3>
      <p className="font-body text-sm text-ink-soft mb-5">
        every day at this time, completions reset and all kids get blocked until
        chores are done.
      </p>

      {loading ? (
        <div className="font-display text-ink-soft/60">loading…</div>
      ) : (
        <>
          <label className="block">
            <span className="block font-display font-semibold text-ink-soft text-sm mb-1">
              reset at
            </span>
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                setDone(false);
              }}
              className="input font-mono text-lg"
            />
          </label>

          {error && (
            <div className="mt-4 sticker bg-tangerine text-paper px-4 py-2 font-display animate-shake-x">
              {error}
            </div>
          )}
          {done && (
            <div className="mt-4 sticker bg-mint text-ink px-4 py-2 font-display animate-pop-in">
              saved ✓
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              onClick={submit}
              disabled={busy || !dirty}
              className="pill bg-mint text-ink disabled:opacity-50"
            >
              {busy ? "saving…" : "save"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ChangePinSection() {
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setOldPin("");
    setNewPin("");
    setConfirmPin("");
  };

  const submit = async () => {
    setError(null);
    setDone(false);
    if (!/^\d{4,8}$/.test(newPin)) {
      setError("new pin must be 4–8 digits");
      return;
    }
    if (newPin !== confirmPin) {
      setError("new pins don't match");
      return;
    }
    if (newPin === oldPin) {
      setError("new pin must be different");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/parent/change-pin", { oldPin, newPin });
      setDone(true);
      reset();
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 401) {
        setError("current pin is wrong");
      } else {
        setError(String(e.message ?? e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticker-lg bg-paper-deep p-6 max-w-md">
      <h3 className="font-display font-bold text-xl mb-1">change parent pin</h3>
      <p className="font-body text-sm text-ink-soft mb-5">
        4–8 digits. you'll stay logged in on this device after the change.
      </p>

      <div className="space-y-4">
        <PinField label="current pin" value={oldPin} onChange={setOldPin} autoFocus />
        <PinField label="new pin" value={newPin} onChange={setNewPin} />
        <PinField label="confirm new pin" value={confirmPin} onChange={setConfirmPin} />
      </div>

      {error && (
        <div className="mt-4 sticker bg-tangerine text-paper px-4 py-2 font-display animate-shake-x">
          {error}
        </div>
      )}
      {done && (
        <div className="mt-4 sticker bg-mint text-ink px-4 py-2 font-display animate-pop-in">
          pin updated ✓
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          onClick={submit}
          disabled={busy || !oldPin || !newPin || !confirmPin}
          className="pill bg-mint text-ink disabled:opacity-50"
        >
          {busy ? "saving…" : "save new pin"}
        </button>
        <button
          onClick={() => {
            reset();
            setError(null);
            setDone(false);
          }}
          className="pill bg-paper text-ink-soft"
        >
          clear
        </button>
      </div>
    </div>
  );
}

function PinField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block font-display font-semibold text-ink-soft text-sm mb-1">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        maxLength={8}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
        className="input font-mono text-lg tracking-[0.4em]"
        placeholder="••••"
      />
    </label>
  );
}
