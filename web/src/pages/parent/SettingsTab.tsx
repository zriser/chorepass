import { useEffect, useState } from "react";
import { api, ApiError, type EnforcementPause } from "../../api.js";
import { formatLocalDateTime } from "../../format.js";

export default function SettingsTab() {
  return (
    <div className="space-y-6">
      <h2 className="font-display font-bold text-2xl">settings</h2>
      <PauseEnforcementSection />
      <DailyScheduleSection />
      <HistoryRetentionSection />
      <ChangePinSection />
      <DeployConfigSection />
    </div>
  );
}

// Convert a datetime-local input value (local wall-clock, no zone) to a UTC ISO
// string the server can store. Empty → null (pause with no end date).
function localInputToIso(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function PauseEnforcementSection() {
  const [state, setState] = useState<EnforcementPause | null>(null);
  const [until, setUntil] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setState(await api.get<EnforcementPause>("/api/admin/enforcement-pause"));
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pause = async () => {
    setError(null);
    if (until.trim() && new Date(until).getTime() <= Date.now()) {
      setError("resume time must be in the future");
      return;
    }
    setBusy(true);
    try {
      const r = await api.put<EnforcementPause & { unblocked: number }>(
        "/api/admin/enforcement-pause",
        { paused: true, until: localInputToIso(until) },
      );
      setState({ paused: r.paused, until: r.until });
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api.put<EnforcementPause>("/api/admin/enforcement-pause", {
        paused: false,
      });
      setState({ paused: r.paused, until: r.until });
      setUntil("");
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticker-lg bg-paper-deep p-6 max-w-md">
      <h3 className="font-display font-bold text-xl mb-1">pause enforcement</h3>
      <p className="font-body text-sm text-ink-soft mb-5">
        away mode. while paused, scheduled bedtime blocks and morning chore
        enforcement are skipped and everyone is unblocked now — so nobody loses
        internet while you're out. manual block/unblock still works, and it
        resumes on its own at the time you set.
      </p>

      {loading ? (
        <div className="font-display text-ink-soft/60">loading…</div>
      ) : state?.paused ? (
        <>
          <div className="sticker bg-grape text-paper px-4 py-3 font-display animate-pop-in">
            ⏸ paused —{" "}
            {state.until ? (
              <>resumes {formatLocalDateTime(state.until)}</>
            ) : (
              <>no end date (resume manually)</>
            )}
          </div>
          {error && (
            <div className="mt-4 sticker bg-tangerine text-paper px-4 py-2 font-display animate-shake-x">
              {error}
            </div>
          )}
          <div className="mt-5">
            <button
              onClick={resume}
              disabled={busy}
              className="pill bg-mint text-ink disabled:opacity-50"
            >
              {busy ? "resuming…" : "resume now"}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="block">
            <span className="block font-display font-semibold text-ink-soft text-sm mb-1">
              resume at (optional)
            </span>
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="input font-mono"
            />
            <span className="block font-body text-xs text-ink-soft/80 mt-1">
              leave blank to pause with no end date — you resume it by hand.
            </span>
          </label>

          {error && (
            <div className="mt-4 sticker bg-tangerine text-paper px-4 py-2 font-display animate-shake-x">
              {error}
            </div>
          )}

          <div className="mt-5">
            <button
              onClick={pause}
              disabled={busy}
              className="pill bg-grape text-paper disabled:opacity-50"
            >
              {busy ? "pausing…" : "pause enforcement"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function HistoryRetentionSection() {
  const [days, setDays] = useState<string>("");
  const [original, setOriginal] = useState<number | null>(null);
  const [limits, setLimits] = useState<{ min: number; max: number }>({ min: 1, max: 3650 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ days: number; min: number; max: number }>(
          "/api/admin/history-retention-days",
        );
        setDays(String(r.days));
        setOriginal(r.days);
        setLimits({ min: r.min, max: r.max });
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
    const n = Number(days);
    if (!Number.isInteger(n) || n < limits.min || n > limits.max) {
      setError(`days must be a whole number between ${limits.min} and ${limits.max}`);
      return;
    }
    setBusy(true);
    try {
      const r = await api.put<{ ok: true; days: number }>(
        "/api/admin/history-retention-days",
        { days: n },
      );
      setOriginal(r.days);
      setDays(String(r.days));
      setDone(true);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const dirty = original !== null && Number(days) !== original;

  return (
    <div className="sticker-lg bg-paper-deep p-6 max-w-md">
      <h3 className="font-display font-bold text-xl mb-1">history retention</h3>
      <p className="font-body text-sm text-ink-soft mb-5">
        completions and gate-log rows older than this are pruned every night at 2am.
      </p>

      {loading ? (
        <div className="font-display text-ink-soft/60">loading…</div>
      ) : (
        <>
          <label className="block">
            <span className="block font-display font-semibold text-ink-soft text-sm mb-1">
              keep last
            </span>
            <div className="flex items-baseline gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={limits.min}
                max={limits.max}
                value={days}
                onChange={(e) => {
                  setDays(e.target.value);
                  setDone(false);
                }}
                className="input font-mono text-lg w-28"
              />
              <span className="font-body text-ink-soft">days</span>
            </div>
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

function DailyScheduleSection() {
  const [resetTime, setResetTime] = useState<string>("");
  const [enforcementTime, setEnforcementTime] = useState<string>("");
  const [original, setOriginal] = useState<{ resetTime: string; enforcementTime: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ resetTime: string; enforcementTime: string }>(
          "/api/admin/daily-schedule",
        );
        setResetTime(r.resetTime);
        setEnforcementTime(r.enforcementTime);
        setOriginal(r);
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
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!hhmm.test(resetTime) || !hhmm.test(enforcementTime)) {
      setError("times must be HH:MM (24-hour)");
      return;
    }
    if (enforcementTime < resetTime) {
      setError("enforcement time must be at or after reset time");
      return;
    }
    setBusy(true);
    try {
      const r = await api.put<{ ok: true; resetTime: string; enforcementTime: string }>(
        "/api/admin/daily-schedule",
        { resetTime, enforcementTime },
      );
      setOriginal({ resetTime: r.resetTime, enforcementTime: r.enforcementTime });
      setResetTime(r.resetTime);
      setEnforcementTime(r.enforcementTime);
      setDone(true);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const dirty =
    original !== null &&
    (resetTime !== original.resetTime || enforcementTime !== original.enforcementTime);
  const combined = resetTime === enforcementTime;

  return (
    <div className="sticker-lg bg-paper-deep p-6 max-w-md">
      <h3 className="font-display font-bold text-xl mb-1">daily schedule</h3>
      <p className="font-body text-sm text-ink-soft mb-5">
        at <b>reset</b>, yesterday's completions clear and bedtime ends — devices unblock.
        at <b>chore enforcement</b>, devices block again until today's chores are done.
        set them equal to skip the morning buffer (clear + block in one step).
      </p>

      {loading ? (
        <div className="font-display text-ink-soft/60">loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block font-display font-semibold text-ink-soft text-sm mb-1">
                reset at
              </span>
              <input
                type="time"
                value={resetTime}
                onChange={(e) => {
                  setResetTime(e.target.value);
                  setDone(false);
                }}
                className="input font-mono text-lg"
              />
            </label>
            <label className="block">
              <span className="block font-display font-semibold text-ink-soft text-sm mb-1">
                enforce at
              </span>
              <input
                type="time"
                value={enforcementTime}
                onChange={(e) => {
                  setEnforcementTime(e.target.value);
                  setDone(false);
                }}
                className="input font-mono text-lg"
              />
            </label>
          </div>

          <div className="mt-3 font-body text-xs text-ink-soft/80">
            {combined
              ? "no morning buffer — devices stay blocked from bedtime through chores."
              : `morning buffer: devices are unblocked from ${resetTime} until ${enforcementTime}.`}
          </div>

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
