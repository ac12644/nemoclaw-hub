import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";

import * as db from "./db.js";
import { getToken, login, logout, authHook } from "./auth.js";
import { getProvider } from "./providers/index.js";
import { WorkflowExecutor } from "./workflows/executor.js";
import { WorkflowScheduler } from "./workflows/scheduler.js";

// Route plugins
import sandboxRoutes from "./routes/sandboxes.js";
import policyRoutes from "./routes/policies.js";
import nimRoutes from "./routes/nim.js";
import credentialRoutes from "./routes/credentials.js";
import messageRoutes from "./routes/messages.js";
import auditRoutes from "./routes/audit.js";
import systemRoutes from "./routes/system.js";
import workflowRoutes from "./routes/workflows.js";

// WebSocket plugins
import logsWs from "./ws/logs.js";
import activityWs from "./ws/activity.js";
import workflowRunsWs from "./ws/workflow-runs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.HUB_PORT || "3100");
const HOST = process.env.HUB_HOST || "127.0.0.1";

const fastify = Fastify({ logger: true });

async function start(): Promise<void> {
  // Initialize database
  db.getDb();

  // Initialize provider
  const provider = getProvider();
  fastify.log.info(`Provider: ${provider.name}`);

  // Initialize workflow scheduler
  const executor = new WorkflowExecutor(provider);
  const scheduler = new WorkflowScheduler(executor);
  scheduler.start();
  fastify.log.info("Workflow scheduler started");

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
    await app.register(workflowRoutes);
  });

  // Protected WebSocket routes
  await fastify.register(async (app) => {
    app.addHook("preHandler", authHook);
    await app.register(logsWs);
    await app.register(activityWs);
    await app.register(workflowRunsWs);
  });

  // Serve frontend static files in production
  const clientDist = path.join(__dirname, "..", "client", "dist");
  try {
    await fastify.register(fastifyStatic, {
      root: clientDist,
      wildcard: false,
    });

    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        reply.code(404).send({ error: "Not found" });
      } else {
        reply.sendFile("index.html");
      }
    });
  } catch {
    fastify.log.info("Client dist not found, serving API only");
  }

  // Print access token on first start
  const token = getToken();
  fastify.log.info(`Access token: ${token}`);
  fastify.log.info(`Provider: ${provider.name} | Port: ${PORT}`);

  // Graceful shutdown
  fastify.addHook("onClose", () => {
    scheduler.stop();
    db.close();
  });

  await fastify.listen({ port: PORT, host: HOST });
}

start().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
