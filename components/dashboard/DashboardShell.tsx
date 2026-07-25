"use client";

import { TrustGraph } from "./TrustGraph";
import { MonologuePanel } from "./MonologuePanel";
import { StatusSidebar } from "./StatusSidebar";
import { AudioPlayer } from "./AudioPlayer";
import { GodMicButton } from "./GodMicButton";

export function DashboardShell() {
  return (
    <div className="flex h-screen flex-col bg-black text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
          <h1 className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-400">
            Director&rsquo;s Dashboard — Live
          </h1>
        </div>
        <span className="font-mono text-xs text-zinc-600">CAM 01</span>
      </header>

      <div className="grid flex-1 grid-cols-[220px_1fr_320px] overflow-hidden">
        <aside className="overflow-y-auto border-r border-zinc-800">
          <StatusSidebar />
        </aside>

        <main className="overflow-hidden">
          <TrustGraph />
        </main>

        <aside className="overflow-hidden border-l border-zinc-800">
          <MonologuePanel />
        </aside>
      </div>

      <AudioPlayer />
      <GodMicButton />
    </div>
  );
}
