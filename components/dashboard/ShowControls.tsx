"use client";

import { useSceneState } from "@/lib/state/SceneStateProvider";
import { Button } from "@/components/ui/button";

export function ShowControls() {
  const { send, connectionStatus, state } = useSceneState();
  const disabled = connectionStatus !== "open";

  return (
    <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950/60 px-4 py-2">
      <Button
        size="sm"
        disabled={disabled}
        className="bg-emerald-700 hover:bg-emerald-600"
        onClick={() => send({ type: "start" })}
      >
        Start
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => send({ type: "stop" })}
      >
        Stop
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => send({ type: "reset" })}
      >
        Reset
      </Button>
      {state.lastError && (
        <p className="font-mono text-xs text-red-400">{state.lastError}</p>
      )}
    </div>
  );
}
