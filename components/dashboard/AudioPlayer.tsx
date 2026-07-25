"use client";

import { useEffect, useRef, useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";
import type { AudioChunkMessage } from "@/lib/ws/types";

const BAR_COUNT = 12;
const MIN_BAR_HEIGHT_PX = 4;
const MAX_BAR_HEIGHT_PX = 24;

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function AudioPlayer() {
  const { state } = useSceneState();
  const [nowPlaying, setNowPlaying] = useState<AudioChunkMessage | null>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const queueRef = useRef<AudioChunkMessage[]>([]);
  const isPlayingRef = useRef(false);
  const processedLengthRef = useRef(0);
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
    const chunk = queueRef.current.shift();
    if (!chunk) {
      isPlayingRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      resetBars();
      return;
    }

    if (!chunk.chunk) {
      // No real audio bytes (e.g. the in-browser mock) — skip to the next chunk.
      void playNext();
      return;
    }

    isPlayingRef.current = true;
    setNowPlaying(chunk);

    try {
      const { audioContext, analyser } = getAudioContext();
      const arrayBuffer = base64ToArrayBuffer(chunk.chunk);
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
      source.onended = () => {
        void playNext();
      };
      source.start();
      drawVisualizer();
    } catch (error) {
      console.error("[AudioPlayer] failed to decode/play audio chunk", error);
      void playNext();
    }
  };

  useEffect(() => {
    const newChunks = state.audioQueue.slice(processedLengthRef.current);
    processedLengthRef.current = state.audioQueue.length;
    if (newChunks.length === 0) return;

    queueRef.current.push(...newChunks);
    if (!isPlayingRef.current) {
      void playNext();
    }
    // playNext reads queueRef/isPlayingRef directly, not a reactive dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.audioQueue]);

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
        {nowPlaying
          ? `Playing: ${nowPlaying.character_id} (chunk #${nowPlaying.sequence})`
          : "No audio yet"}
      </span>
    </div>
  );
}
