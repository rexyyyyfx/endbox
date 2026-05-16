import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const JWT_SECRET = process.env.SESSION_SECRET ?? "endbox-fallback-secret";
const SALT_ROUNDS = 12;

export function generateUserId(): string {
  const num = Math.floor(10000 + Math.random() * 89999);
  return `${num}`;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { id: string; userId: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { id: string; userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; userId: string };
  } catch {
    return null;
  }
}

export function generateId(): string {
  return randomBytes(16).toString("hex");
}
