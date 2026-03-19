import type { FastifyInstance } from "fastify";
import { getProvider } from "../providers/index.js";
import * as registry from "../../lib/registry.js";

export default async function sandboxRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/sandboxes", async () => {
    const provider = getProvider();
    const sandboxes = await provider.list();
    const def = registry.getDefault();
    return { sandboxes, defaultSandbox: def };
  });

  fastify.get<{ Params: { name: string } }>(
    "/api/sandboxes/:name",
    async (request, reply) => {
      const provider = getProvider();
      const sandbox = await provider.get(request.params.name);
      if (!sandbox) return reply.code(404).send({ error: "Sandbox not found" });
      return sandbox;
    }
  );

  fastify.post<{ Body: { name: string; image?: string; model?: string; command?: string; env?: Record<string, string>; policies?: string[] } }>(
    "/api/sandboxes",
    async (request, reply) => {
      const { name, ...config } = request.body || {} as { name: string };
      if (!name) return reply.code(400).send({ error: "Missing name" });

      const provider = getProvider();
      const existing = await provider.get(name);
      if (existing) return reply.code(409).send({ error: "Sandbox already exists" });

      const sandbox = await provider.create(name, config);
      return { ok: true, sandbox };
    }
  );

  fastify.delete<{ Params: { name: string } }>(
    "/api/sandboxes/:name",
    async (request, reply) => {
      const provider = getProvider();
      const sandbox = await provider.get(request.params.name);
      if (!sandbox) return reply.code(404).send({ error: "Sandbox not found" });

      await provider.destroy(request.params.name);
      return { ok: true };
    }
  );

  fastify.put<{ Params: { name: string } }>(
    "/api/sandboxes/:name/default",
    async (request, reply) => {
      const ok = registry.setDefault(request.params.name);
      if (!ok) return reply.code(404).send({ error: "Sandbox not found" });
      return { ok: true, defaultSandbox: request.params.name };
    }
  );
}
