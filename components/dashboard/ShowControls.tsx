"use client";

import { useSceneState } from "@/lib/state/SceneStateProvider";

export function ShowControls() {
  const { send, connectionStatus, state } = useSceneState();
  const connected = connectionStatus === "open";

  return (
    <div className="relative z-20 flex items-center gap-3 border-b border-violet-100/80 bg-white/60 px-5 py-2.5 backdrop-blur-xl">
      <button
        type="button"
        disabled={!connected || state.showRunning}
        onClick={() => send({ type: "start" })}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/35 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
        </svg>
        Start Show
      </button>

      <button
        type="button"
        disabled={!connected || !state.showRunning}
        onClick={() => send({ type: "stop" })}
        className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 active:translate-y-px disabled:pointer-events-none disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2.5" />
        </svg>
        Stop
      </button>
      {/* Reset removed for now — Stop already fully clears the session
          (backend and frontend), and Start rebuilds from scratch, so a
          separate Reset button was redundant. */}

      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
          state.showRunning
            ? "bg-violet-50 text-violet-700 ring-violet-200"
            : "bg-slate-50 text-slate-500 ring-slate-200"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            state.showRunning ? "animate-pulse bg-violet-500" : "bg-slate-400"
          }`}
        />
        {state.showRunning ? "On Air" : "Stopped"}
      </span>

      {state.lastError && (
        <p className="ml-auto max-w-[40%] truncate rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200">
          {state.lastError}
        </p>
      )}
    </div>
  );
}
