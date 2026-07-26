"use client";

import { useEffect, useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";
import { TrustGraph } from "./TrustGraph";
import { MonologuePanel } from "./MonologuePanel";
import { DialoguePanel } from "./DialoguePanel";
import { ConversationGroups } from "./ConversationGroups";
import { StatusSidebar } from "./StatusSidebar";
import { AudioPlayer } from "./AudioPlayer";
import { GodMicButton } from "./GodMicButton";
import { ShowControls } from "./ShowControls";

const CLOCK_TICK_MS = 1000;

function formatClock(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function useClock(): string {
  // Empty initial value on both server and client avoids a hydration
  // mismatch — formatClock() only runs after mount, never during SSR.
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () => setNow(formatClock());
    const immediate = setTimeout(tick, 0);
    const interval = setInterval(tick, CLOCK_TICK_MS);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, []);

  return now;
}

const STATUS_STYLE: Record<string, { dot: string; pill: string; label: string }> = {
  open: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    label: "Live",
  },
  connecting: {
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 ring-amber-200",
    label: "Connecting",
  },
  closed: {
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700 ring-rose-200",
    label: "Offline",
  },
};

export function DashboardShell() {
  const clock = useClock();
  const { connectionStatus } = useSceneState();
  const status = STATUS_STYLE[connectionStatus] ?? STATUS_STYLE.closed;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Soft violet gradient blobs — the only thing giving the light
          background depth, kept far behind everything and non-interactive. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-drift absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-violet-300/30 blur-3xl" />
        <div
          className="animate-drift absolute -right-32 top-1/4 h-[28rem] w-[28rem] rounded-full bg-fuchsia-300/25 blur-3xl"
          style={{ animationDelay: "-8s" }}
        />
        <div
          className="animate-drift absolute -bottom-24 left-1/3 h-[26rem] w-[26rem] rounded-full bg-indigo-300/20 blur-3xl"
          style={{ animationDelay: "-16s" }}
        />
      </div>

      <header className="relative z-20 flex items-center justify-between border-b border-violet-100/80 bg-white/70 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 shadow-lg shadow-violet-500/25">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor">
              <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 9a1 1 0 1 1 2 0 9 9 0 0 1-8 8.94V22a1 1 0 1 1-2 0v-2.06A9 9 0 0 1 3 11a1 1 0 1 1 2 0 7 7 0 0 0 14 0z" />
            </svg>
          </span>
          <div className="flex flex-col leading-tight">
            <h1 className="bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 bg-clip-text text-base font-semibold tracking-tight text-transparent">
              Director&rsquo;s Dashboard
            </h1>
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
              Autonomous AI Reality Show
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset ${status.pill}`}
          >
            <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${status.dot}`} />
            {status.label}
          </span>
          <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline">
            {clock}
          </span>
          <span className="hidden rounded-lg bg-violet-50 px-2 py-1 font-mono text-[11px] font-medium text-violet-600 ring-1 ring-inset ring-violet-100 sm:inline">
            CAM 01
          </span>
        </div>
      </header>

      <ShowControls />

      <div className="relative z-10 grid flex-1 grid-cols-[260px_1fr_360px] gap-4 overflow-hidden p-4">
        <aside className="scroll-slim flex flex-col gap-4 overflow-y-auto pr-0.5">
          <ConversationGroups />
          <StatusSidebar />
        </aside>

        <main className="relative overflow-hidden rounded-2xl border border-violet-100 bg-white/80 shadow-sm shadow-violet-900/5 backdrop-blur-sm">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300 to-transparent" />
          <div className="absolute left-5 top-4 z-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-500/80">
              Trust Network
            </h2>
          </div>
          <TrustGraph />
        </main>

        <aside className="flex flex-col gap-4 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-violet-100 bg-white/85 shadow-sm shadow-violet-900/5 backdrop-blur-sm">
            <DialoguePanel />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-rose-100 bg-white/85 shadow-sm shadow-rose-900/5 backdrop-blur-sm">
            <MonologuePanel />
          </div>
        </aside>
      </div>

      <div className="relative z-20 border-t border-violet-100/80 bg-white/70 backdrop-blur-xl">
        <AudioPlayer />
        <GodMicButton />
      </div>
    </div>
  );
}
