import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import type { SandboxProvider, SandboxInfo, CreateConfig, ProviderStatus } from "./types.js";
import * as registry from "../../lib/registry.js";
import * as nim from "../../lib/nim.js";
import * as policies from "../../lib/policies.js";
import { safeRun } from "../safe-runner.js";
import * as db from "../db.js";

export class OpenShellProvider implements SandboxProvider {
  name = "openshell";

  async list(): Promise<SandboxInfo[]> {
    const { sandboxes } = registry.listSandboxes();
    return sandboxes.map((s) => ({
      name: s.name,
      status: "running" as const,
      createdAt: s.createdAt,
      model: s.model,
      provider: s.provider || "openshell",
      policies: s.policies,
    }));
  }

  async get(name: string): Promise<SandboxInfo | null> {
    const s = registry.getSandbox(name);
    if (!s) return null;

    let nimInfo: unknown = { running: false };
    try { nimInfo = nim.nimStatus(name); } catch { /* ignore */ }

    let openshellStatus: unknown = null;
    try {
      const raw = safeRun(`openshell sandbox get ${name} --json 2>/dev/null`);
      if (raw) openshellStatus = JSON.parse(raw);
    } catch { /* ignore */ }

    return {
      name: s.name,
      status: "running",
      createdAt: s.createdAt,
      model: s.model,
      provider: s.provider || "openshell",
      policies: s.policies,
      metadata: { nim: nimInfo, openshell: openshellStatus },
    };
  }

  async create(name: string, config: CreateConfig): Promise<SandboxInfo> {
    registry.registerSandbox({
      name,
      model: config.model || null,
      provider: "openshell",
      policies: config.policies || [],
    });
    db.insertAudit(name, "sandbox.created", { provider: "openshell" });
    return (await this.get(name))!;
  }

  async destroy(name: string): Promise<void> {
    try { nim.stopNimContainer(name); } catch { /* ignore */ }
    safeRun(`openshell sandbox stop ${name} 2>/dev/null`);
    safeRun(`openshell sandbox delete ${name} 2>/dev/null`);
    registry.removeSandbox(name);
    db.insertAudit(name, "sandbox.destroyed", { provider: "openshell" });
  }

  async exec(name: string, command: string): Promise<string> {
    const escaped = command.replace(/'/g, "'\\''");
    const response = safeRun(
      `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ProxyCommand='openshell ssh-proxy --gateway-name nemoclaw --name ${name}' sandbox@openshell-${name} '${escaped}' 2>/dev/null`
    );
    return response;
  }

  streamLogs(name: string): ChildProcess {
    return spawn("ssh", [
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
      "-o", "LogLevel=ERROR",
      "-o", `ProxyCommand=openshell ssh-proxy --gateway-name nemoclaw --name ${name}`,
      `sandbox@openshell-${name}`,
      "tail -f /var/log/*.log /tmp/*.log 2>/dev/null || while true; do echo '[sandbox] heartbeat'; sleep 10; done",
    ], { stdio: ["ignore", "pipe", "pipe"] });
  }

  async applyPolicy(name: string, preset: string): Promise<void> {
    policies.applyPreset(name, preset);
    db.insertAudit(name, "policy.applied", { preset });
  }

  async getStatus(): Promise<ProviderStatus> {
    const version = safeRun("openshell version 2>/dev/null");
    return {
      name: "openshell",
      available: !!version,
      version: version.trim() || undefined,
    };
  }
}
