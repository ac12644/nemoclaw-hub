//
// Safe wrapper around bin/lib/runner.js for use in long-running server.
// Prevents process.exit() from killing the server by using ignoreError mode.

import type { Runner } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const runner: Runner = require("../lib/runner");

export const { ROOT, SCRIPTS } = runner;

export function safeRun(cmd: string): string {
  return runner.runCapture(cmd, { ignoreError: true }) || "";
}

export function safeRunOrThrow(cmd: string): string {
  try {
    return runner.runCapture(cmd, { ignoreError: false }) || "";
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const message = e.stderr || e.stdout || e.message || "Command failed";
    throw new Error(`Command failed: ${cmd}\n${message}`);
  }
}
