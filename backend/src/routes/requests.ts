import { Router, type IRouter } from "express";
import { db } from "../db/index.js";
import { usersTable, requestsTable, conversationsTable, conversationSettingsTable } from "../db/index.js";
import { eq, and, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/auth.js";
import { SendRequestBody, UpdateRequestBody } from "../lib/validation.js";
import { getSocketServer } from "../lib/socketServer.js";

const router: IRouter = Router();

function formatUser(user: { id: string; userId: string; avatarUrl: string | null }) {
  return { id: user.id, userId: user.userId, avatarUrl: user.avatarUrl };
}

router.get("/requests", requireAuth, async (req, res): Promise<void> => {
  const myId = req.userDbId!;

  const allRequests = await db
    .select({
      request: requestsTable,
      fromUser: { id: usersTable.id, userId: usersTable.userId, avatarUrl: usersTable.avatarUrl },
    })
    .from(requestsTable)
    .leftJoin(usersTable, eq(requestsTable.fromUserId, usersTable.id))
    .where(or(eq(requestsTable.fromUserId, myId), eq(requestsTable.toUserId, myId)));

  const toUserIds = [...new Set(allRequests.map(r => r.request.toUserId))];
  const toUsers = toUserIds.length > 0
    ? await db.select({ id: usersTable.id, userId: usersTable.userId, avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(or(...toUserIds.map(id => eq(usersTable.id, id))))
    : [];

  const toUserMap = Object.fromEntries(toUsers.map(u => [u.id, u]));

  const sent = allRequests
    .filter(r => r.request.fromUserId === myId)
    .map(r => ({
      id: r.request.id,
      fromUserId: r.request.fromUserId,
      fromUser: r.fromUser ? formatUser(r.fromUser) : null,
      toUserId: r.request.toUserId,
      toUser: toUserMap[r.request.toUserId] ? formatUser(toUserMap[r.request.toUserId]) : null,
      status: r.request.status,
      createdAt: r.request.createdAt.toISOString(),
    }));

  const received = allRequests
    .filter(r => r.request.toUserId === myId)
    .map(r => ({
      id: r.request.id,
      fromUserId: r.request.fromUserId,
      fromUser: r.fromUser ? formatUser(r.fromUser) : null,
      toUserId: r.request.toUserId,
      toUser: toUserMap[r.request.toUserId] ? formatUser(toUserMap[r.request.toUserId]) : null,
      status: r.request.status,
      createdAt: r.request.createdAt.toISOString(),
    }));

  res.json({ sent, received });
});

router.post("/requests", requireAuth, async (req, res): Promise<void> => {
  const parsed = SendRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const myId = req.userDbId!;
  const { targetUserId } = parsed.data;

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.userId, targetUserId)).limit(1);
  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (targetUser.id === myId) {
    res.status(400).json({ error: "Cannot send request to yourself" });
    return;
  }

  const existing = await db.select().from(requestsTable)
    .where(and(
      or(
        and(eq(requestsTable.fromUserId, myId), eq(requestsTable.toUserId, targetUser.id)),
        and(eq(requestsTable.fromUserId, targetUser.id), eq(requestsTable.toUserId, myId)),
      ),
    )).limit(1);

  if (existing.length > 0 && existing[0].status === "pending") {
    res.status(400).json({ error: "Request already pending" });
    return;
  }

  const existingConv = await db.select().from(conversationsTable)
    .where(or(
      and(eq(conversationsTable.user1Id, myId), eq(conversationsTable.user2Id, targetUser.id)),
      and(eq(conversationsTable.user1Id, targetUser.id), eq(conversationsTable.user2Id, myId)),
    )).limit(1);

  if (existingConv.length > 0) {
    res.status(400).json({ error: "Already connected with this user" });
    return;
  }

  const [myUser] = await db.select().from(usersTable).where(eq(usersTable.id, myId)).limit(1);

  const id = generateId();
  const [request] = await db.insert(requestsTable).values({
    id, fromUserId: myId, toUserId: targetUser.id, status: "pending",
  }).returning();

  const io = getSocketServer();
  if (io) {
    io.to(`user:${targetUser.id}`).emit("request", {
      request: {
        id: request.id,
        fromUserId: request.fromUserId,
        fromUser: myUser ? formatUser(myUser) : null,
        toUserId: request.toUserId,
        toUser: formatUser(targetUser),
        status: request.status,
        createdAt: request.createdAt.toISOString(),
      },
    });
  }

  res.status(201).json({
    id: request.id,
    fromUserId: request.fromUserId,
    fromUser: myUser ? formatUser(myUser) : null,
    toUserId: request.toUserId,
    toUser: formatUser(targetUser),
    status: request.status,
    createdAt: request.createdAt.toISOString(),
  });
});

router.patch("/requests/:requestId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.requestId) ? req.params.requestId[0] : req.params.requestId;
  const parsed = UpdateRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const myId = req.userDbId!;
  const { action } = parsed.data;

  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, raw)).limit(1);
  if (!request || request.toUserId !== myId) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  const newStatus = action === "accept" ? "accepted" : "declined";
  const [updated] = await db.update(requestsTable).set({ status: newStatus }).where(eq(requestsTable.id, raw)).returning();

  if (action === "accept") {
    const convId = generateId();
    const [conv] = await db.insert(conversationsTable).values({
      id: convId, user1Id: request.fromUserId, user2Id: request.toUserId,
    }).returning();

    const settingsId1 = generateId();
    const settingsId2 = generateId();
    await db.insert(conversationSettingsTable).values([
      { id: settingsId1, conversationId: convId, userId: request.fromUserId },
      { id: settingsId2, conversationId: convId, userId: request.toUserId },
    ]);

    const [fromUser] = await db.select().from(usersTable).where(eq(usersTable.id, request.fromUserId)).limit(1);
    const [toUser] = await db.select().from(usersTable).where(eq(usersTable.id, request.toUserId)).limit(1);

    const io = getSocketServer();
    if (io && fromUser && toUser) {
      const convData = {
        id: conv.id,
        otherUser: formatUser(toUser),
        unreadCount: 0,
        isPinned: false,
        isMuted: false,
        isArchived: false,
        isBlocked: false,
        otherUserOnline: false,
        createdAt: conv.createdAt.toISOString(),
      };
      const convDataForReceiver = {
        id: conv.id,
        otherUser: formatUser(fromUser),
        unreadCount: 0,
        isPinned: false,
        isMuted: false,
        isArchived: false,
        isBlocked: false,
        otherUserOnline: false,
        createdAt: conv.createdAt.toISOString(),
      };
      io.to(`user:${request.fromUserId}`).emit("request_accepted", { conversationId: conv.id, conversation: convData });
      io.to(`user:${request.toUserId}`).emit("request_accepted", { conversationId: conv.id, conversation: convDataForReceiver });
    }
  }

  const [fromUser] = await db.select().from(usersTable).where(eq(usersTable.id, updated.fromUserId)).limit(1);
  const [toUser] = await db.select().from(usersTable).where(eq(usersTable.id, updated.toUserId)).limit(1);

  res.json({
    id: updated.id,
    fromUserId: updated.fromUserId,
    fromUser: fromUser ? formatUser(fromUser) : null,
    toUserId: updated.toUserId,
    toUser: toUser ? formatUser(toUser) : null,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/requests/:requestId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.requestId) ? req.params.requestId[0] : req.params.requestId;
  const myId = req.userDbId!;

  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, raw)).limit(1);
  if (!request || request.fromUserId !== myId) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  await db.update(requestsTable).set({ status: "cancelled" }).where(eq(requestsTable.id, raw));
  res.sendStatus(204);
});

export default router;
