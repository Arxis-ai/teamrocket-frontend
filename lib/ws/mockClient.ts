import type {
  ClientMessage,
  ConnectionStatus,
  DialogueTurnMessage,
  ServerMessage,
  SocketHandle,
} from "./types";

const TICK_MS = 1500;
// Scenes conclude (and the Director may reshuffle) after this many turns —
// short on purpose so membership changes are easy to actually observe.
const TURNS_PER_SCENE = 4;
const BACKFILL_TURNS = 6;

const CHARACTERS = [
  { id: "taro", name: "Taro", personality: "A charming strategist who turns every conversation into leverage." },
  { id: "akira", name: "Akira", personality: "A blunt, suspicious competitor who values loyalty but tests everyone." },
  { id: "yuki", name: "Yuki", personality: "A calm observer who notices emotional undercurrents and plays a long game." },
  { id: "haruto", name: "Haruto", personality: "An energetic provocateur who stirs conflict on purpose." },
  { id: "sana", name: "Sana", personality: "A soft-spoken peacemaker who quietly manipulates from the middle." },
  { id: "ren", name: "Ren", personality: "An anxious over-sharer who leaks secrets under pressure." },
];

const NAME_BY_ID = new Map(CHARACTERS.map((character) => [character.id, character.name]));

// Membership-agnostic on purpose: the mock reshuffles who is in which batch,
// so lines can't be pre-written for a fixed line-up the way they used to be.
const LINE_TEMPLATES = [
  (to: string) => `${to}, we should team up before the next vote.`,
  (to: string) => `I'm listening, ${to}. What's the plan?`,
  (to: string) => `Wait — what did you just agree to, ${to}?`,
  (to: string) => `Someone should really start some drama tonight, ${to}.`,
  (to: string) => `Let's keep things calm for once, ${to}.`,
  (to: string) => `I probably shouldn't say this, ${to}, but I overheard something.`,
  (to: string) => `You've been very quiet, ${to}. That worries me.`,
  (to: string) => `Don't pretend you weren't just talking about me, ${to}.`,
];

const MOTIVES = [
  "They are weak. I will betray them while they sleep.",
  "I don't trust a word of this, but I'll play along.",
  "If I stay quiet long enough, they'll hand me the game.",
  "Bored viewers change the channel. I won't let that happen.",
  "Calm is exactly how I stay in control.",
  "I can't keep a secret if my life depends on it.",
];

const EMOTIONS = ["calculating", "wary", "alarmed", "mischievous", "serene", "nervous"];

type MockBatch = {
  id: string;
  participants: string[];
  transcript: Omit<DialogueTurnMessage, "type" | "batch_id">[];
  turnIndex: number;
};

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

function pick<T>(items: T[], index: number): T {
  return items[index % items.length];
}

