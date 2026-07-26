"use client";

import { useSceneState } from "@/lib/state/SceneStateProvider";

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
    <section className="rounded-2xl border border-violet-100 bg-white/85 p-4 shadow-sm shadow-violet-900/5 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-500/80">
          Conversations
        </h2>
        {batchEntries.length > 0 && (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600 ring-1 ring-inset ring-violet-100">
            {batchEntries.length}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {batchEntries.length === 0 && (
          <p className="rounded-xl border border-dashed border-violet-200 px-3 py-4 text-center text-xs text-muted-foreground">
            Waiting for feed…
          </p>
        )}

        {batchEntries.map(([batchId, participants]) => {
          const isFocused = batchId === state.focusedBatchId;
          return (
            <button
              key={batchId}
              type="button"
              onClick={() => send({ type: "focus_batch", batch_id: batchId })}
              className={`group relative overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-all ${
                isFocused
                  ? "border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50 shadow-md shadow-violet-500/10"
                  : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40 hover:shadow-sm"
              }`}
            >
              {isFocused && (
                <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-violet-500 to-fuchsia-500" />
              )}
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${
                    isFocused ? "text-violet-500" : "text-slate-400"
                  }`}
                >
                  {batchId}
                </span>
                {isFocused && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <span className="flex h-2.5 items-end gap-[1.5px]">
                      <span className="w-[2px] animate-pulse rounded-sm bg-white/90" style={{ height: "60%" }} />
                      <span
                        className="w-[2px] animate-pulse rounded-sm bg-white/90"
                        style={{ height: "100%", animationDelay: "0.15s" }}
                      />
                      <span
                        className="w-[2px] animate-pulse rounded-sm bg-white/90"
                        style={{ height: "45%", animationDelay: "0.3s" }}
                      />
                    </span>
                    Listening
                  </span>
                )}
              </div>
              <p
                className={`mt-1 text-sm font-medium ${
                  isFocused ? "text-violet-900" : "text-slate-700"
                }`}
              >
                {participants.map((id) => nameById.get(id) ?? id).join(", ")}
              </p>
            </button>
          );
        })}

        {state.offScreen.length > 0 && (
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Off screen: {state.offScreen.map((id) => nameById.get(id) ?? id).join(", ")}
          </p>
        )}
      </div>
    </section>
  );
}
