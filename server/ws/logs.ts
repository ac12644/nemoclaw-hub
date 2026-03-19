import type { ChildProcess } from "child_process";
import type { FastifyInstance } from "fastify";
import { getProvider } from "../providers/index.js";

export default async function logsWs(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { name: string } }>(
    "/api/sandboxes/:name/logs/stream",
    { websocket: true },
    async (socket, request) => {
      const { name } = request.params;
      const provider = getProvider();
      const sandbox = await provider.get(name);

      if (!sandbox) {
        socket.send(JSON.stringify({ type: "error", message: "Sandbox not found" }));
        socket.close();
        return;
      }

      let child: ChildProcess | null = provider.streamLogs(name);
      let buffer = "";

      child.stdout?.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            socket.send(
              JSON.stringify({ type: "log", line, timestamp: new Date().toISOString() })
            );
          }
        }
      });

      child.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) socket.send(JSON.stringify({ type: "stderr", line: msg }));
      });

      child.on("exit", (code) => {
        socket.send(JSON.stringify({ type: "closed", reason: "process exited", code }));
        socket.close();
        child = null;
      });

      socket.on("close", () => {
        if (child) {
          child.kill("SIGTERM");
          child = null;
        }
      });
    }
  );
}
