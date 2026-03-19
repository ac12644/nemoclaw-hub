import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import * as db from "../db.js";
import { workflowEvents } from "../workflows/executor.js";

const runClients = new Map<string, Set<WebSocket>>();

export default async function workflowRunsWs(fastify: FastifyInstance): Promise<void> {
  // Listen for executor updates and broadcast
  workflowEvents.on("update", (runId: string) => {
    const clients = runClients.get(runId);
    if (!clients || clients.size === 0) return;

    const database = db.getDb();
    const run = database.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(runId);
    const steps = database
      .prepare("SELECT * FROM workflow_step_runs WHERE run_id = ? ORDER BY started_at ASC")
      .all(runId);

    const msg = JSON.stringify({ type: "workflow_update", run, steps });
    for (const client of clients) {
      if (client.readyState === 1) client.send(msg);
    }
  });

  fastify.get<{ Params: { runId: string } }>(
    "/api/workflows/runs/:runId/stream",
    { websocket: true },
    (socket, request) => {
      const { runId } = request.params;

      if (!runClients.has(runId)) {
        runClients.set(runId, new Set());
      }
      runClients.get(runId)!.add(socket);

      // Send initial state
      const database = db.getDb();
      const run = database.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(runId);
      const steps = database
        .prepare("SELECT * FROM workflow_step_runs WHERE run_id = ? ORDER BY started_at ASC")
        .all(runId);

      socket.send(JSON.stringify({ type: "workflow_update", run, steps }));

      socket.on("close", () => {
        runClients.get(runId)?.delete(socket);
        if (runClients.get(runId)?.size === 0) {
          runClients.delete(runId);
        }
      });
    }
  );
}
