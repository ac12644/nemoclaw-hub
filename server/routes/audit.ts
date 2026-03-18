import type { FastifyInstance } from "fastify";
import * as db from "../db.js";

export default async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: { sandbox?: string; type?: string; limit?: string; offset?: string };
  }>("/api/audit", async (request) => {
    const { sandbox, type, limit, offset } = request.query;
    const events = db.getAuditEvents({
      sandbox: sandbox || undefined,
      eventType: type || undefined,
      limit: parseInt(limit || "50"),
      offset: parseInt(offset || "0"),
    });
    return { events };
  });
}
