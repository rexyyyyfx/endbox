import { Router, type IRouter } from "express";
import { db } from "../db/index.js";
import { usersTable, keysTable, requestsTable, conversationsTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/auth.js";
import { verifyPassword } from "../lib/auth.js";
import path from "path";
import fs from "fs/promises";

const router: IRouter = Router();
const AVATAR_DIR = path.join(process.cwd(), "uploads", "avatars");

async function ensureAvatarDir() {
  await fs.mkdir(AVATAR_DIR, { recursive: true });
}

router.patch("/profile", requireAuth, async (req, res): Promise<void> => {
  const { theme } = req.body;
  const myId = req.userDbId!;

  const updateData: Partial<{ theme: string }> = {};
  if (theme && ["dark", "light"].includes(theme)) {
    updateData.theme = theme;
  }

  const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, myId)).returning();

  res.json({
    id: user.id,
    userId: user.userId,
    avatarUrl: user.avatarUrl,
    theme: user.theme,
    storageUsedBytes: user.storageUsedBytes,
    createdAt: user.createdAt.toISOString(),
  });
});

router.post("/profile/avatar", requireAuth, async (req, res): Promise<void> => {
  const { dataUrl } = req.body;
  if (!dataUrl || typeof dataUrl !== "string") {
    res.status(400).json({ error: "Missing dataUrl" });
    return;
  }

  const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches) {
    res.status(400).json({ error: "Invalid dataUrl format" });
    return;
  }

  await ensureAvatarDir();

  const myId = req.userDbId!;
  const ext = matches[1].includes("png") ? "png" : "jpg";
  const filename = `${myId}.${ext}`;
  const filePath = path.join(AVATAR_DIR, filename);

  const buffer = Buffer.from(matches[2], "base64");
  await fs.writeFile(filePath, buffer);

  const avatarUrl = `/api/avatars/${filename}`;
  await db.update(usersTable).set({ avatarUrl }).where(eq(usersTable.id, myId));

  res.json({ avatarUrl });
});

router.get("/avatars/:filename", async (req, res): Promise<void> => {
  const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filePath = path.join(AVATAR_DIR, filename);

  try {
    res.sendFile(filePath);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

router.delete("/profile/delete-account", requireAuth, async (req, res): Promise<void> => {
  const { password } = req.body;
  const myId = req.userDbId!;

  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, myId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, myId));
  res.sendStatus(204);
});

export default router;
