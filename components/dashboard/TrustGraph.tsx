"use client";

import { useEffect, useRef, useState } from "react";
import { useSceneState } from "@/lib/state/SceneStateProvider";

const FLOAT_DURATION_MS = 1200;

function angleForIndex(index: number, total: number) {
  return (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
}

type FloatingNumber = {
  id: string;
  target: string;
  change: number;
};

export function TrustGraph() {
  const { state } = useSceneState();
  const [floatingNumbers, setFloatingNumbers] = useState<FloatingNumber[]>([]);
  const processedTranscriptLengthRef = useRef(0);

  useEffect(() => {
    const newTurns = state.transcript.slice(processedTranscriptLengthRef.current);
    processedTranscriptLengthRef.current = state.transcript.length;

    newTurns.forEach((turn) => {
      if (!turn.trust_delta) return;
      const id = `${turn.trust_delta.target}-${Date.now()}-${Math.random()}`;
      setFloatingNumbers((prev) => [
        ...prev,
        { id, target: turn.trust_delta!.target, change: turn.trust_delta!.change },
      ]);
      setTimeout(() => {
        setFloatingNumbers((prev) => prev.filter((entry) => entry.id !== id));
      }, FLOAT_DURATION_MS);
    });
  }, [state.transcript]);

  const characters = [...state.activeParticipants, ...state.offScreenParticipants];

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
    .map(([key, value]) => {
      const [fromId, toId] = key.split("-");
      const from = positions.find((p) => p.characterId === fromId);
      const to = positions.find((p) => p.characterId === toId);
      if (!from || !to) return null;
      return { fromId, toId, from, to, value };
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
          const isActive = state.activeParticipants.includes(characterId);
          return (
            <g key={characterId}>
              <circle
                cx={x}
                cy={y}
                r={isActive ? 22 : 16}
                fill={isActive ? "#052e2b" : "#18181b"}
                stroke={isActive ? "#10b981" : "#3f3f46"}
                strokeWidth={isActive ? 2.5 : 1}
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize={10}
                fill={isActive ? "#d1fae5" : "#71717a"}
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
      </svg>
    </div>
  );
}
