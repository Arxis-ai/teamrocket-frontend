import type { CharacterInfo, DialogueTurnMessage, ServerMessage } from "../ws/types";

export type SceneState = {
  characters: CharacterInfo[];
  // batch_id -> participant character ids. Several conversations run
  // concurrently; focusedBatchId is the one the viewer is "tuned in" to
  // (the only one AudioPlayer plays audio for).
  batches: Record<string, string[]>;
  offScreen: string[];
  focusedBatchId: string | null;
  trustMatrix: Record<string, Record<string, number>>;
  // Audio-paced reveal (see revealNextTurn in SceneStateProvider): a turn
  // only moves from pendingTurns into transcript once AudioPlayer decides
  // its line has actually started playing (or immediately if it has no
  // audio) — this is what MonologuePanel/DialoguePanel render, so captions
  // never race ahead of the voice that's supposed to be saying them.
  transcript: DialogueTurnMessage[];
  pendingTurns: DialogueTurnMessage[];
  lastError: string | null;
  showRunning: boolean;
  godMic: {
    active: boolean;
    target: string | null;
    transcript: string;
  };
};

export const initialSceneState: SceneState = {
  characters: [],
  batches: {},
  offScreen: [],
  focusedBatchId: null,
  trustMatrix: {},
  transcript: [],
  pendingTurns: [],
  lastError: null,
  showRunning: false,
  godMic: {
    active: false,
    target: null,
    transcript: "",
  },
};

const MAX_TRANSCRIPT_LENGTH = 50;

export type RevealNextTurnAction = { type: "reveal_next_turn" };
export type SceneAction = ServerMessage | RevealNextTurnAction;

export function sceneReducer(state: SceneState, action: SceneAction): SceneState {
  switch (action.type) {
    case "show_state":
      return {
        ...state,
        characters: action.characters,
        trustMatrix: action.trust_matrix,
      };

    case "batches_snapshot": {
      const batches: Record<string, string[]> = {};
      for (const batch of action.batches) {
        batches[batch.id] = batch.participants;
      }
      return {
        ...state,
        batches,
        offScreen: action.off_screen,
        focusedBatchId: action.focused_batch_id,
      };
    }

    case "dialogue_turn":
      return {
        ...state,
        pendingTurns: [...state.pendingTurns, action],
      };

    case "reveal_next_turn": {
      const [next, ...rest] = state.pendingTurns;
      if (!next) return state;
      return {
        ...state,
        pendingTurns: rest,
        transcript: [...state.transcript, next].slice(-MAX_TRANSCRIPT_LENGTH),
      };
    }

    case "trust_snapshot":
      return {
        ...state,
        trustMatrix: action.trust_matrix,
      };

    case "godmic_transcript":
      return {
        ...state,
        godMic: {
          ...state.godMic,
          active: !action.final,
          transcript: action.text,
        },
      };

    case "focus_changed":
      // A real user-initiated switch (as opposed to batches_snapshot, which
      // also fires on the still-watched conversation naturally reshuffling
      // its own id) — clear out the old batch's dialogue/thoughts so the
      // panels and graph only ever show the conversation currently being
      // listened to, not a lingering mix from whatever was focused earlier
      // this session. Safe to wipe pendingTurns outright here too: nothing
      // still queued belongs to the batch we're now leaving.
      return {
        ...state,
        focusedBatchId: action.batch_id,
        transcript: [],
        pendingTurns: [],
      };

    case "error":
      return {
        ...state,
        lastError: action.batch_id ? `[${action.batch_id}] ${action.message}` : action.message,
      };

    case "show_status":
      if (action.running) {
        // Fresh show_state/batches_snapshot arrive immediately after this
        // (see show_ws.py) — just clear the per-run fields those messages
        // don't touch, so old dialogue/thoughts don't linger into a new run.
        return {
          ...state,
          showRunning: true,
          transcript: [],
          pendingTurns: [],
          lastError: null,
          godMic: { active: false, target: null, transcript: "" },
        };
      }
      // Stopped: the backend fully clears its own session too (see
      // ShowEngine.stop) and nothing else is coming until the next start —
      // return to exactly how the dashboard looked before anything ever
      // connected, not a frozen snapshot of the last run.
      return { ...initialSceneState, showRunning: false };

    // audio_chunk / audio_end / pong are consumed directly by subscribers
    // (AudioPlayer, ping keepalive) that don't need to live in shared state.
    case "audio_chunk":
    case "audio_end":
    case "pong":
    default:
      return state;
  }
}
