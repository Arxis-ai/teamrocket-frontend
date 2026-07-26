"use client";

import { useEffect, useRef } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";
import { ScrollArea } from "@/components/ui/scroll-area";

const MAX_VISIBLE = 10;

export function MonologuePanel() {
  const { state } = useSceneState();
  // Reverse so newest is first, then cap to MAX_VISIBLE entries.
  const entries = [...state.transcript].reverse().slice(0, MAX_VISIBLE);
  const topRef = useRef<HTMLDivElement>(null);

  // Scroll to the top (newest entry) whenever the list changes.
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state.transcript.length]);

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="mb-2 text-xs uppercase tracking-widest text-rose-500/70">
        Inner Monologue
      </h2>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 pr-2">
          {/* Invisible anchor at the very top so useEffect can scroll here */}
          <div ref={topRef} />
          {entries.length === 0 && (
            <p className="text-sm text-zinc-500">No thoughts yet…</p>
          )}
          {entries.map((entry, index) => {
            const isCurrent = index === 0;
            return (
              <div
                key={`${entry.character_id}-${index}`}
                className={`rounded border px-3 py-2 transition-colors ${
                  isCurrent
                    ? "border-amber-600/60 bg-amber-950/20"
                    : "border-rose-900/40 bg-rose-950/20"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-rose-400/80">
                  <span className="flex items-center gap-1.5">
                    <span className={`font-mono capitalize ${isCurrent ? "text-amber-300" : ""}`}>{entry.character_id}</span>
                    <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-zinc-500">
                      {entry.batch_id}
                    </span>
                  </span>
                  <span>{entry.emotion}</span>
                </div>
                <p className="mt-1 text-sm italic text-rose-100/90">
                  &ldquo;{entry.secret_motive}&rdquo;
                </p>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
