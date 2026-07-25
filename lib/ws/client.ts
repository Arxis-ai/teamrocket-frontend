import type {
  ClientMessage,
  ConnectionStatus,
  ServerMessage,
  SocketHandle,
} from "./types";

export function createRealSocket(url: string): SocketHandle {
  const messageHandlers = new Set<(message: ServerMessage) => void>();
  const statusHandlers = new Set<(status: ConnectionStatus) => void>();
  const socket = new WebSocket(url);

  const setStatus = (status: ConnectionStatus) => {
    statusHandlers.forEach((handler) => handler(status));
  };

  socket.addEventListener("open", () => setStatus("open"));
  socket.addEventListener("close", () => setStatus("closed"));
  socket.addEventListener("error", () => setStatus("closed"));

  socket.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(event.data) as ServerMessage;
      messageHandlers.forEach((handler) => handler(parsed));
    } catch (error) {
      console.error("[client] failed to parse server message", error, event.data);
    }
  });

  return {
    send(message: ClientMessage) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      } else {
        console.warn("[client] dropped message, socket not open", message);
      }
    },
    onMessage(handler) {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onStatusChange(handler) {
      statusHandlers.add(handler);
      handler(
        socket.readyState === WebSocket.OPEN
          ? "open"
          : socket.readyState === WebSocket.CONNECTING
            ? "connecting"
            : "closed"
      );
      return () => statusHandlers.delete(handler);
    },
    close() {
      messageHandlers.clear();
      statusHandlers.clear();
      socket.close();
    },
  };
}
