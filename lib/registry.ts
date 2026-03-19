import fs from "fs";
import path from "path";

const REGISTRY_FILE = path.join(process.env.HOME || "/tmp", ".nemoclaw", "sandboxes.json");

export interface SandboxEntry {
  name: string;
  createdAt: string;
  model: string | null;
  nimContainer: string | null;
  provider: string | null;
  gpuEnabled: boolean;
  policies: string[];
}

interface RegistryData {
  sandboxes: Record<string, SandboxEntry>;
  defaultSandbox: string | null;
}

export function load(): RegistryData {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      return JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf-8")) as RegistryData;
    }
  } catch { /* ignore */ }
  return { sandboxes: {}, defaultSandbox: null };
}

export function save(data: RegistryData): void {
  const dir = path.dirname(REGISTRY_FILE);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function getSandbox(name: string): SandboxEntry | null {
  const data = load();
  return data.sandboxes[name] || null;
}

export function getDefault(): string | null {
  const data = load();
  if (data.defaultSandbox && data.sandboxes[data.defaultSandbox]) {
    return data.defaultSandbox;
  }
  const names = Object.keys(data.sandboxes);
  return names.length > 0 ? names[0] : null;
}

export function registerSandbox(entry: Partial<SandboxEntry> & { name: string }): void {
  const data = load();
  data.sandboxes[entry.name] = {
    name: entry.name,
    createdAt: entry.createdAt || new Date().toISOString(),
    model: entry.model || null,
    nimContainer: entry.nimContainer || null,
    provider: entry.provider || null,
    gpuEnabled: entry.gpuEnabled || false,
    policies: entry.policies || [],
  };
  if (!data.defaultSandbox) {
    data.defaultSandbox = entry.name;
  }
  save(data);
}

export function updateSandbox(name: string, updates: Partial<SandboxEntry>): boolean {
  const data = load();
  if (!data.sandboxes[name]) return false;
  Object.assign(data.sandboxes[name], updates);
  save(data);
  return true;
}

export function removeSandbox(name: string): boolean {
  const data = load();
  if (!data.sandboxes[name]) return false;
  delete data.sandboxes[name];
  if (data.defaultSandbox === name) {
    const remaining = Object.keys(data.sandboxes);
    data.defaultSandbox = remaining.length > 0 ? remaining[0] : null;
  }
  save(data);
  return true;
}

export function listSandboxes(): { sandboxes: SandboxEntry[]; defaultSandbox: string | null } {
  const data = load();
  return {
    sandboxes: Object.values(data.sandboxes),
    defaultSandbox: data.defaultSandbox,
  };
}

export function setDefault(name: string): boolean {
  const data = load();
  if (!data.sandboxes[name]) return false;
  data.defaultSandbox = name;
  save(data);
  return true;
}
