import type { FastifyInstance } from "fastify";
import * as creds from "../../lib/credentials.js";
import * as db from "../db.js";

const ALLOWED_KEYS = [
  "NVIDIA_API_KEY",
  "GITHUB_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "NIM_API_KEY",
  "OPENAI_API_KEY",
];

export default async function credentialRoutes(fastify: FastifyInstance): Promise<void> {
  // List credential keys only (never values)
  fastify.get("/api/credentials", async () => {
    const all = creds.loadCredentials();
    const keys = Object.keys(all).map((key) => ({ key, set: !!all[key] }));
    return { credentials: keys };
  });

  fastify.put<{ Params: { key: string }; Body: { value?: string } }>(
    "/api/credentials/:key",
    async (request, reply) => {
      const { key } = request.params;
      const { value } = request.body || {};
      if (!value) return reply.code(400).send({ error: "Missing value" });
      if (!ALLOWED_KEYS.includes(key)) {
        return reply.code(400).send({ error: `Invalid credential key: ${key}` });
      }

      creds.saveCredential(key, value);
      db.insertAudit(null, "credential.updated", { key });
      return { ok: true };
    }
  );
}
