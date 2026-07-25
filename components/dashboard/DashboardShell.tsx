"use client";

import { useEffect, useState } from "react";
import { TrustGraph } from "./TrustGraph";
import { MonologuePanel } from "./MonologuePanel";
import { StatusSidebar } from "./StatusSidebar";
import { AudioPlayer } from "./AudioPlayer";
import { GodMicButton } from "./GodMicButton";

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

function CornerBracket({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-5 w-5 border-emerald-700/50 ${className}`}
    />
  );
}

export function DashboardShell() {
  const clock = useClock();

  return (
    <div className="relative flex h-screen flex-col bg-black text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, #fff 0px, #fff 1px, transparent 1px, transparent 3px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          boxShadow: "inset 0 0 160px 40px rgba(0,0,0,0.85)",
        }}
      />

      <header className="relative z-20 flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
          <h1 className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-400">
            Director&rsquo;s Dashboard — Live
          </h1>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-zinc-600">
          <span>{clock}</span>
          <span className="text-zinc-700">|</span>
          <span>CAM 01</span>
        </div>
      </header>

      <div className="relative z-20 grid flex-1 grid-cols-[220px_1fr_320px] overflow-hidden">
        <aside className="overflow-y-auto border-r border-zinc-800">
          <StatusSidebar />
        </aside>

        <main className="relative overflow-hidden">
          <CornerBracket className="left-3 top-3 border-l-2 border-t-2" />
          <CornerBracket className="right-3 top-3 border-r-2 border-t-2" />
          <CornerBracket className="bottom-3 left-3 border-b-2 border-l-2" />
          <CornerBracket className="bottom-3 right-3 border-b-2 border-r-2" />
          <TrustGraph />
        </main>

        <aside className="overflow-hidden border-l border-zinc-800">
          <MonologuePanel />
        </aside>
      </div>

      <div className="relative z-20">
        <AudioPlayer />
        <GodMicButton />
      </div>
    </div>
  );
}
