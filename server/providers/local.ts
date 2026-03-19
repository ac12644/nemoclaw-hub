import { spawn, execSync } from "child_process";
import type { ChildProcess } from "child_process";
import type { SandboxProvider, SandboxInfo, CreateConfig, ProviderStatus } from "./types.js";
import * as db from "../db.js";

interface LocalAgent {
  name: string;
  process: ChildProcess | null;
  command: string;
  createdAt: string;
  model: string | null;
}

const agents = new Map<string, LocalAgent>();

export class LocalProvider implements SandboxProvider {
  name = "local";

  async list(): Promise<SandboxInfo[]> {
    return Array.from(agents.values()).map((a) => ({
      name: a.name,
      status: a.process && !a.process.killed ? "running" as const : "stopped" as const,
      createdAt: a.createdAt,
      model: a.model,
      provider: "local",
      policies: [],
    }));
  }

  async get(name: string): Promise<SandboxInfo | null> {
    const a = agents.get(name);
    if (!a) return null;
    return {
      name: a.name,
      status: a.process && !a.process.killed ? "running" : "stopped",
      createdAt: a.createdAt,
      model: a.model,
      provider: "local",
      policies: [],
    };
  }

  async create(name: string, config: CreateConfig): Promise<SandboxInfo> {
    const command = config.command || "bash";
    const proc = spawn("bash", ["-c", `${command}`], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...config.env },
    });

    agents.set(name, {
      name,
      process: proc,
      command,
      createdAt: new Date().toISOString(),
      model: config.model || null,
    });

    proc.on("exit", () => {
      const a = agents.get(name);
      if (a) a.process = null;
    });

    db.insertAudit(name, "sandbox.created", { provider: "local", command });
    return (await this.get(name))!;
  }

  async destroy(name: string): Promise<void> {
    const a = agents.get(name);
    if (a?.process) a.process.kill("SIGTERM");
    agents.delete(name);
    db.insertAudit(name, "sandbox.destroyed", { provider: "local" });
  }

  async exec(name: string, command: string): Promise<string> {
    try {
      return execSync(command, {
        encoding: "utf-8",
        timeout: 60000,
      }).trim();
    } catch {
      return "";
    }
  }

  streamLogs(name: string): ChildProcess {
    const a = agents.get(name);
    if (a?.process) return a.process;
    // Return a dummy process that just echoes
    return spawn("bash", ["-c", "while true; do echo '[local] no process'; sleep 10; done"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  async getStatus(): Promise<ProviderStatus> {
    return { name: "local", available: true, version: "1.0.0" };
  }
}
