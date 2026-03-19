import type { FastifyInstance } from "fastify";
import { getProvider } from "../providers/index.js";
import * as nim from "../../lib/nim.js";

export default async function systemRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/system/health", async () => {
    return { ok: true, timestamp: new Date().toISOString() };
  });

  fastify.get("/api/system/gpu", async () => {
    return { gpu: nim.detectGpu() };
  });

  fastify.get("/api/system/provider", async () => {
    const provider = getProvider();
    const status = await provider.getStatus();
    return status;
  });
}
