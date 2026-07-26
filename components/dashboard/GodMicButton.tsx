"use client";

import { useRef, useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";
import { Button } from "@/components/ui/button";
import { getDeepgramToken } from "@/lib/deepgram/tokenCache";

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
// POST /api/deepgram/token (cached in lib/deepgram/tokenCache.ts so a
// rapid double-press doesn't mint a fresh key every time) and streams
// straight to Deepgram from the browser, then forwards only the final
// transcript text to the backend as godmic_transcript_final.

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

type DeepgramMessage = {
  type?: string;
  is_final?: boolean;
  channel?: { alternatives?: { transcript?: string }[] };
  // Present on Deepgram's error-shaped messages (exact shape isn't
  // consistently documented) — surfaced so a real auth/config error
  // doesn't look identical to "nothing happened."
  description?: string;
  message?: string;
};

export function GodMicButton() {
  const { state, send } = useSceneState();
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const captureRef = useRef<CaptureHandle | null>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);
  const finalPiecesRef = useRef<string[]>([]);
  const targetRef = useRef<string | null>(null);
  // Guards a release that happens while still awaiting the token/mic
  // permission (a very quick press-release) — capture must stop the
  // moment it actually starts, instead of recording indefinitely.
  const releaseRequestedRef = useRef(false);
  // Distinguishes an intentional stopDeepgram() close from the socket
  // dying unexpectedly mid-recording (auth issue, network drop) — both
  // fire the same "close" event, so this is set right before the
  // intentional close and checked inside the close handler.
  const intentionalCloseRef = useRef(false);

  // God Mic can only target a character in the batch you're currently
  // focused on (listening to) — the backend rejects whispers into any
  // other conversation, even an active one you're just not tuned into.
  const activeCharacters = state.focusedBatchId ? (state.batches[state.focusedBatchId] ?? []) : [];

  const stopCapture = () => {
    const capture = captureRef.current;
    if (!capture) return;
    // source/processor may be null if stopCapture is called before the
    // WebSocket "open" event fires and the full audio graph is wired up.
    capture.processor?.disconnect();
    capture.source?.disconnect();
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
    console.log(`[GodMicButton] finalizing whisper — target="${target}" text="${text}"`);
    if (text && target) {
      console.log("[GodMicButton] sending godmic_transcript_final to the backend");
      send({ type: "godmic_transcript_final", target_character: target, text });
    } else if (target) {
      console.warn("[GodMicButton] nothing was transcribed — not sending anything to the backend");
      setMicError("No speech detected — try holding the button longer and speaking clearly.");
    }
  };

  const stopDeepgram = () => {
    const socket = deepgramSocketRef.current;
    deepgramSocketRef.current = null;
    intentionalCloseRef.current = true;
    // Guard: if both the timeout and the close event fire in quick succession
    // (e.g. server acks CloseStream before clearTimeout runs), make sure
    // finalizeAndSend is only called once.
    let finalized = false;
    const safeFinalize = () => {
      if (finalized) return;
      finalized = true;
      finalizeAndSend();
    };
    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      console.warn("[GodMicButton] stopDeepgram called but socket wasn't open — finalizing with whatever was captured");
      safeFinalize();
      return;
    }
    // Give Deepgram a moment to flush the trailing final result after we
    // signal end-of-stream, then finalize whatever we've accumulated.
    console.log("[GodMicButton] sending CloseStream, waiting for Deepgram to flush the final result");
    const finalizeTimer = setTimeout(() => {
      console.warn("[GodMicButton] Deepgram didn't close within 1s of CloseStream — finalizing anyway");
      socket.close();
      safeFinalize();
    }, 1000);
    socket.addEventListener(
      "close",
      () => {
        clearTimeout(finalizeTimer);
        safeFinalize();
      },
      { once: true }
    );
    try {
      socket.send(JSON.stringify({ type: "CloseStream" }));
    } catch (error) {
      console.error("[GodMicButton] failed to send CloseStream", error);
      clearTimeout(finalizeTimer);
      socket.close();
      safeFinalize();
    }
  };

  const handlePress = async (characterId: string) => {
    if (captureRef.current || pendingTarget) return; // already recording/loading, ignore re-press
    setMicError(null);
    setInterimTranscript("");
    finalPiecesRef.current = [];
    releaseRequestedRef.current = false;
    intentionalCloseRef.current = false;
    setPendingTarget(characterId);

    let key: string;
    try {
      key = await getDeepgramToken();
      console.log("[GodMicButton] Deepgram token acquired");
    } catch (error) {
      console.error("[GodMicButton] failed to mint Deepgram token", error);
      setMicError("Could not reach the backend for a Deepgram token.");
      setPendingTarget(null);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.error("[GodMicButton] microphone access failed", error);
      setMicError("Microphone permission denied or unavailable.");
      setPendingTarget(null);
      return;
    }

    const audioContext = new AudioContext();
    const sampleRate = audioContext.sampleRate;
    const dgUrl =
      `wss://api.deepgram.com/v1/listen?model=${DEEPGRAM_MODEL}` +
      `&encoding=linear16&sample_rate=${sampleRate}&channels=1&interim_results=true&punctuate=true`;
    console.log("[GodMicButton] connecting to Deepgram", dgUrl);
    const deepgramSocket = new WebSocket(dgUrl, ["token", key]);

    deepgramSocket.addEventListener("open", () => {
      console.log("[GodMicButton] Deepgram connection open, selected subprotocol:", deepgramSocket.protocol);
      // BUG FIX: Only wire up and start sending PCM *after* the socket is
      // confirmed OPEN. Starting earlier causes every onaudioprocess callback
      // during the WebSocket handshake (100-500ms) to be silently dropped
      // because readyState !== OPEN — that's the first second of speech lost.
      if (releaseRequestedRef.current) {
        // User released before the socket even opened — abort cleanly.
        console.warn("[GodMicButton] release was requested before socket opened — aborting");
        stopCapture();
        stopDeepgram();
        setSelectedTarget(null);
        return;
      }
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(PCM_BUFFER_SIZE, 1, 1);
      // A muted gain node keeps the processor in the audio graph (required for
      // onaudioprocess to fire in some browsers) without playing audio back.
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      processor.onaudioprocess = (ev) => {
        const socket = deepgramSocketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const input = ev.inputBuffer.getChannelData(0);
        socket.send(floatTo16BitPCM(input));
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      // Update the capture ref with the full graph so stopCapture() can
      // disconnect everything properly on release.
      captureRef.current = { audioContext, source, processor, stream };
      setSelectedTarget(characterId);
    });

    deepgramSocket.addEventListener("message", (event) => {
      let parsed: DeepgramMessage;
      try {
        parsed = JSON.parse(event.data) as DeepgramMessage;
      } catch (error) {
        console.error("[GodMicButton] failed to parse Deepgram message", error, event.data);
        return;
      }

      if (parsed.type === "Metadata") {
        console.log("[GodMicButton] Deepgram Metadata (stream wrapping up)", parsed);
        return;
      }
      if (parsed.type !== "Results") {
        // Anything other than Results/Metadata is unexpected — could be a
        // real Deepgram-side error (bad model/params/auth) that would
        // otherwise look identical to "the button just didn't do anything."
        console.warn("[GodMicButton] unexpected Deepgram message, surfacing it instead of silently dropping it", parsed);
        setMicError(`Deepgram: ${parsed.description ?? parsed.message ?? parsed.type ?? "unexpected response"}`);
        return;
      }

      const transcript = parsed.channel?.alternatives?.[0]?.transcript ?? "";
      if (parsed.is_final) {
        console.log(`[GodMicButton] is_final result: "${transcript}"`);
      }
      if (!transcript) return;
      if (parsed.is_final) {
        finalPiecesRef.current.push(transcript);
        console.log("[GodMicButton] accumulated so far:", JSON.stringify(finalPiecesRef.current.join(" ")));
        setInterimTranscript("");
      } else {
        setInterimTranscript(transcript);
      }
    });
    deepgramSocket.addEventListener("error", (event) => {
      console.error("[GodMicButton] Deepgram socket error", event);
      setMicError("Deepgram connection error.");
    });
    deepgramSocket.addEventListener("close", (event) => {
      if (intentionalCloseRef.current) return;
      // Closed on its own while we were still supposed to be recording —
      // e.g. an auth problem or the connection dropping. Without this,
      // the UI would keep showing "recording" while nothing is happening.
      console.error("[GodMicButton] Deepgram closed unexpectedly", { code: event.code, reason: event.reason });
      setMicError(`Deepgram connection closed unexpectedly (${event.code}). Release and try again.`);
    });
    deepgramSocketRef.current = deepgramSocket;

    // Store a minimal capture handle now so stopCapture() during the pending
    // window (before `open` fires and the full graph is wired) can at least
    // stop the mic track and close the AudioContext.
    captureRef.current = { audioContext, source: null as unknown as MediaStreamAudioSourceNode, processor: null as unknown as ScriptProcessorNode, stream };
    targetRef.current = characterId;
    setPendingTarget(null);

    if (releaseRequestedRef.current) {
      // User already released while we were fetching the token/mic
      // permission — stop immediately instead of recording indefinitely.
      stopCapture();
      stopDeepgram();
      setSelectedTarget(null);
      return;
    }
    // Note: setSelectedTarget is now called inside the "open" handler so the
    // amber active state only shows once we're actually streaming audio.
  };

  const handleRelease = () => {
    releaseRequestedRef.current = true;
    // BUG FIX: must stop even when still in the pending (Connecting…) phase.
    // selectedTarget is null until the socket opens, so checking only
    // selectedTarget caused the Deepgram socket to be leaked open whenever
    // the user released the button before the handshake completed.
    if (selectedTarget || captureRef.current || deepgramSocketRef.current) {
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
        {activeCharacters.map((characterId) => {
          const isPending = pendingTarget === characterId;
          const isRecording = selectedTarget === characterId;
          return (
            <Button
              key={characterId}
              className={
                isRecording
                  ? "max-w-[200px] truncate border-amber-600 bg-amber-600 text-white hover:bg-amber-500 active:bg-amber-700"
                  : "max-w-[200px] truncate border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 active:bg-zinc-700"
              }
              disabled={isPending}
              onMouseDown={() => void handlePress(characterId)}
              onMouseUp={handleRelease}
              onMouseLeave={() => isRecording && handleRelease()}
            >
              {isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Connecting…
                </span>
              ) : (
                `Whisper to ${characterId}`
              )}
            </Button>
          );
        })}
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
