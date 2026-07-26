"use client";

import { useSceneState } from "@/lib/state/SceneStateProvider";
import { characterTier } from "@/lib/state/characterTier";

const TIER_BADGE_CLASS: Record<string, string> = {
  focused: "bg-violet-600 text-white ring-violet-600",
  active: "bg-indigo-50 text-indigo-600 ring-indigo-200",
  off: "bg-slate-50 text-slate-400 ring-slate-200",
};

const TIER_LABEL: Record<string, string> = {
  focused: "Listening",
  active: "In Conversation",
  off: "Off Screen",
};

const TIER_AVATAR_CLASS: Record<string, string> = {
  focused: "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-500/25",
  active: "bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-600",
  off: "bg-slate-100 text-slate-400",
};

const TIER_ROW_CLASS: Record<string, string> = {
  focused: "border-violet-200 bg-violet-50/50",
  active: "border-slate-200 bg-white",
  off: "border-slate-100 bg-slate-50/50",
};

export function StatusSidebar() {
  const { state } = useSceneState();
  const roster =
    state.characters.length > 0
      ? state.characters.map((character) => character.id)
      : [...Object.values(state.batches).flat(), ...state.offScreen];
  const nameById = new Map(state.characters.map((character) => [character.id, character.name]));

  return (
    <section className="rounded-2xl border border-violet-100 bg-white/85 p-4 shadow-sm shadow-violet-900/5 backdrop-blur-sm">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-500/80">
        Contestants
      </h2>

      <div className="flex flex-col gap-1.5">
        {roster.length === 0 && (
          <p className="rounded-xl border border-dashed border-violet-200 px-3 py-4 text-center text-xs text-muted-foreground">
            Waiting for feed…
          </p>
        )}

        {roster.map((characterId) => {
          const tier = characterTier(characterId, state.batches, state.focusedBatchId);
          const name = nameById.get(characterId) ?? characterId;
          return (
            <div
              key={characterId}
              className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${TIER_ROW_CLASS[tier]}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold uppercase ${TIER_AVATAR_CLASS[tier]}`}
              >
                {name.slice(0, 2)}
              </span>
              <span
                className={`flex-1 truncate text-sm font-medium capitalize ${
                  tier === "off" ? "text-slate-400" : "text-slate-800"
                }`}
              >
                {name}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset ${TIER_BADGE_CLASS[tier]}`}
              >
                {TIER_LABEL[tier]}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
