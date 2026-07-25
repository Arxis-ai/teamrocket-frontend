"use client";

import { useRef, useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";
import { Button } from "@/components/ui/button";

// Raw PCM buffer size per audio-processing callback. WebM/Opus via
// MediaRecorder was tried first and doesn't reliably reach Deepgram's
// real-time API through a relay (fragmented container — see
// github.com/orgs/deepgram/discussions/1073). Raw linear16 PCM is the path
// that actually works.
const PCM_BUFFER_SIZE = 4096;
const DEEPGRAM_MODEL = process.env.NEXT_PUBLIC_DEEPGRAM_MODEL ?? "nova-3";

// The backend does not proxy microphone audio over /ws/show (see
// 02_BACKEND_HANDOFF.md "Not implemented yet" — backend-proxy Deepgram
// streaming). Instead the frontend mints a short-lived Deepgram key via
// POST /api/deepgram/token and streams straight to Deepgram from the
// browser, then forwards only the final transcript text to the backend
// as godmic_transcript_final.
function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  return `${base.replace(/\/$/, "")}${path}`;
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output.buffer;
}

type CaptureHandle = {
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  stream: MediaStream;
};

type DeepgramResult = {
  type?: string;
  is_final?: boolean;
  channel?: { alternatives?: { transcript?: string }[] };
};

export function GodMicButton() {
  const { state, send } = useSceneState();
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const captureRef = useRef<CaptureHandle | null>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);
  const finalPiecesRef = useRef<string[]>([]);
  const targetRef = useRef<string | null>(null);

  // God Mic only ever targets a character currently in the active scene
  // (01_build_plan.md Section 2.5) — off-screen characters are never offered.
  const activeCharacters = state.activeParticipants;

  const stopCapture = () => {
    const capture = captureRef.current;
    if (!capture) return;
    capture.processor.disconnect();
    capture.source.disconnect();
    capture.stream.getTracks().forEach((track) => track.stop());
    void capture.audioContext.close();
    captureRef.current = null;
  };

  const finalizeAndSend = () => {
    const text = finalPiecesRef.current.join(" ").trim();
    finalPiecesRef.current = [];
    setInterimTranscript("");
    const target = targetRef.current;
    targetRef.current = null;
    if (text && target) {
      send({ type: "godmic_transcript_final", target_character: target, text });
    }
  };

  const stopDeepgram = () => {
    const socket = deepgramSocketRef.current;
    deepgramSocketRef.current = null;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      finalizeAndSend();
      return;
    }
    // Give Deepgram a moment to flush the trailing final result after we
    // signal end-of-stream, then finalize whatever we've accumulated.
    const finalizeTimer = setTimeout(() => {
      socket.close();
      finalizeAndSend();
    }, 1000);
    socket.addEventListener(
      "close",
      () => {
        clearTimeout(finalizeTimer);
        finalizeAndSend();
      },
      { once: true }
    );
    try {
      socket.send(JSON.stringify({ type: "CloseStream" }));
    } catch {
      clearTimeout(finalizeTimer);
      socket.close();
      finalizeAndSend();
    }
  };

  const handlePress = async (characterId: string) => {
    if (captureRef.current) return; // already recording, ignore re-press
    setMicError(null);
    setInterimTranscript("");
    finalPiecesRef.current = [];

    let key: string;
    try {
      const response = await fetch(apiUrl("/api/deepgram/token"), { method: "POST" });
      if (!response.ok) throw new Error(`token request failed: ${response.status}`);
      const data = (await response.json()) as { key: string };
      key = data.key;
    } catch (error) {
      console.error("[GodMicButton] failed to mint Deepgram token", error);
      setMicError("Could not reach the backend for a Deepgram token.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.error("[GodMicButton] microphone access failed", error);
      setMicError("Microphone permission denied or unavailable.");
      return;
    }

    const audioContext = new AudioContext();
    const sampleRate = audioContext.sampleRate;
    const dgUrl =
      `wss://api.deepgram.com/v1/listen?model=${DEEPGRAM_MODEL}` +
      `&encoding=linear16&sample_rate=${sampleRate}&channels=1&interim_results=true&punctuate=true`;
    const deepgramSocket = new WebSocket(dgUrl, ["token", key]);
    deepgramSocket.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(event.data) as DeepgramResult;
        if (parsed.type !== "Results") return;
        const transcript = parsed.channel?.alternatives?.[0]?.transcript ?? "";
        if (!transcript) return;
        if (parsed.is_final) {
          finalPiecesRef.current.push(transcript);
          setInterimTranscript("");
        } else {
          setInterimTranscript(transcript);
        }
      } catch (error) {
        console.error("[GodMicButton] failed to parse Deepgram message", error, event.data);
      }
    });
    deepgramSocket.addEventListener("error", (event) => {
      console.error("[GodMicButton] Deepgram socket error", event);
      setMicError("Deepgram connection error.");
    });
    deepgramSocketRef.current = deepgramSocket;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(PCM_BUFFER_SIZE, 1, 1);
    // A muted gain node keeps the processor in the audio graph (required for
    // onaudioprocess to fire in some browsers) without playing audio back.
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      const socket = deepgramSocketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      socket.send(floatTo16BitPCM(input));
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    captureRef.current = { audioContext, source, processor, stream };
    targetRef.current = characterId;
    setSelectedTarget(characterId);
  };

  const handleRelease = () => {
    if (selectedTarget) {
      stopCapture();
      stopDeepgram();
    }
    setSelectedTarget(null);
  };

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-800 bg-zinc-950/60 p-4">
      <h2 className="text-xs uppercase tracking-widest text-amber-500/70">
        God Mic
      </h2>
      <div className="flex flex-wrap gap-2">
        {activeCharacters.length === 0 && (
          <p className="text-sm text-zinc-500">No active characters to target.</p>
        )}
        {activeCharacters.map((characterId) => (
          <Button
            key={characterId}
            variant={selectedTarget === characterId ? "default" : "outline"}
            className={
              selectedTarget === characterId ? "bg-amber-600 hover:bg-amber-600" : ""
            }
            onMouseDown={() => void handlePress(characterId)}
            onMouseUp={handleRelease}
            onMouseLeave={() => selectedTarget === characterId && handleRelease()}
          >
            Whisper to {characterId}
          </Button>
        ))}
      </div>
      {micError && <p className="font-mono text-xs text-red-400">{micError}</p>}
      {selectedTarget && interimTranscript && (
        <p className="font-mono text-xs text-amber-200/60">
          &ldquo;{interimTranscript}&rdquo;
          <span className="animate-pulse"> …</span>
        </p>
      )}
      {state.godMic.transcript && (
        <p className="font-mono text-xs text-amber-200/80">
          Sent: &ldquo;{state.godMic.transcript}&rdquo;
        </p>
      )}
    </div>
  );
}
