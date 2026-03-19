import type { FastifyInstance } from "fastify";
import { getProvider } from "../providers/index.js";
import * as db from "../db.js";

export default async function messageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { sandbox: string }; Querystring: { limit?: string; offset?: string } }>(
    "/api/messages/:sandbox",
    async (request, reply) => {
      const { sandbox } = request.params;
      const provider = getProvider();
      const s = await provider.get(sandbox);
      if (!s) return reply.code(404).send({ error: "Sandbox not found" });

      const limit = parseInt(request.query.limit || "50");
      const offset = parseInt(request.query.offset || "0");
      return { messages: db.getMessages(sandbox, { limit, offset }) };
    }
  );

  fastify.post<{ Params: { sandbox: string }; Body: { content?: string } }>(
    "/api/messages/:sandbox",
    async (request, reply) => {
      const { sandbox } = request.params;
      const { content } = request.body || {};

      const provider = getProvider();
      const s = await provider.get(sandbox);
      if (!s) return reply.code(404).send({ error: "Sandbox not found" });
      if (!content) return reply.code(400).send({ error: "Missing content" });

      db.insertMessage(sandbox, "user", content);

      const response = await provider.exec(sandbox, content);

      // Strip noise lines (plugin banners, system messages)
      const cleaned = response
        .split("\n")
        .filter((line) => !line.startsWith("[plugins]") && !line.startsWith("[system]"))
        .join("\n")
        .trim();
      const assistantContent = cleaned || "(no response)";

      db.insertMessage(sandbox, "assistant", assistantContent);
      db.insertAudit(sandbox, "message.sent", { preview: content.slice(0, 100) });

      return {
        user: { role: "user", content },
        assistant: { role: "assistant", content: assistantContent },
      };
    }
  );
}
