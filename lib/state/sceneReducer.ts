import type { DialogueTurnMessage, AudioChunkMessage, ServerMessage } from "../ws/types";

export type SceneState = {
  activeParticipants: string[];
  offScreenParticipants: string[];
  trustMatrix: Record<string, number>;
  transcript: DialogueTurnMessage[];
  audioQueue: AudioChunkMessage[];
  godMic: {
    active: boolean;
    target: string | null;
    transcript: string;
  };
};

export const initialSceneState: SceneState = {
  activeParticipants: [],
  offScreenParticipants: [],
  trustMatrix: {},
  transcript: [],
  audioQueue: [],
  godMic: {
    active: false,
    target: null,
    transcript: "",
  },
};

const MAX_TRANSCRIPT_LENGTH = 50;

export function sceneReducer(state: SceneState, message: ServerMessage): SceneState {
  switch (message.type) {
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

    case "audio_chunk":
      return {
        ...state,
        audioQueue: [...state.audioQueue, message],
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

    default:
      return state;
  }
}
