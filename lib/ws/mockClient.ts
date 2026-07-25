import type { ServerMessage, SocketHandle } from "./types";

const SCRIPT_INTERVAL_MS = 3000;

function buildScript(): ServerMessage[] {
  return [
    { type: "scene_change", participants: ["taro", "akira"], off_screen: ["yuki"] },
    {
      type: "dialogue_turn",
      character_id: "taro",
      public_dialogue: "Akira, we should team up before the next vote.",
      secret_motive: "He is weak, I will betray him while he sleeps.",
      trust_delta: { target: "akira", change: -15 },
      emotion: "calculating",
    },
    { type: "audio_chunk", character_id: "taro", chunk: "", sequence: 1 },
    {
      type: "dialogue_turn",
      character_id: "akira",
      public_dialogue: "I'm listening, Taro. What's the plan?",
      secret_motive: "I don't trust him, but I'll play along for now.",
      trust_delta: { target: "taro", change: 5 },
      emotion: "wary",
    },
    { type: "audio_chunk", character_id: "akira", chunk: "", sequence: 2 },
    { type: "trust_snapshot", trust_matrix: { "taro-akira": 22, "taro-yuki": 58, "akira-taro": 40 } },
    { type: "scene_change", participants: ["taro", "akira", "yuki"], off_screen: [] },
    { type: "godmic_transcript", text: "Hey Taro, Akira is planning to betray you", final: false },
    { type: "godmic_transcript", text: "Hey Taro, Akira is planning to betray you tonight.", final: true },
    {
      type: "dialogue_turn",
      character_id: "taro",
      public_dialogue: "Wait... what did you just say to me?",
      secret_motive: "Someone is onto me. I need to deny everything.",
      trust_delta: { target: "akira", change: -30 },
      emotion: "alarmed",
    },
  ];
}

export function createMockSocket(): SocketHandle {
  const handlers = new Set<(message: ServerMessage) => void>();
  const script = buildScript();
  let index = 0;

  const timer = setInterval(() => {
    if (index >= script.length) {
      index = 0; // loop so the dashboard stays alive during development
    }
    const message = script[index];
    index += 1;
    handlers.forEach((handler) => handler(message));
  }, SCRIPT_INTERVAL_MS);

  return {
    send() {
      // Mock has no server to relay to — godmic_start/stop are no-ops here;
      // godmic_transcript playback is scripted above instead.
    },
    sendAudio() {
      // No real audio pipeline in the in-browser mock.
    },
    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      clearInterval(timer);
      handlers.clear();
    },
  };
}
