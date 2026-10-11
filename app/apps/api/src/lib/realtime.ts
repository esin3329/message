import type { Server } from "socket.io";

let currentServer: Server | undefined;

export function setRealtimeServer(server: Server | undefined): void {
  currentServer = server;
}

export function getRealtimeServer(): Server | undefined {
  return currentServer;
}
