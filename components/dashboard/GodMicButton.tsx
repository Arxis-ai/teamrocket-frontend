"use client";

import { useRef, useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";
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
    <div className="flex flex-col gap-2.5 px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm shadow-violet-500/25">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
            <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 9a1 1 0 1 1 2 0 9 9 0 0 1-8 8.94V22a1 1 0 1 1-2 0v-2.06A9 9 0 0 1 3 11a1 1 0 1 1 2 0 7 7 0 0 0 14 0z" />
          </svg>
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-500/80">
          God Mic
        </h2>
        <span className="text-[11px] text-slate-400">Whisper to a contestant mid-scene</span>
      </div>

      {/* Target character selector — single-click to select */}
      <div className="flex flex-wrap gap-2">
        {activeCharacters.length === 0 && (
          <p className="text-xs text-slate-400">No active characters to target.</p>
        )}
        {activeCharacters.map((characterId) => {
          const isSelected = selectedTarget === characterId;
          return (
            <button
              key={characterId}
              type="button"
              className={`max-w-[200px] truncate rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                isSelected
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-md shadow-violet-500/25"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
              }`}
              onClick={() => setSelectedTarget(isSelected ? null : characterId)}
            >
              {characterId}
            </button>
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
            className="min-h-[3rem] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm outline-none transition-all focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
          />

          {/* Mic toggle button */}
          <button
            type="button"
            onClick={handleMicToggle}
            disabled={micPending}
            title={micActive ? "Stop recording" : "Start dictating"}
            className={`animate-halo flex h-[3rem] w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
              micActive
                ? "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100"
                : micPending
                  ? "border-slate-200 bg-slate-100 text-slate-400"
                  : "border-slate-200 bg-white text-slate-500 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600"
            }`}
            style={
              micActive
                ? ({ "--halo-color": "rgb(244 63 94 / 0.45)" } as React.CSSProperties)
                : { animation: "none" }
            }
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
            className={`flex h-[3rem] w-11 shrink-0 items-center justify-center rounded-xl transition-all ${
              canSend
                ? "bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/35 active:translate-y-px"
                : "border border-slate-200 bg-slate-50 text-slate-300"
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
            <p className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
              {micError}
            </p>
          ) : micActive ? (
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
              Recording…
            </p>
          ) : lastSent && !inputText ? (
            <p className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Sent: {lastSent}
            </p>
          ) : !selectedTarget ? (
            <p className="text-xs text-slate-400">Select a target character first</p>
          ) : (
            <p className="text-xs text-slate-400">
              Target:{" "}
              <span className="font-semibold capitalize text-violet-600">{selectedTarget}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
