"use client";

import { createContext, useContext, useEffect, useReducer, useRef } from "react";
import type { ReactNode } from "react";
import { createSocket } from "../ws/createSocket";
import type { ClientMessage, SocketHandle } from "../ws/types";
import { initialSceneState, sceneReducer } from "./sceneReducer";
import type { SceneState } from "./sceneReducer";

type SceneStateContextValue = {
  state: SceneState;
  send: (message: ClientMessage) => void;
  sendAudio: (chunk: ArrayBuffer) => void;
};

const SceneStateContext = createContext<SceneStateContextValue | null>(null);

export function SceneStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sceneReducer, initialSceneState);
  const socketRef = useRef<SocketHandle | null>(null);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;
    const unsubscribe = socket.onMessage(dispatch);

    return () => {
      unsubscribe();
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const send = (message: ClientMessage) => {
    socketRef.current?.send(message);
  };

  const sendAudio = (chunk: ArrayBuffer) => {
    socketRef.current?.sendAudio(chunk);
  };

  return (
    <SceneStateContext.Provider value={{ state, send, sendAudio }}>
      {children}
    </SceneStateContext.Provider>
  );
}

export function useSceneState(): SceneStateContextValue {
  const context = useContext(SceneStateContext);
  if (!context) {
    throw new Error("useSceneState must be used within a SceneStateProvider");
  }
  return context;
}
