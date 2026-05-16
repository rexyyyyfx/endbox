import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";
import { db } from "../db/index.js";
import { usersTable } from "../db/index.js";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userDbId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id)).limit(1);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  req.userId = user.userId;
  req.userDbId = user.id;
  next();
}
