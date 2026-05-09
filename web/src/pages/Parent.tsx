import { useState } from "react";
import { Link } from "react-router-dom";
import { PinPad } from "../components/PinPad.js";
import { useParent } from "../useParent.js";
import TodayTab from "./parent/TodayTab.js";
import KidsTab from "./parent/KidsTab.js";
import ChoresTab from "./parent/ChoresTab.js";
import HistoryTab from "./parent/HistoryTab.js";
import GateLogTab from "./parent/GateLogTab.js";
import SettingsTab from "./parent/SettingsTab.js";

type TabId = "today" | "kids" | "chores" | "history" | "log" | "settings";

const TABS: { id: TabId; label: string; bg: string }[] = [
  { id: "today", label: "today", bg: "#FFC93C" },
  { id: "kids", label: "kids", bg: "#E94886" },
  { id: "chores", label: "chores", bg: "#5BD9A4" },
  { id: "history", label: "history", bg: "#9B6FE0" },
  { id: "log", label: "gate log", bg: "#2BB7C4" },
  { id: "settings", label: "settings", bg: "#FF7A45" },
];

export default function Parent() {
  const { ready, authed, login, logout } = useParent();
  const [tab, setTab] = useState<TabId>("today");

  if (!ready) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center">
        <div className="font-display text-2xl text-ink-soft/60 animate-wiggle-slow">loading…</div>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="min-h-screen px-6 py-8 flex flex-col items-center">
        <Link
          to="/"
          className="self-start pill border-ink/40 bg-transparent text-ink-soft hover:bg-paper-deep"
        >
          ← back
        </Link>
        <div className="flex-1 flex flex-col items-center justify-center gap-8 w-full max-w-sm">
          <div className="text-center">
            <div className="ribbon -rotate-2 inline-block mb-4">parent area</div>
            <h1 className="font-display font-bold text-5xl">enter pin</h1>
          </div>
          <div className="sticker-lg p-7 w-full">
            <PinPad onSubmit={login} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <header className="flex items-center gap-3 mb-6 flex-wrap">
        <Link to="/" className="pill border-ink/40 bg-transparent text-ink-soft hover:bg-paper-deep">
          ←
        </Link>
        <h1 className="font-display font-bold text-3xl flex-1">parent</h1>
        <button
          onClick={logout}
          className="pill bg-paper-deep text-ink-soft hover:bg-paper"
        >
          log out
        </button>
      </header>

      <nav className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "tab",
                active ? "shadow-sticker text-ink" : "shadow-sticker-sm bg-paper text-ink-soft",
              ].join(" ")}
              style={active ? { backgroundColor: t.bg } : undefined}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <section className="sticker p-5 sm:p-6 bg-paper">
        {tab === "today" && <TodayTab />}
        {tab === "kids" && <KidsTab />}
        {tab === "chores" && <ChoresTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "log" && <GateLogTab />}
        {tab === "settings" && <SettingsTab />}
      </section>
    </main>
  );
}
