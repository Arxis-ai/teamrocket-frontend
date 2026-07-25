"use client";

import { useEffect, useRef, useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";

const BAR_COUNT = 12;
const MIN_BAR_HEIGHT_PX = 4;
const MAX_BAR_HEIGHT_PX = 24;

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatUint8Arrays(chunks: Uint8Array[]): ArrayBuffer {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined.buffer;
}

type QueuedTurn = {
  characterId: string;
  buffer: ArrayBuffer;
};

// The backend streams MP3 bytes at arbitrary byte boundaries per
// audio_chunk — an individual chunk is not a self-contained decodable MP3
// file. Bytes must be accumulated until audio_end (one contestant line)
// before a single decodeAudioData call, per 02_BACKEND_HANDOFF.md.
export function AudioPlayer() {
  const { onMessage } = useSceneState();
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pendingChunksRef = useRef<Uint8Array[]>([]);
  const queueRef = useRef<QueuedTurn[]>([]);
  const isPlayingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  const getAudioContext = (): { audioContext: AudioContext; analyser: AnalyserNode } => {
    if (!audioContextRef.current || !analyserRef.current) {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 32; // 16 frequency bins — plenty of resolution for BAR_COUNT bars
      analyser.connect(audioContext.destination);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
    }
    // Browsers suspend AudioContext until a user gesture occurs on the page;
    // resume() is a no-op if already running, harmless if still suspended.
    void audioContextRef.current.resume();
    return { audioContext: audioContextRef.current, analyser: analyserRef.current };
  };

  const resetBars = () => {
    barRefs.current.forEach((bar) => {
      if (bar) bar.style.height = `${MIN_BAR_HEIGHT_PX}px`;
    });
  };

  const drawVisualizer = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    barRefs.current.forEach((bar, index) => {
      if (!bar) return;
      const value = data[index % data.length] ?? 0;
      const height = MIN_BAR_HEIGHT_PX + (value / 255) * (MAX_BAR_HEIGHT_PX - MIN_BAR_HEIGHT_PX);
      bar.style.height = `${height}px`;
    });

    animationFrameRef.current = requestAnimationFrame(drawVisualizer);
  };

  const playNext = async () => {
    const turn = queueRef.current.shift();
    if (!turn) {
      isPlayingRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      resetBars();
      setNowPlaying(null);
      return;
    }

    isPlayingRef.current = true;
    setNowPlaying(turn.characterId);

    try {
      const { audioContext, analyser } = getAudioContext();
      const audioBuffer = await audioContext.decodeAudioData(turn.buffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
      source.onended = () => {
        void playNext();
      };
      source.start();
      drawVisualizer();
    } catch (error) {
      console.error("[AudioPlayer] failed to decode/play turn audio", error);
      void playNext();
    }
  };

  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      if (message.type === "audio_chunk") {
        if (message.chunk) {
          pendingChunksRef.current.push(base64ToUint8Array(message.chunk));
        }
      } else if (message.type === "audio_end") {
        const chunks = pendingChunksRef.current;
        pendingChunksRef.current = [];
        if (chunks.length > 0) {
          queueRef.current.push({
            characterId: message.character_id,
            buffer: concatUint8Arrays(chunks),
          });
          if (!isPlayingRef.current) void playNext();
        }
      }
    });
    return unsubscribe;
    // playNext reads queueRef/isPlayingRef directly, not a reactive dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage]);

  useEffect(() => {
    const audioContext = audioContextRef.current;
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      void audioContext?.close();
    };
  }, []);

  return (
    <div className="flex items-center gap-3 border-t border-zinc-800 bg-zinc-950/60 px-4 py-3">
      <div className="flex items-end gap-0.5 h-6">
        {Array.from({ length: BAR_COUNT }).map((_, index) => (
          <span
            key={index}
            ref={(el) => {
              barRefs.current[index] = el;
            }}
            className="w-1 rounded-sm bg-emerald-500"
            style={{ height: MIN_BAR_HEIGHT_PX, opacity: 0.8 }}
          />
        ))}
      </div>
      <span className="font-mono text-xs text-zinc-400">
        {nowPlaying ? `Playing: ${nowPlaying}` : "No audio yet"}
      </span>
    </div>
  );
}
