import type { ClientMessage, ServerMessage, SocketHandle } from "./types";

export function createRealSocket(url: string): SocketHandle {
  const handlers = new Set<(message: ServerMessage) => void>();
  const socket = new WebSocket(url);

  socket.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(event.data) as ServerMessage;
      handlers.forEach((handler) => handler(parsed));
    } catch (error) {
      console.error("[client] failed to parse server message", error, event.data);
    }
  });

  return {
    send(message: ClientMessage) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      handlers.clear();
      socket.close();
    },
  };
}
