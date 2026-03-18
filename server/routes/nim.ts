import type { FastifyInstance } from "fastify";
import type { Nim, Registry } from "../types.js";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nimLib: Nim = require("../../lib/nim");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const registry: Registry = require("../../lib/registry");

export default async function nimRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/nim/models", async () => {
    return { models: nimLib.listModels() };
  });

  fastify.get("/api/nim/gpu", async () => {
    return { gpu: nimLib.detectGpu() };
  });

  fastify.get<{ Params: { name: string } }>(
    "/api/nim/:name/status",
    async (request, reply) => {
      const { name } = request.params;
      const sandbox = registry.getSandbox(name);
      if (!sandbox) return reply.code(404).send({ error: "Sandbox not found" });
      return nimLib.nimStatus(name);
    }
  );
}
