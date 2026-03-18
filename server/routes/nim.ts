import type { FastifyInstance } from "fastify";
import * as nimLib from "../../lib/nim.js";
import * as registry from "../../lib/registry.js";

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
