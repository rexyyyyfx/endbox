import { Router, type IRouter } from "express";
import { db } from "../db/index.js";
import { usersTable, keysTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { StorePublicKeyBody } from "../lib/validation.js";

const router: IRouter = Router();

router.get("/users/:userId", requireAuth, async (req, res): Promise<void> => {
  const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, rawUserId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ id: user.id, userId: user.userId, avatarUrl: user.avatarUrl });
});

router.post("/keys", requireAuth, async (req, res): Promise<void> => {
  const parsed = StorePublicKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { publicKey, encryptedPrivateKey } = parsed.data;
  const userId = req.userDbId!;

  const [key] = await db.insert(keysTable).values({ userId, publicKey, encryptedPrivateKey })
    .onConflictDoUpdate({ target: keysTable.userId, set: { publicKey, encryptedPrivateKey: encryptedPrivateKey ?? null } })
    .returning();

  res.json({ userId: key.userId, publicKey: key.publicKey, encryptedPrivateKey: key.encryptedPrivateKey });
});

router.get("/keys/:userId", requireAuth, async (req, res): Promise<void> => {
  const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const [key] = await db.select().from(keysTable).where(eq(keysTable.userId, rawUserId)).limit(1);
  if (!key) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  res.json({ userId: key.userId, publicKey: key.publicKey, encryptedPrivateKey: null });
});

export default router;
