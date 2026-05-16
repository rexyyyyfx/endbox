import { Router, type IRouter } from "express";
import { db } from "../db/index.js";
import { filesTable, usersTable } from "../db/index.js";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/auth.js";
import path from "path";
import fs from "fs/promises";

const router: IRouter = Router();
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

router.post("/uploads", requireAuth, async (req, res): Promise<void> => {
  const { filename, mimeType, sizeBytes, encryptedData } = req.body;

  if (!filename || !mimeType || !sizeBytes || !encryptedData) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  await ensureUploadDir();

  const fileId = generateId();
  const ext = path.extname(filename) || "";
  const storagePath = path.join(UPLOAD_DIR, `${fileId}${ext}`);

  const buffer = Buffer.from(encryptedData, "base64");
  await fs.writeFile(storagePath, buffer);

  await db.insert(filesTable).values({
    id: fileId,
    uploaderId: req.userDbId!,
    filename,
    mimeType,
    sizeBytes,
    storagePath,
  });

  await db.update(usersTable)
    .set({ storageUsedBytes: sql`${usersTable.storageUsedBytes} + ${sizeBytes}` })
    .where(eq(usersTable.id, req.userDbId!));

  const url = `/api/files/${fileId}${ext}`;
  res.status(201).json({ url, fileId });
});

router.get("/files/:fileId", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
  const fileIdWithExt = rawId;
  const fileId = fileIdWithExt.split(".")[0];

  const [file] = await db.select().from(filesTable).where(eq(filesTable.id, fileId)).limit(1);
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.sendFile(file.storagePath);
});

export default router;
