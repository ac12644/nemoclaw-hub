import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import * as db from "../db.js";

const clients = new Set<WebSocket>();
let lastEventId = 0;
let pollInterval: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  if (pollInterval) return;

  // Initialize lastEventId to current max
  const events = db.getAuditEvents({ limit: 1 });
  if (events.length > 0) lastEventId = events[0].id;

  pollInterval = setInterval(() => {
    if (clients.size === 0) return;

    const database = db.getDb();
    const newEvents = database
      .prepare("SELECT * FROM audit_events WHERE id > ? ORDER BY id ASC LIMIT 50")
      .all(lastEventId) as Array<{ id: number; [key: string]: unknown }>;

    for (const event of newEvents) {
      lastEventId = event.id;
      const msg = JSON.stringify({ type: "audit", event });
      for (const client of clients) {
        if (client.readyState === 1) client.send(msg);
      }
    }
  }, 1000);
}

function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

export default async function activityWs(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/activity", { websocket: true }, (socket) => {
    clients.add(socket);
    startPolling();

    socket.on("close", () => {
      clients.delete(socket);
      if (clients.size === 0) stopPolling();
    });
  });
}

export { clients, stopPolling };
