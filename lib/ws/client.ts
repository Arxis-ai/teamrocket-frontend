import type {
  ClientMessage,
  ConnectionStatus,
  ServerMessage,
  SocketHandle,
} from "./types";

// Backoff between reconnect attempts. The backend being restarted mid-session
// is completely routine during development, and without reconnection the
// dashboard stays dead — every control is gated on connectionStatus, so a
// single dropped socket left Start disabled until a full page reload.
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000];
const MAX_RECONNECT_DELAY_MS = 10000;

export function createRealSocket(url: string): SocketHandle {
  // Handler sets live outside any one WebSocket so subscriptions survive a
  // reconnect — subscribers register once and must keep working afterwards.
  const messageHandlers = new Set<(message: ServerMessage) => void>();
  const statusHandlers = new Set<(status: ConnectionStatus) => void>();

  let socket: WebSocket | null = null;
  let status: ConnectionStatus = "connecting";
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const setStatus = (next: ConnectionStatus) => {
    status = next;
    statusHandlers.forEach((handler) => handler(next));
  };

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]
      ?? MAX_RECONNECT_DELAY_MS;
    attempt += 1;
    console.warn(`[client] socket closed — reconnecting in ${delay}ms (attempt ${attempt})`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  function connect() {
    if (disposed) return;
    setStatus("connecting");
    const next = new WebSocket(url);
    socket = next;

    next.addEventListener("open", () => {
      if (disposed) {
        next.close();
        return;
      }
      attempt = 0;
      console.log("[client] socket open");
      setStatus("open");
    });

    next.addEventListener("close", () => {
      // Only the currently-live socket may drive state; a late event from a
      // superseded one must not clobber a newer connection's status.
      if (disposed || socket !== next) return;
      setStatus("closed");
      scheduleReconnect();
    });

    next.addEventListener("error", () => {
      // 'error' is always followed by 'close', which is what triggers the
      // retry — closing here as well would double-schedule it.
      if (socket === next) console.warn("[client] socket error");
    });

    next.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(event.data) as ServerMessage;
        messageHandlers.forEach((handler) => handler(parsed));
      } catch (error) {
        console.error("[client] failed to parse server message", error, event.data);
      }
    });
  }

  connect();

  return {
    send(message: ClientMessage) {
      if (socket && socket.readyState === WebSocket.OPEN) {
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
      handler(status);
      return () => statusHandlers.delete(handler);
    },
    close() {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      messageHandlers.clear();
      statusHandlers.clear();
      socket?.close();
    },
  };
}
