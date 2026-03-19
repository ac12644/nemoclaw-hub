import { spawn, execSync } from "child_process";
import type { ChildProcess } from "child_process";
import type { SandboxProvider, SandboxInfo, CreateConfig, ProviderStatus } from "./types.js";
import * as db from "../db.js";

const LABEL = "agenthub.managed=true";

function dockerRun(args: string): string {
  try {
    return execSync(`docker ${args}`, { encoding: "utf-8", timeout: 30000 }).trim();
  } catch {
    return "";
  }
}

export class DockerProvider implements SandboxProvider {
  name = "docker";

  async list(): Promise<SandboxInfo[]> {
    const raw = dockerRun(`ps -a --filter label=${LABEL} --format '{{json .}}'`);
    if (!raw) return [];
    return raw.split("\n").filter(Boolean).map((line) => {
      const c = JSON.parse(line) as {
        Names: string; State: string; CreatedAt: string;
        Image: string; Labels: string;
      };
      return {
        name: c.Names,
        status: c.State === "running" ? "running" : c.State === "exited" ? "stopped" : "unknown",
        createdAt: c.CreatedAt,
        model: null,
        provider: "docker",
        policies: [],
        metadata: { image: c.Image },
      } satisfies SandboxInfo;
    });
  }

  async get(name: string): Promise<SandboxInfo | null> {
    const raw = dockerRun(`inspect ${name} --format '{{json .}}'`);
    if (!raw) return null;
    const c = JSON.parse(raw) as {
      Name: string; State: { Status: string }; Created: string;
      Config: { Image: string; Labels: Record<string, string> };
    };
    if (!c.Config?.Labels?.[`agenthub.managed`]) return null;
    return {
      name: c.Name.replace(/^\//, ""),
      status: c.State.Status === "running" ? "running" : "stopped",
      createdAt: c.Created,
      model: c.Config.Labels["agenthub.model"] || null,
      provider: "docker",
      policies: [],
      metadata: { image: c.Config.Image },
    };
  }

  async create(name: string, config: CreateConfig): Promise<SandboxInfo> {
    const image = config.image || "ubuntu:22.04";
    const envArgs = Object.entries(config.env || {})
      .map(([k, v]) => `-e ${k}=${v}`)
      .join(" ");
    const labelArgs = `--label ${LABEL} --label agenthub.model=${config.model || ""}`;

    dockerRun(`run -d --name ${name} ${labelArgs} ${envArgs} ${image} sleep infinity`);

    db.insertAudit(name, "sandbox.created", { image, provider: "docker" });

    return {
      name,
      status: "running",
      createdAt: new Date().toISOString(),
      model: config.model || null,
      provider: "docker",
      policies: config.policies || [],
    };
  }

  async destroy(name: string): Promise<void> {
    dockerRun(`stop ${name} 2>/dev/null`);
    dockerRun(`rm ${name} 2>/dev/null`);
    db.insertAudit(name, "sandbox.destroyed", { provider: "docker" });
  }

  async exec(name: string, command: string): Promise<string> {
    return dockerRun(`exec ${name} bash -c '${command.replace(/'/g, "'\\''")}'`);
  }

  streamLogs(name: string): ChildProcess {
    return spawn("docker", ["logs", "-f", "--tail", "100", name], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  async getStatus(): Promise<ProviderStatus> {
    const version = dockerRun("version --format '{{.Server.Version}}'");
    return {
      name: "docker",
      available: !!version,
      version: version || undefined,
    };
  }
}
