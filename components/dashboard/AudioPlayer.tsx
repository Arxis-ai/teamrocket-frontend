"use client";

import { useSceneState } from "@/lib/state/SceneStateProvider";

// Displays live audio_chunk activity from the mock/real feed. Actual chunk
// decoding/playback is a Hour 6-8.5 slice per 02_team_split.md — this pass
// only proves the message contract flows end-to-end into the UI.
export function AudioPlayer() {
  const { state } = useSceneState();
  const lastChunk = state.audioQueue[state.audioQueue.length - 1];

  return (
    <div className="flex items-center gap-3 border-t border-zinc-800 bg-zinc-950/60 px-4 py-3">
      <div className="flex items-end gap-0.5 h-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <span
            key={index}
            className="w-1 rounded-sm bg-emerald-500"
            style={{
              height: lastChunk ? `${8 + ((index * 7) % 18)}px` : "4px",
              opacity: lastChunk ? 0.8 : 0.25,
            }}
          />
        ))}
      </div>
      <span className="font-mono text-xs text-zinc-400">
        {lastChunk
          ? `Playing: ${lastChunk.character_id} (chunk #${lastChunk.sequence})`
          : "No audio yet"}
      </span>
    </div>
  );
}
