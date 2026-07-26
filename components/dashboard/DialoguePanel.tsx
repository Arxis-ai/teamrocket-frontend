"use client";

import { useSceneState } from "@/lib/state/SceneStateProvider";
import { ScrollArea } from "@/components/ui/scroll-area";

// Shows what's actually said out loud (public_dialogue), in sync with the
// audio-paced transcript (see AudioPlayer.tsx / sceneReducer.ts) — the
// counterpart to MonologuePanel's private secret_motive, per the WOW1
// public-vs-private contrast in 01_final_build_plan.md.
export function DialoguePanel() {
  const { state } = useSceneState();
  const entries = [...state.transcript].reverse();

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="mb-2 text-xs uppercase tracking-widest text-emerald-500/70">
        Spoken Dialogue
      </h2>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 pr-2">
          {entries.length === 0 && (
            <p className="text-sm text-zinc-500">No dialogue yet…</p>
          )}
          {entries.map((entry, index) => {
            // transcript is cleared on every real focus switch (see
            // sceneReducer's focus_changed case), so everything here always
            // belongs to the conversation currently being listened to —
            // batch_id is shown for reference only, never used to dim,
            // since a reshuffle can change a still-focused batch's id
            // without the conversation itself having changed.
            return (
              <div
                key={`${entry.character_id}-${index}`}
                className="rounded border border-emerald-900/40 bg-emerald-950/10 px-3 py-2"
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-emerald-400/80">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono capitalize">{entry.character_id}</span>
                    <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-zinc-500">
                      {entry.batch_id}
                    </span>
                  </span>
                  {entry.addressed_to && (
                    <span className="normal-case text-zinc-500">
                      to <span className="capitalize">{entry.addressed_to}</span>
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-zinc-100">&ldquo;{entry.public_dialogue}&rdquo;</p>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
