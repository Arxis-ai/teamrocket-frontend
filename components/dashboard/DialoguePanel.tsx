"use client";

import { useEffect, useRef } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";

// Shows what's actually said out loud (public_dialogue), in sync with the
// audio-paced transcript (see AudioPlayer.tsx / sceneReducer.ts) — the
// counterpart to MonologuePanel's private secret_motive, per the WOW1
// public-vs-private contrast in 01_final_build_plan.md.

const MAX_VISIBLE = 10;

export function DialoguePanel() {
  const { state } = useSceneState();
  // Reverse so newest is first, then cap to MAX_VISIBLE entries.
  const entries = [...state.transcript].reverse().slice(0, MAX_VISIBLE);
  const topRef = useRef<HTMLDivElement>(null);

  // Scroll to the top (newest entry) whenever the list changes.
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state.transcript.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-violet-100 px-4 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
            <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
          </svg>
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-500/80">
          Spoken Dialogue
        </h2>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {/* Invisible anchor at the very top so useEffect can scroll here */}
          <div ref={topRef} />
          {entries.length === 0 && (
            <p className="rounded-xl border border-dashed border-violet-200 px-3 py-6 text-center text-xs text-muted-foreground">
              No dialogue yet…
            </p>
          )}
          {entries.map((entry, index) => {
            const isCurrent = index === 0;
            return (
              <div
                key={`${entry.character_id}-${index}`}
                className={`animate-enter-up relative overflow-hidden rounded-xl border px-3 py-2.5 transition-colors ${
                  isCurrent
                    ? "border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50/60 shadow-md shadow-violet-500/10"
                    : "border-slate-200 bg-white"
                }`}
              >
                {isCurrent && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 -left-full w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent"
                    style={{ animation: "sheen 1.6s ease-out" }}
                  />
                )}
                <div className="relative flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-bold capitalize ${
                        isCurrent ? "text-violet-700" : "text-slate-700"
                      }`}
                    >
                      {entry.character_id}
                    </span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase text-slate-400">
                      {entry.batch_id}
                    </span>
                  </span>
                  {entry.addressed_to && (
                    <span className="shrink-0 text-[10px] font-medium text-slate-400">
                      to <span className="capitalize text-violet-500">{entry.addressed_to}</span>
                    </span>
                  )}
                </div>
                <p className="relative mt-1.5 text-sm leading-relaxed text-slate-800">
                  &ldquo;{entry.public_dialogue}&rdquo;
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
