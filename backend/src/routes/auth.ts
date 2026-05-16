import { Router, type IRouter } from "express";
import { db } from "../db/index.js";
import { usersTable, keysTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { generateUserId, hashPassword, verifyPassword, signToken, generateId } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";
import { RegisterBody, LoginBody } from "../lib/validation.js";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { password, encryptedPrivateKey, publicKey } = parsed.data;

  let userId = generateUserId();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await db.select().from(usersTable).where(eq(usersTable.userId, userId)).limit(1);
    if (existing.length === 0) break;
    userId = generateUserId();
    attempts++;
  }

  const id = generateId();
  const passwordHash = await hashPassword(password);

  const [user] = await db.insert(usersTable).values({ id, userId, passwordHash }).returning();

  if (publicKey) {
    await db.insert(keysTable).values({
      userId: id,
      publicKey,
      encryptedPrivateKey: encryptedPrivateKey ?? null,
    }).onConflictDoUpdate({ target: keysTable.userId, set: { publicKey, encryptedPrivateKey: encryptedPrivateKey ?? null } });
  }

  const token = signToken({ id: user.id, userId: user.userId });

  res.status(201).json({
    token,
    user: {
      id: user.id,
      userId: user.userId,
      avatarUrl: user.avatarUrl,
      theme: user.theme,
      storageUsedBytes: user.storageUsedBytes,
      createdAt: user.createdAt.toISOString(),
    },
    encryptedPrivateKey: encryptedPrivateKey ?? null,
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const [keyRecord] = await db.select().from(keysTable).where(eq(keysTable.userId, user.id)).limit(1);

  const token = signToken({ id: user.id, userId: user.userId });

  res.json({
    token,
    user: {
      id: user.id,
      userId: user.userId,
      avatarUrl: user.avatarUrl,
      theme: user.theme,
      storageUsedBytes: user.storageUsedBytes,
      createdAt: user.createdAt.toISOString(),
    },
    encryptedPrivateKey: keyRecord?.encryptedPrivateKey ?? null,
  });
});

router.post("/auth/logout", requireAuth, async (_req, res): Promise<void> => {
  res.sendStatus(204);
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userDbId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    userId: user.userId,
    avatarUrl: user.avatarUrl,
    theme: user.theme,
    storageUsedBytes: user.storageUsedBytes,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
