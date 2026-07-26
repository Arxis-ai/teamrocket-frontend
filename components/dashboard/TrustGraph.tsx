"use client";

import { useEffect, useRef, useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";
import { characterTier, sameBatch } from "@/lib/state/characterTier";

const FLOAT_DURATION_MS = 1200;
const SPEECH_BUBBLE_DURATION_MS = 6000;
const SPEECH_BUBBLE_MAX_CHARS = 60;

const TIER_STYLE: Record<string, { fill: string; stroke: string; text: string; radius: number }> = {
  focused: { fill: "#052e2b", stroke: "#10b981", text: "#d1fae5", radius: 22 },
  active: { fill: "#082032", stroke: "#0ea5e9", text: "#bae6fd", radius: 18 },
  off: { fill: "#18181b", stroke: "#3f3f46", text: "#71717a", radius: 16 },
};

function angleForIndex(index: number, total: number) {
  return (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 3)}...` : text;
}

type FloatingNumber = {
  id: string;
  target: string;
  change: number;
};

type SpeechBubble = {
  id: string;
  text: string;
};

export function TrustGraph() {
  const { state } = useSceneState();
  const [floatingNumbers, setFloatingNumbers] = useState<FloatingNumber[]>([]);
  const [speechBubbles, setSpeechBubbles] = useState<Record<string, SpeechBubble>>({});
  const processedTranscriptLengthRef = useRef(0);
  const bubbleTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Whoever we're currently listening to — used to drop a bubble the moment
  // its speaker is traded out of the watched conversation.
  const focusedLineUp = (state.focusedBatchId ? state.batches[state.focusedBatchId] : undefined) ?? [];

  useEffect(() => {
    // transcript is cleared to [] on a real focus switch (see sceneReducer's
    // focus_changed case) — without this, the ref would stay stuck above
    // the new (shorter) array's length and silently stop picking up any
    // new turns until it grew back past the old high-water mark.
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

      // A hovering text box above whoever's speaking — applies to every
      // batch's turns (not just the focused one), matching the existing
      // pattern where text is always visible and only audio is focus-gated.
      const bubbleId = `${turn.character_id}-${Date.now()}-${Math.random()}`;
      setSpeechBubbles((prev) => ({
        ...prev,
        [turn.character_id]: {
          id: bubbleId,
          text: truncate(turn.public_dialogue, SPEECH_BUBBLE_MAX_CHARS),
        },
      }));
      const existingTimer = bubbleTimersRef.current[turn.character_id];
      if (existingTimer) clearTimeout(existingTimer);
      bubbleTimersRef.current[turn.character_id] = setTimeout(() => {
        setSpeechBubbles((prev) => {
          if (prev[turn.character_id]?.id !== bubbleId) return prev; // superseded by a newer line
          const next = { ...prev };
          delete next[turn.character_id];
          return next;
        });
        delete bubbleTimersRef.current[turn.character_id];
      }, SPEECH_BUBBLE_DURATION_MS);
    });
  }, [state.transcript]);

  useEffect(() => {
    const timers = bubbleTimersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);


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
    // Only draw a line between two characters who are actually in the same
    // conversation right now — trust values themselves stay global/always
    // tracked, this just controls which pairs get a visible edge. Works
    // the same regardless of how many characters end up in a batch.
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
        {edges.map((edge) => (
          <line
            key={`${edge.fromId}-${edge.toId}`}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke={edge.value >= 50 ? "#10b981" : "#ef4444"}
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
        ))}
        {positions.map(({ characterId, x, y }) => {
          const tier = characterTier(characterId, state.batches, state.focusedBatchId);
          const style = TIER_STYLE[tier];
          return (
            <g key={characterId}>
              <circle
                cx={x}
                cy={y}
                r={style.radius}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={tier === "off" ? 1 : 2.5}
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize={10}
                fill={style.text}
                fontFamily="monospace"
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
              fontFamily="monospace"
              fontWeight="bold"
              fill={entry.change >= 0 ? "#34d399" : "#f87171"}
              style={{ animation: `float-up-fade ${FLOAT_DURATION_MS}ms ease-out forwards` }}
            >
              {entry.change >= 0 ? `+${entry.change}` : entry.change}
            </text>
          );
        })}
        {positions.map(({ characterId, x, y }) => {
          const bubble = speechBubbles[characterId];
          // Drop it the moment this speaker is no longer in the watched
          // conversation, rather than waiting out the remainder of its own
          // 6s timer — that lag is what left a just-left batch's text stuck
          // on the graph after switching, and it covers someone traded away
          // mid-scene too. Checked per character so one person leaving
          // doesn't blank out everyone else's bubble.
          if (!bubble || !focusedLineUp.includes(characterId)) return null;
          const style = TIER_STYLE[characterTier(characterId, state.batches, state.focusedBatchId)];
          const bubbleWidth = 100;
          const bubbleHeight = 30;
          // Clamped rather than always-above: nodes near the top of the
          // circle would otherwise push the bubble off the viewBox.
          const bubbleY = Math.max(2, y - style.radius - bubbleHeight - 6);
          return (
            <foreignObject
              key={bubble.id}
              x={x - bubbleWidth / 2}
              y={bubbleY}
              width={bubbleWidth}
              height={bubbleHeight}
            >
              <div
                className="flex h-full items-center justify-center rounded border px-1.5 text-center font-mono leading-tight"
                style={{
                  fontSize: "8px",
                  color: "#f4f4f5",
                  backgroundColor: "rgba(9,9,11,0.9)",
                  borderColor: style.stroke,
                }}
              >
                {bubble.text}
              </div>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}
