import type { FastifyInstance } from "fastify";
import * as policies from "../../lib/policies.js";
import { getProvider } from "../providers/index.js";
import * as db from "../db.js";

export default async function policyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/policies/presets", async () => {
    const presets = policies.listPresets();
    return {
      presets: presets.map((p) => ({
        ...p,
        endpoints: policies.getPresetEndpoints(policies.loadPreset(p.name) || ""),
      })),
    };
  });

  fastify.get<{ Params: { name: string } }>(
    "/api/policies/presets/:name",
    async (request, reply) => {
      const { name } = request.params;
      const content = policies.loadPreset(name);
      if (!content) return reply.code(404).send({ error: "Preset not found" });
      return { name, content, endpoints: policies.getPresetEndpoints(content) };
    }
  );

  fastify.get<{ Params: { name: string } }>(
    "/api/sandboxes/:name/policies",
    async (request, reply) => {
      const provider = getProvider();
      const sandbox = await provider.get(request.params.name);
      if (!sandbox) return reply.code(404).send({ error: "Sandbox not found" });
      return { policies: sandbox.policies };
    }
  );

  fastify.post<{ Params: { name: string }; Body: { preset?: string } }>(
    "/api/sandboxes/:name/policies",
    async (request, reply) => {
      const { name } = request.params;
      const { preset } = request.body || {};

      const provider = getProvider();
      const sandbox = await provider.get(name);
      if (!sandbox) return reply.code(404).send({ error: "Sandbox not found" });
      if (!preset) return reply.code(400).send({ error: "Missing preset name" });

      if (provider.applyPolicy) {
        try {
          await provider.applyPolicy(name, preset);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return reply.code(500).send({ error: message });
        }
      }

      db.insertAudit(name, "policy.applied", { preset });
      const updated = await provider.get(name);
      return { ok: true, applied: updated?.policies || [] };
    }
  );
}
