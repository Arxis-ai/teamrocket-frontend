"use client";

import { useRef, useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";
import { Button } from "@/components/ui/button";
import { getDeepgramToken } from "@/lib/deepgram/tokenCache";

const PCM_BUFFER_SIZE = 4096;
const DEEPGRAM_MODEL = process.env.NEXT_PUBLIC_DEEPGRAM_MODEL ?? "nova-3";

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
  source: MediaStreamAudioSourceNode | null;
  processor: ScriptProcessorNode | null;
  stream: MediaStream;
};

type DeepgramMessage = {
  type?: string;
  is_final?: boolean;
  channel?: { alternatives?: { transcript?: string }[] };
  description?: string;
  message?: string;
};

export function GodMicButton() {
  const { state, send } = useSceneState();
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [micActive, setMicActive] = useState(false);
  const [micPending, setMicPending] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);

  const captureRef = useRef<CaptureHandle | null>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);
  const intentionalCloseRef = useRef(false);
  const finalPiecesRef = useRef<string[]>([]);

  // Characters visible in the currently focused batch.
  const activeCharacters = state.focusedBatchId
    ? (state.batches[state.focusedBatchId] ?? [])
    : [];

  // ── Audio graph teardown ───────────────────────────────────────────────
  const stopCapture = () => {
    const capture = captureRef.current;
    if (!capture) return;
    capture.processor?.disconnect();
    capture.source?.disconnect();
    capture.stream.getTracks().forEach((t) => t.stop());
    void capture.audioContext.close();
    captureRef.current = null;
  };

  // ── Stop Deepgram, collect remaining transcript into inputText ─────────
  const stopMicAndCollect = () => {
    stopCapture();
    const socket = deepgramSocketRef.current;
    deepgramSocketRef.current = null;
    intentionalCloseRef.current = true;

    let finalized = false;
    const doFinalize = () => {
      if (finalized) return;
      finalized = true;
      const pieces = finalPiecesRef.current.join(" ").trim();
      finalPiecesRef.current = [];
      if (pieces) {
        setInputText((prev) => (prev ? `${prev} ${pieces}` : pieces));
      }
      setMicActive(false);
    };

    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      doFinalize();
      return;
    }

    const timer = setTimeout(() => {
      socket.close();
      doFinalize();
    }, 1000);
    socket.addEventListener("close", () => { clearTimeout(timer); doFinalize(); }, { once: true });
    try {
      socket.send(JSON.stringify({ type: "CloseStream" }));
    } catch {
      clearTimeout(timer);
      socket.close();
      doFinalize();
    }
  };

  // ── Start Deepgram mic recording, appends transcript into inputText ────
  const startMic = async () => {
    if (micPending || micActive) return;
    setMicError(null);
    setMicPending(true);
    intentionalCloseRef.current = false;
    finalPiecesRef.current = [];

    let key: string;
    try {
      key = await getDeepgramToken();
    } catch {
      setMicError("Could not reach the backend for a Deepgram token.");
      setMicPending(false);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError("Microphone permission denied or unavailable.");
      setMicPending(false);
      return;
    }

    const audioContext = new AudioContext();
    const sampleRate = audioContext.sampleRate;
    const dgUrl =
      `wss://api.deepgram.com/v1/listen?model=${DEEPGRAM_MODEL}` +
      `&encoding=linear16&sample_rate=${sampleRate}&channels=1&interim_results=true&punctuate=true`;
    const deepgramSocket = new WebSocket(dgUrl, ["token", key]);

    deepgramSocket.addEventListener("open", () => {
      if (intentionalCloseRef.current) {
        // Toggled off before socket opened
        stopCapture();
        deepgramSocket.close();
        setMicActive(false);
        setMicPending(false);
        return;
      }
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(PCM_BUFFER_SIZE, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.onaudioprocess = (ev) => {
        const socket = deepgramSocketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(floatTo16BitPCM(ev.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      captureRef.current = { audioContext, source, processor, stream };
      setMicActive(true);
      setMicPending(false);
    });

    deepgramSocket.addEventListener("message", (event) => {
      let parsed: DeepgramMessage;
      try { parsed = JSON.parse(event.data) as DeepgramMessage; } catch { return; }
      if (parsed.type === "Metadata") return;
      if (parsed.type !== "Results") {
        setMicError(`Deepgram: ${parsed.description ?? parsed.message ?? parsed.type ?? "unexpected response"}`);
        return;
      }
      const transcript = parsed.channel?.alternatives?.[0]?.transcript ?? "";
      if (!transcript) return;
      if (parsed.is_final) {
        finalPiecesRef.current.push(transcript);
        // Show live interim feedback in the text box
        setInputText(finalPiecesRef.current.join(" "));
      } else {
        // Show interim (not-yet-final) text as a preview suffix
        setInputText(finalPiecesRef.current.concat(transcript).join(" "));
      }
    });

    deepgramSocket.addEventListener("error", () => setMicError("Deepgram connection error."));
    deepgramSocket.addEventListener("close", (event) => {
      if (intentionalCloseRef.current) return;
      setMicError(`Deepgram closed unexpectedly (${event.code}). Try again.`);
      setMicActive(false);
    });

    deepgramSocketRef.current = deepgramSocket;
    // Minimal stub so stopCapture works during the pending window
    captureRef.current = {
      audioContext,
      source: null,
      processor: null,
      stream,
    };
  };

  const handleMicToggle = () => {
    if (micActive) {
      intentionalCloseRef.current = true;
      stopMicAndCollect();
    } else {
      void startMic();
    }
  };

  // ── Send the typed/dictated text to the selected target ───────────────
  const handleSend = () => {
    const text = inputText.trim();
    if (!text || !selectedTarget) return;
    send({ type: "godmic_transcript_final", target_character: selectedTarget, text });
    setLastSent(`"${text}" → ${selectedTarget}`);
    setInputText("");
    setMicError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = inputText.trim().length > 0 && selectedTarget !== null;

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-800 bg-zinc-950/60 p-4">
      <h2 className="text-xs uppercase tracking-widest text-amber-500/70">God Mic</h2>

      {/* Target character selector — single-click to select */}
      <div className="flex flex-wrap gap-2">
        {activeCharacters.length === 0 && (
          <p className="text-sm text-zinc-500">No active characters to target.</p>
        )}
        {activeCharacters.map((characterId) => {
          const isSelected = selectedTarget === characterId;
          return (
            <Button
              key={characterId}
              className={
                isSelected
                  ? "max-w-[200px] truncate border-amber-600 bg-amber-600 text-white hover:bg-amber-500 active:bg-amber-700"
                  : "max-w-[200px] truncate border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 active:bg-zinc-700"
              }
              onClick={() => setSelectedTarget(isSelected ? null : characterId)}
            >
              {characterId}
            </Button>
          );
        })}
      </div>

      {/* Always-visible text input + mic + send row */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-end gap-2">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder={
              selectedTarget
                ? `Whisper to ${selectedTarget}… (Enter to send)`
                : "Select a character above, then type or dictate…"
            }
            className="min-h-[3rem] flex-1 resize-none rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-amber-600/60 focus:bg-zinc-900"
          />

          {/* Mic toggle button */}
          <button
            type="button"
            onClick={handleMicToggle}
            disabled={micPending}
            title={micActive ? "Stop recording" : "Start dictating"}
            className={`flex h-[3rem] w-10 shrink-0 items-center justify-center rounded border transition-colors ${
              micActive
                ? "border-red-600 bg-red-900/30 text-red-400 hover:bg-red-900/50"
                : micPending
                ? "border-zinc-700 bg-zinc-800 text-zinc-500"
                : "border-zinc-700 bg-transparent text-zinc-400 hover:border-amber-600/60 hover:text-amber-400"
            }`}
          >
            {micPending ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : micActive ? (
              /* Stop icon */
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              /* Mic icon */
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 19.93V21h-3a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-.07A9 9 0 0 0 21 12a1 1 0 0 0-2 0 7 7 0 0 1-14 0 1 1 0 0 0-2 0 9 9 0 0 0 8 8.93z" />
              </svg>
            )}
          </button>

          {/* Send button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            title="Send whisper"
            className={`flex h-[3rem] w-10 shrink-0 items-center justify-center rounded border transition-colors ${
              canSend
                ? "border-amber-600 bg-amber-600/20 text-amber-400 hover:bg-amber-600/40"
                : "border-zinc-800 bg-transparent text-zinc-700"
            }`}
          >
            {/* Arrow-up send icon */}
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>

        {/* Status line — always present, never jumps layout */}
        <div className="min-h-[1.25rem]">
          {micError ? (
            <p className="font-mono text-xs text-red-400">{micError}</p>
          ) : micActive ? (
            <p className="font-mono text-xs text-red-400 animate-pulse">● Recording…</p>
          ) : lastSent && !inputText ? (
            <p className="font-mono text-xs text-amber-200/70">Sent: {lastSent}</p>
          ) : !selectedTarget ? (
            <p className="font-mono text-xs text-zinc-600">Select a target character first</p>
          ) : (
            <p className="font-mono text-xs text-zinc-600">
              Target: <span className="text-amber-400/80 capitalize">{selectedTarget}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
