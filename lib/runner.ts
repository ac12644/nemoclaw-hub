import { execSync, spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const SCRIPTS = path.join(ROOT, "scripts");

// Auto-detect Colima Docker socket
if (!process.env.DOCKER_HOST) {
  const home = process.env.HOME || "/tmp";
  const candidates = [
    path.join(home, ".colima/default/docker.sock"),
    path.join(home, ".config/colima/default/docker.sock"),
  ];
  for (const sock of candidates) {
    if (fs.existsSync(sock)) {
      process.env.DOCKER_HOST = `unix://${sock}`;
      break;
    }
  }
}

interface RunOpts {
  ignoreError?: boolean;
  env?: Record<string, string>;
  [key: string]: unknown;
}

export function run(cmd: string, opts: RunOpts = {}): ReturnType<typeof spawnSync> {
  const result = spawnSync("bash", ["-c", cmd], {
    stdio: "inherit",
    cwd: ROOT,
    env: { ...process.env, ...opts.env } as NodeJS.ProcessEnv,
  });
  if (result.status !== 0 && !opts.ignoreError) {
    console.error(`  Command failed (exit ${result.status}): ${cmd.slice(0, 80)}`);
    process.exit(result.status || 1);
  }
  return result;
}

export function runCapture(cmd: string, opts: RunOpts = {}): string {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      cwd: ROOT,
      env: { ...process.env, ...opts.env } as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (opts.ignoreError) return "";
    throw err;
  }
}
