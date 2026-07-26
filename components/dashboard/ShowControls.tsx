"use client";

import { useSceneState } from "@/lib/state/SceneStateProvider";
import { Button } from "@/components/ui/button";

export function ShowControls() {
  const { send, connectionStatus, state } = useSceneState();
  const connected = connectionStatus === "open";

  return (
    <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950/60 px-4 py-2">
      <Button
        size="sm"
        disabled={!connected || state.showRunning}
        className="border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-600 active:bg-emerald-800"
        onClick={() => send({ type: "start" })}
      >
        Start
      </Button>
      <Button
        size="sm"
        disabled={!connected || !state.showRunning}
        className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 active:bg-zinc-700"
        onClick={() => send({ type: "stop" })}
      >
        Stop
      </Button>
      {/* Reset removed for now — Stop already fully clears the session
          (backend and frontend), and Start rebuilds from scratch, so a
          separate Reset button was redundant. */}
      <span
        className={`font-mono text-xs uppercase tracking-wider ${
          state.showRunning ? "text-emerald-500" : "text-zinc-600"
        }`}
      >
        {state.showRunning ? "Running" : "Stopped"}
      </span>
      {state.lastError && (
        <p className="font-mono text-xs text-red-400">{state.lastError}</p>
      )}
    </div>
  );
}
