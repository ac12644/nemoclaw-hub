import type { FastifyInstance } from "fastify";
import * as registry from "../../lib/registry.js";
import * as nim from "../../lib/nim.js";
import { safeRun } from "../safe-runner.js";
import * as db from "../db.js";

export default async function sandboxRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/sandboxes", async () => {
    const { sandboxes, defaultSandbox } = registry.listSandboxes();
    return { sandboxes, defaultSandbox };
  });

  fastify.get<{ Params: { name: string } }>(
    "/api/sandboxes/:name",
    async (request, reply) => {
      const { name } = request.params;
      const sandbox = registry.getSandbox(name);
      if (!sandbox) return reply.code(404).send({ error: "Sandbox not found" });

      let nimInfo: unknown = { running: false };
      try {
        nimInfo = nim.nimStatus(name);
      } catch {
        /* NIM may not be running */
      }

      let openshellStatus: unknown = null;
      try {
        const raw = safeRun(`openshell sandbox get ${name} --json 2>/dev/null`);
        if (raw) openshellStatus = JSON.parse(raw);
      } catch {
        /* openshell may not be available */
      }

      return { ...sandbox, nim: nimInfo, openshell: openshellStatus };
    }
  );

  fastify.delete<{ Params: { name: string } }>(
    "/api/sandboxes/:name",
    async (request, reply) => {
      const { name } = request.params;
      const sandbox = registry.getSandbox(name);
      if (!sandbox) return reply.code(404).send({ error: "Sandbox not found" });

      try {
        nim.stopNimContainer(name);
      } catch {
        /* may not have a NIM container */
      }

      safeRun(`openshell sandbox stop ${name} 2>/dev/null`);
      safeRun(`openshell sandbox delete ${name} 2>/dev/null`);
      registry.removeSandbox(name);

      db.insertAudit(name, "sandbox.destroyed", { name });
      return { ok: true };
    }
  );

  fastify.put<{ Params: { name: string } }>(
    "/api/sandboxes/:name/default",
    async (request, reply) => {
      const { name } = request.params;
      const ok = registry.setDefault(name);
      if (!ok) return reply.code(404).send({ error: "Sandbox not found" });
      return { ok: true, defaultSandbox: name };
    }
  );

  fastify.get<{ Params: { name: string }; Querystring: { lines?: string } }>(
    "/api/sandboxes/:name/logs",
    async (request, reply) => {
      const { name } = request.params;
      const sandbox = registry.getSandbox(name);
      if (!sandbox) return reply.code(404).send({ error: "Sandbox not found" });

      const lines = request.query.lines || "50";
      const output = safeRun(`openshell sandbox logs ${name} --lines ${lines} 2>/dev/null`);
      return { logs: output };
    }
  );
}
