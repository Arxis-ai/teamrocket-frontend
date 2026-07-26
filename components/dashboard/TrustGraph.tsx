"use client";

import { useEffect, useRef, useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";
import { characterTier, sameBatch } from "@/lib/state/characterTier";

const FLOAT_DURATION_MS = 1200;

// Speaking highlight fades out after this many ms of silence
const SPEAKING_FADE_MS = 4000;

const TIER_STYLE: Record<string, { fill: string; stroke: string; text: string; radius: number; bubbleBorder: string }> = {
  focused: { fill: "#7c3aed", stroke: "#6d28d9", text: "#ffffff", radius: 23, bubbleBorder: "#7c3aed" },
  active:  { fill: "#ede9fe", stroke: "#a78bfa", text: "#5b21b6", radius: 19, bubbleBorder: "#a78bfa" },
  off:     { fill: "#f8fafc", stroke: "#e2e8f0", text: "#94a3b8", radius: 16, bubbleBorder: "#e2e8f0" },
};

function angleForIndex(index: number, total: number) {
  return (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
}

type FloatingNumber = {
  id: string;
  target: string;
  change: number;
};

export function TrustGraph() {
  const { state, onMessage } = useSceneState();
  const [floatingNumbers, setFloatingNumbers] = useState<FloatingNumber[]>([]);
  // The character_id of whoever spoke most recently — cleared after SPEAKING_FADE_MS
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const processedTranscriptLengthRef = useRef(0);
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // transcript is cleared to [] on a real focus switch (see sceneReducer's
    // focus_changed case) — without this, the ref would stay stuck above
    // the new (shorter) array's length and silently stop picking up new turns.
    if (state.transcript.length < processedTranscriptLengthRef.current) {
      processedTranscriptLengthRef.current = 0;
    }
    const newTurns = state.transcript.slice(processedTranscriptLengthRef.current);
    processedTranscriptLengthRef.current = state.transcript.length;

    newTurns.forEach((turn) => {
      if (turn.trust_delta) {
        const id = `${turn.trust_delta.target}-${Date.now()}-${Math.random()}`;
        setFloatingNumbers((prev) => [
          ...prev,
          { id, target: turn.trust_delta!.target, change: turn.trust_delta!.change },
        ]);
        setTimeout(() => {
          setFloatingNumbers((prev) => prev.filter((entry) => entry.id !== id));
        }, FLOAT_DURATION_MS);
      }

      // Highlight the speaking node — replaces the old speech bubble approach.
      setSpeakingId(turn.character_id);
      if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = setTimeout(() => {
        setSpeakingId(null);
      }, SPEAKING_FADE_MS);
    });
  }, [state.transcript]);

  useEffect(() => {
    const timer = speakingTimerRef.current;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    // Clear speaking highlight immediately on a real focus switch.
    const unsubscribe = onMessage((message) => {
      if (message.type === "focus_changed") {
        if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
        setSpeakingId(null);
        setFloatingNumbers([]);
      }
    });
    return unsubscribe;
  }, [onMessage]);

  const characters =
    state.characters.length > 0
      ? state.characters.map((character) => character.id)
      : [...Object.values(state.batches).flat(), ...state.offScreen];

  const radius = 120;
  const center = 150;

  const positions = characters.map((characterId, index) => {
    const angle = angleForIndex(index, characters.length);
    return {
      characterId,
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  });

  const edges = Object.entries(state.trustMatrix)
    .flatMap(([fromId, targets]) =>
      Object.entries(targets).map(([toId, value]) => ({ fromId, toId, value }))
    )
    .filter((edge) => sameBatch(edge.fromId, edge.toId, state.batches))
    .map((edge) => {
      const from = positions.find((p) => p.characterId === edge.fromId);
      const to = positions.find((p) => p.characterId === edge.toId);
      if (!from || !to) return null;
      return { ...edge, from, to };
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null);

  return (
    <div className="flex h-full items-center justify-center p-4">
      <svg viewBox="0 0 300 300" className="h-full max-h-[320px] w-full max-w-[320px]">
        {/* Ambient glow filter for the speaking node */}
        <defs>
          <filter id="speaking-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Soft drop shadow so nodes lift off the light card surface */}
          <filter id="node-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#4c1d95" floodOpacity="0.18" />
          </filter>
        </defs>

        {edges.map((edge) => (
          <line
            key={`${edge.fromId}-${edge.toId}`}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke={edge.value >= 50 ? "#10b981" : "#f43f5e"}
            strokeWidth={2}
            strokeOpacity={0.45}
            strokeLinecap="round"
          />
        ))}

        {positions.map(({ characterId, x, y }) => {
          const tier = characterTier(characterId, state.batches, state.focusedBatchId);
          const style = TIER_STYLE[tier];
          const isSpeaking = characterId === speakingId;

          return (
            <g key={characterId}>
              {/* Outer pulse ring — only shown for the currently speaking node */}
              {isSpeaking && (
                <circle
                  cx={x}
                  cy={y}
                  r={style.radius + 7}
                  fill="none"
                  stroke="#d946ef"
                  strokeWidth={2.5}
                  strokeOpacity={0.75}
                  style={{ animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite" }}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={style.radius}
                fill={isSpeaking ? "#d946ef" : style.fill}
                stroke={isSpeaking ? "#a21caf" : style.stroke}
                strokeWidth={isSpeaking ? 3 : tier === "off" ? 1.5 : 2.5}
                filter={isSpeaking ? "url(#speaking-glow)" : "url(#node-shadow)"}
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize={10}
                fill={isSpeaking ? "#ffffff" : style.text}
                fontFamily="var(--font-jetbrains), monospace"
                fontWeight="bold"
                letterSpacing="0.5"
              >
                {characterId.slice(0, 4).toUpperCase()}
              </text>
            </g>
          );
        })}

        {floatingNumbers.map((entry) => {
          const position = positions.find((p) => p.characterId === entry.target);
          if (!position) return null;
          return (
            <text
              key={entry.id}
              x={position.x}
              y={position.y - 26}
              textAnchor="middle"
              fontSize={13}
              fontFamily="var(--font-jetbrains), monospace"
              fontWeight="bold"
              fill={entry.change >= 0 ? "#059669" : "#e11d48"}
              style={{ animation: `float-up-fade ${FLOAT_DURATION_MS}ms ease-out forwards` }}
            >
              {entry.change >= 0 ? `+${entry.change}` : entry.change}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
