"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import type { ReactNode } from "react";
import { createSocket } from "../ws/createSocket";
import type { ClientMessage, ConnectionStatus, ServerMessage } from "../ws/types";
import { initialSceneState, sceneReducer } from "./sceneReducer";
import type { SceneState } from "./sceneReducer";

type SceneStateContextValue = {
  state: SceneState;
  connectionStatus: ConnectionStatus;
  send: (message: ClientMessage) => void;
  onMessage: (handler: (message: ServerMessage) => void) => () => void;
  // Called by AudioPlayer the moment a turn's line actually starts playing
  // (or immediately, if that turn has no audio) — moves the oldest queued
  // turn from pendingTurns into the visible transcript. See sceneReducer.ts.
  revealNextTurn: () => void;
};

const SceneStateContext = createContext<SceneStateContextValue | null>(null);

export function SceneStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sceneReducer, initialSceneState);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  // Lazy useState initializer, not a ref: it runs once during this
  // component's own render, before children mount — so the socket already
  // exists by the time a child's effect (e.g. AudioPlayer) subscribes via
  // onMessage. A ref would do the same timing but reading ref.current
  // during render is disallowed by the react-hooks/refs lint rule.
  const [socket] = useState(() => createSocket());

  useEffect(() => {
    const unsubscribeMessages = socket.onMessage(dispatch);
    const unsubscribeStatus = socket.onStatusChange(setConnectionStatus);

    return () => {
      // Unsubscribe only — deliberately does NOT close the socket. React
      // StrictMode mounts, cleans up, then remounts in development, but the
      // socket is created by a useState initializer that runs exactly once,
      // so closing it here would tear down the one connection this page has
      // and nothing would ever rebuild it — leaving every control disabled
      // until a full reload. One socket per page load, closed by the browser
      // when the page goes away.
      unsubscribeMessages();
      unsubscribeStatus();
    };
  }, [socket]);

  const send = useCallback(
    (message: ClientMessage) => {
      socket.send(message);
    },
    [socket]
  );

  const onMessage = useCallback(
    (handler: (message: ServerMessage) => void) => socket.onMessage(handler),
    [socket]
  );

  const revealNextTurn = useCallback(() => {
    dispatch({ type: "reveal_next_turn" });
  }, [dispatch]);

  const value = useMemo(
    () => ({ state, connectionStatus, send, onMessage, revealNextTurn }),
    [state, connectionStatus, send, onMessage, revealNextTurn]
  );

  return <SceneStateContext.Provider value={value}>{children}</SceneStateContext.Provider>;
}

export function useSceneState(): SceneStateContextValue {
  const context = useContext(SceneStateContext);
  if (!context) {
    throw new Error("useSceneState must be used within a SceneStateProvider");
  }
  return context;
}