export function createMockSocket(): SocketHandle {
  const messageHandlers = new Set<(message: ServerMessage) => void>();
  const statusHandlers = new Set<(status: ConnectionStatus) => void>();

  let batches: MockBatch[] = [];
  let focusedBatchId = "";
  let nextBatchNumber = 0;
  let trustMatrix = initialTrustMatrix();
  let timers: ReturnType<typeof setInterval>[] = [];

  const emit = (message: ServerMessage) => {
    messageHandlers.forEach((handler) => handler(message));
  };

  const stopLoop = () => {
    timers.forEach(clearInterval);
    timers = [];
  };

  const newBatchId = () => {
    nextBatchNumber += 1;
    return `batch-${nextBatchNumber}`;
  };

  const emitBatchesSnapshot = () => {
    emit({
      type: "batches_snapshot",
      batches: batches.map((batch) => ({ id: batch.id, participants: batch.participants })),
      off_screen: CHARACTERS.map((c) => c.id).filter(
        (id) => !batches.some((batch) => batch.participants.includes(id))
      ),
      focused_batch_id: focusedBatchId,
    });
  };

  const makeTurn = (batch: MockBatch): Omit<DialogueTurnMessage, "type" | "batch_id"> => {
    const speaker = pick(batch.participants, batch.turnIndex);
    const others = batch.participants.filter((id) => id !== speaker);
    const target = pick(others, batch.turnIndex);
    const change = [-15, 5, -10, 8, -3, 12][batch.turnIndex % 6];
    return {
      character_id: speaker,
      public_dialogue: pick(LINE_TEMPLATES, batch.turnIndex)(NAME_BY_ID.get(target) ?? target),
      addressed_to: target,
      wants_to_pull_in: null,
      wants_to_leave: false,
      scene_continues: true,
      secret_motive: pick(MOTIVES, batch.turnIndex),
      trust_delta: { target, change },
      emotion: pick(EMOTIONS, batch.turnIndex),
    };
  };

  // Mirrors the backend Director's cross-batch trade (see
  // app/services/director.py): swap one member between two batches, then
  // mint new ids ONLY for the batches whose membership actually changed —
  // a group that carries on unchanged keeps its id, which is what lets the
  // dashboard treat an id change as a real "these are different people now".
  const maybeReshuffle = (batch: MockBatch) => {
    const other = batches.find((candidate) => candidate.id !== batch.id);
    if (!other || batch.participants.length < 2 || other.participants.length < 2) {
      batch.transcript = [];
      return;
    }

    const outgoing = pick(batch.participants, batch.turnIndex);
    const incoming = pick(other.participants, batch.turnIndex);

    batch.participants = [...batch.participants.filter((id) => id !== outgoing), incoming];
    other.participants = [...other.participants.filter((id) => id !== incoming), outgoing];

    const wasFocused = focusedBatchId === batch.id;
    const otherWasFocused = focusedBatchId === other.id;
    batch.id = newBatchId();
    other.id = newBatchId();
    batch.transcript = [];
    if (wasFocused) focusedBatchId = batch.id;
    if (otherWasFocused) focusedBatchId = other.id;

    emitBatchesSnapshot();
  };

  const tickBatch = (batch: MockBatch) => {
    const turn = makeTurn(batch);
    batch.turnIndex += 1;
    batch.transcript.push(turn);

    // Text and audio are focus-gated exactly as the real backend does it —
    // an unfocused batch keeps talking here, silently, so switching to it
    // later lands mid-conversation instead of at a cold start.
    if (batch.id === focusedBatchId) {
      emit({ type: "dialogue_turn", batch_id: batch.id, ...turn });
      emit({ type: "audio_chunk", batch_id: batch.id, character_id: turn.character_id, chunk: "", sequence: 0 });
      emit({ type: "audio_end", batch_id: batch.id, character_id: turn.character_id, sequence: 1 });
    }

    const delta = turn.trust_delta;
    if (delta) {
      trustMatrix = {
        ...trustMatrix,
        [turn.character_id]: {
          ...trustMatrix[turn.character_id],
          [delta.target]: Math.max(
            0,
            Math.min(100, trustMatrix[turn.character_id][delta.target] + delta.change)
          ),
        },
      };
      emit({ type: "trust_snapshot", trust_matrix: trustMatrix });
    }

    if (batch.transcript.length >= TURNS_PER_SCENE) {
      maybeReshuffle(batch);
    }
  };

  const startShow = () => {
    stopLoop();
    nextBatchNumber = 0;
    trustMatrix = initialTrustMatrix();
    batches = [
      { id: newBatchId(), participants: ["taro", "akira", "yuki"], transcript: [], turnIndex: 0 },
      { id: newBatchId(), participants: ["haruto", "sana", "ren"], transcript: [], turnIndex: 0 },
    ];
    focusedBatchId = batches[0].id;

    emit({ type: "show_status", running: true });
    emit({ type: "show_state", characters: CHARACTERS, trust_matrix: trustMatrix });
    emitBatchesSnapshot();

    // Offset cadences so the two batches never tick in lockstep.
    timers.push(setInterval(() => tickBatch(batches[0]), TICK_MS));
    timers.push(setInterval(() => tickBatch(batches[1]), TICK_MS * 1.3));
  };

  // Fire on the next microtask so the caller can subscribe onMessage/onStatusChange first.
  setTimeout(() => statusHandlers.forEach((handler) => handler("open")), 0);

  return {
    send(message: ClientMessage) {
      switch (message.type) {
        case "start":
        case "reset":
          startShow();
          break;
        case "stop":
          stopLoop();
          batches = [];
          focusedBatchId = "";
          trustMatrix = {};
          emit({ type: "show_status", running: false });
          emitBatchesSnapshot();
          emit({ type: "trust_snapshot", trust_matrix: {} });
          break;
        case "ping":
          emit({ type: "pong" });
          break;
        case "focus_batch": {
          const target = batches.find((batch) => batch.id === message.batch_id);
          if (!target) {
            emit({ type: "error", message: `Unknown batch: ${message.batch_id}` });
            break;
          }
          focusedBatchId = target.id;
          emit({ type: "focus_changed", batch_id: focusedBatchId });
          // Catch the viewer up on what they missed while tuned elsewhere,
          // matching _maybe_send_catchup on the backend: the history in one
          // backfill message, then the newest line through the normal
          // audio-paced path.
          const history = target.transcript.slice(-BACKFILL_TURNS, -1);
          if (history.length > 0) {
            emit({ type: "transcript_backfill", batch_id: target.id, turns: history });
          }
          const latest = target.transcript[target.transcript.length - 1];
          if (latest) {
            emit({ type: "dialogue_turn", batch_id: target.id, ...latest });
            emit({ type: "audio_chunk", batch_id: target.id, character_id: latest.character_id, chunk: "", sequence: 0 });
            emit({ type: "audio_end", batch_id: target.id, character_id: latest.character_id, sequence: 1 });
          }
          break;
        }
        case "godmic_transcript_final":
          emit({ type: "godmic_transcript", text: message.text, final: true });
          break;
        case "playback_done":
          // The real backend gates its next turn on this; the mock is
          // already paced by its own timers, so there is nothing to release.
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
