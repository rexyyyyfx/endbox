import type { Server } from "socket.io";

let ioInstance: Server | null = null;

export function setSocketServer(io: Server): void {
  ioInstance = io;
}

export function getSocketServer(): Server | null {
  return ioInstance;
}
