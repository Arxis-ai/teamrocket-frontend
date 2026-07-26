"use client";

import { useEffect, useRef } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";

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
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-rose-100 px-4 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-100 text-rose-500">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
            <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2zM9 20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9z" />
          </svg>
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-500/80">
          Inner Monologue
        </h2>
        <span className="ml-auto rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-500 ring-1 ring-inset ring-rose-100">
          Private
        </span>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {/* Invisible anchor at the very top so useEffect can scroll here */}
          <div ref={topRef} />
          {entries.length === 0 && (
            <p className="rounded-xl border border-dashed border-rose-200 px-3 py-6 text-center text-xs text-muted-foreground">
              No thoughts yet…
            </p>
          )}
          {entries.map((entry, index) => {
            const isCurrent = index === 0;
            return (
              <div
                key={`${entry.character_id}-${index}`}
                className={`animate-enter-up rounded-xl border px-3 py-2.5 transition-colors ${
                  isCurrent
                    ? "border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50/60 shadow-md shadow-rose-500/10"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-bold capitalize ${
                        isCurrent ? "text-rose-700" : "text-slate-700"
                      }`}
                    >
                      {entry.character_id}
                    </span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase text-slate-400">
                      {entry.batch_id}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-rose-100/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-600">
                    {entry.emotion}
                  </span>
                </div>
                <p className="mt-1.5 text-sm italic leading-relaxed text-slate-600">
                  &ldquo;{entry.secret_motive}&rdquo;
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
