import type { SocketHandle } from "./types";
import { createMockSocket } from "./mockClient";
import { createRealSocket } from "./client";

export function createSocket(): SocketHandle {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

  if (useMock) {
    return createMockSocket();
  }

  const url = process.env.NEXT_PUBLIC_WS_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_WS_URL must be set when NEXT_PUBLIC_USE_MOCK=false"
    );
  }
  return createRealSocket(url);
}
