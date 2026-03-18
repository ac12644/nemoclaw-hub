import crypto from "crypto";
import path from "path";
import os from "os";
import fs from "fs";
import * as db from "./db.js";
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";

export const TOKEN_PATH = path.join(os.homedir(), ".nemoclaw", "hub-token.json");
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getToken(): string {
  if (fs.existsSync(TOKEN_PATH)) {
    const data = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    return data.token as string;
  }
  const token = crypto.randomBytes(32).toString("hex");
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({ token }), { mode: 0o600 });
  return token;
}

export function login(providedToken: string): string | null {
  const expected = getToken();
  if (providedToken !== expected) return null;

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.createSession(sessionId, expiresAt);
  return sessionId;
}

export function logout(sessionId: string | undefined): void {
  if (sessionId) db.deleteSession(sessionId);
}

export function validateSession(sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  db.cleanExpiredSessions();
  const session = db.getSession(sessionId);
  return !!session;
}

export function authHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const sessionId = (request as FastifyRequest & { cookies?: Record<string, string> }).cookies
    ?.session;
  if (!validateSession(sessionId)) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  done();
}
