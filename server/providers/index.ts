import { OpenShellProvider } from "./openshell.js";
import { DockerProvider } from "./docker.js";
import { LocalProvider } from "./local.js";
import type { SandboxProvider } from "./types.js";

export type { SandboxProvider, SandboxInfo, CreateConfig, ProviderStatus } from "./types.js";

let _provider: SandboxProvider | null = null;

export function getProvider(): SandboxProvider {
  if (_provider) return _provider;
  const name = process.env.HUB_PROVIDER || "docker";
  switch (name) {
    case "openshell":
      _provider = new OpenShellProvider();
      break;
    case "local":
      _provider = new LocalProvider();
      break;
    case "docker":
    default:
      _provider = new DockerProvider();
      break;
  }
  return _provider;
}
