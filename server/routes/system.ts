import type { FastifyInstance } from "fastify";
import * as nim from "../../lib/nim.js";
import { safeRun } from "../safe-runner.js";

export default async function systemRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/system/health", async () => {
    return { ok: true, timestamp: new Date().toISOString() };
  });

  fastify.get("/api/system/gpu", async () => {
    return { gpu: nim.detectGpu() };
  });

  fastify.get("/api/system/openshell", async () => {
    const version = safeRun("openshell version 2>/dev/null");
    const gateway = safeRun("openshell gateway status 2>/dev/null");
    return {
      available: !!version,
      version: version.trim() || null,
      gateway: gateway.trim() || null,
    };
  });
}
