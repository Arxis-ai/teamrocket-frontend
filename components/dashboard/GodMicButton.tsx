"use client";

import { useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";
import { Button } from "@/components/ui/button";

export function GodMicButton() {
  const { state, send } = useSceneState();
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  // God Mic only ever targets a character currently in the active scene
  // (01_build_plan.md Section 2.5) — off-screen characters are never offered.
  const activeCharacters = state.activeParticipants;

  const handlePress = (characterId: string) => {
    setSelectedTarget(characterId);
    send({ type: "godmic_start", target_character: characterId });
  };

  const handleRelease = () => {
    if (selectedTarget) {
      send({ type: "godmic_stop" });
    }
    setSelectedTarget(null);
  };

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-800 bg-zinc-950/60 p-4">
      <h2 className="text-xs uppercase tracking-widest text-amber-500/70">
        God Mic
      </h2>
      <div className="flex flex-wrap gap-2">
        {activeCharacters.length === 0 && (
          <p className="text-sm text-zinc-500">No active characters to target.</p>
        )}
        {activeCharacters.map((characterId) => (
          <Button
            key={characterId}
            variant={selectedTarget === characterId ? "default" : "outline"}
            className={
              selectedTarget === characterId ? "bg-amber-600 hover:bg-amber-600" : ""
            }
            onMouseDown={() => handlePress(characterId)}
            onMouseUp={handleRelease}
            onMouseLeave={() => selectedTarget === characterId && handleRelease()}
          >
            Whisper to {characterId}
          </Button>
        ))}
      </div>
      {state.godMic.transcript && (
        <p className="font-mono text-xs text-amber-200/80">
          &ldquo;{state.godMic.transcript}&rdquo;
          {state.godMic.active && <span className="animate-pulse"> …</span>}
        </p>
      )}
    </div>
  );
}
