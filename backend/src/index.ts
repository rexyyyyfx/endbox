import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { verifyToken } from "./lib/auth.js";
import { setSocketServer } from "./lib/socketServer.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  path: "/api/socket.io",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setSocketServer(io);

const onlineUsers = new Map<string, string>();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    next(new Error("Unauthorized"));
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    next(new Error("Invalid token"));
    return;
  }

  socket.data.userId = payload.id;
  socket.data.userPublicId = payload.userId;
  next();
});

io.on("connection", (socket) => {
  const userId = socket.data.userId as string;
  logger.info({ userId }, "Socket connected");

  socket.join(`user:${userId}`);
  onlineUsers.set(userId, socket.id);

  io.emit("presence", { userId, online: true });

  socket.on("join", ({ conversationId }: { conversationId: string }) => {
    socket.join(`conversation:${conversationId}`);
  });

  socket.on("leave", ({ conversationId }: { conversationId: string }) => {
    socket.leave(`conversation:${conversationId}`);
  });

  socket.on("typing", ({ conversationId }: { conversationId: string }) => {
    socket.to(`conversation:${conversationId}`).emit("typing", { conversationId, userId });
  });

  socket.on("read", ({ conversationId }: { conversationId: string }) => {
    socket.to(`conversation:${conversationId}`).emit("read", { conversationId, userId });
  });

  socket.on("disconnect", () => {
    logger.info({ userId }, "Socket disconnected");
    onlineUsers.delete(userId);
    io.emit("presence", { userId, online: false });
  });
});

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
});
