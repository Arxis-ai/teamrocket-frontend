import type {
  ClientMessage,
  ConnectionStatus,
  ServerMessage,
  SocketHandle,
} from "./types";

const TICK_MS = 1500;

const CHARACTERS = [
  { id: "taro", name: "Taro", personality: "A charming strategist who turns every conversation into leverage." },
  { id: "akira", name: "Akira", personality: "A blunt, suspicious competitor who values loyalty but tests everyone." },
  { id: "yuki", name: "Yuki", personality: "A calm observer who notices emotional undercurrents and plays a long game." },
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

// Mirrors the shape _run_show emits on the real backend: dialogue_turn,
// a couple of audio_chunk frames (empty — nothing to decode in-browser),
// audio_end, then a trust_snapshot. Looped so the dashboard stays alive
// during frontend-only development.
function buildScript(): ServerMessage[] {
  return [
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
    { type: "audio_chunk", character_id: "taro", chunk: "", sequence: 0 },
    { type: "audio_end", character_id: "taro", sequence: 1 },
    { type: "trust_snapshot", trust_matrix: { taro: { akira: 35, yuki: 50 }, akira: { taro: 50, yuki: 50 }, yuki: { taro: 50, akira: 50 } } },
    {
      type: "dialogue_turn",
      character_id: "akira",
      public_dialogue: "I'm listening, Taro. What's the plan?",
      addressed_to: "taro",
      wants_to_pull_in: "yuki",
      wants_to_leave: false,
      scene_continues: true,
      secret_motive: "I don't trust him, but I'll play along for now.",
      trust_delta: { target: "taro", change: 5 },
      emotion: "wary",
    },
    { type: "audio_chunk", character_id: "akira", chunk: "", sequence: 0 },
    { type: "audio_end", character_id: "akira", sequence: 1 },
    { type: "trust_snapshot", trust_matrix: { taro: { akira: 35, yuki: 50 }, akira: { taro: 55, yuki: 50 }, yuki: { taro: 50, akira: 50 } } },
    { type: "scene_change", participants: ["taro", "akira", "yuki"], off_screen: [] },
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
    { type: "audio_chunk", character_id: "yuki", chunk: "", sequence: 0 },
    { type: "audio_end", character_id: "yuki", sequence: 1 },
    { type: "trust_snapshot", trust_matrix: { taro: { akira: 35, yuki: 40 }, akira: { taro: 55, yuki: 50 }, yuki: { taro: 50, akira: 50 } } },
  ];
}

export function createMockSocket(): SocketHandle {
  const messageHandlers = new Set<(message: ServerMessage) => void>();
  const statusHandlers = new Set<(status: ConnectionStatus) => void>();
  const script = buildScript();
  let index = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const emit = (message: ServerMessage) => {
    messageHandlers.forEach((handler) => handler(message));
  };

  const stopLoop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const sendStateAndScene = () => {
    emit({ type: "show_state", characters: CHARACTERS, trust_matrix: initialTrustMatrix() });
    emit({ type: "scene_change", participants: ["taro", "akira"], off_screen: ["yuki"] });
  };

  // Fire on the next microtask so the caller can subscribe onMessage/onStatusChange first.
  setTimeout(() => statusHandlers.forEach((handler) => handler("open")), 0);

  return {
    send(message: ClientMessage) {
      switch (message.type) {
        case "start":
        case "reset":
          stopLoop();
          index = 0;
          sendStateAndScene();
          if (message.type === "start") {
            timer = setInterval(() => {
              if (index >= script.length) index = 0; // loop, dashboard stays alive
              emit(script[index]);
              index += 1;
            }, TICK_MS);
          }
          break;
        case "stop":
          stopLoop();
          break;
        case "ping":
          emit({ type: "pong" });
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
