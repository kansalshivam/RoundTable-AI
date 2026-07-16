import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "./db.js";

const SESSION_COOKIE_NAME = "roundtable_session";
const SESSION_DAYS = 7;

export { SESSION_COOKIE_NAME };

export async function createPasswordHash(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.betterAuthSession.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function getSession(token?: string) {
  if (!token) return null;
  const session = await prisma.betterAuthSession.findUnique({
    where: { token },
    include: { user: { include: { profile: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.profile) return null;
  return session;
}

export async function destroySession(token?: string) {
  if (!token) return;
  await prisma.betterAuthSession.deleteMany({ where: { token } });
}
