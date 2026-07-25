// Message contract — source of truth: 01_build_plan.md Section 3.3 / 3.4

export type TrustDelta = {
  target: string;
  change: number;
};

export type Emotion = string;

export type DialogueTurnMessage = {
  type: "dialogue_turn";
  character_id: string;
  public_dialogue: string;
  secret_motive: string;
  trust_delta: TrustDelta | null;
  emotion: Emotion;
};

export type AudioChunkMessage = {
  type: "audio_chunk";
  character_id: string;
  chunk: string; // binary or base64
  sequence: number;
};

export type TrustSnapshotMessage = {
  type: "trust_snapshot";
  trust_matrix: Record<string, number>; // "taro-akira": 22
};

export type SceneChangeMessage = {
  type: "scene_change";
  participants: string[];
  off_screen: string[];
};

export type GodMicTranscriptMessage = {
  type: "godmic_transcript";
  text: string;
  final: boolean;
};

export type ServerMessage =
  | DialogueTurnMessage
  | AudioChunkMessage
  | TrustSnapshotMessage
  | SceneChangeMessage
  | GodMicTranscriptMessage;

export type GodMicStartMessage = {
  type: "godmic_start";
  target_character: string;
};

export type GodMicTranscriptFinalMessage = {
  type: "godmic_transcript_final";
  text: string;
};

export type GodMicStopMessage = {
  type: "godmic_stop";
};

export type ClientMessage =
  | GodMicStartMessage
  | GodMicTranscriptFinalMessage
  | GodMicStopMessage;

export type SocketHandle = {
  send: (message: ClientMessage) => void;
  onMessage: (handler: (message: ServerMessage) => void) => () => void;
  close: () => void;
};
