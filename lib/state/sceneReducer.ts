import type { CharacterInfo, DialogueTurnMessage, ServerMessage } from "../ws/types";

export type SceneState = {
  characters: CharacterInfo[];
  activeParticipants: string[];
  offScreenParticipants: string[];
  trustMatrix: Record<string, Record<string, number>>;
  transcript: DialogueTurnMessage[];
  lastError: string | null;
  godMic: {
    active: boolean;
    target: string | null;
    transcript: string;
  };
};

export const initialSceneState: SceneState = {
  characters: [],
  activeParticipants: [],
  offScreenParticipants: [],
  trustMatrix: {},
  transcript: [],
  lastError: null,
  godMic: {
    active: false,
    target: null,
    transcript: "",
  },
};

const MAX_TRANSCRIPT_LENGTH = 50;

export function sceneReducer(state: SceneState, message: ServerMessage): SceneState {
  switch (message.type) {
    case "show_state":
      return {
        ...state,
        characters: message.characters,
        trustMatrix: message.trust_matrix,
      };

    case "scene_change":
      return {
        ...state,
        activeParticipants: message.participants,
        offScreenParticipants: message.off_screen,
      };

    case "dialogue_turn":
      return {
        ...state,
        transcript: [...state.transcript, message].slice(-MAX_TRANSCRIPT_LENGTH),
      };

    case "trust_snapshot":
      return {
        ...state,
        trustMatrix: message.trust_matrix,
      };

    case "godmic_transcript":
      return {
        ...state,
        godMic: {
          ...state.godMic,
          active: !message.final,
          transcript: message.text,
        },
      };

    case "error":
      return {
        ...state,
        lastError: message.message,
      };

    // audio_chunk / audio_end / pong are consumed directly by subscribers
    // (AudioPlayer, ping keepalive) that don't need to live in shared state.
    case "audio_chunk":
    case "audio_end":
    case "pong":
    default:
      return state;
  }
}
