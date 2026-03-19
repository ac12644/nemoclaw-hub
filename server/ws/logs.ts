import { spawn, type ChildProcess } from "child_process";
import type { FastifyInstance } from "fastify";
import * as registry from "../../lib/registry.js";

export default async function logsWs(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { name: string } }>(
    "/api/sandboxes/:name/logs/stream",
    { websocket: true },
    (socket, request) => {
      const { name } = request.params;
      const sandbox = registry.getSandbox(name);

      if (!sandbox) {
        socket.send(JSON.stringify({ type: "error", message: "Sandbox not found" }));
        socket.close();
        return;
      }

      // SSH into the sandbox and tail system logs
      let child: ChildProcess | null = spawn(
        "ssh",
        [
          "-o", "StrictHostKeyChecking=no",
          "-o", "UserKnownHostsFile=/dev/null",
          "-o", "LogLevel=ERROR",
          "-o", `ProxyCommand=openshell ssh-proxy --gateway-name nemoclaw --name ${name}`,
          `sandbox@openshell-${name}`,
          "tail -f /var/log/*.log /tmp/*.log 2>/dev/null || while true; do echo '[sandbox] heartbeat'; sleep 10; done",
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      let buffer = "";

      child.stdout?.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            socket.send(
              JSON.stringify({
                type: "log",
                line,
                timestamp: new Date().toISOString(),
              })
            );
          }
        }
      });

      child.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          socket.send(JSON.stringify({ type: "stderr", line: msg }));
        }
      });

      child.on("exit", (code) => {
        socket.send(
          JSON.stringify({ type: "closed", reason: "process exited", code })
        );
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
