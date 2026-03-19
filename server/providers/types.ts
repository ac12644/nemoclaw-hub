import type { ChildProcess } from "child_process";

export interface SandboxInfo {
  name: string;
  status: "running" | "stopped" | "error" | "unknown";
  createdAt: string;
  model: string | null;
  provider: string;
  policies: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateConfig {
  image?: string;
  model?: string;
  command?: string;
  env?: Record<string, string>;
  policies?: string[];
}

export interface ProviderStatus {
  name: string;
  available: boolean;
  version?: string;
  details?: Record<string, unknown>;
}

export interface SandboxProvider {
  name: string;
  list(): Promise<SandboxInfo[]>;
  get(name: string): Promise<SandboxInfo | null>;
  create(name: string, config: CreateConfig): Promise<SandboxInfo>;
  destroy(name: string): Promise<void>;
  exec(name: string, command: string): Promise<string>;
  streamLogs(name: string): ChildProcess;
  applyPolicy?(name: string, policyYaml: string): Promise<void>;
  getStatus(): Promise<ProviderStatus>;
}
