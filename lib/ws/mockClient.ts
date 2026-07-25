import type {
  ClientMessage,
  ConnectionStatus,
  DialogueTurnMessage,
  ServerMessage,
  SocketHandle,
} from "./types";

const TICK_MS = 1500;
const BATCH_1 = "batch-1";
const BATCH_2 = "batch-2";

const CHARACTERS = [
  { id: "taro", name: "Taro", personality: "A charming strategist who turns every conversation into leverage." },
  { id: "akira", name: "Akira", personality: "A blunt, suspicious competitor who values loyalty but tests everyone." },
  { id: "yuki", name: "Yuki", personality: "A calm observer who notices emotional undercurrents and plays a long game." },
  { id: "haruto", name: "Haruto", personality: "An energetic provocateur who stirs conflict on purpose." },
  { id: "sana", name: "Sana", personality: "A soft-spoken peacemaker who quietly manipulates from the middle." },
  { id: "ren", name: "Ren", personality: "An anxious over-sharer who leaks secrets under pressure." },
];

function initialTrustMatrix(): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {};
  for (const source of CHARACTERS) {
    matrix[source.id] = {};
    for (const target of CHARACTERS) {
      if (target.id !== source.id) matrix[source.id][target.id] = 50;
    }
  }
  return matrix;
}

type ScriptedTurn = Omit<DialogueTurnMessage, "batch_id">;

// Mirrors the shape each per-batch loop emits on the real backend:
// dialogue_turn, a couple of audio_chunk frames (empty — nothing to decode
// in-browser), audio_end, then a trust_snapshot. Two independent scripts
// tick concurrently (like two real concurrent batches), looped so the
// dashboard stays alive during frontend-only development.
const BATCH_1_SCRIPT: ScriptedTurn[] = [
  {
    type: "dialogue_turn",
    character_id: "taro",
    public_dialogue: "Akira, we should team up before the next vote.",
    addressed_to: "akira",
    wants_to_pull_in: null,
    wants_to_leave: false,
    scene_continues: true,
    secret_motive: "He is weak, I will betray him while he sleeps.",
    trust_delta: { target: "akira", change: -15 },
    emotion: "calculating",
  },
  {
    type: "dialogue_turn",
    character_id: "akira",
    public_dialogue: "I'm listening, Taro. What's the plan?",
    addressed_to: "taro",
    wants_to_pull_in: null,
    wants_to_leave: false,
    scene_continues: true,
    secret_motive: "I don't trust him, but I'll play along for now.",
    trust_delta: { target: "taro", change: 5 },
    emotion: "wary",
  },
  {
    type: "dialogue_turn",
    character_id: "yuki",
    public_dialogue: "Wait... what did you two just agree to?",
    addressed_to: "taro",
    wants_to_pull_in: null,
    wants_to_leave: false,
    scene_continues: true,
    secret_motive: "Someone is onto them. I need to stay quiet and watch.",
    trust_delta: { target: "taro", change: -10 },
    emotion: "alarmed",
  },
];

const BATCH_2_SCRIPT: ScriptedTurn[] = [
  {
    type: "dialogue_turn",
    character_id: "haruto",
    public_dialogue: "Someone should really start some drama tonight.",
    addressed_to: "sana",
    wants_to_pull_in: null,
    wants_to_leave: false,
    scene_continues: true,
    secret_motive: "Bored viewers change the channel. I won't let that happen.",
    trust_delta: { target: "sana", change: -5 },
    emotion: "mischievous",
  },
  {
    type: "dialogue_turn",
    character_id: "sana",
    public_dialogue: "Let's keep things calm for once, Haruto.",
    addressed_to: "haruto",
    wants_to_pull_in: null,
    wants_to_leave: false,
    scene_continues: true,
    secret_motive: "Calm is exactly how I stay in control.",
    trust_delta: { target: "haruto", change: 8 },
    emotion: "serene",
  },
  {
    type: "dialogue_turn",
    character_id: "ren",
    public_dialogue: "I— I probably shouldn't say this, but I overheard something.",
    addressed_to: "sana",
    wants_to_pull_in: null,
    wants_to_leave: false,
    scene_continues: true,
    secret_motive: "I can't keep a secret if my life depends on it.",
    trust_delta: { target: "sana", change: -3 },
    emotion: "nervous",
  },
];

