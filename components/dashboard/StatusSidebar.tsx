"use client";

import { useSceneState } from "@/lib/state/SceneStateProvider";
import { Badge } from "@/components/ui/badge";

export function StatusSidebar() {
  const { state } = useSceneState();
  const roster =
    state.characters.length > 0
      ? state.characters.map((character) => character.id)
      : [...state.activeParticipants, ...state.offScreenParticipants];
  const nameById = new Map(state.characters.map((character) => [character.id, character.name]));

  return (
    <div className="flex flex-col gap-2 p-4">
      <h2 className="text-xs uppercase tracking-widest text-emerald-500/70">
        Contestant Status
      </h2>
      <div className="flex flex-col gap-2">
        {roster.length === 0 && (
          <p className="text-sm text-zinc-500">Waiting for feed…</p>
        )}
        {roster.map((characterId) => {
          const isActive = state.activeParticipants.includes(characterId);
          return (
            <div
              key={characterId}
              className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2"
            >
              <span className="font-mono text-sm text-zinc-200 capitalize">
                {nameById.get(characterId) ?? characterId}
              </span>
              <Badge
                variant={isActive ? "default" : "outline"}
                className={isActive ? "bg-emerald-600 text-white" : "text-zinc-500"}
              >
                {isActive ? "ON SCREEN" : "OFF SCREEN"}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
