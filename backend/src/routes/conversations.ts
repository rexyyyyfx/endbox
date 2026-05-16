import { Router, type IRouter } from "express";
import { db } from "../db/index.js";
import { usersTable, conversationsTable, conversationSettingsTable, messagesTable } from "../db/index.js";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { UpdateConversationBody } from "../lib/validation.js";
import { generateId } from "../lib/auth.js";

const router: IRouter = Router();

function formatUser(u: { id: string; userId: string; avatarUrl: string | null }) {
  return { id: u.id, userId: u.userId, avatarUrl: u.avatarUrl };
}

function formatMessage(m: typeof messagesTable.$inferSelect) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    type: m.type,
    encryptedContent: m.encryptedContent,
    iv: m.iv,
    attachmentUrl: m.attachmentUrl,
    attachmentName: m.attachmentName,
    attachmentSize: m.attachmentSize,
    replyToId: m.replyToId,
    isEdited: m.isEdited,
    isDeleted: m.isDeleted,
    isRead: m.isRead,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
  };
}

router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const myId = req.userDbId!;

  const convs = await db
    .select()
    .from(conversationsTable)
    .where(or(eq(conversationsTable.user1Id, myId), eq(conversationsTable.user2Id, myId)));

  const result = await Promise.all(convs.map(async (conv) => {
    const otherId = conv.user1Id === myId ? conv.user2Id : conv.user1Id;

    const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, otherId)).limit(1);
    const [settings] = await db.select().from(conversationSettingsTable)
      .where(and(eq(conversationSettingsTable.conversationId, conv.id), eq(conversationSettingsTable.userId, myId)))
      .limit(1);

    const [lastMessage] = await db.select().from(messagesTable)
      .where(and(
        eq(messagesTable.conversationId, conv.id),
        eq(messagesTable.deletedForAll, false),
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);

    const unreadResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.conversationId, conv.id),
        eq(messagesTable.isRead, false),
        sql`${messagesTable.senderId} != ${myId}`,
      ));

    return {
      id: conv.id,
      otherUser: otherUser ? formatUser(otherUser) : { id: otherId, userId: "Unknown", avatarUrl: null },
      lastMessage: lastMessage ? formatMessage(lastMessage) : null,
      unreadCount: unreadResult[0]?.count ?? 0,
      isPinned: settings?.isPinned ?? false,
      isMuted: settings?.isMuted ?? false,
      isArchived: settings?.isArchived ?? false,
      isBlocked: settings?.isBlocked ?? false,
      otherUserOnline: false,
      createdAt: conv.createdAt.toISOString(),
    };
  }));

  result.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    const aTime = a.lastMessage?.createdAt ?? a.createdAt;
    const bTime = b.lastMessage?.createdAt ?? b.createdAt;
    return bTime.localeCompare(aTime);
  });

  res.json(result);
});

router.get("/conversations/stats", requireAuth, async (req, res): Promise<void> => {
  const myId = req.userDbId!;

  const convs = await db.select()
    .from(conversationsTable)
    .where(or(eq(conversationsTable.user1Id, myId), eq(conversationsTable.user2Id, myId)));

  const convIds = convs.map(c => c.id);
  if (convIds.length === 0) {
    res.json({ total: 0, unread: 0, pinned: 0, archived: 0 });
    return;
  }

  const settings = await db.select().from(conversationSettingsTable)
    .where(eq(conversationSettingsTable.userId, myId));

  const settingsMap = Object.fromEntries(settings.map(s => [s.conversationId, s]));

  let unread = 0;
  let pinned = 0;
  let archived = 0;

  for (const conv of convs) {
    const s = settingsMap[conv.id];
    if (s?.isPinned) pinned++;
    if (s?.isArchived) archived++;

    const unreadCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.conversationId, conv.id),
        eq(messagesTable.isRead, false),
        sql`${messagesTable.senderId} != ${myId}`,
      ));

    if ((unreadCount[0]?.count ?? 0) > 0) unread++;
  }

  res.json({ total: convs.length, unread, pinned, archived });
});

router.get("/conversations/:conversationId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const myId = req.userDbId!;

  const [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.id, raw),
      or(eq(conversationsTable.user1Id, myId), eq(conversationsTable.user2Id, myId)),
    )).limit(1);

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const otherId = conv.user1Id === myId ? conv.user2Id : conv.user1Id;
  const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, otherId)).limit(1);
  const [settings] = await db.select().from(conversationSettingsTable)
    .where(and(eq(conversationSettingsTable.conversationId, conv.id), eq(conversationSettingsTable.userId, myId)))
    .limit(1);

  const [lastMessage] = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.conversationId, conv.id), eq(messagesTable.deletedForAll, false)))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  res.json({
    id: conv.id,
    otherUser: otherUser ? formatUser(otherUser) : { id: otherId, userId: "Unknown", avatarUrl: null },
    lastMessage: lastMessage ? formatMessage(lastMessage) : null,
    unreadCount: 0,
    isPinned: settings?.isPinned ?? false,
    isMuted: settings?.isMuted ?? false,
    isArchived: settings?.isArchived ?? false,
    isBlocked: settings?.isBlocked ?? false,
    otherUserOnline: false,
    createdAt: conv.createdAt.toISOString(),
  });
});

router.patch("/conversations/:conversationId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const myId = req.userDbId!;

  const parsed = UpdateConversationBody.safeParse(req.body);
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
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const existing = await db.select().from(conversationSettingsTable)
    .where(and(eq(conversationSettingsTable.conversationId, raw), eq(conversationSettingsTable.userId, myId)))
    .limit(1);

  if (existing.length === 0) {
    const id = generateId();
    await db.insert(conversationSettingsTable).values({ id, conversationId: raw, userId: myId, ...parsed.data });
  } else {
    await db.update(conversationSettingsTable)
      .set(parsed.data)
      .where(and(eq(conversationSettingsTable.conversationId, raw), eq(conversationSettingsTable.userId, myId)));
  }

  const [settings] = await db.select().from(conversationSettingsTable)
    .where(and(eq(conversationSettingsTable.conversationId, raw), eq(conversationSettingsTable.userId, myId)))
    .limit(1);

  const otherId = conv.user1Id === myId ? conv.user2Id : conv.user1Id;
  const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, otherId)).limit(1);
  const [lastMessage] = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.conversationId, raw), eq(messagesTable.deletedForAll, false)))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  res.json({
    id: conv.id,
    otherUser: otherUser ? formatUser(otherUser) : { id: otherId, userId: "Unknown", avatarUrl: null },
    lastMessage: lastMessage ? formatMessage(lastMessage) : null,
    unreadCount: 0,
    isPinned: settings?.isPinned ?? false,
    isMuted: settings?.isMuted ?? false,
    isArchived: settings?.isArchived ?? false,
    isBlocked: settings?.isBlocked ?? false,
    otherUserOnline: false,
    createdAt: conv.createdAt.toISOString(),
  });
});

router.delete("/conversations/:conversationId", requireAuth, async (req, res): Promise<void> => {
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

  await db.update(conversationSettingsTable)
    .set({ clearedAt: new Date() })
    .where(and(eq(conversationSettingsTable.conversationId, raw), eq(conversationSettingsTable.userId, myId)));

  res.sendStatus(204);
});

export default router;
