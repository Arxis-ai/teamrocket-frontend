// Message contract — source of truth: backend/docs/02_BACKEND_HANDOFF.md
// (the implemented contract, which supersedes the pre-build-plan draft in
// 01_final_build_plan.md Section 3).

export type TrustDelta = {
  target: string;
  change: number;
};

export type Emotion = string;

export type CharacterInfo = {
  id: string;
  name: string;
  personality: string;
};

export type ShowStateMessage = {
  type: "show_state";
  characters: CharacterInfo[];
  trust_matrix: Record<string, Record<string, number>>;
};

export type SceneChangeMessage = {
  type: "scene_change";
  participants: string[];
  off_screen: string[];
};

export type DialogueTurnMessage = {
  type: "dialogue_turn";
  character_id: string;
  public_dialogue: string;
  addressed_to: string | null;
  wants_to_pull_in: string | null;
  wants_to_leave: boolean;
  scene_continues: boolean;
  secret_motive: string;
  trust_delta: TrustDelta | null;
  emotion: Emotion;
};

export type AudioChunkMessage = {
  type: "audio_chunk";
  character_id: string;
  chunk: string; // base64-encoded MP3 bytes, arbitrary byte-boundary
  sequence: number;
};

export type AudioEndMessage = {
  type: "audio_end";
  character_id: string;
  sequence: number;
};

export type TrustSnapshotMessage = {
  type: "trust_snapshot";
  trust_matrix: Record<string, Record<string, number>>;
};

export type GodMicTranscriptMessage = {
  type: "godmic_transcript";
  text: string;
  final: boolean;
};

export type PongMessage = {
  type: "pong";
};

export type ErrorMessage = {
  type: "error";
  message: string;
};

export type ServerMessage =
  | ShowStateMessage
  | SceneChangeMessage
  | DialogueTurnMessage
  | AudioChunkMessage
  | AudioEndMessage
  | TrustSnapshotMessage
  | GodMicTranscriptMessage
  | PongMessage
  | ErrorMessage;

export type StartMessage = { type: "start" };
export type StopMessage = { type: "stop" };
export type ResetMessage = { type: "reset" };
export type PingMessage = { type: "ping" };

export type GodMicTranscriptFinalMessage = {
  type: "godmic_transcript_final";
  target_character: string;
  text: string;
};

export type ClientMessage =
  | StartMessage
  | StopMessage
  | ResetMessage
  | PingMessage
  | GodMicTranscriptFinalMessage;

export type ConnectionStatus = "connecting" | "open" | "closed";

export type SocketHandle = {
  send: (message: ClientMessage) => void;
  onMessage: (handler: (message: ServerMessage) => void) => () => void;
  onStatusChange: (handler: (status: ConnectionStatus) => void) => () => void;
  close: () => void;
};
