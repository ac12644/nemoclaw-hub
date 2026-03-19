import type { FastifyInstance } from "fastify";
import * as registry from "../../lib/registry.js";
import * as db from "../db.js";
import { safeRun } from "../safe-runner.js";

export default async function messageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { sandbox: string }; Querystring: { limit?: string; offset?: string } }>(
    "/api/messages/:sandbox",
    async (request, reply) => {
      const { sandbox } = request.params;
      if (!registry.getSandbox(sandbox)) {
        return reply.code(404).send({ error: "Sandbox not found" });
      }

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

      if (!registry.getSandbox(sandbox)) {
        return reply.code(404).send({ error: "Sandbox not found" });
      }
      if (!content) return reply.code(400).send({ error: "Missing content" });

      db.insertMessage(sandbox, "user", content);

      const escaped = content.replace(/'/g, "'\\''");
      const response = safeRun(
        `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ProxyCommand='openshell ssh-proxy --gateway-name nemoclaw --name ${sandbox}' sandbox@openshell-${sandbox} "openclaw agent --agent main --local -m '${escaped}' --session-id hub" 2>/dev/null`
      );

      const assistantContent = response.trim() || "(no response)";
      db.insertMessage(sandbox, "assistant", assistantContent);
      db.insertAudit(sandbox, "message.sent", { preview: content.slice(0, 100) });

      return {
        user: { role: "user", content },
        assistant: { role: "assistant", content: assistantContent },
      };
    }
  );
}
