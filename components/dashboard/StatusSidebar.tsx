"use client";

import { useSceneState } from "@/lib/state/SceneStateProvider";
import { characterTier } from "@/lib/state/characterTier";
import { Badge } from "@/components/ui/badge";

const TIER_BADGE_CLASS: Record<string, string> = {
  focused: "bg-sky-600 text-white",
  active: "bg-emerald-700/70 text-emerald-50",
  off: "text-zinc-500",
};

const TIER_LABEL: Record<string, string> = {
  focused: "LISTENING",
  active: "IN CONVERSATION",
  off: "OFF SCREEN",
};

export function StatusSidebar() {
  const { state } = useSceneState();
  const roster =
    state.characters.length > 0
      ? state.characters.map((character) => character.id)
      : [...Object.values(state.batches).flat(), ...state.offScreen];
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
          const tier = characterTier(characterId, state.batches, state.focusedBatchId);
          return (
            <div
              key={characterId}
              className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2"
            >
              <span className="font-mono text-sm text-zinc-200 capitalize">
                {nameById.get(characterId) ?? characterId}
              </span>
              <Badge
                variant={tier === "off" ? "outline" : "default"}
                className={TIER_BADGE_CLASS[tier]}
              >
                {TIER_LABEL[tier]}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
