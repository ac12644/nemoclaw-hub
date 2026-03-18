// Type declarations for untyped bin/lib CJS modules

export interface SandboxEntry {
  name: string;
  createdAt: string;
  model?: string;
  nimContainer?: string;
  provider?: string;
  gpuEnabled?: boolean;
  policies?: string[];
}

export interface RegistryData {
  sandboxes: SandboxEntry[];
  defaultSandbox: string | null;
}

export interface Registry {
  load(): { sandboxes: Record<string, SandboxEntry>; defaultSandbox: string | null };
  save(data: unknown): void;
  getSandbox(name: string): SandboxEntry | null;
  getDefault(): string | null;
  registerSandbox(entry: SandboxEntry): void;
  updateSandbox(name: string, updates: Partial<SandboxEntry>): boolean;
  removeSandbox(name: string): boolean;
  listSandboxes(): RegistryData;
  setDefault(name: string): boolean;
}

export interface GpuInfo {
  type: "nvidia" | "apple";
  name?: string;
  count: number;
  totalMemoryMB: number;
  perGpuMB: number;
  nimCapable: boolean;
  spark?: boolean;
  cores?: number;
}

export interface NimModel {
  name: string;
  image: string;
  minGpuMemoryMB: number;
}

export interface NimStatus {
  running: boolean;
  healthy?: boolean;
  container: string;
  state?: string;
}

export interface Nim {
  detectGpu(): GpuInfo | null;
  listModels(): NimModel[];
  getImageForModel(name: string): string | null;
  nimStatus(sandboxName: string): NimStatus;
  startNimContainer(sandboxName: string, model: string, port?: number): string;
  stopNimContainer(sandboxName: string): void;
  pullNimImage(model: string): string;
  waitForNimHealth(port?: number, timeout?: number): boolean;
  containerName(sandboxName: string): string;
}

export interface PresetInfo {
  file: string;
  name: string;
  description: string;
}

export interface Policies {
  listPresets(): PresetInfo[];
  loadPreset(name: string): string | null;
  getPresetEndpoints(content: string): string[];
  applyPreset(sandboxName: string, presetName: string): boolean;
  getAppliedPresets(sandboxName: string): string[];
}

export interface Credentials {
  loadCredentials(): Record<string, string>;
  saveCredential(key: string, value: string): void;
  getCredential(key: string): string | null;
}

export interface Runner {
  run(cmd: string, opts?: { ignoreError?: boolean }): void;
  runCapture(cmd: string, opts?: { ignoreError?: boolean }): string;
  ROOT: string;
  SCRIPTS: string;
}
