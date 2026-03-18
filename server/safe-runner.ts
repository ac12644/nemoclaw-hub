// Safe wrapper around lib/runner.ts for use in long-running server.
// Prevents process.exit() from killing the server by using ignoreError mode.

import { runCapture, ROOT, SCRIPTS } from "../lib/runner.js";

export { ROOT, SCRIPTS };

export function safeRun(cmd: string): string {
  return runCapture(cmd, { ignoreError: true }) || "";
}

export function safeRunOrThrow(cmd: string): string {
  try {
    return runCapture(cmd, { ignoreError: false }) || "";
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const message = e.stderr || e.stdout || e.message || "Command failed";
    throw new Error(`Command failed: ${cmd}\n${message}`);
  }
}
