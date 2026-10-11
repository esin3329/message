import { io, type Socket } from "socket.io-client";
import type {
  ChatMessage,
  ClientToServerEvents,
  ServerToClientEvents,
} from "@repo/api/socket-types";
import { markSocketActive } from "./socketLifecycle";

const apiOrigin = "http://localhost:3000";
type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type SocketListener = (socket: AppSocket) => void;
let socket: AppSocket | null = null;
const listeners = new Set<SocketListener>();

export function connectSocket(token: string): AppSocket {
  markSocketActive(true);
  if (socket) {
    const auth = socket.auth;
    if (typeof auth === "object" && auth !== null && "token" in auth)
      auth.token = token;
    socket.connect();
    return socket;
  }
  const created = io(apiOrigin, {
    withCredentials: true,
    auth: { token },
    reconnection: true,
  }) as AppSocket;
  socket = created;
  created.on("connect", () => {
    for (const listener of listeners) listener(created);
  });
  // The server disconnects the socket when the handshaken access token expires. By then a refresh
  // has already stored the replacement token in auth, so re-handshake immediately instead of
  // waiting for the next scheduled refresh (a revoked session simply fails the new handshake).
  created.on("disconnect", (reason) => {
    if (reason === "io server disconnect" && socket === created)
      created.connect();
  });
  return created;
}

export function getSocket(): AppSocket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  markSocketActive(false);
}

export function onSocketConnect(listener: SocketListener): () => void {
  listeners.add(listener);
  if (socket?.connected) listener(socket);
  return () => {
    listeners.delete(listener);
  };
}

export function onNewMessage(
  listener: (message: ChatMessage) => void,
): () => void {
  let attached: AppSocket | null = null;
  const unsubscribe = onSocketConnect((connected) => {
    // The same socket object is reused across reconnects, so attach only once per socket
    // instead of accumulating a duplicate listener on every connect event.
    if (attached === connected) return;
    attached?.off("message:new", listener);
    attached = connected;
    attached.on("message:new", listener);
  });
  return () => {
    unsubscribe();
    attached?.off("message:new", listener);
    attached = null;
  };
}
