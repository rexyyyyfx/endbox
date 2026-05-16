import { Router, type IRouter } from "express";
import { db } from "../db/index.js";
import { conversationsTable, conversationSettingsTable, messagesTable } from "../db/index.js";
import { eq, and, or, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { SendMessageBody, EditMessageBody } from "../lib/validation.js";
import { generateId } from "../lib/auth.js";
import { getSocketServer } from "../lib/socketServer.js";

const router: IRouter = Router();

function formatMessage(m: typeof messagesTable.$inferSelect) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    type: m.type,
    encryptedContent: m.isDeleted ? null : m.encryptedContent,
    iv: m.isDeleted ? null : m.iv,
    attachmentUrl: m.isDeleted ? null : m.attachmentUrl,
    attachmentName: m.isDeleted ? null : m.attachmentName,
    attachmentSize: m.isDeleted ? null : m.attachmentSize,
    replyToId: m.replyToId,
    isEdited: m.isEdited,
    isDeleted: m.isDeleted,
    isRead: m.isRead,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
  };
}

router.get("/conversations/:conversationId/messages", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const myId = req.userDbId!;

  const [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.id, raw),
      or(eq(conversationsTable.user1Id, myId), eq(conversationsTable.user2Id, myId)),
    )).limit(1);

  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const messages = await db.select().from(messagesTable)
    .where(and(
      eq(messagesTable.conversationId, raw),
      eq(messagesTable.deletedForAll, false),
    ))
    .orderBy(desc(messagesTable.createdAt))
    .limit(50);

  const withReplies = await Promise.all(messages.map(async (m) => {
    let replyTo = null;
    if (m.replyToId) {
      const [reply] = await db.select().from(messagesTable).where(eq(messagesTable.id, m.replyToId)).limit(1);
      if (reply) replyTo = formatMessage(reply);
    }
    return { ...formatMessage(m), replyTo };
  }));

  res.json({ messages: withReplies.reverse(), hasMore: messages.length === 50, nextCursor: null });
});

router.post("/conversations/:conversationId/messages", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const myId = req.userDbId!;

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.id, raw),
      or(eq(conversationsTable.user1Id, myId), eq(conversationsTable.user2Id, myId)),
    )).limit(1);

  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const id = generateId();
  const { type, encryptedContent, iv, attachmentUrl, attachmentName, attachmentSize, replyToId } = parsed.data;

  const [message] = await db.insert(messagesTable).values({
    id,
    conversationId: raw,
    senderId: myId,
    type,
    encryptedContent: encryptedContent ?? null,
    iv: iv ?? null,
    attachmentUrl: attachmentUrl ?? null,
    attachmentName: attachmentName ?? null,
    attachmentSize: attachmentSize ?? null,
    replyToId: replyToId ?? null,
    isEdited: false,
    isDeleted: false,
    deletedForAll: false,
    isRead: false,
  }).returning();

  const otherId = conv.user1Id === myId ? conv.user2Id : conv.user1Id;

  await db.update(conversationSettingsTable)
    .set({ unreadCount: "1" })
    .where(and(
      eq(conversationSettingsTable.conversationId, raw),
      eq(conversationSettingsTable.userId, otherId),
    ));

  const formatted = formatMessage(message);

  const io = getSocketServer();
  if (io) {
    io.to(`conversation:${raw}`).emit("message", { conversationId: raw, message: formatted });
    io.to(`user:${otherId}`).emit("message", { conversationId: raw, message: formatted });
  }

  res.status(201).json(formatted);
});

router.patch("/conversations/:conversationId/messages/:messageId", requireAuth, async (req, res): Promise<void> => {
  const convId = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const msgId = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
  const myId = req.userDbId!;

  const parsed = EditMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [message] = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.id, msgId), eq(messagesTable.senderId, myId))).limit(1);

  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  const [updated] = await db.update(messagesTable)
    .set({ encryptedContent: parsed.data.encryptedContent, iv: parsed.data.iv, isEdited: true, editedAt: new Date() })
    .where(eq(messagesTable.id, msgId))
    .returning();

  const formatted = formatMessage(updated);

  const io = getSocketServer();
  if (io) {
    io.to(`conversation:${convId}`).emit("message_edited", { conversationId: convId, message: formatted });
  }

  res.json(formatted);
});

router.delete("/conversations/:conversationId/messages/:messageId", requireAuth, async (req, res): Promise<void> => {
  const msgId = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
  const myId = req.userDbId!;

  const [message] = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.id, msgId), eq(messagesTable.senderId, myId))).limit(1);

  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  await db.update(messagesTable).set({ isDeleted: true }).where(eq(messagesTable.id, msgId));
  res.sendStatus(204);
});

router.delete("/conversations/:conversationId/messages/:messageId/everyone", requireAuth, async (req, res): Promise<void> => {
  const convId = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const msgId = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
  const myId = req.userDbId!;

  const [message] = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.id, msgId), eq(messagesTable.senderId, myId))).limit(1);

  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  await db.update(messagesTable)
    .set({ isDeleted: true, deletedForAll: true, encryptedContent: null, iv: null })
    .where(eq(messagesTable.id, msgId));

  const io = getSocketServer();
  if (io) {
    io.to(`conversation:${convId}`).emit("message_deleted", { conversationId: convId, messageId: msgId });
  }

  res.sendStatus(204);
});

router.post("/conversations/:conversationId/read", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const myId = req.userDbId!;

  const [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.id, raw),
      or(eq(conversationsTable.user1Id, myId), eq(conversationsTable.user2Id, myId)),
    )).limit(1);

  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.update(messagesTable)
    .set({ isRead: true })
    .where(and(
      eq(messagesTable.conversationId, raw),
      eq(messagesTable.isRead, false),
    ));

  await db.update(conversationSettingsTable)
    .set({ unreadCount: "0", lastReadAt: new Date() })
    .where(and(
      eq(conversationSettingsTable.conversationId, raw),
      eq(conversationSettingsTable.userId, myId),
    ));

  const otherId = conv.user1Id === myId ? conv.user2Id : conv.user1Id;
  const io = getSocketServer();
  if (io) {
    io.to(`user:${otherId}`).emit("read", { conversationId: raw, userId: myId });
  }

  res.sendStatus(204);
});

export default router;