export function createMockSocket(): SocketHandle {
  const messageHandlers = new Set<(message: ServerMessage) => void>();
  const statusHandlers = new Set<(status: ConnectionStatus) => void>();
  let focusedBatchId: string = BATCH_1;
  let batch1Index = 0;
  let batch2Index = 0;
  let batch1Timer: ReturnType<typeof setInterval> | null = null;
  let batch2Timer: ReturnType<typeof setInterval> | null = null;

  const emit = (message: ServerMessage) => {
    messageHandlers.forEach((handler) => handler(message));
  };

  const stopLoop = () => {
    if (batch1Timer) clearInterval(batch1Timer);
    if (batch2Timer) clearInterval(batch2Timer);
    batch1Timer = null;
    batch2Timer = null;
  };

  const emitBatchTurn = (batchId: string, turn: ScriptedTurn) => {
    emit({ ...turn, batch_id: batchId });
    if (batchId === focusedBatchId) {
      emit({ type: "audio_chunk", batch_id: batchId, character_id: turn.character_id, chunk: "", sequence: 0 });
      emit({ type: "audio_end", batch_id: batchId, character_id: turn.character_id, sequence: 1 });
    }
    if (turn.trust_delta) {
      const matrix = initialTrustMatrix();
      matrix[turn.character_id][turn.trust_delta.target] = 50 + turn.trust_delta.change;
      emit({ type: "trust_snapshot", trust_matrix: matrix });
    }
  };

  const sendInitialState = () => {
    emit({ type: "show_state", characters: CHARACTERS, trust_matrix: initialTrustMatrix() });
    emit({
      type: "batches_snapshot",
      batches: [
        { id: BATCH_1, participants: ["taro", "akira", "yuki"] },
        { id: BATCH_2, participants: ["haruto", "sana", "ren"] },
      ],
      off_screen: [],
      focused_batch_id: focusedBatchId,
    });
  };

  // Fire on the next microtask so the caller can subscribe onMessage/onStatusChange first.
  setTimeout(() => statusHandlers.forEach((handler) => handler("open")), 0);

  return {
    send(message: ClientMessage) {
      switch (message.type) {
        case "start":
        case "reset":
          stopLoop();
          batch1Index = 0;
          batch2Index = 0;
          focusedBatchId = BATCH_1;
          sendInitialState();
          if (message.type === "start") {
            batch1Timer = setInterval(() => {
              if (batch1Index >= BATCH_1_SCRIPT.length) batch1Index = 0; // loop, dashboard stays alive
              emitBatchTurn(BATCH_1, BATCH_1_SCRIPT[batch1Index]);
              batch1Index += 1;
            }, TICK_MS);
            batch2Timer = setInterval(() => {
              if (batch2Index >= BATCH_2_SCRIPT.length) batch2Index = 0;
              emitBatchTurn(BATCH_2, BATCH_2_SCRIPT[batch2Index]);
              batch2Index += 1;
            }, TICK_MS * 1.3); // offset cadence so the two batches don't tick in lockstep
          }
          break;
        case "stop":
          stopLoop();
          break;
        case "ping":
          emit({ type: "pong" });
          break;
        case "focus_batch":
          if (message.batch_id === BATCH_1 || message.batch_id === BATCH_2) {
            focusedBatchId = message.batch_id;
            emit({ type: "focus_changed", batch_id: focusedBatchId });
          } else {
            emit({ type: "error", message: `Unknown batch: ${message.batch_id}` });
          }
          break;
        case "godmic_transcript_final":
          emit({ type: "godmic_transcript", text: message.text, final: true });
          break;
      }
    },
    onMessage(handler) {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onStatusChange(handler) {
      statusHandlers.add(handler);
      handler("open");
      return () => statusHandlers.delete(handler);
    },
    close() {
      stopLoop();
      messageHandlers.clear();
      statusHandlers.clear();
    },
  };
}
