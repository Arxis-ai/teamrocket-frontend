"use client";

import { useSceneState } from "@/lib/state/SceneStateProvider";
import { ScrollArea } from "@/components/ui/scroll-area";

export function MonologuePanel() {
  const { state } = useSceneState();
  const entries = [...state.transcript].reverse();

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="mb-2 text-xs uppercase tracking-widest text-rose-500/70">
        Inner Monologue
      </h2>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 pr-2">
          {entries.length === 0 && (
            <p className="text-sm text-zinc-500">No thoughts yet…</p>
          )}
          {entries.map((entry, index) => {
            // transcript is cleared on every real focus switch (see
            // sceneReducer's focus_changed case), so everything here always
            // belongs to the conversation currently being listened to —
            // batch_id is shown for reference only, never used to dim,
            // matching DialoguePanel.
            return (
              <div
                key={`${entry.character_id}-${index}`}
                className="rounded border border-rose-900/40 bg-rose-950/20 px-3 py-2"
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-rose-400/80">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono capitalize">{entry.character_id}</span>
                    <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-zinc-500">
                      {entry.batch_id}
                    </span>
                  </span>
                  <span>{entry.emotion}</span>
                </div>
                <p className="mt-1 text-sm italic text-rose-100/90">
                  &ldquo;{entry.secret_motive}&rdquo;
                </p>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
