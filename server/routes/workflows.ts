import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import * as db from "../db.js";
import { parseWorkflow, validateWorkflow } from "../workflows/parser.js";
import { WorkflowExecutor } from "../workflows/executor.js";
import { getProvider } from "../providers/index.js";

export default async function workflowRoutes(fastify: FastifyInstance): Promise<void> {
  const executor = new WorkflowExecutor(getProvider());

  // Create workflow
  fastify.post<{ Body: { yaml: string } }>("/api/workflows", async (request, reply) => {
    const { yaml: yamlContent } = request.body || {};
    if (!yamlContent) return reply.code(400).send({ error: "Missing yaml" });

    let def;
    try {
      def = parseWorkflow(yamlContent);
    } catch (err: unknown) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Invalid YAML" });
    }

    const errors = validateWorkflow(def);
    if (errors.length > 0) {
      return reply.code(400).send({ error: "Validation failed", details: errors });
    }

    const id = `wf-${crypto.randomUUID().slice(0, 8)}`;
    const database = db.getDb();
    database
      .prepare(
        "INSERT INTO workflows (id, name, yaml_content, schedule, enabled) VALUES (?, ?, ?, ?, 1)"
      )
      .run(id, def.name, yamlContent, def.schedule || null);

    db.insertAudit(null, "workflow.created", { id, name: def.name });
    return { id, name: def.name };
  });

  // List workflows
  fastify.get("/api/workflows", async () => {
    const database = db.getDb();
    const workflows = database.prepare("SELECT * FROM workflows ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;

    // Enrich with last run status
    const enriched = workflows.map((wf) => {
      const lastRun = database
        .prepare("SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 1")
        .get(wf.id as string) as Record<string, unknown> | undefined;
      return { ...wf, lastRun: lastRun || null };
    });

    return { workflows: enriched };
  });

  // Get workflow detail
  fastify.get<{ Params: { id: string } }>("/api/workflows/:id", async (request, reply) => {
    const database = db.getDb();
    const workflow = database.prepare("SELECT * FROM workflows WHERE id = ?").get(request.params.id);
    if (!workflow) return reply.code(404).send({ error: "Workflow not found" });

    const def = parseWorkflow((workflow as { yaml_content: string }).yaml_content);
    return { ...(workflow as object), parsed: def };
  });

  // Update workflow
  fastify.put<{ Params: { id: string }; Body: { yaml: string } }>(
    "/api/workflows/:id",
    async (request, reply) => {
      const { yaml: yamlContent } = request.body || {};
      if (!yamlContent) return reply.code(400).send({ error: "Missing yaml" });

      let def;
      try {
        def = parseWorkflow(yamlContent);
      } catch (err: unknown) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "Invalid YAML" });
      }

      const errors = validateWorkflow(def);
      if (errors.length > 0) {
        return reply.code(400).send({ error: "Validation failed", details: errors });
      }

      const database = db.getDb();
      const result = database
        .prepare(
          "UPDATE workflows SET name = ?, yaml_content = ?, schedule = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(def.name, yamlContent, def.schedule || null, request.params.id);

      if (result.changes === 0) return reply.code(404).send({ error: "Workflow not found" });
      return { ok: true };
    }
  );

  // Delete workflow
  fastify.delete<{ Params: { id: string } }>("/api/workflows/:id", async (request, reply) => {
    const database = db.getDb();
    const result = database.prepare("DELETE FROM workflows WHERE id = ?").run(request.params.id);
    if (result.changes === 0) return reply.code(404).send({ error: "Workflow not found" });
    db.insertAudit(null, "workflow.deleted", { id: request.params.id });
    return { ok: true };
  });

  // Trigger a run
  fastify.post<{ Params: { id: string } }>("/api/workflows/:id/run", async (request, reply) => {
    try {
      const runId = await executor.run(request.params.id, "manual");
      return { runId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(400).send({ error: message });
    }
  });

  // List runs for a workflow
  fastify.get<{ Params: { id: string } }>("/api/workflows/:id/runs", async (request) => {
    const database = db.getDb();
    const runs = database
      .prepare("SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 50")
      .all(request.params.id);
    return { runs };
  });

  // Get run detail with steps
  fastify.get<{ Params: { runId: string } }>("/api/workflows/runs/:runId", async (request, reply) => {
    const database = db.getDb();
    const run = database.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(request.params.runId);
    if (!run) return reply.code(404).send({ error: "Run not found" });

    const steps = database
      .prepare("SELECT * FROM workflow_step_runs WHERE run_id = ? ORDER BY started_at ASC")
      .all(request.params.runId);

    return { run, steps };
  });
}
