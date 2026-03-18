import type { FastifyInstance } from "fastify";
import type { Policies, Registry } from "../types.js";
import * as db from "../db.js";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const policies: Policies = require("../../lib/policies");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const registry: Registry = require("../../lib/registry");

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
      const { name } = request.params;
      const sandbox = registry.getSandbox(name);
      if (!sandbox) return reply.code(404).send({ error: "Sandbox not found" });
      return { policies: policies.getAppliedPresets(name) };
    }
  );

  fastify.post<{ Params: { name: string }; Body: { preset?: string } }>(
    "/api/sandboxes/:name/policies",
    async (request, reply) => {
      const { name } = request.params;
      const { preset } = request.body || {};

      const sandbox = registry.getSandbox(name);
      if (!sandbox) return reply.code(404).send({ error: "Sandbox not found" });
      if (!preset) return reply.code(400).send({ error: "Missing preset name" });

      try {
        const ok = policies.applyPreset(name, preset);
        if (!ok) return reply.code(500).send({ error: "Failed to apply preset" });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return reply.code(500).send({ error: message });
      }

      db.insertAudit(name, "policy.applied", { preset });
      return { ok: true, applied: policies.getAppliedPresets(name) };
    }
  );
}
