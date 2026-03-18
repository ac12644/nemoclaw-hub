import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";

import * as db from "./db.js";
import { getToken, login, logout, authHook } from "./auth.js";

// Route plugins
import sandboxRoutes from "./routes/sandboxes.js";
import policyRoutes from "./routes/policies.js";
import nimRoutes from "./routes/nim.js";
import credentialRoutes from "./routes/credentials.js";
import messageRoutes from "./routes/messages.js";
import auditRoutes from "./routes/audit.js";
import systemRoutes from "./routes/system.js";

// WebSocket plugins
import logsWs from "./ws/logs.js";
import activityWs from "./ws/activity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.HUB_PORT || "3100");
const HOST = process.env.HUB_HOST || "127.0.0.1";

const fastify = Fastify({ logger: true });

async function start(): Promise<void> {
  // Initialize database
  db.getDb();

  // Plugins
  await fastify.register(fastifyCors, {
    origin: true,
    credentials: true,
  });
  await fastify.register(fastifyCookie);
  await fastify.register(fastifyWebsocket);

  // Auth routes (no auth required)
  fastify.post<{ Body: { token?: string } }>("/api/auth/login", async (request, reply) => {
    const { token } = request.body || {};
    if (!token) return reply.code(400).send({ error: "Missing token" });

    const sessionId = login(token);
    if (!sessionId) return reply.code(401).send({ error: "Invalid token" });

    reply.setCookie("session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 86400,
    });
    return { ok: true };
  });

  fastify.post("/api/auth/logout", async (request, reply) => {
    const sessionId = (request as typeof request & { cookies?: Record<string, string> }).cookies
      ?.session;
    logout(sessionId);
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });

  // Health (no auth)
  await fastify.register(systemRoutes);

  // Protected API routes
  await fastify.register(async (app) => {
    app.addHook("preHandler", authHook);
    await app.register(sandboxRoutes);
    await app.register(policyRoutes);
    await app.register(nimRoutes);
    await app.register(credentialRoutes);
    await app.register(messageRoutes);
    await app.register(auditRoutes);
  });

  // Protected WebSocket routes
  await fastify.register(async (app) => {
    app.addHook("preHandler", authHook);
    await app.register(logsWs);
    await app.register(activityWs);
  });

  // Serve frontend static files in production
  const clientDist = path.join(__dirname, "..", "client", "dist");
  try {
    await fastify.register(fastifyStatic, {
      root: clientDist,
      wildcard: false,
    });

    // SPA fallback
    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        reply.code(404).send({ error: "Not found" });
      } else {
        reply.sendFile("index.html");
      }
    });
  } catch {
    // Client not built yet — dev mode
    fastify.log.info("Client dist not found, serving API only");
  }

  // Print access token on first start
  const token = getToken();
  fastify.log.info(`Access token: ${token}`);
  fastify.log.info(`Login: POST ${HOST}:${PORT}/api/auth/login { "token": "<token>" }`);

  await fastify.listen({ port: PORT, host: HOST });
}

start().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
