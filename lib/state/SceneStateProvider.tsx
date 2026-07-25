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
      unsubscribeMessages();
      unsubscribeStatus();
      socket.close();
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

  const value = useMemo(
    () => ({ state, connectionStatus, send, onMessage }),
    [state, connectionStatus, send, onMessage]
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
