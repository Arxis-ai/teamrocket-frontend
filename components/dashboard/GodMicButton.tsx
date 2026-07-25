"use client";

import { useRef, useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";
import { Button } from "@/components/ui/button";

// Raw PCM buffer size per audio-processing callback. WebM/Opus via
// MediaRecorder was tried first and doesn't reliably reach Deepgram's
// real-time API through a relay (fragmented container — see
// github.com/orgs/deepgram/discussions/1073). Raw linear16 PCM, same as
// mock/test-deepgram-stt.js's terminal test, is the path that actually works.
const PCM_BUFFER_SIZE = 4096;

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

export function GodMicButton() {
  const { state, send, sendAudio } = useSceneState();
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const captureRef = useRef<CaptureHandle | null>(null);

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

  const handlePress = async (characterId: string) => {
    if (captureRef.current) return; // already recording, ignore re-press
    setMicError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.error("[GodMicButton] microphone access failed", error);
      setMicError("Microphone permission denied or unavailable.");
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(PCM_BUFFER_SIZE, 1, 1);
    // A muted gain node keeps the processor in the audio graph (required for
    // onaudioprocess to fire in some browsers) without playing audio back.
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      sendAudio(floatTo16BitPCM(input));
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    captureRef.current = { audioContext, source, processor, stream };
    setSelectedTarget(characterId);
    send({
      type: "godmic_start",
      target_character: characterId,
      sample_rate: audioContext.sampleRate,
    });
  };

  const handleRelease = () => {
    if (selectedTarget) {
      stopCapture();
      send({ type: "godmic_stop" });
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
      {state.godMic.transcript && (
        <p className="font-mono text-xs text-amber-200/80">
          &ldquo;{state.godMic.transcript}&rdquo;
          {state.godMic.active && <span className="animate-pulse"> …</span>}
        </p>
      )}
    </div>
  );
}
