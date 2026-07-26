// Message contract — source of truth: teamrocket-backend/app/routers/show_ws.py
// and app/services/show_engine.py (the implemented contract). The show runs
// as multiple concurrent conversation "batches" (see app/services/director.py)
// rather than one flat scene — see BatchesSnapshotMessage.

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

export type BatchInfo = {
  id: string;
  participants: string[];
};

// Replaces the old singular scene_change message — one message fully
// describing current batch groupings, sent on start/reset and whenever any
// batch's membership changes, instead of the frontend merging per-batch deltas.
export type BatchesSnapshotMessage = {
  type: "batches_snapshot";
  batches: BatchInfo[];
  off_screen: string[];
  focused_batch_id: string | null;
};

export type DialogueTurnMessage = {
  type: "dialogue_turn";
  batch_id: string;
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
  batch_id: string;
  character_id: string;
  chunk: string; // base64-encoded MP3 bytes, arbitrary byte-boundary
  sequence: number;
};

export type AudioEndMessage = {
  type: "audio_end";
  batch_id: string;
  character_id: string;
  sequence: number;
};

// Recent history of a conversation that had been running unheard in the
// background, handed over when the viewer tunes into it. Deliberately NOT a
// series of dialogue_turn messages: those are audio-paced (each waits on its
// own audio_end before being revealed) and these historical lines carry no
// audio, so they go straight into the transcript instead.
export type TranscriptBackfillMessage = {
  type: "transcript_backfill";
  batch_id: string;
  turns: Omit<DialogueTurnMessage, "type" | "batch_id">[];
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

export type FocusChangedMessage = {
  type: "focus_changed";
  batch_id: string;
};

export type PongMessage = {
  type: "pong";
};

export type ErrorMessage = {
  type: "error";
  message: string;
  // Present when the error came from a specific batch's turn/audio
  // generation (see show_ws.py's resilient retry wrapper) — absent for
  // connection-level protocol errors (bad focus_batch id, unknown message type).
  batch_id?: string;
};

export type ShowStatusMessage = {
  type: "show_status";
  running: boolean;
};

export type ServerMessage =
  | ShowStateMessage
  | BatchesSnapshotMessage
  | DialogueTurnMessage
  | TranscriptBackfillMessage
  | AudioChunkMessage
  | AudioEndMessage
  | TrustSnapshotMessage
  | GodMicTranscriptMessage
  | FocusChangedMessage
  | PongMessage
  | ErrorMessage
  | ShowStatusMessage;

export type StartMessage = { type: "start" };
export type StopMessage = { type: "stop" };
export type ResetMessage = { type: "reset" };
export type PingMessage = { type: "ping" };

export type GodMicTranscriptFinalMessage = {
  type: "godmic_transcript_final";
  target_character: string;
  text: string;
};

export type FocusBatchMessage = {
  type: "focus_batch";
  batch_id: string;
};

// Sent once a line has finished playing — or been discarded without playing.
// The backend holds the focused conversation until this arrives, so it can't
// generate (and reshuffle) faster than the audio can actually be heard.
// Must be sent in every case a turn is resolved, including failures, or that
// conversation stalls until the server-side timeout.
export type PlaybackDoneMessage = {
  type: "playback_done";
  batch_id: string;
};

export type ClientMessage =
  | StartMessage
  | StopMessage
  | ResetMessage
  | PingMessage
  | GodMicTranscriptFinalMessage
  | FocusBatchMessage
  | PlaybackDoneMessage;

export type ConnectionStatus = "connecting" | "open" | "closed";

export type SocketHandle = {
  send: (message: ClientMessage) => void;
  onMessage: (handler: (message: ServerMessage) => void) => () => void;
  onStatusChange: (handler: (status: ConnectionStatus) => void) => () => void;
  close: () => void;
};
