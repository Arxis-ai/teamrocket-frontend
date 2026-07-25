"use client";

import { useSceneState } from "@/lib/state/SceneStateProvider";
import { Badge } from "@/components/ui/badge";

// Lets the viewer pick which of the concurrently-running conversations to
// "tune in" to — audio only ever plays for the focused batch (see
// AudioPlayer.tsx); every other batch keeps talking silently in the
// background. Clicking a card sends focus_batch and is confirmed by the
// backend's focus_changed ack (see sceneReducer.ts).
export function ConversationGroups() {
  const { state, send } = useSceneState();
  const nameById = new Map(state.characters.map((character) => [character.id, character.name]));
  const batchEntries = Object.entries(state.batches);

  return (
    <div className="flex flex-col gap-2 p-4">
      <h2 className="text-xs uppercase tracking-widest text-sky-500/70">
        Conversations
      </h2>
      <div className="flex flex-col gap-2">
        {batchEntries.length === 0 && (
          <p className="text-sm text-zinc-500">Waiting for feed…</p>
        )}
        {batchEntries.map(([batchId, participants]) => {
          const isFocused = batchId === state.focusedBatchId;
          return (
            <button
              key={batchId}
              type="button"
              onClick={() => send({ type: "focus_batch", batch_id: batchId })}
              className={`flex flex-col gap-1 rounded border px-3 py-2 text-left transition-colors ${
                isFocused
                  ? "border-sky-600 bg-sky-950/40"
                  : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  {batchId}
                </span>
                {isFocused && (
                  <Badge className="bg-sky-600 text-white">Listening</Badge>
                )}
              </div>
              <span className="text-sm text-zinc-200">
                {participants.map((id) => nameById.get(id) ?? id).join(", ")}
              </span>
            </button>
          );
        })}
        {state.offScreen.length > 0 && (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
            Off screen: {state.offScreen.map((id) => nameById.get(id) ?? id).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
