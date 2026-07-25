export type CharacterTier = "focused" | "active" | "off";

// Which of the concurrently-running conversation batches a character is
// in (if any), relative to which one the viewer is currently tuned into.
export function characterTier(
  characterId: string,
  batches: Record<string, string[]>,
  focusedBatchId: string | null
): CharacterTier {
  for (const [batchId, participants] of Object.entries(batches)) {
    if (participants.includes(characterId)) {
      return batchId === focusedBatchId ? "focused" : "active";
    }
  }
  return "off";
}

// Whether two characters are currently in the same conversation batch —
// deliberately size-agnostic (just list membership), so it works the same
// whether a batch has 2, 3, or however many participants, and however many
// batches exist at once.
export function sameBatch(a: string, b: string, batches: Record<string, string[]>): boolean {
  return Object.values(batches).some((participants) => participants.includes(a) && participants.includes(b));
}
